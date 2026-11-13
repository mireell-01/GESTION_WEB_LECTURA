// Contenido inicial de LectoAventura: los cuentos de los 5 mundos para cada rango de edad. Cada cuento se
// escribe en forma compacta (su texto y sus preguntas) y aquí se convierte en lo que recibe la API del
// backoffice (RF-021 a RF-025), la misma que usa el equipo de contenidos. Lo publica
// scripts/publicar-cuentos.mjs y lo valida, sin base de datos, test/unit/contenido/dominio/cuentos-iniciales.spec.ts.

/** RN-15 exige declarar la licencia: estos textos se escribieron con IA y necesitan revisión pedagógica. */
export const LICENCIA = 'CC BY 4.0 · Texto de demostración escrito con IA para LectoAventura; requiere revisión pedagógica';

/** Los clásicos (Esopo, Perrault, los Grimm, Andersen…) son de dominio público; la adaptación también se revisa. */
export const licenciaDe = (cuento) =>
  cuento.autor ? `CC BY 4.0 · Adaptación con IA de ${cuento.autor} (dominio público); requiere revisión pedagógica` : LICENCIA;

/** Las habilidades foco de cada mundo (aventura.mundo, SRS §1): las misiones las miden para desbloquear (RN-09). */
export const HABILIDADES_DEL_MUNDO = {
  1: ['LIT', 'VOC'],
  2: ['INF', 'VOC'],
  3: ['LIT', 'INF'],
  4: ['CRI', 'ARG'],
  5: ['LIT', 'INF', 'VOC', 'CRI', 'ARG'],
};

/** Dificultad (1 a 5) de cada mundo según la edad: crece de mundo en mundo. */
export const DIFICULTAD = {
  R1: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2 },
  R2: { 1: 2, 2: 2, 3: 3, 4: 3, 5: 3 },
  R3: { 1: 3, 2: 3, 3: 4, 4: 4, 5: 5 },
};

/*
 * Para escribir las preguntas. `extra.durante` es la oración exacta tras la que aparece la pregunta mientras
 * se lee (RF-039); sin ella, la pregunta va después de leer. Las pistas van de P1 a P3 (RN-06): P1 remite a
 * la zona del texto, P2 la acota y P3 reformula la pregunta. Ninguna puede decir la respuesta.
 */
export const sel = (habilidad, enunciado, correcta, otras, pistas, explicacion, extra = {}) => ({ tipo: 'SELECCION', habilidad, enunciado, correctas: [correcta], otras, pistas, explicacion, ...extra });
export const multiple = (habilidad, enunciado, correctas, otras, pistas, explicacion, extra = {}) => ({ tipo: 'MULTIPLE', habilidad, enunciado, correctas, otras, pistas, explicacion, ...extra });
export const evidencia = (habilidad, enunciado, oraciones, pistas, explicacion, extra = {}) => ({ tipo: 'EVIDENCIA', habilidad, enunciado, oraciones, pistas, explicacion, ...extra });
export const ordenar = (habilidad, enunciado, elementos, pistas, explicacion, extra = {}) => ({ tipo: 'ORDENAMIENTO', habilidad, enunciado, elementos, pistas, explicacion, ...extra });
export const escribir = (habilidad, enunciado, minPalabras, explicacion, extra = {}) => ({ tipo: 'ESCRITURA', habilidad, enunciado, minPalabras, explicacion, ...extra });
export const defender = (habilidad, enunciado, correcta, otras, pistas, explicacion) => ({ tipo: 'DEFIENDE', habilidad, enunciado, correctas: [correcta], otras, pistas, explicacion });

/** Un número estable a partir de un texto (FNV-1a): la respuesta correcta no queda siempre en la misma letra. */
function semilla(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mezcla las opciones de forma estable y devuelve dónde quedaron las correctas. */
function mezclar(correctas, otras, clave) {
  const todas = [...correctas.map((texto) => ({ texto, ok: true })), ...otras.map((texto) => ({ texto, ok: false }))];
  let s = semilla(clave) || 1;
  for (let i = todas.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 13), 0x5bd1e995) >>> 0;
    const j = s % (i + 1);
    [todas[i], todas[j]] = [todas[j], todas[i]];
  }
  return { opciones: todas.map((o) => o.texto), indices: todas.flatMap((o, i) => (o.ok ? [i] : [])) };
}

const pistasDe = (pistas = []) => pistas.map((texto, i) => ({ nivel: `P${i + 1}`, texto }));

/** Los textos que cuentan una historia cierran con «Moraleja»; los demás, con «Para reflexionar». */
const NARRATIVOS = ['CUENTO', 'HISTORIETA', 'POEMA'];

/** El último párrafo: el mensaje del cuento, en una sola oración (la web lo muestra como «El mensaje del cuento»). */
export function moralejaDe(cuento) {
  const prefijo = NARRATIVOS.includes(cuento.tipoTexto ?? 'CUENTO') ? 'Moraleja' : 'Para reflexionar';
  return `${prefijo}: ${cuento.moraleja.charAt(0).toLocaleLowerCase('es')}${cuento.moraleja.slice(1)}`;
}

