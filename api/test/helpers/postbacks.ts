import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
