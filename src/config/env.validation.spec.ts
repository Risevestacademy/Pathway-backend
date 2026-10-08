import { MailDriver, NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'production',
    PORT: '8080',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/pathway?schema=public',
    API_VERSION: 'v1',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRY: '7d',
    MAILERSEND_API_KEY: 'test-key',
    EMAIL_FROM_ADDRESS: 'noreply@pathway.dev',
    GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com',
  };

  it('returns the validated configuration', () => {
    const config = validateEnv(validEnv);

    expect(config.NODE_ENV).toBe(NodeEnv.Production);
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(config.API_VERSION).toBe(validEnv.API_VERSION);
  });

  it('coerces PORT to a number', () => {
    const config = validateEnv(validEnv);

    expect(config.PORT).toBe(8080);
    expect(typeof config.PORT).toBe('number');
  });

  it('applies defaults for NODE_ENV, PORT, and API_VERSION when they are absent', () => {
    const config = validateEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
      JWT_ACCESS_EXPIRY: validEnv.JWT_ACCESS_EXPIRY,
      JWT_REFRESH_SECRET: validEnv.JWT_REFRESH_SECRET,
      JWT_REFRESH_EXPIRY: validEnv.JWT_REFRESH_EXPIRY,
      MAILERSEND_API_KEY: validEnv.MAILERSEND_API_KEY,
      EMAIL_FROM_ADDRESS: validEnv.EMAIL_FROM_ADDRESS,
      GOOGLE_CLIENT_IDS: validEnv.GOOGLE_CLIENT_IDS,
    });

    expect(config.NODE_ENV).toBe(NodeEnv.Development);
    expect(config.PORT).toBe(3000);
    expect(config.API_VERSION).toBe('v1');
  });

  it('accepts a custom API version', () => {
    const config = validateEnv({
      ...validEnv,
      API_VERSION: 'v2',
    });

    expect(config.API_VERSION).toBe('v2');
  });

  it('throws when API_VERSION is empty', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        API_VERSION: '',
      }),
    ).toThrow(/API_VERSION/);
  });

  it('allows Sentry variables to be absent', () => {
    const config = validateEnv(validEnv);

    expect(config.SENTRY_DSN).toBeUndefined();
    expect(config.SENTRY_ENVIRONMENT).toBeUndefined();
  });

  it('accepts valid Sentry configuration', () => {
    const config = validateEnv({
      ...validEnv,
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      SENTRY_ENVIRONMENT: 'production',
    });

    expect(config.SENTRY_DSN).toBe(
      'https://examplePublicKey@o0.ingest.sentry.io/0',
    );
    expect(config.SENTRY_ENVIRONMENT).toBe('production');
  });

  it('ignores variables outside the schema', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        UNRELATED_VARIABLE: 'anything',
      }),
    ).not.toThrow();
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: validEnv.NODE_ENV,
        PORT: validEnv.PORT,
        API_VERSION: validEnv.API_VERSION,
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('throws when DATABASE_URL is empty', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        DATABASE_URL: '',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('throws when NODE_ENV is not a known environment', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'invalid',
      }),
    ).toThrow(/NODE_ENV/);
  });

  it('throws when PORT is not an integer', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        PORT: 'not-a-port',
      }),
    ).toThrow(/PORT/);
  });

  it('throws when PORT falls outside the valid range', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        PORT: '70000',
      }),
    ).toThrow(/PORT/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'invalid',
        PORT: '0',
        DATABASE_URL: '',
        API_VERSION: '',
        JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
        JWT_ACCESS_EXPIRY: validEnv.JWT_ACCESS_EXPIRY,
        JWT_REFRESH_SECRET: validEnv.JWT_REFRESH_SECRET,
        JWT_REFRESH_EXPIRY: validEnv.JWT_REFRESH_EXPIRY,
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL[\s\S]*API_VERSION/);
  });

  it('applies default rate limits when absent', () => {
    const config = validateEnv(validEnv);

    expect(config.THROTTLE_TTL_MS).toBe(60000);
    expect(config.THROTTLE_LIMIT).toBe(100);
    expect(config.THROTTLE_AUTH_LIMIT).toBe(10);
  });

  it('throws when THROTTLE_LIMIT is not a positive integer', () => {
    expect(() => validateEnv({ ...validEnv, THROTTLE_LIMIT: '0' })).toThrow(
      /THROTTLE_LIMIT/,
    );
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    'throws when %s is empty',
    (variable) => {
      expect(() => validateEnv({ ...validEnv, [variable]: '' })).toThrow(
        new RegExp(variable),
      );
    },
  );

  it('throws when the refresh secret matches the access secret', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        JWT_REFRESH_SECRET: validEnv.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET/);
  });

  it.each([
    ['JWT_ACCESS_EXPIRY', 'soon'],
    ['JWT_REFRESH_EXPIRY', ''],
    ['JWT_REFRESH_EXPIRY', '-7d'],
  ])('throws when %s is %j', (variable, value) => {
    expect(() => validateEnv({ ...validEnv, [variable]: value })).toThrow(
      new RegExp(`${variable} must be a duration`),
    );
  });

  it('accepts durations written in words', () => {
    const config = validateEnv({ ...validEnv, JWT_REFRESH_EXPIRY: '30 days' });

    expect(config.JWT_REFRESH_EXPIRY).toBe('30 days');
  });

  it('throws when LOG_LEVEL is not a pino level', () => {
    expect(() => validateEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it('defaults PASSWORD_RESET_URL to the local frontend reset page', () => {
    const config = validateEnv(validEnv);

    expect(config.PASSWORD_RESET_URL).toBe(
      'http://localhost:5173/reset-password',
    );
  });

  it('accepts a deployed PASSWORD_RESET_URL', () => {
    const config = validateEnv({
      ...validEnv,
      PASSWORD_RESET_URL: 'https://pathway.example.com/reset-password',
    });

    expect(config.PASSWORD_RESET_URL).toBe(
      'https://pathway.example.com/reset-password',
    );
  });

  it('throws when PASSWORD_RESET_URL is not a URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, PASSWORD_RESET_URL: 'reset-password' }),
    ).toThrow(/PASSWORD_RESET_URL/);
  });

  it('defaults EMAIL_VERIFICATION_URL to the local frontend verify page', () => {
    const config = validateEnv(validEnv);

    expect(config.EMAIL_VERIFICATION_URL).toBe(
      'http://localhost:5173/verify-email',
    );
  });

  it('accepts a deployed EMAIL_VERIFICATION_URL', () => {
    const config = validateEnv({
      ...validEnv,
      EMAIL_VERIFICATION_URL: 'https://pathway.example.com/verify-email',
    });

    expect(config.EMAIL_VERIFICATION_URL).toBe(
      'https://pathway.example.com/verify-email',
    );
  });

  it('throws when EMAIL_VERIFICATION_URL is not a URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, EMAIL_VERIFICATION_URL: 'verify-email' }),
    ).toThrow(/EMAIL_VERIFICATION_URL/);
  });

  it('exposes GOOGLE_CLIENT_IDS as a trimmed array', () => {
    const config = validateEnv({
      ...validEnv,
      GOOGLE_CLIENT_IDS:
        ' web-client.apps.googleusercontent.com , mobile-client.apps.googleusercontent.com,',
    });

    expect(config.GOOGLE_CLIENT_IDS).toEqual([
      'web-client.apps.googleusercontent.com',
      'mobile-client.apps.googleusercontent.com',
    ]);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['only separators', ' , ,'],
  ])('throws when GOOGLE_CLIENT_IDS is %s', (_label, value) => {
    expect(() =>
      validateEnv({ ...validEnv, GOOGLE_CLIENT_IDS: value }),
    ).toThrow(/GOOGLE_CLIENT_IDS/);
  });

  it('throws when a GOOGLE_CLIENT_IDS entry is not a Google client ID', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com,not-a-client',
      }),
    ).toThrow(/GOOGLE_CLIENT_IDS/);
  });

  it('defaults MAIL_DRIVER to mailersend', () => {
    const config = validateEnv(validEnv);

    expect(config.MAIL_DRIVER).toBe(MailDriver.MailerSend);
  });

  it('throws when MAIL_DRIVER is not a known driver', () => {
    expect(() => validateEnv({ ...validEnv, MAIL_DRIVER: 'smtp' })).toThrow(
      /MAIL_DRIVER/,
    );
  });

  it.each([undefined, ''])(
    'throws when MAILERSEND_API_KEY is %j with the mailersend driver',
    (value) => {
      expect(() =>
        validateEnv({
          ...validEnv,
          MAIL_DRIVER: 'mailersend',
          MAILERSEND_API_KEY: value,
        }),
      ).toThrow(/MAILERSEND_API_KEY/);
    },
  );

  it('does not require MAILERSEND_API_KEY with the log driver', () => {
    const config = validateEnv({
      ...validEnv,
      MAIL_DRIVER: 'log',
      MAILERSEND_API_KEY: undefined,
    });

    expect(config.MAIL_DRIVER).toBe(MailDriver.Log);
    expect(config.MAILERSEND_API_KEY).toBeUndefined();
  });
});
