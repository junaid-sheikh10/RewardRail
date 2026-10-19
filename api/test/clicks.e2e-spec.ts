import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb } from './helpers/app';

describe('POST /clicks', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({ data: { id: 'user_t', displayName: 'Tester' } });
    await prisma.offer.create({ data: { id: 'offer_t', title: 'T', description: 'T' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a click with an unguessable clickId', async () => {
    const res = await request(app.getHttpServer())
      .post('/clicks')
      .send({ userId: 'user_t', offerId: 'offer_t' })
      .expect(201);
    expect(res.body.clickId).toMatch(/^clk_[0-9a-f-]{36}$/);
    expect(await prisma.click.count()).toBe(1);
  });

  it('returns the same clickId when the offer is started again', async () => {
    const send = () =>
      request(app.getHttpServer()).post('/clicks').send({ userId: 'user_t', offerId: 'offer_t' });
    const first = await send();
    const second = await send();
    expect(second.body.clickId).toBe(first.body.clickId);
    expect(await prisma.click.count()).toBe(1);
  });

  it('creates exactly one click when started 20 times at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer()).post('/clicks').send({ userId: 'user_t', offerId: 'offer_t' }),
      ),
    );
    expect(new Set(results.map((r) => r.body.clickId)).size).toBe(1);
    expect(await prisma.click.count()).toBe(1);
  });

  it('404s for an unknown user or offer', async () => {
    await request(app.getHttpServer())
      .post('/clicks')
      .send({ userId: 'nope', offerId: 'offer_t' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/clicks')
      .send({ userId: 'user_t', offerId: 'nope' })
      .expect(404);
    expect(await prisma.click.count()).toBe(0);
  });

  it('400s for a malformed body', async () => {
    await request(app.getHttpServer()).post('/clicks').send({ userId: 'user_t' }).expect(400);
  });
});
