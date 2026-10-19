import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';
import { signBody } from '../src/postbacks/signature';
import { makeBody, secret, sendPostback } from './helpers/postbacks';

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

  // Alice has started offer_t, which has two milestones: level_5 ($1.00), level_10 ($2.50).
  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({ data: { id: 'user_t', displayName: 'Tester' } });
    await prisma.offer.create({
      data: {
        id: 'offer_t',
        title: 'Dragon',
        description: 'd',
        milestones: {
          create: [
            { key: 'level_5', label: 'Reach level 5', payoutCents: 100, sortOrder: 0 },
            { key: 'level_10', label: 'Reach level 10', payoutCents: 250, sortOrder: 1 },
          ],
        },
      },
    });
    await prisma.click.create({ data: { clickId: 'clk_test', userId: 'user_t', offerId: 'offer_t' } });
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

describe('POST /postbacks: races (Stage 3)', () => {
  it.todo('same postback 50× concurrently (Promise.all) → exactly one ledger entry');
  it.todo('50× concurrently with DIFFERENT eventIds for the same milestone → exactly one ledger entry');
  it.todo('rejected unknown_click retried after the click exists → credited');
  it.todo('20× concurrent retries of a rejected eventId, click now exists → exactly one credit');
});
