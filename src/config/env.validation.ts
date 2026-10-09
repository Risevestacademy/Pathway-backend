import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateBy,
  ValidateIf,
  validateSync,
} from 'class-validator';
import ms, { type StringValue } from 'ms';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

export enum MailDriver {
  MailerSend = 'mailersend',
  Log = 'log',
}

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];

const splitCommaList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : value;

const FRONTEND_URL_OPTIONS = {
  require_tld: false,
  require_protocol: true,
  protocols: ['http', 'https'],
};

const isPositiveDuration = (value: unknown): boolean => {
  try {
    return typeof value === 'string' && ms(value as StringValue) > 0;
  } catch {
    return false;
  }
};

const IsDuration = () =>
  ValidateBy({
    name: 'isDuration',
    validator: {
      validate: isPositiveDuration,
      defaultMessage: (args) =>
        `${args?.property} must be a duration such as 15m or 7d`,
    },
  });

const DiffersFrom = (property: keyof EnvironmentVariables) =>
  ValidateBy({
    name: 'differsFrom',
    constraints: [property],
    validator: {
      validate: (value, args) =>
        value !== (args?.object as EnvironmentVariables)[property],
      defaultMessage: (args) =>
        `${args?.property} must differ from ${property}`,
    },
  });

const LOCAL_ONLY_MAIL_DRIVER_ENVS = [NodeEnv.Development, NodeEnv.Test];

const LogDriverOnlyInLocalEnvs = () =>
  ValidateBy({
    name: 'logDriverOnlyInLocalEnvs',
    validator: {
      validate: (value, args) =>
        value !== MailDriver.Log ||
        LOCAL_ONLY_MAIL_DRIVER_ENVS.includes(
          (args?.object as EnvironmentVariables).NODE_ENV,
        ),
      defaultMessage: () =>
        'MAIL_DRIVER=log is only allowed when NODE_ENV is development or test, because it writes reset links to the logs',
    },
  });

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsOptional()
  @IsIn(LOG_LEVELS)
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  API_VERSION = 'v1';

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsDuration()
  JWT_ACCESS_EXPIRY: string;

  @IsString()
  @IsNotEmpty()
  @DiffersFrom('JWT_ACCESS_SECRET')
  JWT_REFRESH_SECRET: string;

  @IsDuration()
  JWT_REFRESH_EXPIRY: string;

  @IsOptional()
  @IsString()
  SENTRY_DSN: string;

  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS: number = 60000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT: number = 10;

  @IsEnum(MailDriver)
  @LogDriverOnlyInLocalEnvs()
  MAIL_DRIVER: MailDriver = MailDriver.MailerSend;

  @ValidateIf(
    (env: EnvironmentVariables) => env.MAIL_DRIVER === MailDriver.MailerSend,
  )
  @IsString()
  @IsNotEmpty()
  MAILERSEND_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  EMAIL_FROM_ADDRESS: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM_NAME = 'Pathway';

  @IsOptional()
  @IsUrl(FRONTEND_URL_OPTIONS)
  PASSWORD_RESET_URL = 'http://localhost:5173/reset-password';

  @IsOptional()
  @IsUrl(FRONTEND_URL_OPTIONS)
  EMAIL_VERIFICATION_URL = 'http://localhost:5173/verify-email';

  @Transform(splitCommaList)
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^[\w-]+\.apps\.googleusercontent\.com$/, {
    each: true,
    message:
      'GOOGLE_CLIENT_IDS must be a comma-separated list of Google OAuth client IDs',
  })
  GOOGLE_CLIENT_IDS: string[];
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');

    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  return validated;
}
