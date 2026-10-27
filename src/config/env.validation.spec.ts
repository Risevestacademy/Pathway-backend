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
    RESEND_API_KEY: 'test-resend-key',
    EMAIL_FROM_ADDRESS: 'noreply@pathway.dev',
    GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com',
    PASSWORD_RESET_URL: 'https://pathway.example.com/reset-password',
    STAFF_INVITE_URL: 'https://pathway.example.com/accept-invite',
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
      RESEND_API_KEY: validEnv.RESEND_API_KEY,
      EMAIL_FROM_ADDRESS: validEnv.EMAIL_FROM_ADDRESS,
      GOOGLE_CLIENT_IDS: validEnv.GOOGLE_CLIENT_IDS,
    });

    expect(config.NODE_ENV).toBe(NodeEnv.Development);
    expect(config.PORT).toBe(3000);
    expect(config.API_VERSION).toBe('v1');
  });

  it('accepts a custom API version', () => {
    const config = validateEnv({ ...validEnv, API_VERSION: 'v2' });

    expect(config.API_VERSION).toBe('v2');
  });

  it('throws when API_VERSION is empty', () => {
    expect(() => validateEnv({ ...validEnv, API_VERSION: '' })).toThrow(
      /API_VERSION/,
    );
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
      validateEnv({ ...validEnv, UNRELATED_VARIABLE: 'anything' }),
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
        API_VERSION: '',
        JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
        JWT_ACCESS_EXPIRY: validEnv.JWT_ACCESS_EXPIRY,
        JWT_REFRESH_SECRET: validEnv.JWT_REFRESH_SECRET,
        JWT_REFRESH_EXPIRY: validEnv.JWT_REFRESH_EXPIRY,
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL[\s\S]*API_VERSION/);
  });

  // ─── LOG_LEVEL ──────────────────────────────────────────────────────

  it('defaults LOG_LEVEL to info', () => {
    const config = validateEnv(validEnv);

    expect(config.LOG_LEVEL).toBe('info');
  });

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])(
    'accepts LOG_LEVEL=%s',
    (level) => {
      const config = validateEnv({ ...validEnv, LOG_LEVEL: level });

      expect(config.LOG_LEVEL).toBe(level);
    },
  );

  it('throws when LOG_LEVEL is not a pino level', () => {
    expect(() => validateEnv({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  // ─── THROTTLE ───────────────────────────────────────────────────────

  it('applies default rate limits when absent', () => {
    const config = validateEnv(validEnv);

    expect(config.THROTTLE_TTL_MS).toBe(60000);
    expect(config.THROTTLE_LIMIT).toBe(100);
    expect(config.THROTTLE_AUTH_LIMIT).toBe(10);
    expect(config.THROTTLE_FEEDBACK_LIMIT).toBe(5);
  });

  it('throws when THROTTLE_LIMIT is not a positive integer', () => {
    expect(() => validateEnv({ ...validEnv, THROTTLE_LIMIT: '0' })).toThrow(
      /THROTTLE_LIMIT/,
    );
  });

  // ─── JWT ────────────────────────────────────────────────────────────

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

  it('reports both secrets as empty, but not as differing', () => {
    try {
      validateEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: '',
        JWT_REFRESH_SECRET: '',
      });
      fail('expected validation to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/JWT_ACCESS_SECRET should not be empty/);
      expect(message).toMatch(/JWT_REFRESH_SECRET should not be empty/);
      expect(message).not.toMatch(/must differ from/);
    }
  });

  it('reports only the empty refresh secret when the access secret is set', () => {
    try {
      validateEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: '',
      });
      fail('expected validation to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/JWT_REFRESH_SECRET should not be empty/);
      expect(message).not.toMatch(/JWT_ACCESS_SECRET/);
      expect(message).not.toMatch(/must differ from/);
    }
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

  // ─── PASSWORD_RESET_URL ─────────────────────────────────────────────

  it('defaults PASSWORD_RESET_URL to the local frontend reset page', () => {
    const config = validateEnv({
      ...validEnv,
      NODE_ENV: 'development',
      PASSWORD_RESET_URL: undefined,
    });

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

  it('rejects http PASSWORD_RESET_URL in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PASSWORD_RESET_URL: 'http://pathway.example.com/reset-password',
      }),
    ).toThrow(/PASSWORD_RESET_URL must be an https URL/);
  });

  it('rejects http PASSWORD_RESET_URL in staging', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'staging',
        PASSWORD_RESET_URL: 'http://pathway.example.com/reset-password',
      }),
    ).toThrow(/PASSWORD_RESET_URL must be an https URL/);
  });

  it('allows http PASSWORD_RESET_URL in development', () => {
    const config = validateEnv({
      ...validEnv,
      NODE_ENV: 'development',
      PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
    });

    expect(config.PASSWORD_RESET_URL).toBe(
      'http://localhost:5173/reset-password',
    );
  });

  // ─── STAFF_INVITE_URL ───────────────────────────────────────────────

  it('defaults STAFF_INVITE_URL to the local frontend accept page', () => {
    const config = validateEnv({
      ...validEnv,
      NODE_ENV: 'development',
      STAFF_INVITE_URL: undefined,
    });

    expect(config.STAFF_INVITE_URL).toBe('http://localhost:5173/accept-invite');
  });

  it('accepts a deployed STAFF_INVITE_URL', () => {
    const config = validateEnv({
      ...validEnv,
      STAFF_INVITE_URL: 'https://pathway.example.com/accept-invite',
    });

    expect(config.STAFF_INVITE_URL).toBe(
      'https://pathway.example.com/accept-invite',
    );
  });

  it('throws when STAFF_INVITE_URL is not a URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, STAFF_INVITE_URL: 'accept-invite' }),
    ).toThrow(/STAFF_INVITE_URL/);
  });

  it('allows STAFF_INVITE_URL and PASSWORD_RESET_URL to be absent in development', () => {
    const {
      STAFF_INVITE_URL: _omitStaff,
      PASSWORD_RESET_URL: _omitReset,
      ...withoutUrls
    } = validEnv;

    expect(() =>
      validateEnv({
        ...withoutUrls,
        NODE_ENV: 'development',
      }),
    ).not.toThrow();
  });

  it('fails startup in production when STAFF_INVITE_URL is absent', () => {
    const { STAFF_INVITE_URL: _omit, ...withoutStaffInvite } = validEnv;

    expect(() => validateEnv(withoutStaffInvite)).toThrow(
      /STAFF_INVITE_URL must be an https URL/,
    );
  });

  it('rejects http STAFF_INVITE_URL in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        STAFF_INVITE_URL: 'http://pathway.example.com/accept-invite',
      }),
    ).toThrow(/STAFF_INVITE_URL must be an https URL/);
  });

  it('allows http STAFF_INVITE_URL in development', () => {
    const config = validateEnv({
      ...validEnv,
      NODE_ENV: 'development',
      STAFF_INVITE_URL: 'http://localhost:5173/accept-invite',
    });

    expect(config.STAFF_INVITE_URL).toBe('http://localhost:5173/accept-invite');
  });

  // ─── GOOGLE_CLIENT_IDS ──────────────────────────────────────────────

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

  // ─── MAIL_DRIVER ────────────────────────────────────────────────────

  it('defaults MAIL_DRIVER to resend', () => {
    const config = validateEnv(validEnv);

    expect(config.MAIL_DRIVER).toBe(MailDriver.Resend);
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
      NODE_ENV: 'development',
      MAILERSEND_API_KEY: undefined,
    });

    expect(config.MAIL_DRIVER).toBe(MailDriver.Log);
    expect(config.MAILERSEND_API_KEY).toBeUndefined();
  });

  it('rejects the log driver in production', () => {
    expect(() =>
      validateEnv({ ...validEnv, MAIL_DRIVER: 'log', NODE_ENV: 'production' }),
    ).toThrow('MAIL_DRIVER=log is only allowed');
  });

  it('rejects the log driver in staging', () => {
    expect(() =>
      validateEnv({ ...validEnv, MAIL_DRIVER: 'log', NODE_ENV: 'staging' }),
    ).toThrow('MAIL_DRIVER=log is only allowed');
  });

  // ─── EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME ───────────────────────────

  it('defaults EMAIL_FROM_NAME to "Pathway"', () => {
    const config = validateEnv(validEnv);

    expect(config.EMAIL_FROM_NAME).toBe('Pathway');
  });

  it('accepts a custom EMAIL_FROM_NAME', () => {
    const config = validateEnv({
      ...validEnv,
      EMAIL_FROM_NAME: 'Pathway Careers',
    });

    expect(config.EMAIL_FROM_NAME).toBe('Pathway Careers');
  });

  it('throws when EMAIL_FROM_NAME exceeds 100 characters', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        EMAIL_FROM_NAME: 'a'.repeat(101),
      }),
    ).toThrow(/EMAIL_FROM_NAME/);
  });

  it('throws when EMAIL_FROM_ADDRESS is missing', () => {
    const { EMAIL_FROM_ADDRESS: _omit, ...withoutFrom } = validEnv;

    expect(() => validateEnv(withoutFrom)).toThrow(/EMAIL_FROM_ADDRESS/);
  });

  it('throws when EMAIL_FROM_ADDRESS is empty', () => {
    expect(() => validateEnv({ ...validEnv, EMAIL_FROM_ADDRESS: '' })).toThrow(
      /EMAIL_FROM_ADDRESS/,
    );
  });

  it('throws when EMAIL_FROM_ADDRESS is not an email', () => {
    expect(() =>
      validateEnv({ ...validEnv, EMAIL_FROM_ADDRESS: 'not-an-email' }),
    ).toThrow(/EMAIL_FROM_ADDRESS/);
  });

  it('throws when EMAIL_FROM_ADDRESS exceeds 254 characters', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        EMAIL_FROM_ADDRESS: `${'a'.repeat(250)}@example.com`,
      }),
    ).toThrow(/EMAIL_FROM_ADDRESS/);
  });

  // ─── ANALYTICS_ENABLED ──────────────────────────────────────────────

  it('defaults ANALYTICS_ENABLED to false', () => {
    const config = validateEnv(validEnv);

    expect(config.ANALYTICS_ENABLED).toBe(false);
  });

  it.each([true, 'true', 'TRUE', '1', 'yes', ' Yes '])(
    'coerces %j to true',
    (value) => {
      const config = validateEnv({
        ...validEnv,
        ANALYTICS_ENABLED: value,
        POSTHOG_API_KEY: 'phc_test_key',
      });

      expect(config.ANALYTICS_ENABLED).toBe(true);
    },
  );

  it.each([false, 'false', 'FALSE', '0', 'no', ''])(
    'coerces %j to false',
    (value) => {
      const config = validateEnv({
        ...validEnv,
        ANALYTICS_ENABLED: value,
        POSTHOG_API_KEY: undefined,
      });

      expect(config.ANALYTICS_ENABLED).toBe(false);
    },
  );

  it('rejects an unrecognized ANALYTICS_ENABLED value', () => {
    expect(() =>
      validateEnv({ ...validEnv, ANALYTICS_ENABLED: 'sometimes' }),
    ).toThrow(/ANALYTICS_ENABLED/);
  });

  // ─── POSTHOG_API_KEY / POSTHOG_HOST ─────────────────────────────────

  it('does not require POSTHOG_API_KEY when analytics is disabled', () => {
    const config = validateEnv({
      ...validEnv,
      ANALYTICS_ENABLED: 'false',
      POSTHOG_API_KEY: undefined,
    });

    expect(config.ANALYTICS_ENABLED).toBe(false);
    expect(config.POSTHOG_API_KEY).toBeUndefined();
  });

  it.each([undefined, ''])(
    'requires POSTHOG_API_KEY when analytics is enabled (value: %j)',
    (value) => {
      expect(() =>
        validateEnv({
          ...validEnv,
          ANALYTICS_ENABLED: 'true',
          POSTHOG_API_KEY: value,
        }),
      ).toThrow(/POSTHOG_API_KEY/);
    },
  );

  it('accepts a POSTHOG_API_KEY when analytics is enabled', () => {
    const config = validateEnv({
      ...validEnv,
      ANALYTICS_ENABLED: 'true',
      POSTHOG_API_KEY: 'phc_test_key',
    });

    expect(config.POSTHOG_API_KEY).toBe('phc_test_key');
  });

  it('defaults POSTHOG_HOST to the EU host', () => {
    const config = validateEnv(validEnv);

    expect(config.POSTHOG_HOST).toBe('https://eu.i.posthog.com');
  });

  it('accepts a custom POSTHOG_HOST', () => {
    const config = validateEnv({
      ...validEnv,
      POSTHOG_HOST: 'https://us.i.posthog.com',
    });

    expect(config.POSTHOG_HOST).toBe('https://us.i.posthog.com');
  });

  it('accepts a localhost POSTHOG_HOST in development', () => {
    const config = validateEnv({
      ...validEnv,
      NODE_ENV: 'development',
      POSTHOG_HOST: 'http://localhost:8000',
    });

    expect(config.POSTHOG_HOST).toBe('http://localhost:8000');
  });

  it('throws when POSTHOG_HOST is not a URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, POSTHOG_HOST: 'not-a-url' }),
    ).toThrow(/POSTHOG_HOST/);
  });

  it('rejects http POSTHOG_HOST in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        POSTHOG_HOST: 'http://us.i.posthog.com',
      }),
    ).toThrow(/POSTHOG_HOST must be an https URL/);
  });

  // ─── MAIL_DRIVER=resend ─────────────────────────────────────────────

  describe('MAIL_DRIVER=resend', () => {
    it('requires RESEND_API_KEY', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          MAIL_DRIVER: 'resend',
          MAILERSEND_API_KEY: undefined,
          RESEND_API_KEY: undefined,
        }),
      ).toThrow(/RESEND_API_KEY/);
    });

    it('throws when RESEND_API_KEY is empty', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          MAIL_DRIVER: 'resend',
          MAILERSEND_API_KEY: undefined,
          RESEND_API_KEY: '',
        }),
      ).toThrow(/RESEND_API_KEY/);
    });

    it('accepts RESEND_API_KEY when set', () => {
      const config = validateEnv({
        ...validEnv,
        MAIL_DRIVER: 'resend',
        MAILERSEND_API_KEY: undefined,
        RESEND_API_KEY: 're_test_key',
      });

      expect(config.MAIL_DRIVER).toBe(MailDriver.Resend);
      expect(config.RESEND_API_KEY).toBe('re_test_key');
    });

    it('does not require MAILERSEND_API_KEY when the resend driver is selected', () => {
      const config = validateEnv({
        ...validEnv,
        MAIL_DRIVER: 'resend',
        MAILERSEND_API_KEY: undefined,
        RESEND_API_KEY: 're_test_key',
      });

      expect(config.MAILERSEND_API_KEY).toBeUndefined();
    });

    it('is not restricted by LogDriverOnlyInLocalEnvs in production', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          MAIL_DRIVER: 'resend',
          MAILERSEND_API_KEY: undefined,
          RESEND_API_KEY: 're_test_key',
        }),
      ).not.toThrow();
    });
  });

  // ─── MAIL_DRIVER=mailersend ─────────────────────────────────────────

  describe('MAIL_DRIVER=mailersend', () => {
    it('requires MAILERSEND_API_KEY', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          MAIL_DRIVER: 'mailersend',
          MAILERSEND_API_KEY: undefined,
          RESEND_API_KEY: undefined,
        }),
      ).toThrow(/MAILERSEND_API_KEY/);
    });

    it('does not require RESEND_API_KEY when the mailersend driver is selected', () => {
      const config = validateEnv({
        ...validEnv,
        MAIL_DRIVER: 'mailersend',
        MAILERSEND_API_KEY: 'test-key',
        RESEND_API_KEY: undefined,
      });

      expect(config.MAIL_DRIVER).toBe(MailDriver.MailerSend);
      expect(config.RESEND_API_KEY).toBeUndefined();
    });
  });
});
