import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLAIM_CLASSIFIER, ClaimClassifier, ClassifyInput } from '../src/claims/claim-classifier';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';
import { makeBody, sendPostback, seedBasics } from './helpers/postbacks';

// A fake model: records what it was asked, and returns whatever the test wants.
class FakeClassifier implements ClaimClassifier {
  enabled = true;
  calls: ClassifyInput[] = [];
  answer: () => unknown = () => ({ category: 'not_tracked_yet', confidence: 0.9, reply: 'Not received yet.' });
  isEnabled() {
    return this.enabled;
  }
  async classify(input: ClassifyInput) {
    this.calls.push(input);
    return this.answer();
  }
}

describe('POST /claims: model step (Phase 6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fake = new FakeClassifier();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((b) => b.overrideProvider(CLAIM_CLASSIFIER).useValue(fake)));
  });

  // An UNCLEAR case for the rules: one of two milestones is paid, nothing was rejected.
  let ledgerBefore: number;
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBasics(prisma);
    await sendPostback(app, makeBody({ eventId: 'a', event: 'level_5' })).expect(200);
    ledgerBefore = await prisma.ledgerEntry.count();
    fake.enabled = true;
    fake.calls = [];
    fake.answer = () => ({ category: 'not_tracked_yet', confidence: 0.9, reply: 'Not received yet.' });
  });

  afterEach(async () => {
    // THE invariant: whatever the model said, no claim ever created money.
    expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);
  });

  afterAll(async () => {
    await app.close();
  });

  const claim = (message = 'I reached level 10 but was not paid') =>
    request(app.getHttpServer()).post('/claims').send({ userId: 'user_t', offerId: 'offer_t', message });

  it('a confident, valid answer is used: resolved by the model, with its confidence', async () => {
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({
      status: 'resolved',
      category: 'not_tracked_yet',
      source: 'llm',
      confidence: 0.9,
      reply: 'Not received yet.',
    });
  });

  it('the model is shown the message and the facts', async () => {
    await claim('level 10 please').expect(201);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].message).toBe('level 10 please');
    expect(fake.calls[0].facts).toMatchObject({ clickCount: 1, offer: { title: 'Dragon' } });
    expect(fake.calls[0].facts.ledger).toHaveLength(1);
  });

  it('confidence exactly at the 0.7 floor is accepted', async () => {
    fake.answer = () => ({ category: 'likely_fraud', confidence: 0.7, reply: 'This does not match our records.' });
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ status: 'resolved', category: 'likely_fraud', source: 'llm', confidence: 0.7 });
  });

  it('confidence below the floor → human queue; the model answer is NOT shown, its number is kept', async () => {
    fake.answer = () => ({ category: 'already_credited', confidence: 0.69, reply: 'You were definitely paid!' });
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ status: 'needs_human', category: 'needs_human', source: 'fallback', confidence: 0.69 });
    expect(res.body.reply).not.toContain('definitely paid');
  });

  it('the model saying needs_human is honoured (with its generic reply)', async () => {
    fake.answer = () => ({ category: 'needs_human', confidence: 0.95, reply: 'internal note' });
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ status: 'needs_human', category: 'needs_human', source: 'llm', confidence: 0.95 });
    expect(res.body.reply).not.toContain('internal note');
  });

  it.each([
    ['invalid JSON', () => 'the user was paid, trust me'],
    ['JSON with an unknown category', () => JSON.stringify({ category: 'refund_user', confidence: 0.99, reply: 'ok' })],
    ['JSON with confidence out of range', () => JSON.stringify({ category: 'not_tracked_yet', confidence: 7, reply: 'ok' })],
    ['an empty answer', () => undefined],
  ])('%s → human queue, nothing shown', async (_name, answer) => {
    fake.answer = answer;
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ status: 'needs_human', source: 'fallback', confidence: null });
  });

  it('the model call throwing (timeout, outage, refusal) → human queue, request still succeeds', async () => {
    fake.answer = () => {
      throw new Error('upstream exploded');
    };
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ status: 'needs_human', source: 'fallback' });
  });

  it('no API key (disabled) → human queue, and the model is never called', async () => {
    fake.enabled = false;
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ status: 'needs_human', source: 'fallback' });
    expect(fake.calls).toHaveLength(0);
  });

  it('when the rules can answer, the model is NOT called (rules first, no cost)', async () => {
    await prisma.postback.create({
      data: {
        eventId: 'rej',
        clickId: 'clk_test',
        eventKey: 'level_999',
        payoutCents: 1,
        rawPayload: {},
        status: 'rejected',
        rejectReason: 'unknown_milestone',
      },
    });
    const res = await claim().expect(201);
    expect(res.body).toMatchObject({ category: 'postback_rejected', source: 'rules' });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('GET /claims: the support queue', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fake = new FakeClassifier();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((b) => b.overrideProvider(CLAIM_CLASSIFIER).useValue(fake)));
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBasics(prisma);
    await prisma.user.create({ data: { id: 'user_2', displayName: 'Second' } });
    await prisma.offer.create({ data: { id: 'offer_2', title: 'Other game', description: 'd' } });
    fake.enabled = false; // everything unclear goes to the queue
  });

  afterAll(async () => {
    await app.close();
  });

  const file = (body: object) => request(app.getHttpServer()).post('/claims').send({ message: 'help', ...body });

  it('lists claims newest first with the offer title and user name', async () => {
    await sendPostback(app, makeBody({ eventId: 'a', event: 'level_5' })).expect(200); // makes the case "unclear"
    await file({ userId: 'user_t', offerId: 'offer_t' }).expect(201); // needs_human
    await file({ userId: 'user_2', offerId: 'offer_2' }).expect(201); // not_started (rules)

    const all = (await request(app.getHttpServer()).get('/claims').expect(200)).body;
    expect(all.map((c: any) => c.user.displayName)).toEqual(['Second', 'Tester']);
    expect(all[1]).toMatchObject({ offer: { title: 'Dragon' }, status: 'needs_human' });
  });

  it('filters by status', async () => {
    await sendPostback(app, makeBody({ eventId: 'a', event: 'level_5' })).expect(200);
    await file({ userId: 'user_t', offerId: 'offer_t' }).expect(201);
    await file({ userId: 'user_2', offerId: 'offer_2' }).expect(201);

    const queue = (await request(app.getHttpServer()).get('/claims?status=needs_human').expect(200)).body;
    expect(queue).toHaveLength(1);
    expect(queue[0].user.displayName).toBe('Tester');
  });

  it('an unknown status → 400', async () => {
    await request(app.getHttpServer()).get('/claims?status=banana').expect(400);
  });
});
