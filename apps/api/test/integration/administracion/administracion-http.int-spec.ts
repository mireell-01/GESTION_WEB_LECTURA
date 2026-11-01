import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../../../src/modules/administracion/application/casos-uso-administracion';
import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { API, ayudantesReporting, bearer, CONTRASENA } from '../reporting/ayudantes';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Administración de la plataforma (RF-076 a RF-078) contra PostgreSQL real:
 * instituciones (suspender solo la marca), cuentas docentes (alta por correo, suspensión con pérdida
 * de acceso inmediata y aulas en solo lectura mientras sus niños siguen leyendo, reactivación),
 * auditoría con IP, filtros, páginas, inmutabilidad y retención de 2 años, y parámetros de
 * gamificación versionados que aplican solo a lo que ocurre después.
 */
let t: AppDePrueba;
let casos: CasosUsoAdministracion;
const { backoffice, adulto, docente, publicarKilla, leerKilla, crearAula } = ayudantesReporting(() => t);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoAdministracion>(CASOS_USO_ADMINISTRACION);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  // Los parámetros son catálogo (no se vacían entre archivos): se deja solo la versión 1.
  await t?.prisma.parametroGamificacion.deleteMany({ where: { version: { gt: 1 } } });
  await t?.cerrar();
});

type Cuenta = { email: string; token: string; id: string };
const IP = '203.0.113.50';

/** Una cuenta de administración con verificación en dos pasos (como todo el backoffice, RF-011). */
async function administrador(conMfa = true): Promise<Cuenta> {
  const email = `admin.${uuidV7().slice(-6)}@lectoaventura.test`;
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: 'Ana Admin', email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol: 'ADMIN_PLATAFORMA', estado: 'ACTIVA' },
  });
  const secreto = authenticator.generateSecret();
  if (conMfa) await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, ...(conMfa ? { codigoMfa: authenticator.generate(secreto) } : {}) }).expect(200);
  return { email, token: login.body.accessToken as string, id: cuenta.id };
}

const ingresar = (email: string) => t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA });
const registros = (accion: string) => t.prisma.auditoria.findMany({ where: { accion }, orderBy: { ocurridoEn: 'asc' } });

let admin: Cuenta;
let rosa: Cuenta;
let carmen: Cuenta;
let killa: { lecturaId: string; o: string[] };
let aulaId: string;
let mateo: string;
let ana: string;
let tablet: string;
let tokenMateo: string;
let tokenAna: string;
let codigoFamilia: string;
let institucionId: string;

describe('Preparación', () => {
  it('una administradora; Rosa con su aula "4.° A" del "IE 1234"; un código para la familia de Mateo', async () => {
    admin = await administrador();
    killa = await publicarKilla(await backoffice('EDITOR'), await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    carmen = await adulto('Carmen Díaz', 'FAMILIAR');
    await t.http().post(`${API}/consentimientos`).set(bearer(carmen.token)).send({ otorganteNombre: 'Carmen Díaz', aceptaPolitica: true }).expect(201);
    const aula = await crearAula(rosa.token, '4.° A', ['Mateo', 'Ana']);
    aulaId = aula.aulaId;
    mateo = aula.ids['Mateo'] as string;
    ana = aula.ids['Ana'] as string;
    tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(rosa.token)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    for (const id of [mateo, ana]) {
      await t.http().post(`${API}/estudiantes/${id}/pin/restablecer`).set(bearer(rosa.token)).set('X-Forwarded-For', IP).send({ pinNuevo: '4826' }).expect(200);
    }
    const nino = async (id: string) => (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: id, pin: '4826' }).expect(200)).body.accessToken as string;
    tokenMateo = await nino(mateo);
    tokenAna = await nino(ana);
    codigoFamilia = (await t.http().post(`${API}/estudiantes/${mateo}/invitaciones-familiar`).set(bearer(rosa.token)).expect(201)).body.codigo;
  });
});

