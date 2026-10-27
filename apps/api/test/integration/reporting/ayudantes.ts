import { authenticator } from 'otplib';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba } from '../setup/app';

/**
 * Ayudantes de las pruebas de integración de Reporting (Módulos 9 y 10): cuentas, la lectura de ejemplo
 * publicada por el flujo real, el reto inicial y una lectura real de un niño, y la maestría que
 * calcularía Progreso.
 */
export const API = '/api/v1';
export const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';
export const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const pista = (nivel: string, texto: string) => ({ nivel, texto });

export function ayudantesReporting(app: () => AppDePrueba) {
  const t = () => app();

  async function backoffice(rol: 'EDITOR' | 'REVISOR') {
    const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
    const secreto = authenticator.generateSecret();
    const cuenta = await t().prisma.cuenta.create({ data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' } });
    await t().prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
    return (await t().http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, codigoMfa: authenticator.generate(secreto) }).expect(200)).body.accessToken as string;
  }

  /** Una cuenta adulta registrada y verificada por el flujo real (RF-001, RF-002). */
  async function adulto(nombre: string, rol: 'DOCENTE' | 'FAMILIAR') {
    const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
    await t().http().post(`${API}/auth/registro`).send({ nombre, email, contrasena: CONTRASENA, rol }).expect(201);
    const enlace = ((await t().http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
    await t().http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
    const token = (await t().http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
    return { email, token, id: (await t().prisma.cuenta.findUniqueOrThrow({ where: { email } })).id };
  }

  const docente = (nombre: string) => adulto(nombre, 'DOCENTE');

  /** "Killa y la llama" publicada por el flujo real: inferencia con pistas, evidencia y una abierta. */
  async function publicarKilla(editora: string, revisora: string) {
    const { lecturaId, oraciones } = (
      await t().http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
        metadatos: { titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' },
        texto: TEXTO,
      }).expect(201)
    ).body as { lecturaId: string; oraciones: { id: string }[] };
    const o = oraciones.map((x) => x.id);
    const actividades = [
      {
        momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
        items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.')] }],
      },
      {
        momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
        items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
      },
      { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', explicacionModelada: 'Sí: así encontró la espina.' }] },
    ];
    await t().http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
    await t().http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
    await t().http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
    return { lecturaId, o };
  }

  /** El reto inicial por la API, acertando solo en las habilidades indicadas (Módulo 5). */
  async function retoInicial(token: string, acertar: string[]) {
    const { id } = (await t().http().post(`${API}/diagnosticos`).set(bearer(token)).expect(201)).body;
    for (;;) {
      const { item } = (await t().http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(token)).expect(200)).body;
      if (!item) break;
      const fila = await t().prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: item.itemId } });
      const correcta = (fila.respuestaCorrecta as { indice: number }).indice;
      const indice = acertar.includes(fila.habilidad) ? correcta : (correcta + 1) % (fila.contenido as { opciones: string[] }).opciones.length;
      await t().http().post(`${API}/diagnosticos/${id}/respuestas`).set(bearer(token)).send({ itemId: item.itemId, indice }).expect(200);
    }
    await t().http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(token)).expect(200);
  }

  /** Lee Killa por la API: se equivoca una vez en la inferencia (ve la pista P1), toca la evidencia y escribe. */
  async function leerKilla(token: string, killa: { lecturaId: string; o: string[] }) {
    const id = (await t().http().post(`${API}/sesiones-lectura`).set(bearer(token)).send({ lecturaId: killa.lecturaId }).expect(201)).body.id as string;
    await t().http().put(`${API}/sesiones-lectura/${id}/prediccion`).set(bearer(token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200);
    let primera = true;
    for (let paso = 0; paso < 10; paso++) {
      const p = (await t().http().get(`${API}/sesiones-lectura/${id}`).set(bearer(token)).expect(200)).body.pregunta as { itemId: string; enunciado: string; opciones: string[] } | null;
      if (!p) break;
      let cuerpo: Record<string, unknown>;
      if (p.enunciado.startsWith('¿Por qué')) {
        cuerpo = { indice: p.opciones.indexOf(primera ? 'Estaba feliz' : 'Le dolía algo') };
        primera = false;
      } else if (p.enunciado.startsWith('Toca')) cuerpo = { oraciones: [killa.o[3]] };
      else cuerpo = { texto: 'Sí, porque así encontró la espina y lo curó' };
      await t().http().post(`${API}/sesiones-lectura/${id}/respuestas`).set(bearer(token)).send({ itemId: p.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
    }
    await t().http().post(`${API}/sesiones-lectura/${id}/finalizar`).set(bearer(token)).send({ reflexion: 'Era una espina' }).expect(200);
    return id;
  }

  /** Maestría de un estudiante en las 5 habilidades (lo que calcularía Progreso con sus lecturas). */
  async function maestria(estudianteId: string, valores: Partial<Record<(typeof HABILIDADES)[number], number>>, items = 6) {
    for (const habilidad of HABILIDADES) {
      const valor = valores[habilidad] ?? 70;
      await t().prisma.maestriaHabilidad.upsert({
        where: { estudianteId_habilidad: { estudianteId, habilidad } },
        create: { estudianteId, habilidad, valor, itemsContados: items, actualizadoEn: new Date() },
        update: { valor, itemsContados: items },
      });
    }
  }

  async function crearAula(token: string, nombre: string, ninos: string[]) {
    const aulaId = (await t().http().post(`${API}/aulas`).set(bearer(token)).send({
      nombre, grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id as string;
    const anio = new Date().getFullYear() - 9;
    const csv = ninos.map((alias) => `${alias},${anio},1,zorro`).join('\n');
    const { matriculados } = (await t().http().post(`${API}/aulas/${aulaId}/matriculas/importacion`).set(bearer(token)).send({ csv }).expect(201)).body as { matriculados: { estudianteId: string; alias: string }[] };
    return { aulaId, ids: Object.fromEntries(matriculados.map((m) => [m.alias, m.estudianteId])) as Record<string, string> };
  }

  /** El niño entra en la tablet del aula con su PIN (CR-01) y obtiene su sesión. */
  async function sesionNino(tokenDocente: string, aulaId: string, estudianteId: string) {
    const tablet = (await t().http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    await t().http().post(`${API}/estudiantes/${estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
    return (await t().http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: estudianteId, pin: '4826' }).expect(200)).body.accessToken as string;
  }

  return { backoffice, adulto, docente, publicarKilla, retoInicial, leerKilla, maestria, crearAula, sesionNino };
}
