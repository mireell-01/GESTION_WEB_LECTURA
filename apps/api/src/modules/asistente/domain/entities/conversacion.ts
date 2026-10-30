import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** RF-074: intercambios (mensaje del niño + respuesta) por sesión de lectura. */
export const MAX_INTERCAMBIOS = 10;
/** SRS §7 y ADR-008: las conversaciones se guardan 30 días para auditoría y luego se borran. */
export const DIAS_RETENCION = 30;

export type Emisor = 'ESTUDIANTE' | 'ASISTENTE';

export interface TurnoAsistente {
  orden: number;
  emisor: Emisor;
  /** Lo del niño, sin datos personales; lo del asistente, ya revisado por el filtro de salida. */
  texto: string;
  /** El niño: se le quitaron datos personales o groserías. El asistente: el filtro bloqueó su respuesta. */
  filtrado: boolean;
  creadoEn: Date;
}

export interface ConversacionProps {
  id: string;
  estudianteId: string;
  sesionLecturaId: string;
  intercambios: number;
  iniciadaEn: Date;
  cerradaEn: Date | null;
  expiraEn: Date;
  turnos: TurnoAsistente[];
}

export class LimiteIntercambiosError extends ErrorDeNegocio {
  constructor() {
    super(`El asistente ya respondió ${MAX_INTERCAMBIOS} veces en esta lectura`, 'CONFLICTO');
  }
}

/**
 * Agregado: Conversacion — el diálogo del niño con el asistente en una sesión de lectura (una por
 * sesión): hasta 10 intercambios y se borra a los 30 días.
 */
export class Conversacion {
  private constructor(private readonly props: ConversacionProps) {}

  static iniciar(p: { id: string; estudianteId: string; sesionLecturaId: string; ahora: Date }): Conversacion {
    return new Conversacion({
      id: p.id,
      estudianteId: p.estudianteId,
      sesionLecturaId: p.sesionLecturaId,
      intercambios: 0,
      iniciadaEn: p.ahora,
      cerradaEn: null,
      expiraEn: new Date(p.ahora.getTime() + DIAS_RETENCION * 86_400_000),
      turnos: [],
    });
  }

  static reconstruir(props: ConversacionProps): Conversacion {
    return new Conversacion({ ...props, turnos: [...props.turnos].sort((a, b) => a.orden - b.orden) });
  }

  get id(): string {
    return this.props.id;
  }
  get estudianteId(): string {
    return this.props.estudianteId;
  }
  get sesionLecturaId(): string {
    return this.props.sesionLecturaId;
  }
  get intercambios(): number {
    return this.props.intercambios;
  }
  get restantes(): number {
    return Math.max(0, MAX_INTERCAMBIOS - this.props.intercambios);
  }
  get agotada(): boolean {
    return this.props.intercambios >= MAX_INTERCAMBIOS;
  }
  get turnos(): readonly TurnoAsistente[] {
    return this.props.turnos;
  }
  get snapshot(): Readonly<ConversacionProps> {
    return this.props;
  }

  /** Un intercambio: lo que dijo el niño y lo que le respondió el asistente (en ese orden). */
  registrar(nino: { texto: string; filtrado: boolean }, asistente: { texto: string; filtrado: boolean }, ahora: Date): TurnoAsistente[] {
    if (this.agotada) throw new LimiteIntercambiosError();
    const base = this.props.intercambios * 2;
    const nuevos: TurnoAsistente[] = [
      { orden: base + 1, emisor: 'ESTUDIANTE', ...nino, creadoEn: ahora },
      { orden: base + 2, emisor: 'ASISTENTE', ...asistente, creadoEn: ahora },
    ];
    this.props.intercambios += 1;
    this.props.turnos.push(...nuevos);
    if (this.agotada) this.props.cerradaEn = ahora;
    return nuevos;
  }
}