describe('RF-076: instituciones', () => {
  const url = `${API}/admin/instituciones`;
  const nuevaAula = (institucion: string) =>
    t.http().post(`${API}/aulas`).set(bearer(rosa.token)).send({ nombre: '5.° B', grado: '5', anioLectivo: new Date().getFullYear(), institucion, autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true });

  it('registra una institución y vincula el aula que ya la nombraba igual', async () => {
    expect((await t.http().get(url).set(bearer(admin.token)).expect(200)).body).toEqual([]);
    const i = (await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'I.E. 1234', codigoModular: '0123456', region: 'Puno' }).expect(201)).body;
    institucionId = i.id;
    expect(i).toMatchObject({ nombre: 'I.E. 1234', codigoModular: '0123456', region: 'Puno', estado: 'ACTIVA', aulas: 1, docentes: 1, estudiantes: 2 });
    expect((await t.prisma.aula.findUniqueOrThrow({ where: { id: aulaId } })).institucionId).toBe(i.id);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'IE 1234' }).expect(409);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'IE 99', codigoModular: '123' }).expect(400);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'IE 99', director: 'x' }).expect(400);
  });

  it('suspendida, no se elige para aulas nuevas; reactivada, sí (y el aula queda vinculada)', async () => {
    expect((await t.http().patch(`${url}/${institucionId}`).set(bearer(admin.token)).send({ estado: 'SUSPENDIDA' }).expect(200)).body.estado).toBe('SUSPENDIDA');
    expect((await t.http().get(`${API}/instituciones`).set(bearer(rosa.token)).expect(200)).body).toEqual([]);
    const r = await nuevaAula('ie 1234').expect(409);
    expect(r.body.detail).toContain('está suspendida');

    await t.http().patch(`${url}/${institucionId}`).set(bearer(admin.token)).send({ estado: 'ACTIVA' }).expect(200);
    expect((await t.http().get(`${API}/instituciones`).set(bearer(rosa.token)).expect(200)).body).toEqual([{ id: institucionId, nombre: 'I.E. 1234' }]);
    const aula = (await nuevaAula('IE 1234').expect(201)).body;
    expect((await t.prisma.aula.findUniqueOrThrow({ where: { id: aula.id } })).institucionId).toBe(institucionId);
    await t.http().patch(`${url}/no-existe`).set(bearer(admin.token)).send({ estado: 'ACTIVA' }).expect(404);
  });

  it('solo la administración con verificación en dos pasos', async () => {
    await t.http().get(url).set(bearer(rosa.token)).expect(403);
    const sinMfa = await administrador(false);
    expect((await t.http().get(url).set(bearer(sinMfa.token)).expect(403)).body.detail).toContain('verificación en dos pasos');
    await t.http().get(url).expect(401);
  });
});

