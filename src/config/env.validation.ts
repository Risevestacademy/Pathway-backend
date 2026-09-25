import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateBy,
  validateSync,
} from 'class-validator';
import ms, { type StringValue } from 'ms';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
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
