import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inject } from 'vitest';

/**
 * Variables de entorno de cada worker de integración: base efímera, secreto de pruebas
 * y correo en modo bandeja (sin SMTP real).
 */
process.env['DATABASE_URL'] = inject('databaseUrl');
process.env['JWT_SECRET'] = 'secreto-de-pruebas-de-integracion-con-mas-de-32-caracteres';
process.env['WEB_ORIGIN'] = 'http://localhost:3002';
process.env['NODE_ENV'] = 'test';
// Todas las pruebas salen de 127.0.0.1: se amplía el límite de tasa salvo en la prueba que lo verifica.
process.env['LIMITE_TASA_FACTOR'] = '100';
delete process.env['SMTP_HOST'];
// RF-023: los archivos subidos en las pruebas van a una carpeta temporal, no a la del proyecto.
process.env['ALMACEN_DIR'] = join(tmpdir(), 'lectoaventura-almacen-pruebas');
