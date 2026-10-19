import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';
import { makeBody, sendPostback, seedBasics } from './helpers/postbacks';

describe('POST /claims (Phase 6: rules only so far)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const claim = (body: object = {}) =>
    request(app.getHttpServer())
      .post('/claims')
      .send({ userId: 'user_t', offerId: 'offer_t', message: 'I reached level 10 but was not paid', ...body });

  // THE safety property of the whole feature: no claim, whatever its outcome, creates money.
  const ledgerCount = () => prisma.ledgerEntry.count();

  describe('with a started offer', () => {
    beforeEach(async () => {
      await resetDb(prisma);
      await seedBasics(prisma);
    });

    it('everything already paid → resolved by rules as already_credited, quoting the ledger', async () => {
      await sendPostback(app, makeBody({ eventId: 'a', event: 'level_5' })).expect(200);
      await sendPostback(app, makeBody({ eventId: 'b', event: 'level_10' })).expect(200);
      const before = await ledgerCount();

      const res = await claim().expect(201);
      expect(res.body).toMatchObject({ status: 'resolved', category: 'already_credited', source: 'rules', confidence: null });
      expect(res.body.reply).toContain('Reach level 10: $2.50');
      expect(await ledgerCount()).toBe(before);
    });

    it('a rejected postback on the click → postback_rejected with the reason', async () => {
      await sendPostback(app, makeBody({ eventId: 'x', event: 'level_999' })).expect(200); // unknown_milestone
      const res = await claim().expect(201);
      expect(res.body).toMatchObject({ status: 'resolved', category: 'postback_rejected', source: 'rules' });
      expect(res.body.reply).toContain('level_999');
      expect(await ledgerCount()).toBe(0);
    });

    it('unclear case (partly paid, nothing rejected) → needs_human via fallback, nothing credited', async () => {
      await sendPostback(app, makeBody({ eventId: 'a', event: 'level_5' })).expect(200);
      const before = await ledgerCount();

      const res = await claim().expect(201);
      expect(res.body).toMatchObject({ status: 'needs_human', category: 'needs_human', source: 'fallback' });
      expect(await ledgerCount()).toBe(before); // still only the legitimately paid milestone
    });

    it('a second claim for the same offer → 409', async () => {
      await claim().expect(201);
      await claim({ message: 'trying again' }).expect(409);
      expect(await prisma.claim.count()).toBe(1);
    });

    it('20 simultaneous claims → exactly one stored', async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () => claim()));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(19);
      expect(await prisma.claim.count()).toBe(1);
    });
  });

  describe('without a click', () => {
    beforeEach(async () => {
      await resetDb(prisma);
      await seedBasics(prisma, { withClick: false });
    });

    it('never started → not_started', async () => {
      const res = await claim().expect(201);
      expect(res.body).toMatchObject({ status: 'resolved', category: 'not_started', source: 'rules' });
      expect(await ledgerCount()).toBe(0);
    });
  });

  describe('validation', () => {
    beforeEach(async () => {
      await resetDb(prisma);
      await seedBasics(prisma);
    });

    it('unknown user or offer → 404', async () => {
      await claim({ userId: 'nope' }).expect(404);
      await claim({ offerId: 'nope' }).expect(404);
    });

    it('empty message → 400', async () => {
      await claim({ message: '   ' }).expect(400);
    });

    it('message over 1000 characters → 400 (this text may be sent to a paid model)', async () => {
      await claim({ message: 'x'.repeat(1001) }).expect(400);
      await claim({ message: 'x'.repeat(1000) }).expect(201);
    });

    it('unknown fields are rejected', async () => {
      await claim({ status: 'resolved' }).expect(400);
    });
  });
});
