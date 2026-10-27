import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Cuenta } from '../../../src/modules/iam/domain/entities/cuenta';
import { Contrasena } from '../../../src/modules/iam/domain/value-objects/contrasena';
import { Email } from '../../../src/modules/iam/domain/value-objects/email';
import { Rol } from '../../../src/modules/iam/domain/value-objects/rol';
import { PrismaCuentaRepository } from '../../../src/modules/iam/infrastructure/persistence/prisma-cuenta-repository';
import { PrismaPerfilEstudianteRepository } from '../../../src/modules/iam/infrastructure/persistence/prisma-perfil-estudiante-repository';
import { PrismaAulaRepository } from '../../../src/modules/escuela/infrastructure/persistence/prisma-aula-repository';
import { PrismaService, uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Estructura de datos del SRS §7 contra PostgreSQL real: schemas por bounded context,
 * reglas del negocio como restricciones, registros append-only, catálogo y vistas de reportes.
 */
const prisma = new PrismaService();
const AHORA = new Date('2026-10-15T15:00:00Z');
const SCHEMAS = ['iam', 'escuela', 'contenido', 'aventura', 'diagnostico', 'lectura', 'progreso', 'gamificacion', 'asistente', 'admin'];

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await vaciarBase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Organización de la base (SRS §7)', () => {
  it('cada bounded context tiene su schema con las tablas del SRS', async () => {
    const filas = await prisma.$queryRaw<{ esquema: string; tabla: string }[]>`
      SELECT table_schema AS esquema, table_name AS tabla FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema = ANY(${SCHEMAS})`;
    const porSchema = (s: string) => filas.filter((f) => f.esquema === s).map((f) => f.tabla).sort();

    // 52 del SRS + 4 del Módulo 8 (idempotencia, avance de insignias y recompensas).
    expect(filas).toHaveLength(56);
    expect(porSchema('iam')).toEqual(expect.arrayContaining(['cuenta_adulta', 'perfil_estudiante', 'consentimiento', 'vinculo_responsable', 'factor_mfa', 'refresh_token']));
    expect(porSchema('escuela')).toEqual(['asignacion', 'asignacion_destinatario', 'aula', 'institucion', 'invitacion_familiar', 'matricula']);
    expect(porSchema('contenido')).toEqual(['actividad', 'clave_evidencia', 'item', 'lectura', 'nodo_historia', 'oracion', 'pista', 'recurso', 'version_lectura']);
    expect(porSchema('aventura')).toEqual(['mision', 'mision_lectura', 'mundo', 'progreso_mision', 'progreso_mundo']);
    expect(porSchema('diagnostico')).toEqual(['banco_item_diagnostico', 'diagnostico', 'respuesta_diagnostico']);
    expect(porSchema('lectura')).toEqual(['decision_ruta', 'justificacion', 'respuesta', 'sesion_lectura', 'uso_pista', 'valoracion_rubrica']);
    expect(porSchema('progreso')).toEqual(['historial_maestria', 'maestria_habilidad', 'recomendacion']);
    expect(porSchema('gamificacion')).toEqual(['asiento_puntos', 'avance_insignia', 'canje_recompensa', 'evento_aplicado', 'insignia', 'insignia_otorgada', 'parametro_gamificacion', 'racha', 'recompensa', 'reto_diario']);
    expect(porSchema('asistente')).toEqual(['conversacion', 'turno']);
    expect(porSchema('admin')).toEqual(['auditoria', 'outbox_evento']);

    const vistas = await prisma.$queryRaw<{ matviewname: string }[]>`SELECT matviewname FROM pg_matviews WHERE schemaname = 'reporting' ORDER BY 1`;
    expect(vistas.map((v) => v.matviewname)).toEqual(['mv_actividad_estudiante', 'mv_actividad_semanal', 'mv_desempeno_aula', 'mv_maestria_estudiante']);
  });

  it('los identificadores son UUID y las fechas TIMESTAMPTZ', async () => {
    const tipos = await prisma.$queryRaw<{ columna: string; tipo: string }[]>`
      SELECT column_name AS columna, data_type AS tipo FROM information_schema.columns
      WHERE table_schema = 'iam' AND table_name = 'cuenta_adulta' AND column_name IN ('id', 'creado_en')`;
    expect(Object.fromEntries(tipos.map((t) => [t.columna, t.tipo]))).toEqual({ id: 'uuid', creado_en: 'timestamp with time zone' });
  });

  it('el catálogo del SRS viene cargado: 5 mundos y parámetros de gamificación v1', async () => {
    const mundos = await prisma.mundo.findMany({ orderBy: { numero: 'asc' } });
    expect(mundos.map((m) => m.nombre)).toEqual(['Explorador', 'Detective', 'Investigador', 'Crítico', 'Maestro de la Lectura']);
    expect(mundos[0]?.habilidadesFoco).toEqual(['LIT', 'VOC']);
    const parametros = await prisma.parametroGamificacion.findUniqueOrThrow({ where: { version: 1 } });
    expect(parametros.parametros).toMatchObject({ puntos: { itemCorrecto: 10, lecturaCompletada: 20 }, antiFarming: { topeDiario: 300 } });
  });
});

