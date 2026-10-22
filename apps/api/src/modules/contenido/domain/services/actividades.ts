import { DatoLecturaInvalidoError } from '../errors/errores-contenido';
import { HABILIDADES, Habilidad } from '../value-objects/metadatos-lectura';

export const MOMENTOS = ['ANTES', 'DURANTE', 'DESPUES'] as const;
export const TIPOS_ACTIVIDAD = ['PREDICCION', 'SELECCION', 'ESCRITURA', 'ORDENAMIENTO', 'EVIDENCIA', 'DEFIENDE'] as const;
export const MODALIDADES = ['SELECCION', 'ESCRITURA', 'ORDENAMIENTO', 'EVIDENCIA', 'VOZ'] as const;
export const NIVELES_PISTA = ['P1', 'P2', 'P3'] as const;

export type Momento = (typeof MOMENTOS)[number];
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];
export type Modalidad = (typeof MODALIDADES)[number];
export type NivelPista = (typeof NIVELES_PISTA)[number];

/** Qué modalidades de respuesta tiene sentido usar en cada tipo de actividad (RF-024). */
export const MODALIDADES_POR_TIPO: Record<TipoActividad, readonly Modalidad[]> = {
  PREDICCION: ['ESCRITURA', 'SELECCION', 'VOZ'],
  SELECCION: ['SELECCION'],
  ESCRITURA: ['ESCRITURA', 'VOZ'],
  ORDENAMIENTO: ['ORDENAMIENTO'],
  EVIDENCIA: ['EVIDENCIA'],
  DEFIENDE: ['SELECCION', 'ESCRITURA'],
};

/** Ítem cerrado: tiene respuesta correcta y se corrige solo; los abiertos los valora la docente. */
export const MODALIDADES_CERRADAS: readonly Modalidad[] = ['SELECCION', 'ORDENAMIENTO', 'EVIDENCIA'];
export const MAX_ACTIVIDADES = 30;
export const MAX_ITEMS_POR_ACTIVIDAD = 10;

export interface Pista {
  nivel: NivelPista;
  texto: string;
}

export interface ContenidoItem {
  /** SELECCION: de 2 a 5 opciones. */
  opciones?: string[];
  /** SELECCION múltiple (RF-040): el niño marca todas las correctas. */
  multiple?: boolean;
  /** ORDENAMIENTO: de 2 a 8 elementos, escritos en el orden correcto (al niño se le muestran mezclados). */
  elementos?: string[];
  /** ESCRITURA / VOZ: mínimo de palabras esperado. */
  minPalabras?: number;
}

export interface Item {
  id: string;
  orden: number;
  habilidad: Habilidad;
  nivelDificultad: number;
  modalidad: Modalidad;
  esCerrado: boolean;
  enunciado: string;
  contenido: ContenidoItem;
  /** SELECCION: { indice } o, si es múltiple, { indices }; ORDENAMIENTO: { orden }. Abiertos y EVIDENCIA: null (la evidencia son sus claves). */
  respuestaCorrecta: { indice: number } | { indices: number[] } | { orden: number[] } | null;
  explicacionModelada: string;
  pistas: Pista[];
  /** EVIDENCIA: oraciones de la misma versión que respaldan la respuesta (ConjuntoEvidencia). */
  clavesEvidencia: string[];
}

export interface Actividad {
  id: string;
  momento: Momento;
  tipo: TipoActividad;
  orden: number;
  oracionAnclajeId: string | null;
  items: Item[];
}

/** Lo que envía el editor: sin ids ni órdenes (los pone el dominio) y sin datos derivados. */
export interface ActividadNueva {
  id?: string;
  momento: string;
  tipo: string;
  oracionAnclajeId?: string | null;
  items: {
    id?: string;
    habilidad: string;
    nivelDificultad: number;
    modalidad: string;
    enunciado: string;
    opciones?: string[];
    indiceCorrecto?: number;
    /** Selección múltiple: las opciones correctas (de 2 a todas menos una). */
    indicesCorrectos?: number[];
    elementos?: string[];
    minPalabras?: number;
    clavesEvidencia?: string[];
    explicacionModelada: string;
    pistas?: { nivel: string; texto: string }[];
  }[];
}

