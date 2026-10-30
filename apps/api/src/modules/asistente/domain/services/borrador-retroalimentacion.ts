import type { Habilidad, RangoEdad } from '../../../shared-kernel/public-api';
import { filtrarPalabras } from '../../../shared-kernel/public-api';
import { normalizar, palabrasClave } from './texto';

/** RN-19: lo mínimo que se espera de una respuesta abierta según la edad (si la actividad no lo fija). */
const MINIMO_POR_EDAD: Record<RangoEdad, number> = { R1: 3, R2: 5, R3: 10 };

export interface CriteriosRespuesta {
  palabras: number;
  /** Llega a lo pedido por la actividad (o al mínimo de su edad). */
  suficiente: boolean;
  /** Da al menos una razón ("porque", "ya que"…). */
  daRazones: boolean;
  /** Se apoya en el texto: usa al menos 2 palabras con contenido de la lectura. */
  usaElTexto: boolean;
}

const RAZONES = /\b(porque|por que|ya que|pues|por eso|debido|entonces|asi que|para que)\b/;

/** Una pregunta que invita a profundizar, según la habilidad que trabaja la actividad. */
const PROFUNDIZAR: Record<Habilidad, string> = {
  LIT: '¿En qué parte del texto lo encontraste?',
  INF: '¿Qué pista del texto te ayudó a darte cuenta?',
  VOC: '¿Puedes usar esa palabra en otra oración?',
  CRI: '¿Qué habrías hecho tú en su lugar?',
  ARG: '¿Qué otra razón podrías dar?',
};

export function criteriosDe(p: { respuesta: string; minPalabras: number | null; rangoEdad: RangoEdad; texto: string[] }): CriteriosRespuesta {
  const palabras = normalizar(p.respuesta).split(' ').filter(Boolean).length;
  const delTexto = new Set(p.texto.flatMap((o) => palabrasClave(o)).filter((x) => x.length >= 4));
  const usadas = new Set(palabrasClave(p.respuesta).filter((x) => delTexto.has(x)));
  return {
    palabras,
    suficiente: palabras >= (p.minPalabras ?? MINIMO_POR_EDAD[p.rangoEdad]),
    daRazones: RAZONES.test(normalizar(p.respuesta)),
    usaElTexto: usadas.size >= 2,
  };
}

/**
 * RF-075: un borrador de retroalimentación para una respuesta abierta — algo que hizo bien, una sola
 * mejora y una pregunta para profundizar —, en el tono de la docente y sin repetir lo que escribió el
 * niño. Es solo una propuesta: la docente lo edita y decide; nunca llega al niño sin su aprobación.
 */
export function borradorRetroalimentacion(p: {
  respuesta: string;
  minPalabras: number | null;
  rangoEdad: RangoEdad;
  habilidad: Habilidad;
  texto: string[];
}): { borrador: string; criterios: CriteriosRespuesta } {
  const c = criteriosDe(p);
  const fortaleza = c.usaElTexto
    ? 'Me gusta que uses lo que dice el texto.'
    : c.daRazones
      ? 'Me gusta que expliques por qué lo piensas.'
      : 'Gracias por compartir lo que piensas.';
  const mejora = !c.suficiente
    ? 'Intenta escribir un poco más: cuéntame tu idea con más detalle.'
    : !c.daRazones
      ? 'La próxima vez, agrega una razón con «porque…».'
      : !c.usaElTexto
        ? 'Busca en el texto una parte que respalde tu idea.'
        : '¡Tu respuesta está muy completa!';
  const borrador = filtrarPalabras(`${fortaleza} ${mejora} ${PROFUNDIZAR[p.habilidad]}`).texto;
  return { borrador, criterios: c };
}
