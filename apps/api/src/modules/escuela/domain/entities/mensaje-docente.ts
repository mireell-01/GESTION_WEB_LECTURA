import { DatoMensajeInvalidoError } from '../errors/errores-escuela';

/**
 * Mensajitos de ánimo de la docente para sus estudiantes. Van solo de la docente al niño (el niño no
 * responde por escrito: los cierra con «Gracias»). Llevan un sticker de una lista cerrada y un texto
 * corto; un envío a toda el aula crea un mensaje por niño, para saber quién ya lo leyó.
 */
export const STICKERS = ['ESTRELLA', 'FIESTA', 'FUERZA', 'LIBRO', 'CORAZON', 'TROFEO', 'COHETE', 'SOL'] as const;
export type Sticker = (typeof STICKERS)[number];

export const MAX_CARACTERES_MENSAJE = 140;

/** Caracteres de control o invisibles (no se ven y pueden esconder texto). */
const INVISIBLES = /[\p{Cc}\p{Cf}]/u;

export function esSticker(valor: string): valor is Sticker {
  return (STICKERS as readonly string[]).includes(valor);
}

/** El texto tal como lo verá el niño: sin espacios de sobra, de 1 a 140 caracteres y sin caracteres ocultos. */
export function textoDeMensaje(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length === 0) throw new DatoMensajeInvalidoError('Escribe un mensajito para tus estudiantes');
  if ([...limpio].length > MAX_CARACTERES_MENSAJE) throw new DatoMensajeInvalidoError(`El mensajito puede tener hasta ${MAX_CARACTERES_MENSAJE} caracteres`);
  if (INVISIBLES.test(limpio)) throw new DatoMensajeInvalidoError('El mensajito tiene caracteres que no se pueden mostrar');
  return limpio;
}

export interface MensajeDocenteProps {
  id: string;
  envioId: string;
  aulaId: string;
  docenteId: string;
  estudianteId: string;
  paraTodaElAula: boolean;
  sticker: Sticker;
  texto: string;
  creadoEn: Date;
  leidoEn: Date | null;
}

export class MensajeDocente {
  private constructor(private readonly props: MensajeDocenteProps) {}

  /** Un envío: el mismo sticker y texto para cada estudiante elegido (uno, o toda el aula). */
  static enviar(params: {
    envioId: string;
    generarId: () => string;
    aulaId: string;
    docenteId: string;
    estudianteIds: string[];
    paraTodaElAula: boolean;
    sticker: string;
    texto: string;
    ahora: Date;
  }): MensajeDocente[] {
    if (!esSticker(params.sticker)) throw new DatoMensajeInvalidoError('Elige uno de los stickers');
    const texto = textoDeMensaje(params.texto);
    if (params.estudianteIds.length === 0) throw new DatoMensajeInvalidoError('Aún no hay estudiantes en el aula para recibir el mensajito');
    const sticker = params.sticker;
    return params.estudianteIds.map(
      (estudianteId) =>
        new MensajeDocente({
          id: params.generarId(),
          envioId: params.envioId,
          aulaId: params.aulaId,
          docenteId: params.docenteId,
          estudianteId,
          paraTodaElAula: params.paraTodaElAula,
          sticker,
          texto,
          creadoEn: params.ahora,
          leidoEn: null,
        }),
    );
  }

  static desdePersistencia(props: MensajeDocenteProps): MensajeDocente {
    return new MensajeDocente(props);
  }

  get id(): string {
    return this.props.id;
  }

  get datos(): Readonly<MensajeDocenteProps> {
    return this.props;
  }
}
