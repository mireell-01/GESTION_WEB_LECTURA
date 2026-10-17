import { ALFABETO_CODIGO_AULA } from './codigo-aula';

export const LONGITUD_CODIGO_INVITACION = 8;

/**
 * Value Object: CodigoInvitacion (RF-019) — 8 caracteres sin ambiguos (0/O, 1/I/L), que la familia
 * copia de una nota de la docente. 31^8 ≈ 8,5 × 10^11 combinaciones: con el límite de intentos,
 * adivinar uno no es viable. Se muestra como "ABCD-2345" y solo se guarda su huella.
 */
export class CodigoInvitacion {
  private constructor(private readonly valor: string) {}

  /** `aleatorio(n)` devuelve un entero uniforme en [0, n) de una fuente criptográfica. */
  static generar(aleatorio: (n: number) => number): CodigoInvitacion {
    let valor = '';
    for (let i = 0; i < LONGITUD_CODIGO_INVITACION; i++) {
      valor += ALFABETO_CODIGO_AULA[aleatorio(ALFABETO_CODIGO_AULA.length)];
    }
    return new CodigoInvitacion(valor);
  }

  /** Acepta lo que escribe la familia (con guion, espacios o minúsculas); null si no tiene forma de código. */
  static intentar(texto: string): CodigoInvitacion | null {
    const limpio = texto.replace(/[\s-]/g, '').toUpperCase();
    if (limpio.length !== LONGITUD_CODIGO_INVITACION) return null;
    for (const c of limpio) {
      if (!ALFABETO_CODIGO_AULA.includes(c)) return null;
    }
    return new CodigoInvitacion(limpio);
  }

  get value(): string {
    return this.valor;
  }

  /** Para leer y dictar: "ABCD-2345". */
  get legible(): string {
    return `${this.valor.slice(0, 4)}-${this.valor.slice(4)}`;
  }
}
