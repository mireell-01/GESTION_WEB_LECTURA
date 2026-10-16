import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Cuenta } from '../../../src/modules/iam/domain/entities/cuenta';
import { PerfilEstudiante } from '../../../src/modules/iam/domain/entities/perfil-estudiante';
import { Sesion } from '../../../src/modules/iam/domain/entities/sesion';
import { VerificacionCorreo } from '../../../src/modules/iam/domain/entities/verificacion-correo';
import { AnioMesNacimiento } from '../../../src/modules/iam/domain/value-objects/anio-mes-nacimiento';
import { Contrasena } from '../../../src/modules/iam/domain/value-objects/contrasena';
import { Email } from '../../../src/modules/iam/domain/value-objects/email';
import { Rol } from '../../../src/modules/iam/domain/value-objects/rol';
import { PrismaCuentaRepository } from '../../../src/modules/iam/infrastructure/persistence/prisma-cuenta-repository';
import { PrismaPerfilEstudianteRepository } from '../../../src/modules/iam/infrastructure/persistence/prisma-perfil-estudiante-repository';
import { PrismaSesionRepository } from '../../../src/modules/iam/infrastructure/persistence/prisma-sesion-repository';
import { PrismaVerificacionRepository } from '../../../src/modules/iam/infrastructure/persistence/prisma-verificacion-repository';
import { PrismaService } from '../../../src/modules/shared-kernel/public-api';
import { vaciarBase } from '../setup/app';

/** Nivel 2 — Adaptadores Prisma de IAM contra PostgreSQL real (traducción ORM ↔ dominio). */
const prisma = new PrismaService();
const AHORA = new Date('2026-10-15T15:00:00Z');

function cuenta(id: string, email: string, nombre = 'Ana Ríos') {
  return Cuenta.registrar({
    id, nombre, email: Email.de(email), contrasena: Contrasena.de('Lectura-Segura-2026'),
    rol: Rol.de('DOCENTE'), hashContrasena: '$argon2id$x', ahora: AHORA,
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await vaciarBase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaCuentaRepository', () => {
  const repo = new PrismaCuentaRepository(prisma);

  it('guarda y reconstruye la cuenta con sus value objects y estado MFA', async () => {
    const c = cuenta('c1', 'ana@lectoaventura.test');
    c.verificar();
    c.iniciarMfa('PENDIENTE');
    await repo.guardar(c);

    const leida = await repo.buscarPorEmail('ana@lectoaventura.test');
    expect(leida?.estaActiva()).toBe(true);
    expect(leida?.mfaSecretPendiente).toBe('PENDIENTE');
    expect(leida?.propsSnapshot.creadoEn).toEqual(AHORA);
  });

  it('upsert: guardar dos veces actualiza, no duplica', async () => {
    const c = cuenta('c1', 'ana@lectoaventura.test');
    await repo.guardar(c);
    c.suspender();
    await repo.guardar(c);
    expect(await prisma.cuenta.count()).toBe(1);
    expect((await repo.buscarPorId('c1'))?.estaSuspendida()).toBe(true);
  });

  it('listar filtra por texto sin distinguir mayúsculas en nombre o correo', async () => {
    await repo.guardar(cuenta('c1', 'ana@lectoaventura.test', 'Ana Ríos'));
    await repo.guardar(cuenta('c2', 'luis@colegio.pe', 'Luis Paz'));
    expect((await repo.listar({ texto: 'RÍOS' })).map((c) => c.id)).toEqual(['c1']);
    expect((await repo.listar({ texto: 'COLEGIO' })).map((c) => c.id)).toEqual(['c2']);
  });

  it('el correo es único a nivel de base de datos', async () => {
    await repo.guardar(cuenta('c1', 'ana@lectoaventura.test'));
    await expect(repo.guardar(cuenta('c2', 'ana@lectoaventura.test'))).rejects.toThrow();
  });
});

describe('PrismaPerfilEstudianteRepository y PrismaSesionRepository', () => {
  it('listarPorResponsable excluye perfiles eliminados', async () => {
    await new PrismaCuentaRepository(prisma).guardar(cuenta('c1', 'ana@lectoaventura.test'));
    const repo = new PrismaPerfilEstudianteRepository(prisma);
    const nuevo = (id: string, alias: string) =>
      PerfilEstudiante.crear({
        id, cuentaResponsableId: 'c1', consentimientoId: 'k1', alias,
        anioMesNacimiento: AnioMesNacimiento.de(2018, 5, AHORA), avatar: 'zorro', hashPin: 'h', ahora: AHORA,
      });
    const borrado = nuevo('p2', 'Beto');
    borrado.anonimizar(AHORA);
    await repo.guardar(nuevo('p1', 'Ana'));
    await repo.guardar(borrado);

    expect((await repo.listarPorResponsable('c1')).map((p) => p.id)).toEqual(['p1']);
    expect((await repo.buscarPorIds(['p1', 'p2'])).length).toBe(2);
  });

  it('revocarTodasDe revoca solo las sesiones vivas de ese sujeto', async () => {
    const repo = new PrismaSesionRepository(prisma);
    const abrir = (id: string, sujetoId: string) =>
      Sesion.abrir({ id, sujetoId, rol: 'FAMILIAR', mfa: false, hashRefreshToken: `h-${id}`, ahora: AHORA });
    await repo.guardar(abrir('s1', 'c1'));
    await repo.guardar(abrir('s2', 'c1'));
    await repo.guardar(abrir('s3', 'c2'));

    await repo.revocarTodasDe('c1', AHORA);
    expect((await repo.buscarPorId('s1'))?.revocadaEn).toEqual(AHORA);
    expect((await repo.buscarPorId('s3'))?.revocadaEn).toBeNull();
    expect((await repo.buscarPorHashRefreshToken('h-s2'))?.id).toBe('s2');
  });
});

describe('PrismaVerificacionRepository', () => {
  it('no confunde un enlace de verificación con uno de recuperación', async () => {
    await new PrismaCuentaRepository(prisma).guardar(cuenta('c1', 'ana@lectoaventura.test'));
    const repo = new PrismaVerificacionRepository(prisma);
    const v = VerificacionCorreo.paraVerificacionCorreo({ id: 'v1', cuentaId: 'c1', codigo: 'huella-1', ahora: AHORA });
    await repo.guardar(v);

    expect(await repo.buscarPorCodigo('huella-1', 'RECUPERACION_CONTRASENA')).toBeNull();
    const leida = await repo.buscarPorCodigo('huella-1', 'CORREO');
    expect(leida?.estaVigente(AHORA)).toBe(true);
    leida?.canjear(AHORA);
    await repo.guardar(leida as VerificacionCorreo);
    expect((await repo.buscarPorCodigo('huella-1', 'CORREO'))?.codigo.yaCanjeado).toBe(true);
  });
});
