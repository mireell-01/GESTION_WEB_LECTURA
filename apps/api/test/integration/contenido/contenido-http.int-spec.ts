import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Contenido integrado (RF-021 a RF-029): backoffice con MFA, flujo de publicación,
 * subida firmada de archivos, versiones, biblioteca y su vínculo con las asignaciones de Escuela,
 * contra PostgreSQL real.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(60)]);
const TEXTO = 'Había una vez un zorro que miraba la luna. Quería tocarla.\nUna tarde subió al cerro. Pero la luna seguía lejos.';

let t: AppDePrueba;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

/** Cuenta del backoffice con MFA activo (las crea el administrador, RF-076; aquí se siembran). */
async function backoffice(rol: 'EDITOR' | 'REVISOR', conMfa = true) {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  const secreto = authenticator.generateSecret();
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' },
  });
  if (conMfa) await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, ...(conMfa ? { codigoMfa: authenticator.generate(secreto) } : {}) }).expect(200);
  return { id: cuenta.id, token: login.body.accessToken as string, requiereConfigurarMfa: login.body.requiereConfigurarMfa as boolean };
}

async function adulto(rol: 'DOCENTE' | 'FAMILIAR') {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
  return login.body.accessToken as string;
}

const metadatos = (cambios = {}) => ({
  titulo: 'El zorro y la luna', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO',
  habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0', ...cambios,
});

const actividades = (oraciones: { id: string }[]) => [
  { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿De qué tratará?', explicacionModelada: 'El título lo anticipa.' }] },
  {
    momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: oraciones[1]!.id,
    items: [{
      habilidad: 'LIT', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué quería el zorro?', opciones: ['Tocar la luna', 'Dormir'], indiceCorrecto: 0,
      explicacionModelada: 'Dice que quería tocarla.', pistas: [{ nivel: 'P1', texto: 'Relee la segunda oración.' }],
    }],
  },
  {
    momento: 'DESPUES', tipo: 'EVIDENCIA',
    items: [{
      habilidad: 'INF', nivelDificultad: 3, modalidad: 'EVIDENCIA', enunciado: 'Marca dónde se ve que la luna estaba lejos', clavesEvidencia: [oraciones[3]!.id],
      explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }],
    }],
  },
];

let editora: Awaited<ReturnType<typeof backoffice>>;
let revisor: Awaited<ReturnType<typeof backoffice>>;
let lecturaId: string;
let recursoId: string;

describe('Backoffice protegido (RF-009, RF-011)', () => {
  it('solo editores y revisores con MFA verificado; las familias no entran', async () => {
    const sinMfa = await backoffice('EDITOR', false);
    expect(sinMfa.requiereConfigurarMfa).toBe(true);
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(sinMfa.token)).send({ metadatos: metadatos(), texto: TEXTO }).expect(403);
    const familia = await adulto('FAMILIAR');
    await t.http().get(`${API}/backoffice/lecturas`).set(bearer(familia)).expect(403);
    revisor = await backoffice('REVISOR');
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(revisor.token)).send({ metadatos: metadatos(), texto: TEXTO }).expect(403);
    // El esqueleto vacío del módulo ya no existe.
    await t.http().post(`${API}/contenido/demo`).set(bearer(revisor.token)).send({}).expect(404);
  });
});

