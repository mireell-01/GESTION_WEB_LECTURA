import type { Consentimiento as ConsentimientoFila } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { ConsentimientoRepository } from '../../application/ports/consentimiento.repository';
import {
  Consentimiento,
  MedioConsentimiento,
  TipoConsentimiento,
} from '../../domain/entities/consentimiento';

/** Adaptador: PrismaConsentimientoRepository. */
export class PrismaConsentimientoRepository implements ConsentimientoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(c: Consentimiento): Promise<void> {
    const p = c.propsSnapshot;
    await this.prisma.consentimiento.upsert({
      where: { id: p.id },
      update: { vigente: p.vigente },
      create: {
        id: p.id,
        cuentaResponsableId: p.cuentaResponsableId,
        tipo: p.tipo,
        aulaId: p.aulaId,
        versionPolitica: p.versionPolitica,
        otorgadoEn: p.otorgadoEn,
        otorganteNombre: p.otorganteNombre,
        medio: p.medio,
        vigente: p.vigente,
      },
    });
  }

  async buscarParentalVigente(cuentaResponsableId: string): Promise<Consentimiento | null> {
    const fila = await this.prisma.consentimiento.findFirst({
      where: { cuentaResponsableId, tipo: 'PARENTAL', vigente: true },
      orderBy: { otorgadoEn: 'desc' },
    });
    return fila ? this.aDominio(fila) : null;
  }

  async buscarInstitucionalVigente(cuentaResponsableId: string, aulaId: string): Promise<Consentimiento | null> {
    const fila = await this.prisma.consentimiento.findFirst({
      where: { cuentaResponsableId, tipo: 'INSTITUCIONAL', aulaId, vigente: true },
      orderBy: { otorgadoEn: 'desc' },
    });
    return fila ? this.aDominio(fila) : null;
  }

  async listarPorIds(ids: string[]): Promise<Consentimiento[]> {
    const filas = await this.prisma.consentimiento.findMany({ where: { id: { in: ids.filter(esUuid) } } });
    return filas.map((f) => this.aDominio(f));
  }

  private aDominio(f: ConsentimientoFila): Consentimiento {
    return Consentimiento.desdePersistencia({
      id: f.id,
      cuentaResponsableId: f.cuentaResponsableId,
      tipo: f.tipo as TipoConsentimiento,
      aulaId: f.aulaId,
      versionPolitica: f.versionPolitica,
      otorgadoEn: f.otorgadoEn,
      otorganteNombre: f.otorganteNombre,
      medio: f.medio as MedioConsentimiento,
      vigente: f.vigente,
    });
  }
}
