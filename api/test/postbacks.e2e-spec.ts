import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';
import { signBody } from '../src/postbacks/signature';
import { createClick, makeBody, secret, sendPostback, seedBasics } from './helpers/postbacks';

// Phase 2: these tests are written WHILE implementing the postback logic.
// They run against the real test database (no mocks), which is the only way
// to prove the UNIQUE constraints really stop double payment under concurrency.
//
// Setup idea for each test:
//   - resetDb(prisma), then create a user, an offer with milestones, and a click.
//   - Build a body object, JSON.stringify it ONCE, sign that exact string with
//     signBody(), and send the same string with
//     request(app.getHttpServer()).post('/postbacks')
//       .set('Content-Type', 'application/json')
//       .set('X-Signature', signature)
//       .send(bodyString)
//   - Assert on the HTTP response AND on prisma.ledgerEntry.count(...).

describe('POST /postbacks: signature guard (Stage 1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const nothingStored = async () => {
    expect(await prisma.postback.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  };

  it('bad signature → 401, no postback stored, no ledger entry', async () => {
    await sendPostback(app, makeBody(), { signature: 'a'.repeat(64) }).expect(401);
    await nothingStored();
  });

  it('signature made with the wrong secret → 401', async () => {
    await sendPostback(app, makeBody(), { secret: 'not-the-secret' }).expect(401);
    await nothingStored();
  });

  it('missing signature → 401', async () => {
    await sendPostback(app, makeBody(), { signature: null }).expect(401);
    await nothingStored();
  });

  it('body changed after signing → 401', async () => {
    const original = JSON.stringify(makeBody({ payoutCents: 250 }));
    const signature = signBody(original, secret()); // valid for the ORIGINAL bytes only
    await sendPostback(app, original.replace('250', '999999'), { signature }).expect(401);
    await nothingStored();
  });

  it('malformed body + bad signature → 401, NOT 400 (the guard runs before validation)', async () => {
    await sendPostback(app, { nonsense: true }, { signature: 'a'.repeat(64) }).expect(401);
  });

  it('malformed body + valid signature → 400 (validation still runs after the guard)', async () => {
    await sendPostback(app, { nonsense: true }).expect(400);
    await nothingStored();
  });
});

