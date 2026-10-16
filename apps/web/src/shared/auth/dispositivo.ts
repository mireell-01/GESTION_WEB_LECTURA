/**
 * Token del dispositivo familiar vinculado (RN-04). Solo permite ver los avatares de la familia;
 * para entrar sigue haciendo falta el PIN de cada niño.
 */
const CLAVE = 'lectoaventura.dispositivo';

export function leerTokenDispositivo(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarTokenDispositivo(token: string): void {
  try {
    localStorage.setItem(CLAVE, token);
  } catch {
    // Navegación privada: el dispositivo no queda vinculado.
  }
}

export function olvidarDispositivo(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento local, no hay nada que borrar.
  }
}
