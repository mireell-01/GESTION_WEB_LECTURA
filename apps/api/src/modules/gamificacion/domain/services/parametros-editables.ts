import { ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { ParametrosGamificacion } from './parametros';

/** Lo que la administración puede cambiar en una versión nueva de los parámetros (RF-078). */
export type ParametrosEditables = Omit<ParametrosGamificacion, 'version'>;

/** Rangos admitidos: amplios para ajustar, pero sin valores que rompan el juego (RN-10 a RN-12, RN-19, RF-057). */
export const LIMITES = {
  puntos: { min: 0, max: 500 },
  rachaDias: { min: 1, max: 365 },
  rachaBono: { min: 0, max: 1000 },
  porcentajeRepeticion: { min: 0, max: 100 },
  topeDiario: { min: 10, max: 10_000 },
  baseNivel: { min: 10, max: 10_000 },
  palabras: { min: 1, max: 100 },
  umbralInsignia: { min: 1, max: 1000 },
} as const;

export class ParametrosInvalidosError extends ErrorDeNegocio {
  constructor(errores: string[]) {
    super(`Revisa los parámetros: ${errores.join('; ')}`, 'VALIDACION', { errores });
  }
}

const PUNTOS: [keyof ParametrosEditables['puntos'], string][] = [
  ['lecturaCompletada', 'los puntos por lectura completada'],
  ['itemCorrecto', 'los puntos por respuesta correcta'],
  ['correctoTrasPista', 'los puntos por respuesta correcta tras una pista'],
  ['subidaNivelCneb', 'los puntos por subir de nivel en una habilidad'],
  ['retoDelDia', 'los puntos del reto del día'],
];

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

/**
 * RF-078: valida una versión nueva completa. A diferencia de `leerParametros` (que completa lo que falte
 * con el SRS para no detener el juego), aquí todo debe venir y estar en rango: si algo falla, no se
 * publica nada y se dice qué corregir. Las insignias con umbral son las del catálogo que se ganan contando.
 */
export function validarParametros(entrada: unknown, insigniasConUmbral: string[]): ParametrosEditables {
  const errores: string[] = [];
  const raiz = objeto(entrada) ?? {};
  const entero = (valor: unknown, rango: { min: number; max: number }, nombre: string): number => {
    if (!Number.isInteger(valor) || (valor as number) < rango.min || (valor as number) > rango.max) {
      errores.push(`${nombre} debe ser un número entero entre ${rango.min} y ${rango.max}`);
      return rango.min;
    }
    return valor as number;
  };

  const p = objeto(raiz['puntos']) ?? {};
  const puntos = Object.fromEntries(PUNTOS.map(([clave, nombre]) => [clave, entero(p[clave], LIMITES.puntos, nombre)])) as Omit<ParametrosEditables['puntos'], 'racha'>;
  const rachaEntrada = Object.entries(objeto(p['racha']) ?? {});
  if (rachaEntrada.length === 0 || rachaEntrada.length > 6) errores.push('la racha debe tener entre 1 y 6 bonos');
  const racha: Record<string, number> = {};
  for (const [dias, bono] of rachaEntrada) {
    const d = entero(/^\d+$/.test(dias) ? Number(dias) : NaN, LIMITES.rachaDias, 'los días de cada bono de racha');
    racha[String(d)] = entero(bono, LIMITES.rachaBono, `el bono de ${dias} días de racha`);
  }

  const anti = objeto(raiz['antiFarming']) ?? {};
  const antiFarming = {
    porcentajeRepeticion: entero(anti['porcentajeRepeticion'], LIMITES.porcentajeRepeticion, 'el porcentaje al repetir una lectura'),
    topeDiario: entero(anti['topeDiario'], LIMITES.topeDiario, 'el tope de puntos por día'),
  };
  const nivelLector = { base: entero(objeto(raiz['nivelLector'])?.['base'], LIMITES.baseNivel, 'la base del nivel lector') };

  const abiertas = objeto(raiz['respuestasAbiertas']) ?? {};
  const respuestasAbiertas = {
    palabrasMinimasR2: entero(abiertas['palabrasMinimasR2'], LIMITES.palabras, 'las palabras mínimas de 6 a 9 años'),
    palabrasMinimasR3: entero(abiertas['palabrasMinimasR3'], LIMITES.palabras, 'las palabras mínimas de 10 a 12 años'),
  };
  if (respuestasAbiertas.palabrasMinimasR3 < respuestasAbiertas.palabrasMinimasR2) {
    errores.push('a los 10–12 años se piden al menos tantas palabras como a los 6–9');
  }

  const insigniasEntrada = objeto(raiz['insignias']) ?? {};
  const insignias: Record<string, number> = {};
  for (const [codigo, umbral] of Object.entries(insigniasEntrada)) {
    if (!insigniasConUmbral.includes(codigo)) {
      errores.push(`la insignia ${codigo} no se gana contando y no tiene umbral`);
      continue;
    }
    insignias[codigo] = entero(umbral, LIMITES.umbralInsignia, `el umbral de la insignia ${codigo}`);
  }

  if (errores.length > 0) throw new ParametrosInvalidosError([...new Set(errores)]);
  return { puntos: { ...puntos, racha }, antiFarming, nivelLector, respuestasAbiertas, insignias };
}

/** Cómo se guarda una versión (el mismo formato que la versión 1 sembrada por la migración). */
export function aJsonParametros(p: ParametrosEditables): Record<string, unknown> {
  return {
    puntos: p.puntos,
    antiFarming: p.antiFarming,
    nivelLector: { umbral: `${p.nivelLector.base} * n * (n + 1) / 2` },
    respuestasAbiertas: p.respuestasAbiertas,
    insignias: p.insignias,
  };
}
