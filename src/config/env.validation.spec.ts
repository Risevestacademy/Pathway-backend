import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'production',
    PORT: '8080',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/pathway?schema=public',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRY: '7d',
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
    const config = validateEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
      JWT_ACCESS_EXPIRY: validEnv.JWT_ACCESS_EXPIRY,
      JWT_REFRESH_SECRET: validEnv.JWT_REFRESH_SECRET,
      JWT_REFRESH_EXPIRY: validEnv.JWT_REFRESH_EXPIRY,
    });

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
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'invalid' })).toThrow(
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
      validateEnv({
        NODE_ENV: 'invalid',
        PORT: '0',
        DATABASE_URL: '',
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'invalid',
        PORT: '0',
        DATABASE_URL: '',
        JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
        JWT_ACCESS_EXPIRY: validEnv.JWT_ACCESS_EXPIRY,
        JWT_REFRESH_SECRET: validEnv.JWT_REFRESH_SECRET,
        JWT_REFRESH_EXPIRY: validEnv.JWT_REFRESH_EXPIRY,
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL/);
  });
});
