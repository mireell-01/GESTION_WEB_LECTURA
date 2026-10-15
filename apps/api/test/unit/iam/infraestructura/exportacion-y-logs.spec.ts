import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { HmacFirmador } from '../../../../src/modules/iam/infrastructure/crypto/hmac-firmador';
import { PdfLibGenerador } from '../../../../src/modules/iam/infrastructure/export/pdf-lib-generador';
import { ErrorDeNegocio, FiltroErrores, redactar } from '../../../../src/modules/shared-kernel/public-api';

const SECRETO = 'secreto-de-pruebas-unitarias-con-mas-de-32-caracteres';

describe('HmacFirmador (RF-012, enlaces firmados)', () => {
  const firmador = new HmacFirmador(SECRETO, 'exportaciones');

  it('verifica su propia firma y rechaza cualquier cambio en el texto o la firma', () => {
    const firma = firmador.firmar('exp-1.pdf.1760000000000');
    expect(firmador.verificar('exp-1.pdf.1760000000000', firma)).toBe(true);
    expect(firmador.verificar('exp-1.json.1760000000000', firma)).toBe(false);
    expect(firmador.verificar('exp-1.pdf.1760000000000', `${firma}x`)).toBe(false);
    expect(firmador.verificar('exp-1.pdf.1760000000000', '')).toBe(false);
  });

  it('la clave depende del propósito: una firma de exportación no sirve para otro uso', () => {
    const otro = new HmacFirmador(SECRETO, 'otro-proposito');
    expect(otro.verificar('exp-1.pdf.1', firmador.firmar('exp-1.pdf.1'))).toBe(false);
  });
});

describe('PdfLibGenerador (RF-012)', () => {
  it('genera un PDF A4 válido, con título, idioma y páginas numeradas aunque haya mucho contenido', async () => {
    const pdf = await new PdfLibGenerador().generar({
      generadoEn: '2026-10-16T15:00:00.000Z',
      aviso: 'Datos del estudiante en LectoAventura (Ley N.º 29733).',
      perfil: { alias: 'Lucía Ñandú', rangoEdad: 'R2', activo: true },
      consentimiento: { tipo: 'PARENTAL', otorgante: 'Ana Ríos', medio: 'DIGITAL' },
      aulas: Array.from({ length: 60 }, (_, i) => ({ aula: `Aula ${i + 1} con un nombre bastante largo para forzar el ajuste de línea`, grado: '3' })),
      emoji: '🦊 no está en WinAnsi',
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getTitle()).toBe('Datos del estudiante — LectoAventura');
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const [ancho, alto] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect([Math.round(ancho), Math.round(alto)]).toEqual([595, 842]);
  });
});

describe('redactar — logs sin secretos (RNF-031)', () => {
  it.each([
    ['{"email":"ana@x.pe","contrasena":"Lectura-Segura-2026"}', 'Lectura-Segura-2026'],
    ['pin=2580&perfilId=p1', '2580'],
    ['GET /verificar-correo?codigo=Zx9_abcDEF123456789012345678901234567890abc', 'Zx9_abcDEF'],
    ['Cookie: la_refresh=abcDEF123; Path=/', 'abcDEF123'],
    ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl', 'eyJhbGciOiJIUzI1NiJ9'],
    ['hashPin: $argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA', '$argon2id$'],
    ['huella 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', '9f86d081884c'],
    ['tokenDispositivo: Zx9_abcDEF123456789012345678901234567890abc', 'Zx9_abcDEF'],
  ])('enmascara %s', (texto, secreto) => {
    const limpio = redactar(texto);
    expect(limpio).not.toContain(secreto);
  });

  it('no altera mensajes sin secretos', () => {
    expect(redactar('Falló un manejador de iam.CuentaCreada: conexión rechazada')).toBe(
      'Falló un manejador de iam.CuentaCreada: conexión rechazada',
    );
  });
});

describe('FiltroErrores — Problem Details RFC 9457 (SRS §7)', () => {
  function capturar(excepcion: unknown) {
    const salida: { estado?: number; tipo?: string; cuerpo?: Record<string, unknown> } = {};
    const res = {
      status(e: number) { salida.estado = e; return res; },
      type(t: string) { salida.tipo = t; return res; },
      json(c: Record<string, unknown>) { salida.cuerpo = c; return res; },
    };
    const req = { path: '/api/v1/auth/login', method: 'POST', headers: { 'x-request-id': 'req-12345678' } };
    const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ArgumentsHost;
    new FiltroErrores().catch(excepcion, host);
    return salida;
  }

  it('error de negocio → status, type, title, detail, instance, requestId y extensiones', () => {
    const r = capturar(new ErrorDeNegocio('PIN incorrecto', 'NO_AUTENTICADO', { intentosRestantes: 3 }));
    expect(r.estado).toBe(401);
    expect(r.tipo).toBe('application/problem+json');
    expect(r.cuerpo).toEqual({
      type: 'https://lectoaventura.pe/problemas/no-autenticado',
      title: 'Sesión requerida',
      status: 401,
      detail: 'PIN incorrecto',
      instance: '/api/v1/auth/login',
      requestId: 'req-12345678',
      intentosRestantes: 3,
    });
  });

  it('errores de validación de NestJS se unen en un solo detail', () => {
    const r = capturar(new HttpException({ message: ['el correo no es válido', 'falta la contraseña'] }, HttpStatus.BAD_REQUEST));
    expect(r.cuerpo).toMatchObject({ status: 400, detail: 'el correo no es válido. falta la contraseña' });
  });

  it('un error inesperado responde 500 genérico, sin filtrar el mensaje interno', () => {
    const r = capturar(new Error('relation "Cuenta" does not exist, hashContrasena: $argon2id$v=19$abc'));
    expect(r.estado).toBe(500);
    expect(r.cuerpo?.['detail']).toBe('Ocurrió un error inesperado. Inténtalo de nuevo.');
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/argon2|relation/);
  });
});
