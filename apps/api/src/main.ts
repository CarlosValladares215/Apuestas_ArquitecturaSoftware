import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureAppSecurity } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureAppSecurity(app);

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API service listening on port ${String(port)}`, 'Bootstrap');
}

void bootstrap();
