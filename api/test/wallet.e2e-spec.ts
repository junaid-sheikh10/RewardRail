import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';

describe('GET /users/:id/wallet', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({ data: { id: 'user_t', displayName: 'Tester' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns balance 0 and no entries for an empty ledger', async () => {
    const res = await request(app.getHttpServer()).get('/users/user_t/wallet').expect(200);
    expect(res.body).toEqual({ balanceCents: 0, entries: [] });
  });

  it('derives the balance from the ledger and lists entries newest first', async () => {
    const offer = await prisma.offer.create({
      data: {
        title: 'Dragon',
        description: 'd',
        milestones: {
          create: [
            { key: 'level_5', label: 'Reach level 5', payoutCents: 100 },
            { key: 'level_10', label: 'Reach level 10', payoutCents: 250 },
          ],
        },
      },
      include: { milestones: true },
    });
    // Look milestones up by key: a query without ORDER BY gives no promise about row order.
    const m5 = offer.milestones.find((m) => m.key === 'level_5')!;
    const m10 = offer.milestones.find((m) => m.key === 'level_10')!;
    await prisma.ledgerEntry.create({
      data: { userId: 'user_t', amountCents: 100, offerId: offer.id, milestoneId: m5.id, createdAt: new Date('2026-01-01') },
    });
    await prisma.ledgerEntry.create({
      data: { userId: 'user_t', amountCents: 250, offerId: offer.id, milestoneId: m10.id, createdAt: new Date('2026-01-02') },
    });

    const res = await request(app.getHttpServer()).get('/users/user_t/wallet').expect(200);
    expect(res.body.balanceCents).toBe(350);
    expect(res.body.entries.map((e: any) => e.milestoneLabel)).toEqual(['Reach level 10', 'Reach level 5']);
    expect(res.body.entries[0]).toMatchObject({ amountCents: 250, offerTitle: 'Dragon' });
  });

  it("does not include another user's entries", async () => {
    await prisma.user.create({ data: { id: 'user_other', displayName: 'Other' } });
    await prisma.ledgerEntry.create({ data: { userId: 'user_other', amountCents: 999 } });
    const res = await request(app.getHttpServer()).get('/users/user_t/wallet').expect(200);
    expect(res.body.balanceCents).toBe(0);
  });

  it('404s for an unknown user', async () => {
    await request(app.getHttpServer()).get('/users/nope/wallet').expect(404);
  });
});