describe('Repositorios con la nueva estructura', () => {
  const cuenta = () =>
    Cuenta.registrar({
      id: uuidV7(), nombre: 'Ana Ríos', email: Email.de(`ana.${Math.random().toString(36).slice(2, 8)}@lectoaventura.test`), contrasena: Contrasena.de('Lectura-Segura-2026'),
      rol: Rol.de('DOCENTE'), hashContrasena: '$argon2id$x', ahora: AHORA,
    });

  it('el segundo factor (MFA) se guarda en iam.factor_mfa y se borra al desactivarse', async () => {
    const repo = new PrismaCuentaRepository(prisma);
    const c = cuenta();
    c.iniciarMfa('SECRETO-PENDIENTE');
    await repo.guardar(c);
    expect(await prisma.factorMfa.findUnique({ where: { cuentaId: c.id } })).toMatchObject({ habilitado: false, secretoPendiente: 'SECRETO-PENDIENTE' });
    expect((await repo.buscarPorId(c.id))?.mfaSecretPendiente).toBe('SECRETO-PENDIENTE');

    const sinMfa = cuenta();
    await repo.guardar(sinMfa);
    expect(await prisma.factorMfa.count({ where: { cuentaId: sinMfa.id } })).toBe(0);
  });

  it('un id mal formado no rompe la consulta: simplemente no existe', async () => {
    expect(await new PrismaCuentaRepository(prisma).buscarPorId('no-es-un-uuid')).toBeNull();
    expect(await new PrismaPerfilEstudianteRepository(prisma).buscarPorId('x')).toBeNull();
    expect(await new PrismaPerfilEstudianteRepository(prisma).buscarPorIds(['x', uuidV7()])).toEqual([]);
    expect(await new PrismaAulaRepository(prisma).buscarPorId('aula-1')).toBeNull();
  });

  it('uuidV7 genera UUID versión 7 ordenados por tiempo', () => {
    const a = uuidV7(Date.UTC(2026, 9, 16));
    const b = uuidV7(Date.UTC(2026, 9, 17));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});

describe('Reglas del negocio en la base', () => {
  const crearCuenta = async (datos: Partial<{ rol: string; estado: string }> = {}) =>
    prisma.cuenta.create({ data: { id: uuidV7(), nombre: 'Ana', email: `${uuidV7()}@lectoaventura.test`, hashContrasena: 'h', rol: 'FAMILIAR', ...datos } });

  it('rechaza valores fuera del catálogo y reglas imposibles', async () => {
    await expect(crearCuenta({ rol: 'SUPERUSUARIO' })).rejects.toThrow(/ck_cuenta_rol/);
    // RN-10: los puntos nunca son negativos.
    await expect(
      prisma.asientoPuntos.create({ data: { estudianteId: uuidV7(), puntos: -5, motivo: 'ITEM_CORRECTO', eventoOrigen: uuidV7(), fechaLima: AHORA } }),
    ).rejects.toThrow(/ck_asiento_puntos/);
    // RF-074: el asistente admite como máximo 10 intercambios.
    await expect(
      prisma.conversacion.create({
        data: { estudianteId: uuidV7(), sesionLecturaId: uuidV7(), intercambios: 11, expiraEn: new Date(Date.now() + 86_400_000) },
      }),
    ).rejects.toThrow(/ck_conversacion_intercambios/);
    // Solo un diagnóstico inicial por estudiante.
    const estudianteId = uuidV7();
    await prisma.diagnostico.create({ data: { estudianteId, rangoEdad: 'R2', totalItems: 15 } });
    await expect(prisma.diagnostico.create({ data: { estudianteId, rangoEdad: 'R2', totalItems: 15 } })).rejects.toThrow();
  });

  it('el libro de puntos y la auditoría solo admiten agregar registros', async () => {
    const asiento = await prisma.asientoPuntos.create({
      data: { estudianteId: uuidV7(), puntos: 10, motivo: 'ITEM_CORRECTO', eventoOrigen: uuidV7(), fechaLima: AHORA },
    });
    await expect(prisma.asientoPuntos.update({ where: { id: asiento.id }, data: { puntos: 99 } })).rejects.toThrow(/solo admite agregar/);
    await expect(prisma.asientoPuntos.delete({ where: { id: asiento.id } })).rejects.toThrow(/solo admite agregar/);

    const evento = await prisma.auditoria.create({ data: { accion: 'CUENTA_SUSPENDIDA', recursoTipo: 'cuenta', ip: '203.0.113.7' } });
    await expect(prisma.auditoria.delete({ where: { id: evento.id } })).rejects.toThrow(/solo admite agregar/);
  });

  it('el libro de puntos es idempotente ante la reentrega de un evento', async () => {
    const datos = { estudianteId: uuidV7(), puntos: 10, motivo: 'ITEM_CORRECTO', eventoOrigen: uuidV7(), fechaLima: AHORA };
    await prisma.asientoPuntos.create({ data: datos });
    await expect(prisma.asientoPuntos.create({ data: datos })).rejects.toThrow();
  });

  it('la vista de desempeño del aula se refresca con los datos de matrícula y maestría', async () => {
    const docente = await crearCuenta({ rol: 'DOCENTE' });
    const aula = await prisma.aula.create({
      data: { id: uuidV7(), docenteId: docente.id, nombre: '3.° B', grado: '3', anioLectivo: 2026, institucion: 'IE', codigo: 'ABC234' },
    });
    const estudianteId = uuidV7();
    await prisma.matricula.create({ data: { id: uuidV7(), aulaId: aula.id, estudianteId } });
    await prisma.maestriaHabilidad.create({ data: { estudianteId, habilidad: 'INF', valor: 72.5, itemsContados: 6, actualizadoEn: AHORA } });

    await prisma.$executeRaw`SELECT "reporting"."refrescar_vistas"()`;
    const filas = await prisma.$queryRaw<{ habilidad: string; estudiantes: number; nivel_a: number }[]>`
      SELECT habilidad, estudiantes, nivel_a FROM "reporting"."mv_desempeno_aula" WHERE aula_id = ${aula.id}::uuid`;
    expect(filas).toEqual([{ habilidad: 'INF', estudiantes: 1, nivel_a: 1 }]);
  });
});
