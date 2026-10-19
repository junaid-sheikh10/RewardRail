import { isValidSignature, signBody } from '../src/postbacks/signature';

// Pure unit tests: no app, no database.
describe('postback signature', () => {
  const secret = 'test-secret';
  const body = Buffer.from('{"eventId":"evt_001","clickId":"clk_1","event":"level_10"}');

  it('accepts the correct signature', () => {
    expect(isValidSignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it('rejects a body changed by one character', () => {
    const signature = signBody(body, secret);
    const tampered = Buffer.from(body.toString().replace('level_10', 'level_11'));
    expect(isValidSignature(tampered, signature, secret)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(isValidSignature(body, signBody(body, 'other-secret'), secret)).toBe(false);
  });

  it('returns false (does not throw) for a signature of the wrong length', () => {
    expect(() => isValidSignature(body, 'abc123', secret)).not.toThrow();
    expect(isValidSignature(body, 'abc123', secret)).toBe(false);
  });

  it('rejects non-hex garbage of the right length', () => {
    const garbage = 'z'.repeat(signBody(body, secret).length);
    expect(isValidSignature(body, garbage, secret)).toBe(false);
  });

  it('rejects a missing signature or missing body', () => {
    expect(isValidSignature(body, undefined, secret)).toBe(false);
    expect(isValidSignature(body, '', secret)).toBe(false);
    expect(isValidSignature(undefined, signBody(body, secret), secret)).toBe(false);
  });
});
