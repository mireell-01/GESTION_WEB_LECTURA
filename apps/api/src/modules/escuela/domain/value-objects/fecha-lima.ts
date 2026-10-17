import { DatoAsignacionInvalidoError } from '../errors/errores-escuela';

/** Perú no cambia la hora en el año: Lima está siempre en UTC−5. */
const DESFASE_LIMA_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Value Object: FechaLima — un día del calendario escolar en Lima (AAAA-MM-DD). La docente elige
 * días, no horas: una asignación empieza a las 00:00 de su día de inicio y vence a las 23:59:59
 * de su fecha límite, hora de Lima, sin importar la zona horaria del servidor.
 */
export class FechaLima {
  private constructor(private readonly valor: string) {}

  static de(texto: string): FechaLima {
    const limpio = texto.trim();
    const partes = FORMATO.exec(limpio);
    const fecha = partes ? new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))) : null;
    if (!fecha || fecha.toISOString().slice(0, 10) !== limpio) {
      throw new DatoAsignacionInvalidoError('Escribe la fecha como AAAA-MM-DD');
    }
    return new FechaLima(limpio);
  }

  static hoy(ahora: Date): FechaLima {
    return FechaLima.delInstante(ahora);
  }

  /** El día de Lima al que pertenece un instante. */
  static delInstante(instante: Date): FechaLima {
    return new FechaLima(new Date(instante.getTime() - DESFASE_LIMA_MS).toISOString().slice(0, 10));
  }

  get value(): string {
    return this.valor;
  }

  /** 00:00:00.000 de ese día en Lima. */
  get inicio(): Date {
    return new Date(Date.parse(`${this.valor}T00:00:00.000Z`) + DESFASE_LIMA_MS);
  }

  /** 23:59:59.999 de ese día en Lima. */
  get fin(): Date {
    return new Date(this.inicio.getTime() + DIA_MS - 1);
  }

  sumarDias(dias: number): FechaLima {
    return FechaLima.delInstante(new Date(this.inicio.getTime() + dias * DIA_MS));
  }

  esAnteriorA(otra: FechaLima): boolean {
    return this.valor < otra.valor;
  }
}