describe('POST /postbacks: crediting (Stage 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBasics(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const balance = async () =>
    (await request(app.getHttpServer()).get('/users/user_t/wallet').expect(200)).body.balanceCents;

  it('valid postback → credited, exactly one ledger entry, correct balance', async () => {
    const res = await sendPostback(app, makeBody()).expect(200);
    expect(res.body).toEqual({ status: 'credited', amountCents: 250 });
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await balance()).toBe(250);
    expect(await prisma.postback.findUniqueOrThrow({ where: { eventId: 'evt_001' } })).toMatchObject({
      status: 'credited',
    });
  });

  it('payoutCents in body differs from milestone → the milestone payout is credited', async () => {
    const res = await sendPostback(app, makeBody({ payoutCents: 999_999 })).expect(200);
    expect(res.body).toEqual({ status: 'credited', amountCents: 250 });
    expect(await balance()).toBe(250);
    // ...but what the advertiser claimed is kept for auditing.
    expect((await prisma.postback.findUniqueOrThrow({ where: { eventId: 'evt_001' } })).payoutCents).toBe(999_999);
  });

  it('same postback sent again (sequentially) → duplicate, still one ledger entry', async () => {
    await sendPostback(app, makeBody()).expect(200);
    const res = await sendPostback(app, makeBody()).expect(200);
    expect(res.body).toEqual({ status: 'duplicate' });
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await prisma.postback.count()).toBe(1);
    expect(await balance()).toBe(250);
  });

  it('different eventIds for the same milestone → paid once, second is duplicate', async () => {
    await sendPostback(app, makeBody({ eventId: 'evt_A' })).expect(200);
    const res = await sendPostback(app, makeBody({ eventId: 'evt_B' })).expect(200);
    expect(res.body).toEqual({ status: 'duplicate' });
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await balance()).toBe(250);
    // The second one is still recorded, with the reason, so support can see it.
    expect(await prisma.postback.findUniqueOrThrow({ where: { eventId: 'evt_B' } })).toMatchObject({
      status: 'duplicate',
      rejectReason: 'milestone_already_paid',
    });
  });

  it('milestones out of order (level_10 before level_5) → each paid once', async () => {
    await sendPostback(app, makeBody({ eventId: 'evt_10', event: 'level_10' })).expect(200);
    await sendPostback(app, makeBody({ eventId: 'evt_5', event: 'level_5' })).expect(200);
    expect(await prisma.ledgerEntry.count()).toBe(2);
    expect(await balance()).toBe(350);
  });

  it('unknown clickId → rejected (unknown_click), stored, no ledger entry', async () => {
    const res = await sendPostback(app, makeBody({ clickId: 'clk_nope' })).expect(200);
    expect(res.body).toEqual({ status: 'rejected', reason: 'unknown_click' });
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.postback.findUniqueOrThrow({ where: { eventId: 'evt_001' } })).toMatchObject({
      status: 'rejected',
      rejectReason: 'unknown_click',
    });
  });

  it('unknown event for the offer → rejected (unknown_milestone), no ledger entry', async () => {
    const res = await sendPostback(app, makeBody({ event: 'level_999' })).expect(200);
    expect(res.body).toEqual({ status: 'rejected', reason: 'unknown_milestone' });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('timestamp far in the future → rejected (timestamp_in_future)', async () => {
    const tenMinutesAhead = Math.floor(Date.now() / 1000) + 10 * 60;
    const res = await sendPostback(app, makeBody({ timestamp: tenMinutesAhead })).expect(200);
    expect(res.body).toEqual({ status: 'rejected', reason: 'timestamp_in_future' });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('LATE postback (a year old) is still credited', async () => {
    const aYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
    const res = await sendPostback(app, makeBody({ timestamp: aYearAgo })).expect(200);
    expect(res.body).toEqual({ status: 'credited', amountCents: 250 });
  });
});

describe('POST /postbacks: races and retries (Stage 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const statuses = (results: { body: { status: string } }[]) => {
    const count: Record<string, number> = {};
    for (const r of results) count[r.body.status] = (count[r.body.status] ?? 0) + 1;
    return count;
  };

  describe('with a known click', () => {
    beforeEach(async () => {
      await resetDb(prisma);
      await seedBasics(prisma);
    });

    it('same postback 50× concurrently (Promise.all) → exactly one ledger entry', async () => {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => sendPostback(app, makeBody())),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(statuses(results)).toEqual({ credited: 1, duplicate: 49 });
      expect(await prisma.ledgerEntry.count()).toBe(1);
      expect(await prisma.postback.count()).toBe(1);
      expect((await prisma.ledgerEntry.findFirstOrThrow()).amountCents).toBe(250);
    });

    it('50× concurrently with DIFFERENT eventIds for the same milestone → exactly one ledger entry', async () => {
      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) => sendPostback(app, makeBody({ eventId: `evt_${i}` }))),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(statuses(results)).toEqual({ credited: 1, duplicate: 49 });
      expect(await prisma.ledgerEntry.count()).toBe(1);
      // Every attempt is still on record, so support can see what the advertiser sent.
      expect(await prisma.postback.count()).toBe(50);
      expect(await prisma.postback.count({ where: { status: 'credited' } })).toBe(1);
    });

    it('a mix of two milestones sent concurrently → each paid exactly once', async () => {
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          sendPostback(app, makeBody({ eventId: `evt_${i}`, event: i % 2 ? 'level_5' : 'level_10' })),
        ),
      );
      expect(statuses(results)).toEqual({ credited: 2, duplicate: 38 });
      expect(await prisma.ledgerEntry.count()).toBe(2);
    });
  });

  // Decision Q4: a REJECTED eventId must not stay blocked forever. The advertiser may
  // report the event before our click exists (click-creation lag); its retry must pay.
  describe('retrying a rejected postback', () => {
    beforeEach(async () => {
      await resetDb(prisma);
      await seedBasics(prisma, { withClick: false });
    });

    it('rejected (unknown_click), then the click exists, then retried → credited', async () => {
      const first = await sendPostback(app, makeBody()).expect(200);
      expect(first.body).toEqual({ status: 'rejected', reason: 'unknown_click' });

      await createClick(prisma);
      const retry = await sendPostback(app, makeBody()).expect(200);
      expect(retry.body).toEqual({ status: 'credited', amountCents: 250 });

      expect(await prisma.ledgerEntry.count()).toBe(1);
      expect(await prisma.postback.count()).toBe(1); // updated in place, not a second row
      expect(await prisma.postback.findUniqueOrThrow({ where: { eventId: 'evt_001' } })).toMatchObject({
        status: 'credited',
        rejectReason: null,
      });

      // ...and a further retry is now an ordinary duplicate.
      const again = await sendPostback(app, makeBody()).expect(200);
      expect(again.body).toEqual({ status: 'duplicate' });
      expect(await prisma.ledgerEntry.count()).toBe(1);
    });

    it('retried while the click STILL does not exist → rejected again, nothing credited', async () => {
      await sendPostback(app, makeBody()).expect(200);
      const retry = await sendPostback(app, makeBody()).expect(200);
      expect(retry.body).toEqual({ status: 'rejected', reason: 'unknown_click' });
      expect(await prisma.ledgerEntry.count()).toBe(0);
      expect(await prisma.postback.count()).toBe(1);
    });

    it('20× concurrent retries of a rejected eventId, click now exists → exactly one credit', async () => {
      await sendPostback(app, makeBody()).expect(200); // rejected: no click yet
      await createClick(prisma);

      const results = await Promise.all(
        Array.from({ length: 20 }, () => sendPostback(app, makeBody())),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(statuses(results)).toEqual({ credited: 1, duplicate: 19 });
      expect(await prisma.ledgerEntry.count()).toBe(1);
      expect(await prisma.postback.count()).toBe(1);
    });

    it('rejected eventId retried after the user was paid via ANOTHER eventId → duplicate, paid once', async () => {
      await sendPostback(app, makeBody({ eventId: 'evt_early' })).expect(200); // rejected
      await createClick(prisma);
      await sendPostback(app, makeBody({ eventId: 'evt_other' })).expect(200); // credited

      const retry = await sendPostback(app, makeBody({ eventId: 'evt_early' })).expect(200);
      expect(retry.body).toEqual({ status: 'duplicate' });
      expect(await prisma.ledgerEntry.count()).toBe(1);
      expect(await prisma.postback.findUniqueOrThrow({ where: { eventId: 'evt_early' } })).toMatchObject({
        status: 'duplicate',
        rejectReason: 'milestone_already_paid',
      });
    });
  });
});

