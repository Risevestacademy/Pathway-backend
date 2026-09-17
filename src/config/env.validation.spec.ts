import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'production',
    PORT: '8080',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/pathway?schema=public',
  };

  it('returns the validated configuration', () => {
    const config = validateEnv(validEnv);

    expect(config.NODE_ENV).toBe(NodeEnv.Production);
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('coerces PORT to a number', () => {
    const config = validateEnv(validEnv);

    expect(config.PORT).toBe(8080);
    expect(typeof config.PORT).toBe('number');
  });

  it('applies defaults for NODE_ENV and PORT when they are absent', () => {
    const config = validateEnv({ DATABASE_URL: validEnv.DATABASE_URL });

    expect(config.NODE_ENV).toBe(NodeEnv.Development);
    expect(config.PORT).toBe(3000);
  });

  it('ignores variables outside the schema', () => {
    expect(() =>
      validateEnv({ ...validEnv, UNRELATED_VARIABLE: 'anything' }),
    ).not.toThrow();
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({ NODE_ENV: validEnv.NODE_ENV, PORT: validEnv.PORT }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('throws when DATABASE_URL is empty', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: '' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('throws when NODE_ENV is not a known environment', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('throws when PORT is not an integer', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'not-a-port' })).toThrow(
      /PORT/,
    );
  });

  it('throws when PORT falls outside the valid range', () => {
    expect(() => validateEnv({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'staging', PORT: '0', DATABASE_URL: '' }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL/);
  });
});
