/**
 * Value Object: CodigoAula (RF-014) — 6 caracteres alfanuméricos sin ambiguos (0/O, 1/I/L).
 * La unicidad global la garantiza el repositorio (índice único) y el caso de uso (reintento).
 */
export const ALFABETO_CODIGO_AULA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LONGITUD_CODIGO_AULA = 6;

export class CodigoAula {
  private constructor(private readonly valor: string) {}

  /** `aleatorio(n)` devuelve un entero uniforme en [0, n) de una fuente criptográfica. */
  static generar(aleatorio: (n: number) => number): CodigoAula {
    let valor = '';
    for (let i = 0; i < LONGITUD_CODIGO_AULA; i++) {
      valor += ALFABETO_CODIGO_AULA[aleatorio(ALFABETO_CODIGO_AULA.length)];
    }
    return new CodigoAula(valor);
  }

  /** Normaliza lo que escribe el estudiante; devuelve null si no tiene forma de código. */
  static intentar(valor: string): CodigoAula | null {
    const limpio = valor.trim().toUpperCase();
    if (limpio.length !== LONGITUD_CODIGO_AULA) return null;
    for (const c of limpio) {
      if (!ALFABETO_CODIGO_AULA.includes(c)) return null;
    }
    return new CodigoAula(limpio);
  }

  static desdePersistencia(valor: string): CodigoAula {
    return new CodigoAula(valor);
  }

  get value(): string {
    return this.valor;
  }
}