describe('GET /postbacks (Stage 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBasics(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const list = (query = '') => request(app.getHttpServer()).get(`/postbacks${query}`).expect(200);

  it('is empty when nothing has arrived', async () => {
    expect((await list()).body).toEqual([]);
  });

  it('lists credited, duplicate and rejected postbacks, newest first', async () => {
    await sendPostback(app, makeBody({ eventId: 'evt_1' })); // credited
    await sendPostback(app, makeBody({ eventId: 'evt_2' })); // duplicate (same milestone)
    await sendPostback(app, makeBody({ eventId: 'evt_3', clickId: 'clk_nope' })); // rejected

    const rows = (await list()).body;
    expect(rows.map((r: any) => [r.eventId, r.status, r.rejectReason])).toEqual([
      ['evt_3', 'rejected', 'unknown_click'],
      ['evt_2', 'duplicate', 'milestone_already_paid'],
      ['evt_1', 'credited', null],
    ]);
  });

  it('filters by clickId', async () => {
    await sendPostback(app, makeBody({ eventId: 'evt_1' }));
    await sendPostback(app, makeBody({ eventId: 'evt_2', clickId: 'clk_nope' }));

    const rows = (await list('?clickId=clk_nope')).body;
    expect(rows.map((r: any) => r.eventId)).toEqual(['evt_2']);
  });

  it('does not expose the raw payload', async () => {
    await sendPostback(app, makeBody());
    expect((await list()).body[0]).not.toHaveProperty('rawPayload');
  });

  it('is capped at 50 rows', async () => {
    await prisma.postback.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        eventId: `evt_${i}`,
        clickId: 'clk_test',
        eventKey: 'level_5',
        payoutCents: 100,
        rawPayload: {},
        status: 'duplicate' as const,
      })),
    });
    expect((await list()).body).toHaveLength(50);
  });
});
