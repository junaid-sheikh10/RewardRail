import { INestApplication, ValidationPipe } from '@nestjs/common';

// Shared by main.ts and the e2e tests, so tests run the app exactly like production.
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true, // ...and reject requests that send them
      transform: true, // turn plain JSON into DTO class instances
    }),
  );
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
}
