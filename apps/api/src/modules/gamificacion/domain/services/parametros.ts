/**
 * Parámetros de gamificación versionados (RF-078). Se lee la versión vigente en cada evento, así un
 * cambio del administrador aplica solo a lo que ocurre después. Un valor ausente o inválido toma el
 * del SRS (RN-11, RN-12, RN-19, RF-057), que es la versión 1 sembrada por la migración.
 */
export interface ParametrosGamificacion {
  version: number;
  puntos: {
    lecturaCompletada: number;
    itemCorrecto: number;
    correctoTrasPista: number;
    subidaNivelCneb: number;
    retoDelDia: number;
    /** Días de racha → puntos de bono (RN-11: 3, 7 y 30 días). */
    racha: Record<string, number>;
  };
  antiFarming: { porcentajeRepeticion: number; topeDiario: number };
  /** RF-057: umbral del nivel n = base × n × (n + 1) / 2. */
  nivelLector: { base: number };
  respuestasAbiertas: { palabrasMinimasR2: number; palabrasMinimasR3: number };
}

export const PARAMETROS_POR_DEFECTO: ParametrosGamificacion = {
  version: 1,
  puntos: {
    lecturaCompletada: 20,
    itemCorrecto: 10,
    correctoTrasPista: 6,
    subidaNivelCneb: 50,
    retoDelDia: 15,
    racha: { '3': 10, '7': 30, '30': 100 },
  },
  antiFarming: { porcentajeRepeticion: 25, topeDiario: 300 },
  nivelLector: { base: 100 },
  respuestasAbiertas: { palabrasMinimasR2: 5, palabrasMinimasR3: 10 },
};

const UMBRAL = /^\s*(\d+)\s*\*\s*n\s*\*\s*\(\s*n\s*\+\s*1\s*\)\s*\/\s*2\s*$/;

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function entero(valor: unknown, porDefecto: number, maximo = Number.MAX_SAFE_INTEGER): number {
  return Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) <= maximo ? (valor as number) : porDefecto;
}

/** Lee el JSON guardado en `parametro_gamificacion`, completando con los valores del SRS. */
export function leerParametros(version: number, json: unknown): ParametrosGamificacion {
  const d = PARAMETROS_POR_DEFECTO;
  const raiz = objeto(json);
  const puntos = objeto(raiz['puntos']);
  const anti = objeto(raiz['antiFarming']);
  const abiertas = objeto(raiz['respuestasAbiertas']);
  const umbral = objeto(raiz['nivelLector'])['umbral'];
  const base = typeof umbral === 'string' ? Number(UMBRAL.exec(umbral)?.[1] ?? NaN) : NaN;

  const racha = Object.entries(objeto(puntos['racha'])).filter(([dias, bono]) => /^[1-9]\d*$/.test(dias) && Number.isInteger(bono) && (bono as number) >= 0);
  return {
    version,
    puntos: {
      lecturaCompletada: entero(puntos['lecturaCompletada'], d.puntos.lecturaCompletada),
      itemCorrecto: entero(puntos['itemCorrecto'], d.puntos.itemCorrecto),
      correctoTrasPista: entero(puntos['correctoTrasPista'], d.puntos.correctoTrasPista),
      subidaNivelCneb: entero(puntos['subidaNivelCneb'], d.puntos.subidaNivelCneb),
      retoDelDia: entero(puntos['retoDelDia'], d.puntos.retoDelDia),
      racha: racha.length > 0 ? (Object.fromEntries(racha) as Record<string, number>) : { ...d.puntos.racha },
    },
    antiFarming: {
      porcentajeRepeticion: entero(anti['porcentajeRepeticion'], d.antiFarming.porcentajeRepeticion, 100),
      topeDiario: entero(anti['topeDiario'], d.antiFarming.topeDiario),
    },
    nivelLector: { base: Number.isInteger(base) && base > 0 ? base : d.nivelLector.base },
    respuestasAbiertas: {
      palabrasMinimasR2: entero(abiertas['palabrasMinimasR2'], d.respuestasAbiertas.palabrasMinimasR2),
      palabrasMinimasR3: entero(abiertas['palabrasMinimasR3'], d.respuestasAbiertas.palabrasMinimasR3),
    },
  };
}
