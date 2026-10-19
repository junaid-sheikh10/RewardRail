import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';

// Working tests for the Phase 1 endpoints. They prove the setup works end to end:
// app boots, connects to Postgres, migrations applied, validation configured.
describe('Phase 1: health and offers', () => {
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

  it('GET /health reports the database is up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('GET /offers returns offers with milestones in order', async () => {
    await prisma.offer.create({
      data: {
        id: 'offer_test',
        title: 'Test Game',
        description: 'A game for tests',
        milestones: {
          create: [
            { key: 'level_10', label: 'Reach level 10', payoutCents: 250, sortOrder: 1 },
            { key: 'level_5', label: 'Reach level 5', payoutCents: 100, sortOrder: 0 },
          ],
        },
      },
    });

    const res = await request(app.getHttpServer()).get('/offers').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Test Game');
    expect(res.body[0].milestones.map((m: { key: string }) => m.key)).toEqual(['level_5', 'level_10']);
  });
});
