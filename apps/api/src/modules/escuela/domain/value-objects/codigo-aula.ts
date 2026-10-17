/**
 * Value Object: CodigoAula (RF-014) — 6 caracteres alfanuméricos sin ambiguos (0/O, 1/I/L).
 * Desde CR-01 los niños ya no lo escriben (entran desde la tablet activada); identifica al aula.
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

  static desdePersistencia(valor: string): CodigoAula {
    return new CodigoAula(valor);
  }

  get value(): string {
    return this.valor;
  }
}
