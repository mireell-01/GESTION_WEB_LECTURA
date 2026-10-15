import { AulaLlenaError, EstudianteRepetidoEnAulaError } from '../errors/errores-escuela';
import { MAX_MATRICULAS_ACTIVAS } from '../entities/aula';

/**
 * Servicio de dominio: PoliticaMatricula — capacidad del aula y estudiantes distinguibles
 * al elegir avatar en el ingreso (alias + avatar únicos dentro del aula).
 */
export class PoliticaMatricula {
  static validarCapacidad(activas: number, nuevas = 1): void {
    if (activas + nuevas > MAX_MATRICULAS_ACTIVAS) {
      throw new AulaLlenaError(MAX_MATRICULAS_ACTIVAS);
    }
  }

  static validarDistinguible(
    existentes: { alias: string; avatar: string }[],
    nuevo: { alias: string; avatar: string },
  ): void {
    const clave = (e: { alias: string; avatar: string }) => `${e.alias.trim().toLowerCase()}|${e.avatar}`;
    if (existentes.some((e) => clave(e) === clave(nuevo))) {
      throw new EstudianteRepetidoEnAulaError();
    }
  }
}

/**
 * PIN aleatorio para la tarjeta de acceso (RF-017): 4 dígitos sin patrones fáciles
 * (repetidos, escaleras ni años recientes). `aleatorio(n)` es una fuente criptográfica.
 */
export function generarPinTarjeta(aleatorio: (n: number) => number, anioNacimiento: number): string {
  for (;;) {
    const pin = Array.from({ length: 4 }, () => String(aleatorio(10))).join('');
    const digitos = pin.split('').map(Number);
    const repetido = new Set(digitos).size <= 2;
    const escalera = digitos.every((d, i) => i === 0 || d === (digitos[i - 1] as number) + 1) ||
      digitos.every((d, i) => i === 0 || d === (digitos[i - 1] as number) - 1);
    const pareceAnio = /^(19|20)\d\d$/.test(pin) || pin === String(anioNacimiento);
    if (!repetido && !escalera && !pareceAnio) return pin;
  }
}
