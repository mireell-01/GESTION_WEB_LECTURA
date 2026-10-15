import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Express } from 'express';

import { FiltroErrores } from './modules/shared-kernel/public-api';

/**
 * Adaptadores primarios globales (prefijo, CORS, validación y errores).
 * Se comparte entre main.ts y las pruebas de integración para que ambos usen la misma configuración.
 */
export function configurarApp(app: INestApplication): INestApplication {
  // La IP real del cliente llega en X-Forwarded-For desde el proxy (Next.js en local, CDN/ALB en la nube);
  // solo se confía en proxies conocidos para que el límite de tasa por IP (RNF-019) no se pueda burlar.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', process.env['TRUST_PROXY'] ?? 'loopback');
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3002',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new FiltroErrores());
  return app;
}
