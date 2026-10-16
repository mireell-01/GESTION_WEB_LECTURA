import type { Sesion as SesionFila } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { SesionRepository } from '../../application/ports/sesion.repository';
import { Sesion } from '../../domain/entities/sesion';

/** Adaptador: PrismaSesionRepository. */
export class PrismaSesionRepository implements SesionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(sesion: Sesion): Promise<void> {
    const p = sesion.propsSnapshot;
    const datos = {
      sujetoId: p.sujetoId,
      rol: p.rol,
      mfa: p.mfa,
      hashRefreshToken: p.hashRefreshToken,
      ultimaActividadEn: p.ultimaActividadEn,
      revocadaEn: p.revocadaEn,
    };
    await this.prisma.sesion.upsert({
      where: { id: p.id },
      update: datos,
      create: { id: p.id, creadaEn: p.creadaEn, ...datos },
    });
  }

  async buscarPorId(id: string): Promise<Sesion | null> {
    const fila = esUuid(id) ? await this.prisma.sesion.findUnique({ where: { id } }) : null;
    return fila ? this.aDominio(fila) : null;
  }

  async buscarPorHashRefreshToken(hash: string): Promise<Sesion | null> {
    const fila = await this.prisma.sesion.findUnique({ where: { hashRefreshToken: hash } });
    return fila ? this.aDominio(fila) : null;
  }

  async revocarTodasDe(sujetoId: string, ahora: Date): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { sujetoId, revocadaEn: null },
      data: { revocadaEn: ahora },
    });
  }

  async registrarRefreshUsado(hash: string, sesionId: string, ahora: Date): Promise<void> {
    await this.prisma.refreshTokenUsado.upsert({
      where: { hash },
      update: {},
      create: { hash, sesionId, usadoEn: ahora },
    });
  }

  async sesionDeRefreshUsado(hash: string): Promise<string | null> {
    return (await this.prisma.refreshTokenUsado.findUnique({ where: { hash } }))?.sesionId ?? null;
  }

  private aDominio(f: SesionFila): Sesion {
    return Sesion.desdePersistencia({
      id: f.id,
      sujetoId: f.sujetoId,
      rol: f.rol,
      mfa: f.mfa,
      hashRefreshToken: f.hashRefreshToken,
      creadaEn: f.creadaEn,
      ultimaActividadEn: f.ultimaActividadEn,
      revocadaEn: f.revocadaEn,
    });
  }
}