describe('Autoría y flujo de publicación (RF-021 a RF-027)', () => {
  it('la editora crea la lectura en borrador, segmentada en oraciones', async () => {
    editora = await backoffice('EDITOR');
    const r = await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({ metadatos: metadatos(), texto: TEXTO }).expect(201);
    lecturaId = r.body.lecturaId;
    expect(r.body).toMatchObject({ numero: 1, estado: 'BORRADOR', esAutor: true });
    expect(r.body.oraciones.map((o: { texto: string }) => o.texto)).toEqual([
      'Había una vez un zorro que miraba la luna.', 'Quería tocarla.', 'Una tarde subió al cerro.', 'Pero la luna seguía lejos.',
    ]);
    expect(await t.prisma.oracion.count({ where: { versionLecturaId: r.body.versionId } })).toBe(4);

    const invalido = await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({ metadatos: metadatos({ nivelDificultad: 9 }), texto: TEXTO }).expect(400);
    expect(invalido.body.type).toMatch(/validacion/);
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({ metadatos: metadatos({ titulo: 'Ab' }), texto: TEXTO }).expect(400);
  });

  it('editar el texto conserva los ids de las oraciones que no cambian (RF-022)', async () => {
    const antes = (await t.http().get(`${API}/backoffice/lecturas/${lecturaId}`).set(bearer(editora.token)).expect(200)).body;
    const r = await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/borrador`).set(bearer(editora.token))
      .send({ texto: TEXTO.replace('Una tarde', 'Una noche') }).expect(200);
    const ids = (d: { oraciones: { id: string }[] }) => d.oraciones.map((o) => o.id);
    expect(ids(r.body.detalle).filter((id: string) => ids(antes).includes(id))).toHaveLength(3);
    const cortada = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/oraciones/${antes.oraciones[0].id}/dividir`).set(bearer(editora.token)).send({ posicion: 'Había una vez un zorro'.length }).expect(200);
    expect(cortada.body.oraciones).toHaveLength(5);
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/oraciones/${antes.oraciones[0].id}/unir`).set(bearer(editora.token)).expect(200);
  });

  it('actividades con anclaje, pistas y evidencias se guardan en sus tablas (RF-024, RF-025)', async () => {
    const d = (await t.http().get(`${API}/backoffice/lecturas/${lecturaId}`).set(bearer(editora.token))).body;
    const r = await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora.token)).send({ actividades: actividades(d.oraciones) }).expect(200);
    expect(r.body.problemas).toEqual([]);
    expect(await t.prisma.actividad.count({ where: { versionLecturaId: d.versionId } })).toBe(3);
    expect(await t.prisma.pista.count()).toBe(2);
    expect(await t.prisma.claveEvidencia.findMany()).toEqual([expect.objectContaining({ oracionId: d.oraciones[3].id })]);

    const sinAnclaje = actividades(d.oraciones);
    sinAnclaje[1]!.oracionAnclajeId = undefined as unknown as string;
    const error = await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora.token)).send({ actividades: sinAnclaje }).expect(400);
    expect(error.body.detail).toMatch(/oración donde aparece/);
  });

  it('subida firmada de una imagen WebP: se valida el archivo real y se guarda (RF-023)', async () => {
    const pedido = await t.http().post(`${API}/backoffice/recursos`).set(bearer(editora.token))
      .send({ lecturaId, tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: WEBP.length, textoAlternativo: 'Un zorro mira la luna' }).expect(201);
    recursoId = pedido.body.recursoId;
    const url: string = pedido.body.url.replace(API, '');
    const subir = (cuerpo: Buffer, ruta = url) =>
      t.http().put(`${API}${ruta}`).set(bearer(editora.token)).set('Content-Type', 'application/octet-stream').send(cuerpo);

    expect((await subir(Buffer.concat([Buffer.from('<svg'), Buffer.alloc(WEBP.length - 4)]))).body.detail).toMatch(/formato/);
    expect((await subir(WEBP, url.replace('token=', 'token=x'))).status).toBe(400);
    const r = await subir(WEBP).expect(200);
    expect(r.body).toMatchObject({ id: recursoId, tipo: 'IMAGEN', bytes: WEBP.length });
    expect(await t.prisma.recurso.findUniqueOrThrow({ where: { id: recursoId } })).toMatchObject({ tipoMime: 'image/webp', textoAlternativo: 'Un zorro mira la luna' });
    expect((await subir(WEBP)).status).toBe(409);

    const archivo = await t.http().get(`${API}/backoffice/recursos/${recursoId}/archivo`).set(bearer(revisor.token)).expect(200);
    expect(archivo.headers['content-type']).toBe('image/webp');
    // Sin publicar, la biblioteca no la entrega.
    await t.http().get(`${API}/biblioteca/recursos/${recursoId}`).set(bearer(editora.token)).expect(404);
  });

  it('enviar → rechazar con motivo → reenviar → aprobar; cada paso queda auditado (RF-026)', async () => {
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(409); // aún en borrador
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
    await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/borrador`).set(bearer(editora.token)).send({ texto: 'Otro texto.' }).expect(409);

    const rechazo = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/rechazar`).set(bearer(revisor.token)).send({ comentario: 'Agrega una pista P2 a la actividad 2.' }).expect(200);
    expect(rechazo.body).toMatchObject({ estado: 'BORRADOR' });
    expect((await t.prisma.versionLectura.findUniqueOrThrow({ where: { id: rechazo.body.versionId } })).comentarioRevision).toBe('Agrega una pista P2 a la actividad 2.');

    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
    const aprobada = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(200);
    expect(aprobada.body).toMatchObject({ estado: 'PUBLICADO', permisos: { archivar: true } });
    expect(await t.prisma.lectura.findUniqueOrThrow({ where: { id: lecturaId } })).toMatchObject({ versionPublicadaId: aprobada.body.versionId });
    expect(await t.prisma.versionLectura.findUniqueOrThrow({ where: { id: aprobada.body.versionId } })).toMatchObject({ revisorId: revisor.id, comentarioRevision: null });

    const auditoria = await t.prisma.auditoria.findMany({ where: { recursoId: lecturaId }, orderBy: { ocurridoEn: 'asc' } });
    expect(auditoria.map((a) => [a.accion, a.actorRol])).toEqual([
      ['LECTURA_ENVIADA_A_REVISION', 'EDITOR'],
      ['LECTURA_RECHAZADA', 'REVISOR'],
      ['LECTURA_ENVIADA_A_REVISION', 'EDITOR'],
      ['LECTURA_PUBLICADA', 'REVISOR'],
    ]);
  });
});

describe('Biblioteca y asignaciones (RF-028, RF-018)', () => {
  let docente: string;
  let ninoR2: string;

  it('docentes y familias ven lo publicado sin respuestas, y la imagen se entrega', async () => {
    docente = await adulto('DOCENTE');
    const r = await t.http().get(`${API}/biblioteca`).set(bearer(docente)).expect(200);
    expect(r.body.lecturas).toEqual([expect.objectContaining({ lecturaId, titulo: 'El zorro y la luna', totalActividades: 3 })]);
    const d = await t.http().get(`${API}/biblioteca/${lecturaId}`).set(bearer(docente)).expect(200);
    expect(d.body.imagenes).toEqual([{ id: recursoId, url: `${API}/biblioteca/recursos/${recursoId}`, textoAlternativo: 'Un zorro mira la luna' }]);
    expect(JSON.stringify(d.body)).not.toMatch(/indice|pistas|explicacion|claves/i);
    const imagen = await t.http().get(`${API}/biblioteca/recursos/${recursoId}`).set(bearer(docente)).expect(200);
    expect(imagen.headers['cache-control']).toMatch(/immutable/);
    await t.http().get(`${API}/biblioteca?nivel=9`).set(bearer(docente)).expect(400);
  });

  it('la lectura publicada aparece en el catálogo para asignar del aula (Módulo 2)', async () => {
    const aula = (await t.http().post(`${API}/aulas`).set(bearer(docente)).send({
      nombre: '3.° B', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body;
    const catalogo = await t.http().get(`${API}/aulas/${aula.id}/asignaciones/catalogo`).set(bearer(docente)).expect(200);
    expect(catalogo.body.lecturas).toEqual([{ id: lecturaId, tipo: 'LECTURA', titulo: 'El zorro y la luna', detalle: '8–9 años · nivel 2' }]);

    // Un niño de 9 años (R2) ve la lectura; otro de 6 años (R1), no.
    const crear = async (alias: string, anioNacimiento: number) => {
      const m = (await t.http().post(`${API}/aulas/${aula.id}/matriculas`).set(bearer(docente)).send({ alias, anioNacimiento, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(docente)).send({ pinNuevo: '4826' }).expect(200);
      return m.estudianteId as string;
    };
    const anio = new Date().getFullYear();
    const mayor = await crear('Mateo', anio - 9);
    const menor = await crear('Lía', anio - 6);
    const tablet = (await t.http().post(`${API}/aulas/${aula.id}/dispositivos`).set(bearer(docente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const entrar = async (perfilId: string) => (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId, pin: '4826' }).expect(200)).body.accessToken as string;
    ninoR2 = await entrar(mayor);
    const ninoR1 = await entrar(menor);

    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR2)).expect(200)).body).toMatchObject({ lecturas: [{ lecturaId }], alcance: { rangoEdad: 'R2', niveles: [1, 2, 3] } });
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR1)).expect(200)).body.lecturas).toEqual([]);
    await t.http().get(`${API}/biblioteca/${lecturaId}`).set(bearer(ninoR1)).expect(404);
    await t.http().get(`${API}/backoffice/lecturas`).set(bearer(ninoR2)).expect(403);
  });

  it('RF-027: una versión nueva no toca la publicada ni sus oraciones; al aprobarse la reemplaza', async () => {
    const v1 = (await t.prisma.lectura.findUniqueOrThrow({ where: { id: lecturaId } })).versionPublicadaId as string;
    const oracionesV1 = await t.prisma.oracion.findMany({ where: { versionLecturaId: v1 }, orderBy: { orden: 'asc' } });

    const v2 = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/nueva-version`).set(bearer(editora.token)).expect(201);
    expect(v2.body).toMatchObject({ numero: 2, estado: 'BORRADOR', publicada: { versionId: v1, numero: 1 } });
    await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/borrador`).set(bearer(editora.token)).send({ metadatos: metadatos({ titulo: 'El zorro y la luna llena' }) }).expect(200);
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR2))).body.lecturas[0].titulo).toBe('El zorro y la luna');

    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(200);
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR2))).body.lecturas[0].titulo).toBe('El zorro y la luna llena');
    expect(await t.prisma.versionLectura.findUniqueOrThrow({ where: { id: v1 } })).toMatchObject({ estado: 'ARCHIVADO' });
    expect(await t.prisma.oracion.findMany({ where: { versionLecturaId: v1 }, orderBy: { orden: 'asc' } })).toEqual(oracionesV1);
  });

  it('archivar la saca de la biblioteca y del catálogo de asignaciones', async () => {
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/archivar`).set(bearer(revisor.token)).expect(200);
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(docente))).body.lecturas).toEqual([]);
    await t.http().get(`${API}/biblioteca/${lecturaId}`).set(bearer(docente)).expect(404);
    expect(await t.prisma.auditoria.count({ where: { recursoId: lecturaId, accion: 'LECTURA_ARCHIVADA' } })).toBe(1);
  });
});
