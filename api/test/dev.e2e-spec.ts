import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';
import { seedBasics } from './helpers/postbacks';

// The demo-only simulator. It must behave like a real advertiser (real HTTP, real
// signatures) and must not exist in production.
describe('Dev simulator (demo only)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0); // the simulator calls back into this server over real HTTP
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBasics(prisma);
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEMO_MODE;
  });

  afterAll(async () => {
    await app.close();
  });

  const simulate = (body: object) => request(app.getHttpServer()).post('/dev/simulate-postback').send(body);

  it('sends a validly signed postback that credits the user', async () => {
    const res = await simulate({ clickId: 'clk_test', event: 'level_10' }).expect(200);
    expect(res.body.results).toEqual([{ httpStatus: 200, body: { status: 'credited', amountCents: 250 } }]);
    expect(await prisma.ledgerEntry.count()).toBe(1);
  });

  it('repeat: 20 identical copies at once → one credit, 19 duplicates, one ledger entry', async () => {
    const res = await simulate({ clickId: 'clk_test', event: 'level_10', repeat: 20 }).expect(200);
    const statuses = res.body.results.map((r: any) => r.body.status).sort();
    expect(statuses.filter((s: string) => s === 'credited')).toHaveLength(1);
    expect(statuses.filter((s: string) => s === 'duplicate')).toHaveLength(19);
    expect(new Set(res.body.results.map((r: any) => r.httpStatus))).toEqual(new Set([200]));
    expect(await prisma.ledgerEntry.count()).toBe(1);
  });

  it('validSignature: false → the real endpoint answers 401 and nothing is stored', async () => {
    const res = await simulate({ clickId: 'clk_test', event: 'level_10', validSignature: false }).expect(200);
    expect(res.body.results[0].httpStatus).toBe(401);
    expect(await prisma.postback.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('an explicit eventId is reused, so calling twice is a retry', async () => {
    await simulate({ clickId: 'clk_test', event: 'level_10', eventId: 'evt_fixed' }).expect(200);
    const second = await simulate({ clickId: 'clk_test', event: 'level_10', eventId: 'evt_fixed' }).expect(200);
    expect(second.body.results[0].body).toEqual({ status: 'duplicate' });
  });

  it('rejects unknown fields (not a way to inject arbitrary postback fields)', async () => {
    await simulate({ clickId: 'clk_test', event: 'level_10', signature: 'x' }).expect(400);
  });

  it('caps repeat at 50', async () => {
    await simulate({ clickId: 'clk_test', event: 'level_10', repeat: 51 }).expect(400);
  });

  it('reset wipes one user only, so the demo can be run again', async () => {
    await prisma.user.create({ data: { id: 'user_other', displayName: 'Other' } });
    await prisma.click.create({ data: { clickId: 'clk_other', userId: 'user_other', offerId: 'offer_t' } });
    await simulate({ clickId: 'clk_test', event: 'level_10' }).expect(200);
    await simulate({ clickId: 'clk_other', event: 'level_10' }).expect(200);

    const res = await request(app.getHttpServer()).post('/dev/reset').send({ userId: 'user_t' }).expect(200);
    expect(res.body.deleted).toEqual({ ledgerEntries: 1, postbacks: 1, clicks: 1 });
    expect(await prisma.ledgerEntry.count({ where: { userId: 'user_t' } })).toBe(0);
    expect(await prisma.click.count({ where: { userId: 'user_t' } })).toBe(0);
    // The other user is untouched.
    expect(await prisma.ledgerEntry.count({ where: { userId: 'user_other' } })).toBe(1);
  });

  it('does not exist in production: every dev route answers 404', async () => {
    process.env.NODE_ENV = 'production';
    await simulate({ clickId: 'clk_test', event: 'level_10' }).expect(404);
    await request(app.getHttpServer()).post('/dev/reset').send({ userId: 'user_t' }).expect(404);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('DEMO_MODE=true is an explicit opt-in that keeps it available in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    await simulate({ clickId: 'clk_test', event: 'level_10' }).expect(200);
    process.env.DEMO_MODE = 'yes'; // only the exact value "true" counts
    await simulate({ clickId: 'clk_test', event: 'level_5' }).expect(404);
  });
});
