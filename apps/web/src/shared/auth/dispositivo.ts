/**
 * Token de la tablet activada por un adulto (RN-04, CR-01): de la familia o del aula. Solo
 * permite ver los avatares de ese grupo; para entrar sigue haciendo falta el PIN de cada niño.
 * También se recuerda para quién quedó activada, solo para mostrárselo al adulto.
 */
const CLAVE = 'lectoaventura.dispositivo';
const CLAVE_NOMBRE = 'lectoaventura.dispositivo.nombre';

export function leerTokenDispositivo(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function leerNombreDispositivo(): string | null {
  try {
    return localStorage.getItem(CLAVE_NOMBRE);
  } catch {
    return null;
  }
}

export function guardarTokenDispositivo(token: string, nombre?: string): void {
  try {
    localStorage.setItem(CLAVE, token);
    if (nombre) localStorage.setItem(CLAVE_NOMBRE, nombre);
    else localStorage.removeItem(CLAVE_NOMBRE);
  } catch {
    // Navegación privada: la tablet no queda activada.
  }
}

export function olvidarDispositivo(): void {
  try {
    localStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE_NOMBRE);
  } catch {
    // Sin almacenamiento local, no hay nada que borrar.
  }
}
