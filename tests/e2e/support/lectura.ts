import { resolve } from 'node:path';

import { APIRequestContext, expect, Locator, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { CuentaBackoffice, cuentaBackoffice, sesionBackoffice } from './contenido';
import { sesionDelNino } from './diagnostico';
import { AulaPreparada } from './escuela';

/** Ayudantes del Módulo 6 (lectura interactiva): la lectura de ejemplo y cómo avanzarla por la API. */

export const TEXTO_KILLA = [
  'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.',
  'Un día Pancho no quiso comer. Killa vio que tenía una espina en la pata.',
  'Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.',
].join('\n');

export const PREDICCION = '¿Qué crees que le pasará a la llama?';
export const ENUNCIADOS = {
  seleccion: '¿Por qué Pancho no quiso comer?',
  evidencia: 'Toca las oraciones que cuentan qué le pasaba a Pancho.',
  ordenar: 'Ordena lo que pasó.',
  multiple: '¿Qué hizo bien Killa? Marca todas.',
  escritura: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?',
  defiende: '¿Qué razón defiende mejor tu respuesta?',
};
/** RF-042: el orden correcto (al niño se le muestran mezclados). */
export const ORDEN_CORRECTO = ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'];
export const DESENLACE_RIO = 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!';

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** Una actividad de cada tipo: predicción, 2 durante (con anclaje) y 4 después, con su defensa. */
function actividades(o: string[]) {
  return [
    { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: PREDICCION, explicacionModelada: 'Al leer comprobarás tu idea.' }] },
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
      items: [{
        habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: ENUNCIADOS.seleccion, opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1,
        explicacionModelada: 'Más adelante el texto dice que tenía una espina en la pata: le dolía.',
        pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no quiere comer?')],
      }],
    },
    {
      momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: ENUNCIADOS.evidencia, clavesEvidencia: [o[2], o[3]], explicacionModelada: 'El segundo párrafo cuenta que no comía y que tenía una espina.', pistas: [pista('P1', 'Busca en el párrafo que acabas de leer.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'ORDENAMIENTO',
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: ENUNCIADOS.ordenar, elementos: ORDEN_CORRECTO, explicacionModelada: 'Primero no comió, luego Killa miró y al final lo curó.', pistas: [pista('P1', 'Piensa qué pasó primero.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'SELECCION',
      items: [{ habilidad: 'CRI', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: ENUNCIADOS.multiple, opciones: ['Miró con atención', 'Se fue a jugar', 'Lo ayudó con cuidado'], indicesCorrectos: [0, 2], explicacionModelada: 'Killa miró la pata y quitó la espina con cuidado.', pistas: [pista('P1', 'Recuerda lo que hizo cuando Pancho no comía.')] }],
    },
    { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 3, modalidad: 'ESCRITURA', enunciado: ENUNCIADOS.escritura, minPalabras: 3, explicacionModelada: 'Sí: así encontró la espina.' }] },
    {
      momento: 'DESPUES', tipo: 'DEFIENDE',
      items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: ENUNCIADOS.defiende, opciones: ['El texto dice que tenía una espina', 'A las llamas no les gusta comer'], indiceCorrecto: 0, explicacionModelada: 'La razón está en el texto.', pistas: [pista('P1', 'Busca la razón en lo que leíste.')] }],
    },
  ];
}