describe('RF-076: cuentas docentes', () => {
  const url = `${API}/admin/docentes`;

  it('alta: el docente crea su contraseña con el enlace del correo y ya ingresa', async () => {
    const d = (await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'Luis Ramos', email: 'luis.ramos@ie1234.edu.pe' }).expect(201)).body;
    expect(d).toMatchObject({ nombre: 'Luis Ramos', email: 'luis.ramos@ie1234.edu.pe', estado: 'PENDIENTE_VERIFICACION', aulas: 0 });
    await ingresar('luis.ramos@ie1234.edu.pe').expect(401);
    const correo = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; enlace: string }[]).find((c) => c.para === 'luis.ramos@ie1234.edu.pe');
    expect(correo?.asunto).toBe('Tu cuenta de docente en LectoAventura');
    await t.http().post(`${API}/auth/restablecer`).send({ codigo: new URL(correo!.enlace).searchParams.get('codigo'), contrasenaNueva: CONTRASENA }).expect(200);
    expect((await ingresar('luis.ramos@ie1234.edu.pe').expect(200)).body.rol).toBe('DOCENTE');
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'Luis Ramos', email: 'luis.ramos@ie1234.edu.pe' }).expect(409);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'Sin correo', email: 'no-es-correo' }).expect(400);
  });

  it('lista cada docente con sus aulas y estudiantes', async () => {
    const lista = (await t.http().get(url).set(bearer(admin.token)).expect(200)).body as { email: string; estado: string; aulas: number; estudiantes: number }[];
    expect(lista.find((d) => d.email === rosa.email)).toMatchObject({ estado: 'ACTIVA', aulas: 2, estudiantes: 2 });
    expect((await t.http().get(`${url}?estado=SUSPENDIDA`).set(bearer(admin.token)).expect(200)).body).toEqual([]);
    expect((await t.http().get(`${url}?texto=ramos`).set(bearer(admin.token)).expect(200)).body.map((d: { nombre: string }) => d.nombre)).toEqual(['Luis Ramos']);
    await t.http().get(`${url}?estado=BORRADA`).set(bearer(admin.token)).expect(400);
  });

  it('suspender: pierde el acceso al instante, sus aulas quedan en solo lectura y sus niños siguen leyendo', async () => {
    await t.http().get(`${API}/aulas`).set(bearer(rosa.token)).expect(200);
    const r = (await t.http().post(`${url}/${rosa.id}/suspension`).set(bearer(admin.token)).set('X-Forwarded-For', IP).expect(200)).body;
    expect(r).toMatchObject({ estado: 'SUSPENDIDA', aulas: 2, estudiantes: 2, aulasEnSoloLectura: true });

    await t.http().get(`${API}/aulas`).set(bearer(rosa.token)).expect(401);
    expect((await ingresar(rosa.email).expect(403)).body.detail).toContain('suspendida');
    // La familia no puede vincularse con el código que ella generó: el aula está en solo lectura.
    expect((await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo: codigoFamilia }).expect(409)).body.detail).toContain('solo lectura');
    // Los niños siguen: Mateo sigue con su sesión y Ana vuelve a entrar en la tablet del aula.
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(tokenMateo)).send({ lecturaId: killa.lecturaId }).expect(201);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: ana, pin: '4826' }).expect(200);
  });

  it('reactivar: vuelve a ingresar y su aula acepta cambios otra vez', async () => {
    expect((await t.http().delete(`${url}/${rosa.id}/suspension`).set(bearer(admin.token)).expect(200)).body).toMatchObject({ estado: 'ACTIVA', aulasEnSoloLectura: false });
    rosa.token = (await ingresar(rosa.email).expect(200)).body.accessToken;
    await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo: codigoFamilia }).expect(201);
  });

  it('solo cuentas docentes: una familia o un id inexistente responden 404', async () => {
    await t.http().post(`${url}/${carmen.id}/suspension`).set(bearer(admin.token)).expect(404);
    await t.http().post(`${url}/no-existe/suspension`).set(bearer(admin.token)).expect(404);
    await t.http().post(`${url}/${rosa.id}/suspension`).set(bearer(rosa.token)).expect(403);
  });
});

