import type { Aula as AulaFila } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { AulaRepository } from '../../application/ports/aula.repository';
import { Aula, EstadoAula, Grado } from '../../domain/entities/aula';
import { CodigoAula } from '../../domain/value-objects/codigo-aula';

/** Adaptador: PrismaAulaRepository. */
export class PrismaAulaRepository implements AulaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(aula: Aula): Promise<void> {
    const p = aula.propsSnapshot;
    const datos = {
      docenteId: p.docenteId,
      nombre: p.nombre,
      grado: p.grado,
      anioLectivo: p.anioLectivo,
      institucion: p.institucion,
      codigo: p.codigo.value,
      estado: p.estado,
      archivadaEn: p.archivadaEn,
    };
    await this.prisma.aula.upsert({
      where: { id: p.id },
      update: datos,
      create: { id: p.id, creadaEn: p.creadaEn, ...datos },
    });
  }

  async buscarPorId(id: string): Promise<Aula | null> {
    const fila = esUuid(id) ? await this.prisma.aula.findUnique({ where: { id } }) : null;
    return fila ? this.aDominio(fila) : null;
  }

  async buscarPorCodigo(codigo: string): Promise<Aula | null> {
    const fila = await this.prisma.aula.findUnique({ where: { codigo } });
    return fila ? this.aDominio(fila) : null;
  }

  async existeCodigo(codigo: string): Promise<boolean> {
    return (await this.prisma.aula.count({ where: { codigo } })) > 0;
  }

  async listarPorDocente(docenteId: string): Promise<Aula[]> {
    const filas = await this.prisma.aula.findMany({ where: { docenteId }, orderBy: { creadaEn: 'desc' } });
    return filas.map((f) => this.aDominio(f));
  }

  async buscarPorIds(ids: string[]): Promise<Aula[]> {
    if (ids.length === 0) return [];
    const filas = await this.prisma.aula.findMany({ where: { id: { in: ids.filter(esUuid) } } });
    return filas.map((f) => this.aDominio(f));
  }

  private aDominio(f: AulaFila): Aula {
    return Aula.desdePersistencia({
      id: f.id,
      docenteId: f.docenteId,
      nombre: f.nombre,
      grado: f.grado as Grado,
      anioLectivo: f.anioLectivo,
      institucion: f.institucion,
      codigo: CodigoAula.desdePersistencia(f.codigo),
      estado: f.estado as EstadoAula,
      creadaEn: f.creadaEn,
      archivadaEn: f.archivadaEn,
    });
  }
}
