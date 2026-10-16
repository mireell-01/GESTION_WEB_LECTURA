import { createHash } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { ErrorDeNegocio } from '../domain/errors/error-de-negocio';

/**
 * RNF-019: limitación de tasa por ventana de 1 minuto.
 * `por` define qué se cuenta: la IP del cliente o un campo del cuerpo (p. ej. el token de la tablet);
 * si el campo no viene en la petición, esa regla no aplica.
 */
export interface ReglaLimiteTasa {
  nombre: string;
  maximoPorMinuto: number;
  por: 'ip' | { campoCuerpo: string };
}

export const LIMITE_TASA = 'la:limite-tasa';
export const LimiteTasa = (...reglas: ReglaLimiteTasa[]) => SetMetadata(LIMITE_TASA, reglas);

const VENTANA_MS = 60_000;

/**
 * El campo puede ser un dato personal o un secreto (correo, token de la tablet): en memoria solo
 * queda su huella. Sin distinguir mayúsculas, para que "Ana@x.pe" y "ana@x.pe" cuenten juntos.
 * Vacío si el campo no viene, para que esa regla no aplique.
 */
function huellaDeCampo(cuerpo: unknown, campo: string): string {
  const valor = String((cuerpo as Record<string, unknown> | undefined)?.[campo] ?? '').trim().toLowerCase();
  return valor ? createHash('sha256').update(valor).digest('base64url') : '';
}

/**
 * Guard global de límite de tasa en memoria (una instancia de API). Con varias instancias,
 * el almacén debe moverse a Redis (ADR-004). `LIMITE_TASA_FACTOR` multiplica los máximos
 * en entornos de prueba de carga.
 */
@Injectable()
export class LimiteTasaGuard implements CanActivate {
  private readonly contadores = new Map<string, { inicio: number; usados: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const reglas = this.reflector.get<ReglaLimiteTasa[] | undefined>(LIMITE_TASA, contexto.getHandler());
    if (!reglas || reglas.length === 0) return true;

    const http = contexto.switchToHttp();
    const req = http.getRequest<Request>();
    const ahora = Date.now();
    const factor = Number(process.env['LIMITE_TASA_FACTOR'] ?? 1) || 1;

    // Primero se comprueban todas las reglas; solo si ninguna se excede se cuenta el intento.
    const claves: { clave: string; maximo: number }[] = [];
    for (const regla of reglas) {
      const sujeto = regla.por === 'ip' ? (req.ip ?? 'desconocida') : huellaDeCampo(req.body, regla.por.campoCuerpo);
      if (!sujeto) continue;
      const clave = `${regla.nombre}:${sujeto}`;
      const maximo = regla.maximoPorMinuto * factor;
      const actual = this.contadores.get(clave);
      if (actual && ahora - actual.inicio < VENTANA_MS && actual.usados >= maximo) {
        const reintentarEnSeg = Math.ceil((actual.inicio + VENTANA_MS - ahora) / 1000);
        http.getResponse<Response>().setHeader('Retry-After', String(reintentarEnSeg));
        throw new ErrorDeNegocio('Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.', 'LIMITE', {
          reintentarEnSeg,
        });
      }
      claves.push({ clave, maximo });
    }

    for (const { clave } of claves) {
      const actual = this.contadores.get(clave);
      if (!actual || ahora - actual.inicio >= VENTANA_MS) {
        this.contadores.set(clave, { inicio: ahora, usados: 1 });
      } else {
        actual.usados += 1;
      }
    }
    this.limpiar(ahora);
    return true;
  }

  /** Evita que el mapa crezca sin límite con claves de ventanas ya vencidas. */
  private limpiar(ahora: number): void {
    if (this.contadores.size < 10_000) return;
    for (const [clave, valor] of this.contadores) {
      if (ahora - valor.inicio >= VENTANA_MS) this.contadores.delete(clave);
    }
  }
}
