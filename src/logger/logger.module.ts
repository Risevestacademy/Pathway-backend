import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigModule, EnvironmentVariables } from '../config';
import { generateRequestId } from '../common';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),

          genReqId: (req) => generateRequestId(req.headers['x-request-id']),

          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            '*.password',
            '*.token',
            '*.accessToken',
            '*.refreshToken',
            '*.secret',
          ],

          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                  },
                }
              : undefined,
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
