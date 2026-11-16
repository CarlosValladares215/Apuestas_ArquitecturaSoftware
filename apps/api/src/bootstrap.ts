import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/**
 * Applies baseline HTTP security headers, cookie parsing, strict input validation, and CORS policy.
 */
export function configureAppSecurity(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const rawOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const allowedOrigins = rawOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.enableShutdownHooks();
}
