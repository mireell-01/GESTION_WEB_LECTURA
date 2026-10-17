import { RecursoInvalidoError } from '../errors/errores-contenido';
import type { TipoRecurso } from '../entities/version-lectura';

/** RF-023: imágenes AVIF/WebP ≤ 200 KB; audio ≤ 2 MB. */
export const MAX_BYTES_IMAGEN = 200 * 1024;
export const MAX_BYTES_AUDIO = 2 * 1024 * 1024;
export const MAX_RECURSOS = 20;

export const TIPOS_MIME: Record<TipoRecurso, readonly string[]> = {
  IMAGEN: ['image/webp', 'image/avif'],
  AUDIO: ['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4'],
};

export const EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};

const ascii = (b: Uint8Array, desde: number, largo: number) => String.fromCharCode(...b.subarray(desde, desde + largo));

/** Reconoce el formato por su firma (los primeros bytes), sin confiar en lo que dice el navegador. */
export function detectarTipoMime(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(b, 4, 4) === 'ftyp') {
    const marca = ascii(b, 8, 4);
    if (marca === 'avif' || marca === 'avis') return 'image/avif';
    if (['M4A ', 'M4B ', 'mp42', 'isom', 'dash'].includes(marca)) return 'audio/mp4';
  }
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] as number) & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(b, 0, 4) === 'OggS') return 'audio/ogg';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  return null;
}

export interface DeclaracionRecurso {
  tipo: string;
  tipoMime: string;
  bytes: number;
  textoAlternativo?: string | null;
  duracionSeg?: number | null;
}

/** Lo que el editor declara antes de subir (se vuelve a comprobar con el archivo real). */
export function validarDeclaracion(d: DeclaracionRecurso): { tipo: TipoRecurso; textoAlternativo: string | null; duracionSeg: number | null } {
  if (d.tipo !== 'IMAGEN' && d.tipo !== 'AUDIO') throw new RecursoInvalidoError('El recurso es una imagen o un audio');
  const tipo = d.tipo as TipoRecurso;
  if (!TIPOS_MIME[tipo].includes(d.tipoMime)) {
    throw new RecursoInvalidoError(tipo === 'IMAGEN' ? 'La imagen debe estar en WebP o AVIF' : 'El audio debe ser MP3, OGG, WebM o M4A');
  }
  const maximo = tipo === 'IMAGEN' ? MAX_BYTES_IMAGEN : MAX_BYTES_AUDIO;
  if (!Number.isInteger(d.bytes) || d.bytes <= 0 || d.bytes > maximo) {
    throw new RecursoInvalidoError(tipo === 'IMAGEN' ? 'La imagen debe pesar como máximo 200 KB' : 'El audio debe pesar como máximo 2 MB');
  }
  const alt = d.textoAlternativo?.trim() || null;
  if (tipo === 'IMAGEN' && (!alt || alt.length < 3)) throw new RecursoInvalidoError('Describe la imagen (texto alternativo) para quien no puede verla');
  if (alt && alt.length > 250) throw new RecursoInvalidoError('El texto alternativo admite hasta 250 caracteres');
  const duracion = d.duracionSeg ?? null;
  if (duracion !== null && (!Number.isInteger(duracion) || duracion < 1 || duracion > 900)) {
    throw new RecursoInvalidoError('La duración del audio va de 1 a 900 segundos');
  }
  return { tipo, textoAlternativo: alt, duracionSeg: tipo === 'AUDIO' ? duracion : null };
}

/** El archivo que llega debe ser exactamente el declarado: mismo formato real y mismo tamaño. */
export function validarArchivo(archivo: Uint8Array, declarado: { tipoMime: string; bytes: number }): void {
  if (archivo.length !== declarado.bytes) throw new RecursoInvalidoError('El archivo no tiene el tamaño declarado');
  if (detectarTipoMime(archivo) !== declarado.tipoMime) throw new RecursoInvalidoError('El archivo no es del formato declarado');
}
