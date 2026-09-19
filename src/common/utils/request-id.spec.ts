import { generateRequestId } from './request-id';

describe('generateRequestId', () => {
  it('returns a valid incoming request ID', () => {
    expect(generateRequestId('test-123')).toBe('test-123');
  });

  it('generates a request ID when no ID is provided', () => {
    const requestId = generateRequestId(undefined);

    expect(requestId).toMatch(
      /^[a-zA-Z0-9._-]{1,128}$/,
    );
  });

  it('generates a new request ID for an invalid incoming ID', () => {
    const requestId = generateRequestId('bad id');

    expect(requestId).not.toBe('bad id');
    expect(requestId).toMatch(
      /^[a-zA-Z0-9._-]{1,128}$/,
    );
  });

  it('generates a new request ID when the incoming ID is too long', () => {
    const requestId = generateRequestId('a'.repeat(129));

    expect(requestId).not.toBe('a'.repeat(129));
    expect(requestId).toMatch(
      /^[a-zA-Z0-9._-]{1,128}$/,
    );
  });
});