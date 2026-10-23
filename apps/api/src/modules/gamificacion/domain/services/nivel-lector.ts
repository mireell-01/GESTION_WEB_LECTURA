/**
 * RF-057: nivel de lector según los puntos acumulados. Llegar al nivel n pide base × n × (n + 1) / 2
 * puntos (con base 100: nivel 1 con 100, nivel 2 con 300, nivel 3 con 600, nivel 4 con 1000…).
 */
export function umbralNivel(n: number, base = 100): number {
  return (base * n * (n + 1)) / 2;
}

export function nivelLector(puntos: number, base = 100): number {
  if (puntos <= 0) return 0;
  let n = Math.floor((Math.sqrt(1 + (8 * puntos) / base) - 1) / 2);
  // La raíz en coma flotante puede quedar a un paso del entero exacto.
  while (umbralNivel(n + 1, base) <= puntos) n++;
  while (n > 0 && umbralNivel(n, base) > puntos) n--;
  return n;
}

export interface AvanceNivel {
  actual: number;
  /** Puntos con los que se llegó al nivel actual y los que pide el siguiente. */
  desde: number;
  hasta: number;
  faltan: number;
}

export function avanceNivel(puntos: number, base = 100): AvanceNivel {
  const actual = nivelLector(puntos, base);
  const hasta = umbralNivel(actual + 1, base);
  return { actual, desde: umbralNivel(actual, base), hasta, faltan: hasta - puntos };
}