/** Cada párrafo es una lista de oraciones; si el cuento tiene moraleja, va como párrafo final. */
export const parrafosDe = (cuento) => (cuento.moraleja ? [...cuento.texto, [moralejaDe(cuento)]] : cuento.texto);

/** El texto lleva un párrafo por línea (RF-022). */
export const textoDe = (cuento) => parrafosDe(cuento).map((parrafo) => parrafo.join(' ')).join('\n');

/**
 * La pregunta que lleva el valor del cuento a la vida del niño, después de leer (pensamiento crítico). De 6 a 7
 * años elige qué haría; desde los 8 lo escribe (RN-19: 5 palabras a los 8–9 años y 10 a los 10–12).
 */
export function preguntaDeVida(cuento) {
  if (!cuento.vida) return null;
  if (Array.isArray(cuento.vida)) {
    const [enunciado, mejor, otras] = cuento.vida;
    return sel('CRI', enunciado, mejor, otras, ['Piensa en lo que pasó en el cuento.', 'Lee otra vez el mensaje del final.'], cuento.moraleja, { vida: true });
  }
  return escribir('ARG', cuento.vida, cuento.rango === 'R3' ? 10 : 5, `Este cuento habla de ${cuento.valor.toLocaleLowerCase('es')}: pensar en tu vida te ayuda a ponerlo en práctica.`, { vida: true });
}

/** Todas las preguntas del cuento: las de comprensión y, al final, la de su valor. */
export const preguntasDe = (cuento) => [...cuento.preguntas, ...(cuento.vida ? [preguntaDeVida(cuento)] : [])];

/** Paso 1 de la API (POST /backoffice/lecturas): metadatos y texto. */
export function metadatosDe(cuento) {
  const habilidades = [...new Set(preguntasDe(cuento).map((p) => p.habilidad))];
  return {
    titulo: cuento.titulo,
    rangoEdad: cuento.rango,
    nivelDificultad: DIFICULTAD[cuento.rango][cuento.mundo],
    tematica: cuento.tematica,
    tipoTexto: cuento.tipoTexto ?? 'CUENTO',
    habilidadesObjetivo: habilidades,
    licencia: licenciaDe(cuento),
  };
}

/**
 * Paso 2 de la API (PUT /backoffice/lecturas/:id/actividades): las actividades, con los ids de las
 * oraciones que devolvió el paso 1 (anclajes y evidencias se escriben con el texto exacto de la oración).
 */
export function actividadesDe(cuento, oraciones) {
  const idDe = (texto) => {
    const o = oraciones.find((x) => x.texto === texto);
    if (!o) throw new Error(`«${texto}» no es una oración de «${cuento.titulo}»`);
    return o.id;
  };
  const dificultad = DIFICULTAD[cuento.rango][cuento.mundo];
  const actividades = [
    {
      momento: 'ANTES',
      tipo: 'PREDICCION',
      items: [{ habilidad: 'INF', nivelDificultad: dificultad, modalidad: 'ESCRITURA', enunciado: cuento.prediccion, explicacionModelada: 'Al leer comprobarás si tu idea se parece a lo que pasa.' }],
    },
  ];
  for (const p of preguntasDe(cuento)) {
    const base = { habilidad: p.habilidad, nivelDificultad: dificultad, enunciado: p.enunciado, explicacionModelada: p.explicacion };
    let tipo;
    let item;
    if (p.tipo === 'SELECCION' || p.tipo === 'MULTIPLE' || p.tipo === 'DEFIENDE') {
      const { opciones, indices } = mezclar(p.correctas, p.otras, `${cuento.clave}:${p.enunciado}`);
      tipo = p.tipo === 'DEFIENDE' ? 'DEFIENDE' : 'SELECCION';
      item = { ...base, modalidad: 'SELECCION', opciones, ...(p.tipo === 'MULTIPLE' ? { indicesCorrectos: indices } : { indiceCorrecto: indices[0] }), pistas: pistasDe(p.pistas) };
    } else if (p.tipo === 'EVIDENCIA') {
      tipo = 'EVIDENCIA';
      item = { ...base, modalidad: 'EVIDENCIA', clavesEvidencia: p.oraciones.map(idDe), pistas: pistasDe(p.pistas) };
    } else if (p.tipo === 'ORDENAMIENTO') {
      tipo = 'ORDENAMIENTO';
      item = { ...base, modalidad: 'ORDENAMIENTO', elementos: p.elementos, pistas: pistasDe(p.pistas) };
    } else if (p.tipo === 'ESCRITURA') {
      tipo = 'ESCRITURA';
      item = { ...base, modalidad: 'ESCRITURA', minPalabras: p.minPalabras };
    } else {
      throw new Error(`Tipo de pregunta desconocido en «${cuento.titulo}»: ${p.tipo}`);
    }
    actividades.push({
      momento: p.durante ? 'DURANTE' : 'DESPUES',
      tipo,
      ...(p.durante ? { oracionAnclajeId: idDe(p.durante) } : {}),
      items: [item],
    });
  }
  return actividades;
}
