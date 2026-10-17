/** RF-023: imágenes en WebP/AVIF de hasta 200 KB; audio de hasta 2 MB. */
export const MAX_BYTES_IMAGEN = 200 * 1024;
export const MAX_BYTES_AUDIO = 2 * 1024 * 1024;
export const AUDIOS = ['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4'];

const comoBlob = (canvas: HTMLCanvasElement, calidad: number) =>
  new Promise<Blob | null>((listo) => canvas.toBlob(listo, 'image/webp', calidad));

/**
 * Convierte la imagen elegida a WebP de hasta 200 KB en el propio navegador (sin subir el
 * original ni instalar nada en el servidor): baja la calidad y, si hace falta, el tamaño.
 */
export async function convertirAWebp(archivo: File): Promise<Blob> {
  if ((archivo.type === 'image/webp' || archivo.type === 'image/avif') && archivo.size <= MAX_BYTES_IMAGEN) return archivo;
  const imagen = await createImageBitmap(archivo);
  const lado = Math.max(imagen.width, imagen.height);
  for (const escala of [1, 0.8, 0.6, 0.45, 0.3]) {
    const factor = Math.min(1, 1600 / lado) * escala;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imagen.width * factor));
    canvas.height = Math.max(1, Math.round(imagen.height * factor));
    canvas.getContext('2d')?.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    for (const calidad of [0.85, 0.72, 0.6, 0.48]) {
      const blob = await comoBlob(canvas, calidad);
      if (!blob || blob.type !== 'image/webp') {
        throw new Error('Este navegador no puede convertir imágenes a WebP. Usa Chrome, Edge o Firefox.');
      }
      if (blob.size <= MAX_BYTES_IMAGEN) return blob;
    }
  }
  throw new Error('No se pudo reducir la imagen a 200 KB. Prueba con una imagen más pequeña.');
}

/** Duración del audio en segundos (para mostrarla a la docente y al niño). */
export function duracionDeAudio(archivo: File): Promise<number | null> {
  return new Promise((listo) => {
    const url = URL.createObjectURL(archivo);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      listo(Number.isFinite(audio.duration) ? Math.max(1, Math.round(audio.duration)) : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      listo(null);
    };
    audio.src = url;
  });
}