const NODOS = [
  { clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
  { clave: 'rio', contenido: DESENLACE_RIO, esFinal: true },
  { clave: 'cerro', contenido: 'En el cerro vieron un cóndor volar.', esFinal: true },
];

/** "Killa y la llama" publicada por la API (editora escribe, revisor aprueba), con historia ramificada. */
export async function lecturaKilla(
  request: APIRequestContext,
  p: { rangoEdad?: 'R1' | 'R2'; tematica?: string } = {},
): Promise<{ lecturaId: string; titulo: string; tematica: string; editora: CuentaBackoffice }> {
  const editoraCuenta = await cuentaBackoffice('EDITOR');
  const editora = await sesionBackoffice(request, editoraCuenta);
  const revisor = await sesionBackoffice(request, await cuentaBackoffice('REVISOR'));
  const sufijo = Date.now().toString(36);
  const titulo = `Killa y la llama ${sufijo}`;
  const tematica = p.tematica ?? `Llamas ${sufijo}`;
  const creada = await request.post('/api/v1/backoffice/lecturas', {
    headers: editora,
    data: { metadatos: { titulo, rangoEdad: p.rangoEdad ?? 'R2', nivelDificultad: 2, tematica, tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' }, texto: TEXTO_KILLA },
  });
  expect(creada.status(), await creada.text()).toBe(201);
  const { lecturaId, oraciones } = await creada.json();
  const o = (oraciones as { id: string }[]).map((x) => x.id);
  for (const [ruta, data] of [['actividades', { actividades: actividades(o) }], ['grafo', { nodos: NODOS }]] as const) {
    const r = await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/${ruta}`, { headers: editora, data });
    expect(r.status(), await r.text()).toBe(200);
  }
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/enviar-revision`, { headers: editora })).status()).toBe(200);
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/aprobar`, { headers: revisor })).status()).toBe(200);
  return { lecturaId, titulo, tematica, editora: editoraCuenta };
}

interface PreguntaApi {
  itemId: string;
  enunciado: string;
  opciones: string[];
  elementos: string[];
}

interface SesionApi {
  id: string;
  fase: string;
  pregunta: PreguntaApi | null;
  historia: { nodo: { id: string } } | null;
  texto: { parrafos: { oraciones: { id: string; texto: string }[] }[] };
}

/** La respuesta correcta de cada pregunta de la lectura de ejemplo (la clave no llega a la web). */
function respuestaCorrecta(s: SesionApi, p: PreguntaApi): Record<string, unknown> {
  const oracion = (texto: string) => s.texto.parrafos.flatMap((x) => x.oraciones).find((x) => x.texto === texto)?.id;
  switch (p.enunciado) {
    case ENUNCIADOS.seleccion:
      return { indice: p.opciones.indexOf('Le dolía algo') };
    case ENUNCIADOS.evidencia:
      return { oraciones: [oracion('Killa vio que tenía una espina en la pata.')] };
    case ENUNCIADOS.ordenar:
      return { orden: ORDEN_CORRECTO.map((t) => p.elementos.indexOf(t)) };
    case ENUNCIADOS.multiple:
      return { indices: ['Miró con atención', 'Lo ayudó con cuidado'].map((t) => p.opciones.indexOf(t)) };
    case ENUNCIADOS.escritura:
      return { texto: 'Sí, porque así encontró la espina' };
    default:
      return { indice: p.opciones.indexOf('El texto dice que tenía una espina') };
  }
}

/**
 * Lee la lectura por la API como lo haría el niño (predice, responde bien y elige el río) hasta la
 * pregunta `hasta` (sin responderla) o, con `terminar`, hasta cerrarla con su reflexión.
 */
export async function leerPorApi(
  request: APIRequestContext,
  preparada: AulaPreparada,
  alias: string,
  lecturaId: string,
  p: { hasta?: string; terminar?: boolean; prediccion?: string } = {},
): Promise<string> {
  const nino = await sesionDelNino(request, preparada, alias);
  const llamar = async (metodo: 'post' | 'put', ruta: string, data: object = {}) => {
    const r = await request[metodo](`/api/v1${ruta}`, { headers: nino, data });
    expect(r.status(), await r.text()).toBeLessThan(300);
    return r.json();
  };
  let s = (await llamar('post', '/sesiones-lectura', { lecturaId })) as SesionApi;
  if (s.fase === 'PREDICCION') s = await llamar('put', `/sesiones-lectura/${s.id}/prediccion`, { texto: p.prediccion ?? 'Creo que la llama se enfermará' });
  for (;;) {
    if (s.fase === 'HISTORIA') {
      s = await llamar('post', `/sesiones-lectura/${s.id}/decisiones`, { nodoId: s.historia?.nodo.id, opcion: 0 });
    } else if (s.pregunta) {
      if (s.pregunta.enunciado === p.hasta) return s.id;
      const r = await llamar('post', `/sesiones-lectura/${s.id}/respuestas`, { itemId: s.pregunta.itemId, idempotencyKey: crypto.randomUUID(), ...respuestaCorrecta(s, s.pregunta) });
      s = r.sesion;
    } else break;
  }
  if (p.terminar) await llamar('post', `/sesiones-lectura/${s.id}/finalizar`, { reflexion: 'Pensé que se enfermaba y era una espina' });
  return s.id;
}

/** RF-042: ordena con los botones Subir (la alternativa accesible al arrastre). */
export async function ordenarConBotones(page: Page, orden: string[]): Promise<void> {
  for (let k = 0; k < orden.length; k++) {
    const textos = await page.locator('.ordenar__texto').allTextContents();
    for (let i = textos.indexOf(orden[k] as string); i > k; i--) {
      await page.getByRole('button', { name: `Subir «${orden[k]}»` }).click();
    }
  }
  await expect(page.locator('.ordenar__texto')).toHaveText(orden);
}

/** RF-042: arrastra una tarjeta hasta ponerla sobre otra (ratón o dedo, por Pointer Events). */
export async function arrastrar(page: Page, origen: Locator, destino: Locator): Promise<void> {
  // Como haría el niño: primero desplaza la lista a la vista (en el celular la barra inferior tapa lo de abajo).
  await origen.evaluate((el) => el.closest('ol')?.scrollIntoView({ block: 'center' }));
  const a = (await origen.boundingBox())!;
  const b = (await destino.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 12 });
  await page.mouse.up();
}

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RN-07: lo que quedó guardado de la respuesta del niño a una pregunta (por su enunciado). */
export async function respuestaGuardada(estudianteId: string, enunciado: string) {
  const prisma = db();
  try {
    const items = (await prisma.item.findMany({ where: { enunciado }, select: { id: true } })).map((i) => i.id);
    const sesiones = (await prisma.sesionLectura.findMany({ where: { estudianteId }, select: { id: true } })).map((s) => s.id);
    return await prisma.respuesta.findFirstOrThrow({ where: { sesionId: { in: sesiones }, itemId: { in: items } }, include: { usosPista: true } });
  } finally {
    await prisma.$disconnect();
  }
}

/** El ítem de la lectura por su enunciado, con sus pistas y las oraciones de su clave de evidencia. */
export async function itemDeLectura(lecturaId: string, enunciado: string) {
  const prisma = db();
  try {
    return await prisma.item.findFirstOrThrow({
      where: { enunciado, actividad: { versionLectura: { lecturaId } } },
      include: { pistas: true, claves: { include: { oracion: true } } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** RF-053: los ItemRespondido que Lectura publicó para Progreso y Gamificación. */
export async function itemsRespondidos(estudianteId: string): Promise<Record<string, unknown>[]> {
  const prisma = db();
  try {
    const filas = await prisma.outboxEvento.findMany({ where: { tipo: 'lectura.ItemRespondido', payload: { path: ['estudianteId'], equals: estudianteId } } });
    return filas.map((f) => f.payload as Record<string, unknown>);
  } finally {
    await prisma.$disconnect();
  }
}

/** Voz simulada en el navegador (RF-049, RF-050): la síntesis avisa cada frase y el dictado "escucha" `dicho`. */
export async function vozSimulada(page: Page, dicho: string): Promise<void> {
  await page.addInitScript((texto) => {
    const w = window as unknown as Record<string, unknown>;
    const frases: { texto: string; velocidad: number }[] = [];
    w.__frases = frases;
    class FraseFalsa {
      lang = '';
      rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    w.SpeechSynthesisUtterance = FraseFalsa;
    let vigente = 0;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => {
          vigente += 1;
        },
        speak: (f: FraseFalsa) => {
          const turno = vigente;
          frases.push({ texto: f.text, velocidad: f.rate });
          setTimeout(() => {
            if (turno !== vigente) return;
            f.onstart?.();
            setTimeout(() => turno === vigente && f.onend?.(), 600);
          }, 20);
        },
      },
    });
    class ReconocimientoFalso {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: texto }]] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    w.SpeechRecognition = ReconocimientoFalso;
    w.webkitSpeechRecognition = ReconocimientoFalso;
  }, dicho);
}
