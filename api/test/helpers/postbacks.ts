import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { signBody } from '../../src/postbacks/signature';

// The secret the app under test was configured with (see test/setup-env.ts).
export const secret = () => process.env.POSTBACK_SECRET as string;

export function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_001',
    clickId: 'clk_test',
    event: 'level_10',
    payoutCents: 250,
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// Serialise ONCE, sign those exact bytes, send those exact bytes. Signing the object
// and letting supertest serialise it again could change the bytes and break the signature.
export function sendPostback(
  app: INestApplication,
  body: unknown,
  opts: { signature?: string | null; secret?: string } = {},
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const req = request(app.getHttpServer()).post('/postbacks').set('Content-Type', 'application/json');
  if (opts.signature !== null) {
    req.set('X-Signature', opts.signature ?? signBody(raw, opts.secret ?? secret()));
  }
  return req.send(raw);
}

// user_t has started offer_t, which has level_5 ($1.00) and level_10 ($2.50).
// `withClick: false` leaves the click out, to test postbacks that arrive before it exists.
export async function seedBasics(prisma: PrismaService, { withClick = true } = {}) {
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
  if (withClick) await createClick(prisma);
}

export const createClick = (prisma: PrismaService) =>
  prisma.click.create({ data: { clickId: 'clk_test', userId: 'user_t', offerId: 'offer_t' } });
