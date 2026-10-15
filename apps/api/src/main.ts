import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

// Carga apps/api/.env antes de importar los módulos (que leen process.env al definirse).
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del entorno.
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('./app.module') as typeof import('./app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configurarApp } = require('./configurar-app') as typeof import('./configurar-app');

/** COMPOSITION ROOT: arranque de la aplicación. */
async function bootstrap(): Promise<void> {
  const app = configurarApp(await NestFactory.create(AppModule));
  app.enableShutdownHooks();

  const puerto = Number(process.env['PORT'] ?? 3001);
  await app.listen(puerto);

  console.log(`🛰️  API Lectoaventura escuchando en http://localhost:${puerto}/api`);
}

void bootstrap();