const texto = (valor: unknown, min: number, max: number, campo: string): string => {
  const limpio = String(valor ?? '').trim();
  if (limpio.length < min || limpio.length > max) {
    throw new DatoLecturaInvalidoError(`${campo}: escribe entre ${min} y ${max} caracteres`);
  }
  return limpio;
};

/**
 * Construye y valida las actividades de un borrador (RF-024, RF-025). Lo estructural se exige al
 * guardar; lo que falta para publicar (P1, evidencias, actividad "después") se revisa al enviar.
 */
export function construirActividades(entrada: ActividadNueva[], oracionIds: Set<string>, generarId: () => string): Actividad[] {
  if (entrada.length > MAX_ACTIVIDADES) throw new DatoLecturaInvalidoError(`Una lectura admite hasta ${MAX_ACTIVIDADES} actividades`);
  const porMomento = (m: string) => MOMENTOS.indexOf(m as Momento);
  return [...entrada]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => porMomento(x.a.momento) - porMomento(y.a.momento) || x.i - y.i)
    .map(({ a }, i) => {
      const n = i + 1;
      if (!(MOMENTOS as readonly string[]).includes(a.momento)) throw new DatoLecturaInvalidoError(`Actividad ${n}: elige antes, durante o después`);
      if (!(TIPOS_ACTIVIDAD as readonly string[]).includes(a.tipo)) throw new DatoLecturaInvalidoError(`Actividad ${n}: tipo de actividad desconocido`);
      const tipo = a.tipo as TipoActividad;
      let anclaje: string | null = null;
      if (a.momento === 'DURANTE') {
        if (!a.oracionAnclajeId || !oracionIds.has(a.oracionAnclajeId)) {
          throw new DatoLecturaInvalidoError(`Actividad ${n}: una actividad "durante" necesita la oración donde aparece`);
        }
        anclaje = a.oracionAnclajeId;
      }
      if (a.items.length === 0 || a.items.length > MAX_ITEMS_POR_ACTIVIDAD) {
        throw new DatoLecturaInvalidoError(`Actividad ${n}: debe tener entre 1 y ${MAX_ITEMS_POR_ACTIVIDAD} preguntas`);
      }
      const items = a.items.map((it, j): Item => {
        const donde = `Actividad ${n}, pregunta ${j + 1}`;
        if (!(HABILIDADES as readonly string[]).includes(it.habilidad)) throw new DatoLecturaInvalidoError(`${donde}: elige la habilidad`);
        if (!Number.isInteger(it.nivelDificultad) || it.nivelDificultad < 1 || it.nivelDificultad > 5) {
          throw new DatoLecturaInvalidoError(`${donde}: la dificultad va de 1 a 5`);
        }
        if (!MODALIDADES_POR_TIPO[tipo].includes(it.modalidad as Modalidad)) {
          throw new DatoLecturaInvalidoError(`${donde}: esa forma de responder no corresponde al tipo de actividad`);
        }
        const modalidad = it.modalidad as Modalidad;
        let contenido: ContenidoItem = {};
        let respuesta: Item['respuestaCorrecta'] = null;
        if (modalidad === 'SELECCION') {
          const opciones = (it.opciones ?? []).map((o, k) => texto(o, 1, 200, `${donde}, opción ${k + 1}`));
          if (opciones.length < 2 || opciones.length > 5) throw new DatoLecturaInvalidoError(`${donde}: escribe de 2 a 5 opciones`);
          if (new Set(opciones.map((o) => o.toLowerCase())).size !== opciones.length) throw new DatoLecturaInvalidoError(`${donde}: hay opciones repetidas`);
          if (Array.isArray(it.indicesCorrectos)) {
            const indices = [...new Set(it.indicesCorrectos)].sort((x, y) => x - y);
            if (indices.some((k) => !Number.isInteger(k) || k < 0 || k >= opciones.length) || indices.length < 2 || indices.length >= opciones.length) {
              throw new DatoLecturaInvalidoError(`${donde}: en selección múltiple marca al menos 2 opciones correctas, y no todas`);
            }
            contenido = { opciones, multiple: true };
            respuesta = { indices };
          } else {
            if (!Number.isInteger(it.indiceCorrecto) || (it.indiceCorrecto as number) < 0 || (it.indiceCorrecto as number) >= opciones.length) {
              throw new DatoLecturaInvalidoError(`${donde}: marca la opción correcta`);
            }
            contenido = { opciones };
            respuesta = { indice: it.indiceCorrecto as number };
          }
        } else if (modalidad === 'ORDENAMIENTO') {
          const elementos = (it.elementos ?? []).map((e, k) => texto(e, 1, 200, `${donde}, elemento ${k + 1}`));
          if (elementos.length < 2 || elementos.length > 8) throw new DatoLecturaInvalidoError(`${donde}: escribe de 2 a 8 elementos en el orden correcto`);
          contenido = { elementos };
          respuesta = { orden: elementos.map((_, k) => k) };
        } else if (modalidad === 'ESCRITURA' || modalidad === 'VOZ') {
          if (it.minPalabras !== undefined && (!Number.isInteger(it.minPalabras) || it.minPalabras < 1 || it.minPalabras > 200)) {
            throw new DatoLecturaInvalidoError(`${donde}: el mínimo de palabras va de 1 a 200`);
          }
          contenido = it.minPalabras ? { minPalabras: it.minPalabras } : {};
        }
        const claves = modalidad === 'EVIDENCIA' ? [...new Set(it.clavesEvidencia ?? [])] : [];
        if (claves.some((c) => !oracionIds.has(c))) throw new DatoLecturaInvalidoError(`${donde}: las evidencias deben ser oraciones de esta lectura`);

        const pistas = (it.pistas ?? [])
          .filter((p) => String(p.texto ?? '').trim())
          .map((p) => {
            if (!(NIVELES_PISTA as readonly string[]).includes(p.nivel)) throw new DatoLecturaInvalidoError(`${donde}: las pistas son P1, P2 y P3`);
            return { nivel: p.nivel as NivelPista, texto: texto(p.texto, 3, 300, `${donde}, pista ${p.nivel}`) };
          })
          .sort((x, y) => x.nivel.localeCompare(y.nivel));
        if (new Set(pistas.map((p) => p.nivel)).size !== pistas.length) throw new DatoLecturaInvalidoError(`${donde}: cada pista va una sola vez`);
        // Las pistas son progresivas: no hay P2 sin P1 ni P3 sin P2.
        if (pistas.some((p, k) => p.nivel !== NIVELES_PISTA[k])) throw new DatoLecturaInvalidoError(`${donde}: las pistas van en orden, empezando por P1`);

        return {
          id: it.id ?? generarId(),
          orden: j + 1,
          habilidad: it.habilidad as Habilidad,
          nivelDificultad: it.nivelDificultad,
          modalidad,
          esCerrado: MODALIDADES_CERRADAS.includes(modalidad),
          enunciado: texto(it.enunciado, 3, 500, `${donde}, enunciado`),
          contenido,
          respuestaCorrecta: respuesta,
          explicacionModelada: texto(it.explicacionModelada, 3, 1000, `${donde}, explicación modelada`),
          pistas,
          clavesEvidencia: claves,
        };
      });
      return { id: a.id ?? generarId(), momento: a.momento as Momento, tipo, orden: n, oracionAnclajeId: anclaje, items };
    });
}

