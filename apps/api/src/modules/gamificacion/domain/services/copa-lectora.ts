import { diasEntre, lunesDeLaSemana } from '../../../shared-kernel/public-api';

/**
 * La Copa Lectora del aula: cada semana (lunes a domingo, hora de Lima) los compañeros suman los puntos
 * que ganan leyendo. El lunes todos empiezan de cero. Solo se muestran alias y avatar (nunca nombres).
 */
export interface SemanaCopa {
  desde: string;
  hasta: string;
  /** Días que quedan, contando hoy (domingo: 1). */
  diasQuedan: number;
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

export function semanaDeCopa(hoy: string): SemanaCopa {
  const desde = lunesDeLaSemana(hoy);
  const hasta = sumarDias(desde, 6);
  return { desde, hasta, diasQuedan: diasEntre(hoy, hasta) + 1 };
}

export interface Competidor {
  alias: string;
  puntos: number;
}

/** Más puntos primero. Un empate comparte el puesto (1, 1, 3) y se ordena por alias, para que no salte. */
export function clasificar<T extends Competidor>(competidores: readonly T[]): (T & { posicion: number })[] {
  const orden = [...competidores].sort((a, b) => b.puntos - a.puntos || a.alias.localeCompare(b.alias, 'es'));
  const tabla: (T & { posicion: number })[] = [];
  orden.forEach((c, i) => {
    const anterior = tabla[i - 1];
    tabla.push({ ...c, posicion: anterior && anterior.puntos === c.puntos ? anterior.posicion : i + 1 });
  });
  return tabla;
}
