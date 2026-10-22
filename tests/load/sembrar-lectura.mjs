// Publica "Killa y la llama" (8–9 años) con una actividad de cada tipo y una historia ramificada,
// para el escenario k6 de la lectura interactiva (scenarios/lectura-respuestas.js, RF-040).
// SOLO para desarrollo y CI (ver sembrado.mjs). Imprime solo el id de la lectura.
//
// Uso (con la API en marcha):  node tests/load/sembrar-lectura.mjs
import { fileURLToPath } from 'node:url';

import { conPrisma, cuentaBackoffice, exigirEntornoLocal, llamar } from './sembrado.mjs';

export const TEXTO_KILLA = [
  'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.',
  'Un día Pancho no quiso comer. Killa vio que tenía una espina en la pata.',
  'Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.',
].join('\n');

const pista = (nivel, texto) => ({ nivel, texto });

/** Las actividades de la lectura: predicción, 2 durante (selección y evidencia) y 4 después. */
export function actividadesKilla(o) {
  return [
    { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿Qué crees que le pasará a la llama?', explicacionModelada: 'Al leer comprobarás tu idea.' }] },
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
      items: [{
        habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1,
        explicacionModelada: 'Más adelante el texto dice que tenía una espina en la pata: le dolía.',
        pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no quiere comer?')],
      }],
    },
    {
      momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina lo dice.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'ORDENAMIENTO',
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: 'Ordena lo que pasó.', elementos: ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'], explicacionModelada: 'Primero no comió, luego Killa miró y al final lo curó.', pistas: [pista('P1', 'Piensa qué pasó primero.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'SELECCION',
      items: [{ habilidad: 'CRI', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué hizo bien Killa? Marca todas.', opciones: ['Miró con atención', 'Se fue a jugar', 'Lo ayudó con cuidado'], indicesCorrectos: [0, 2], explicacionModelada: 'Killa miró la pata y quitó la espina con cuidado.', pistas: [pista('P1', 'Recuerda lo que hizo cuando Pancho no comía.')] }],
    },
    { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 3, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', minPalabras: 3, explicacionModelada: 'Sí: así encontró la espina.' }] },
    {
      momento: 'DESPUES', tipo: 'DEFIENDE',
      items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué razón defiende mejor tu respuesta?', opciones: ['El texto dice que tenía una espina', 'A las llamas no les gusta comer'], indiceCorrecto: 0, explicacionModelada: 'La razón está en el texto.', pistas: [pista('P1', 'Busca la razón en lo que leíste.')] }],
    },
  ];
}

export const NODOS_KILLA = [
  { clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
  { clave: 'rio', contenido: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', esFinal: true },
  { clave: 'cerro', contenido: 'En el cerro vieron un cóndor volar.', esFinal: true },
];

/** Publica la lectura por el flujo real (editora escribe, revisor aprueba) y devuelve su id. */
export async function publicarKilla(editora, revisor, { titulo = 'Killa y la llama', rangoEdad = 'R2', tematica = 'Animales' } = {}) {
  const { lecturaId, oraciones } = await llamar(
    'POST',
    '/backoffice/lecturas',
    { metadatos: { titulo, rangoEdad, nivelDificultad: 2, tematica, tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' }, texto: TEXTO_KILLA },
    editora,
  );
  await llamar('PUT', `/backoffice/lecturas/${lecturaId}/actividades`, { actividades: actividadesKilla(oraciones.map((x) => x.id)) }, editora);
  await llamar('PUT', `/backoffice/lecturas/${lecturaId}/grafo`, { nodos: NODOS_KILLA }, editora);
  await llamar('POST', `/backoffice/lecturas/${lecturaId}/enviar-revision`, {}, editora);
  await llamar('POST', `/backoffice/lecturas/${lecturaId}/aprobar`, {}, revisor);
  return lecturaId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exigirEntornoLocal();
  const id = await conPrisma(async (prisma) => publicarKilla(await cuentaBackoffice(prisma, 'EDITOR'), await cuentaBackoffice(prisma, 'REVISOR'), { titulo: `Killa de carga ${Date.now().toString(36)}` }));
  console.log(id);
}