describe('RF-077: auditoría', () => {
  it('registra las acciones sensibles con actor, rol, recurso, fecha e IP', async () => {
    const [suspension] = await registros('CUENTA_SUSPENDIDA');
    expect(suspension).toMatchObject({ actorId: admin.id, actorRol: 'ADMIN_PLATAFORMA', recursoTipo: 'cuenta_adulta', recursoId: rosa.id, ip: IP });
    const pines = await registros('PIN_RESTABLECIDO');
    expect(pines.map((p) => [p.actorId, p.recursoId, p.ip])).toEqual([
      [rosa.id, mateo, IP],
      [rosa.id, ana, IP],
    ]);
    // La familia de Carmen y el consentimiento institucional de cada aula de Rosa (RF-015).
    expect((await registros('CONSENTIMIENTO_OTORGADO')).map((c) => [c.actorId, (c.datos as { tipo: string }).tipo])).toEqual([
      [carmen.id, 'PARENTAL'],
      [rosa.id, 'INSTITUCIONAL'],
      [rosa.id, 'INSTITUCIONAL'],
    ]);
    expect((await registros('INSTITUCION_CREADA'))[0]).toMatchObject({ actorId: admin.id, recursoId: institucionId });
    expect((await registros('DOCENTE_DADO_DE_ALTA'))[0]).toMatchObject({ actorId: admin.id, actorRol: 'ADMIN_PLATAFORMA' });
    expect(await registros('CUENTA_REACTIVADA')).toHaveLength(1);
  });

  it('registra el acceso de la docente al detalle de un estudiante', async () => {
    await t.http().get(`${API}/aulas/${aulaId}/estudiantes/${mateo}/detalle`).set(bearer(rosa.token)).set('X-Forwarded-For', '203.0.113.51').expect(200);
    expect((await registros('DETALLE_ESTUDIANTE_CONSULTADO'))[0]).toMatchObject({ actorId: rosa.id, actorRol: 'DOCENTE', recursoTipo: 'perfil_estudiante', recursoId: mateo, ip: '203.0.113.51' });
    // Un acceso negado no se registra.
    await t.http().get(`${API}/aulas/${aulaId}/estudiantes/${mateo}/detalle`).set(bearer(admin.token)).expect(403);
    expect(await registros('DETALLE_ESTUDIANTE_CONSULTADO')).toHaveLength(1);
  });

  it('la administración la consulta con filtros, el nombre de cada acción y de quién la hizo', async () => {
    const r = (await t.http().get(`${API}/admin/auditoria?accion=CUENTA_SUSPENDIDA`).set(bearer(admin.token)).expect(200)).body;
    expect(r.siguiente).toBeNull();
    expect(r.registros).toEqual([
      expect.objectContaining({ accion: 'CUENTA_SUSPENDIDA', etiqueta: 'Cuenta suspendida', actor: { id: admin.id, nombre: 'Ana Admin', rol: 'ADMIN_PLATAFORMA' }, recurso: { tipo: 'cuenta_adulta', id: rosa.id }, ip: IP }),
    ]);
    const deMateo = (await t.http().get(`${API}/admin/auditoria?recursoTipo=perfil_estudiante&recursoId=${mateo}`).set(bearer(admin.token)).expect(200)).body;
    expect(deMateo.registros.map((x: { accion: string }) => x.accion).sort()).toEqual(['DETALLE_ESTUDIANTE_CONSULTADO', 'FAMILIAR_VINCULADO', 'INVITACION_FAMILIAR_GENERADA', 'PIN_RESTABLECIDO']);
    expect((await t.http().get(`${API}/admin/auditoria?actorId=${rosa.id}&accion=PIN_RESTABLECIDO`).set(bearer(admin.token)).expect(200)).body.registros).toHaveLength(2);
    expect((await t.http().get(`${API}/admin/auditoria/acciones`).set(bearer(admin.token)).expect(200)).body).toContainEqual({ accion: 'PIN_RESTABLECIDO', etiqueta: 'PIN restablecido' });
    await t.http().get(`${API}/admin/auditoria?accion=BORRAR_TODO`).set(bearer(admin.token)).expect(400);
    await t.http().get(`${API}/admin/auditoria?desde=2026-10-30&hasta=2026-10-01`).set(bearer(admin.token)).expect(400);
    await t.http().get(`${API}/admin/auditoria`).set(bearer(rosa.token)).expect(403);
    // Consultar la auditoría también queda registrado.
    expect((await registros('AUDITORIA_CONSULTADA')).length).toBeGreaterThanOrEqual(3);
  });

  it('por páginas de 50, sin repetir ni saltar registros', async () => {
    const ahora = Date.now();
    await t.prisma.auditoria.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({ id: uuidV7(ahora - 3_600_000 - i), actorId: admin.id, actorRol: 'ADMIN_PLATAFORMA', accion: 'MISION_CREADA', recursoTipo: 'mision', recursoId: `m-${i}`, ocurridoEn: new Date(ahora - 3_600_000 - (i % 30) * 1000) })),
    });
    const primera = (await t.http().get(`${API}/admin/auditoria?accion=MISION_CREADA`).set(bearer(admin.token)).expect(200)).body;
    expect(primera.registros).toHaveLength(50);
    const segunda = (await t.http().get(`${API}/admin/auditoria?accion=MISION_CREADA&antesDe=${encodeURIComponent(primera.siguiente)}`).set(bearer(admin.token)).expect(200)).body;
    expect(segunda.registros).toHaveLength(10);
    expect(segunda.siguiente).toBeNull();
    expect(new Set([...primera.registros, ...segunda.registros].map((x: { id: string }) => x.id)).size).toBe(60);
  });

  it('es inmutable y se conserva 2 años: solo se borra lo más antiguo', async () => {
    const [una] = await registros('CUENTA_SUSPENDIDA');
    await expect(t.prisma.auditoria.update({ where: { id: una!.id }, data: { accion: 'OTRA' } })).rejects.toThrow(/solo admite agregar/);
    await expect(t.prisma.auditoria.delete({ where: { id: una!.id } })).rejects.toThrow(/más de 2 años/);
    const vieja = await t.prisma.auditoria.create({
      data: { id: uuidV7(Date.now() - 3 * 365 * 86_400_000), accion: 'LECTURA_PUBLICADA', recursoTipo: 'lectura', ocurridoEn: new Date(Date.now() - 3 * 365 * 86_400_000) },
    });
    const total = await t.prisma.auditoria.count();
    expect(await casos.auditoria.depurar(new Date())).toBe(1);
    expect(await t.prisma.auditoria.findUnique({ where: { id: vieja.id } })).toBeNull();
    expect(await t.prisma.auditoria.count()).toBe(total - 1);
  });
});

