// HMAC signing for postbacks.
//
// The advertiser and we share a secret (POSTBACK_SECRET). The advertiser sends
//   X-Signature: hex( HMAC-SHA256(rawBody, secret) )
// We compute the same thing over the bytes we received and compare.
// Without the secret, nobody can produce a valid signature, so fake postbacks fail.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Hex HMAC-SHA256 of `rawBody` using `secret`. Tests and the demo panel sign with this too. */
export function signBody(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * True only if `signature` is the correct signature for `rawBody`. Never throws.
 *
 * - We sign the RAW bytes we received, not JSON.stringify(parsedBody): re-serialising
 *   can change key order or whitespace and a valid signature would stop matching.
 * - timingSafeEqual takes the same time wherever the first difference is, so an
 *   attacker can't guess the signature byte by byte from response times.
 * - We compare the hex strings as UTF-8 buffers, not Buffer.from(sig, 'hex'):
 *   the 'hex' decoder silently drops invalid characters, which could make garbage
 *   input decode to something unexpected. Comparing the text itself avoids that.
 * - timingSafeEqual throws on different lengths, so the length check comes first.
 *   Revealing the length is fine: a valid signature always has a fixed length.
 */
export function isValidSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature) return false;

  const expected = Buffer.from(signBody(rawBody, secret));
  const received = Buffer.from(signature.toLowerCase());

  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
