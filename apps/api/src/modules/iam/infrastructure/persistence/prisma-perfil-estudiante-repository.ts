import type { PerfilEstudiante as PerfilFila } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { PerfilEstudianteRepository } from '../../application/ports/perfil-estudiante.repository';
import { PerfilEstudiante } from '../../domain/entities/perfil-estudiante';
import { AnioMesNacimiento } from '../../domain/value-objects/anio-mes-nacimiento';

/** Adaptador: PrismaPerfilEstudianteRepository. */
export class PrismaPerfilEstudianteRepository implements PerfilEstudianteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(perfil: PerfilEstudiante): Promise<void> {
    const p = perfil.propsSnapshot;
    const datos = {
      cuentaResponsableId: p.cuentaResponsableId,
      consentimientoId: p.consentimientoId,
      alias: p.alias,
      anioNacimiento: p.anioMesNacimiento.anio,
      mesNacimiento: p.anioMesNacimiento.mes,
      avatar: p.avatar,
      hashPin: p.hashPin,
      intentosFallidos: p.intentosFallidos,
      bloqueadoHasta: p.bloqueadoHasta,
      activo: p.activo,
      eliminadoEn: p.eliminadoEn,
    };
    await this.prisma.perfilEstudiante.upsert({
      where: { id: p.id },
      update: datos,
      create: { id: p.id, creadoEn: p.creadoEn, ...datos },
    });
  }

  async buscarPorId(id: string): Promise<PerfilEstudiante | null> {
    const fila = esUuid(id) ? await this.prisma.perfilEstudiante.findUnique({ where: { id } }) : null;
    return fila ? this.aDominio(fila) : null;
  }

  async buscarPorIds(ids: string[]): Promise<PerfilEstudiante[]> {
    const filas = await this.prisma.perfilEstudiante.findMany({ where: { id: { in: ids.filter(esUuid) } } });
    return filas.map((f) => this.aDominio(f));
  }

  async listarPorResponsable(cuentaResponsableId: string): Promise<PerfilEstudiante[]> {
    const filas = await this.prisma.perfilEstudiante.findMany({
      where: { cuentaResponsableId, eliminadoEn: null },
      orderBy: { creadoEn: 'asc' },
    });
    return filas.map((f) => this.aDominio(f));
  }

  private aDominio(fila: PerfilFila): PerfilEstudiante {
    return PerfilEstudiante.desdePersistencia({
      id: fila.id,
      cuentaResponsableId: fila.cuentaResponsableId,
      consentimientoId: fila.consentimientoId,
      alias: fila.alias,
      anioMesNacimiento: AnioMesNacimiento.desdePersistencia(fila.anioNacimiento, fila.mesNacimiento),
      avatar: fila.avatar,
      hashPin: fila.hashPin,
      intentosFallidos: fila.intentosFallidos,
      bloqueadoHasta: fila.bloqueadoHasta,
      activo: fila.activo,
      eliminadoEn: fila.eliminadoEn,
      creadoEn: fila.creadoEn,
    });
  }
}