describe('RF-078: parámetros de gamificación', () => {
  const url = `${API}/admin/parametros-gamificacion`;

  it('muestra la versión vigente con los umbrales de las insignias', async () => {
    const v = (await t.http().get(url).set(bearer(admin.token)).expect(200)).body;
    expect(v).toMatchObject({ version: 1, creadoPor: null, parametros: { puntos: { lecturaCompletada: 20 }, antiFarming: { topeDiario: 300 }, nivelLector: { base: 100 } } });
    expect(v.insignias.map((i: { codigo: string; umbral: number }) => [i.codigo, i.umbral])).toEqual([
      ['PRIMERA_LECTURA', 1],
      ['DETECTIVE_EVIDENCIAS', 5],
      ['LECTOR_PERSEVERANTE', 7],
    ]);
  });

  it('una versión inválida no se publica y dice qué corregir', async () => {
    const { parametros } = (await t.http().get(url).set(bearer(admin.token))).body;
    const r = await t.http().put(url).set(bearer(admin.token)).send({ ...parametros, puntos: { ...parametros.puntos, lecturaCompletada: 900 } }).expect(400);
    expect(r.body.errores).toEqual(['los puntos por lectura completada debe ser un número entero entre 0 y 500']);
    await t.http().put(url).set(bearer(admin.token)).send({ puntos: {} }).expect(400);
    await t.http().put(url).set(bearer(rosa.token)).send(parametros).expect(403);
    expect(await t.prisma.parametroGamificacion.count()).toBe(1);
  });

  it('publicar crea la versión 2, que aplica solo a lo que ocurre desde ahora', async () => {
    const { parametros } = (await t.http().get(url).set(bearer(admin.token))).body;
    const v = (await t.http().put(url).set(bearer(admin.token)).set('X-Forwarded-For', IP).send({ ...parametros, puntos: { ...parametros.puntos, lecturaCompletada: 30 }, insignias: { PRIMERA_LECTURA: 2 } }).expect(200)).body;
    expect(v).toMatchObject({ version: 2, creadoPor: admin.id, parametros: { puntos: { lecturaCompletada: 30 }, insignias: { PRIMERA_LECTURA: 2 } } });
    expect((await t.http().get(`${url}/historial`).set(bearer(admin.token)).expect(200)).body.map((h: { version: number }) => h.version)).toEqual([2, 1]);
    expect((await registros('PARAMETROS_GAMIFICACION_PUBLICADOS'))[0]).toMatchObject({ actorId: admin.id, recursoId: '2', ip: IP });

    // Ana termina Killa: +30 (no 20) y "Primera lectura" ahora pide 2 lecturas.
    await leerKilla(tokenAna, killa);
    const asientos = await t.prisma.asientoPuntos.findMany({ where: { estudianteId: ana, motivo: 'LECTURA_COMPLETADA' } });
    expect(asientos.map((a) => a.puntos)).toEqual([30]);
    const primera = await t.prisma.insignia.findUniqueOrThrow({ where: { codigo: 'PRIMERA_LECTURA' } });
    expect(await t.prisma.insigniaOtorgada.count({ where: { estudianteId: ana, insigniaId: primera.id } })).toBe(0);
  });
});