const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** RF-025, RN-06, RN-15: lo que impide enviar las actividades a revisión. */
export function problemasDeActividades(actividades: Actividad[]): string[] {
  const problemas: string[] = [];
  if (!actividades.some((a) => a.momento === 'DESPUES')) problemas.push('Agrega al menos una actividad para después de leer');
  for (const a of actividades) {
    for (const it of a.items) {
      const donde = `Actividad ${a.orden}, pregunta ${it.orden}`;
      if (it.esCerrado && !it.pistas.some((p) => p.nivel === 'P1')) problemas.push(`${donde}: falta la pista P1`);
      if (it.modalidad === 'EVIDENCIA' && it.clavesEvidencia.length === 0) problemas.push(`${donde}: marca las oraciones que son evidencia`);
      const rc = it.respuestaCorrecta;
      const correctas = rc && 'indice' in rc ? [rc.indice] : rc && 'indices' in rc ? rc.indices : [];
      // Una pista nunca dice la respuesta literal (RN-06).
      const revela = correctas.some((k) => {
        const correcta = normal(it.contenido.opciones?.[k] ?? '');
        return correcta.length >= 3 && it.pistas.some((p) => normal(p.texto).includes(correcta));
      });
      if (revela) problemas.push(`${donde}: una pista revela la respuesta correcta`);
    }
  }
  return problemas;
}
