import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';

describe('GET /users/:id/offers', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({ data: { id: 'user_t', displayName: 'Tester' } });
    await prisma.user.create({ data: { id: 'user_other', displayName: 'Other' } });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedOffer(id: string) {
    return prisma.offer.create({
      data: {
        id,
        title: id,
        description: 'd',
        milestones: {
          create: [
            { key: 'level_5', label: 'L5', payoutCents: 100, sortOrder: 0 },
            { key: 'level_10', label: 'L10', payoutCents: 250, sortOrder: 1 },
          ],
        },
      },
      include: { milestones: true },
    });
  }

  it('shows nothing started or credited for a fresh user', async () => {
    await seedOffer('offer_a');
    const res = await request(app.getHttpServer()).get('/users/user_t/offers').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ started: false, clickId: null });
    expect(res.body[0].milestones.map((m: any) => m.credited)).toEqual([false, false]);
  });

  it("shows this user's click and credited milestones, not another user's", async () => {
    const a = await seedOffer('offer_a');
    await seedOffer('offer_b');
    await prisma.click.create({ data: { clickId: 'clk_t', userId: 'user_t', offerId: 'offer_a' } });
    await prisma.ledgerEntry.create({
      data: { userId: 'user_t', amountCents: 100, offerId: 'offer_a', milestoneId: a.milestones.find((m) => m.key === 'level_5')!.id },
    });
    // Another user's progress on the same offer must not leak into user_t's view.
    await prisma.click.create({ data: { clickId: 'clk_o', userId: 'user_other', offerId: 'offer_b' } });
    await prisma.ledgerEntry.create({
      data: { userId: 'user_other', amountCents: 250, offerId: 'offer_a', milestoneId: a.milestones.find((m) => m.key === 'level_10')!.id },
    });

    const res = await request(app.getHttpServer()).get('/users/user_t/offers').expect(200);
    const offerA = res.body.find((o: any) => o.id === 'offer_a');
    const offerB = res.body.find((o: any) => o.id === 'offer_b');
    expect(offerA).toMatchObject({ started: true, clickId: 'clk_t' });
    expect(offerA.milestones.map((m: any) => [m.key, m.credited])).toEqual([
      ['level_5', true],
      ['level_10', false],
    ]);
    expect(offerB).toMatchObject({ started: false, clickId: null });
  });

  it('404s for an unknown user', async () => {
    await request(app.getHttpServer()).get('/users/nope/offers').expect(404);
  });
});
