import type { Verificacion } from '@prisma/client';

import { PrismaService } from '../../../shared-kernel/public-api';
import { VerificacionRepository } from '../../application/ports/verificacion.repository';
import { TipoVerificacion, VerificacionCorreo } from '../../domain/entities/verificacion-correo';
import { CodigoUnUso } from '../../domain/value-objects/codigo-un-uso';

/** Adaptador: PrismaVerificacionRepository — el campo `codigo` guarda la huella, no el enlace. */
export class PrismaVerificacionRepository implements VerificacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(v: VerificacionCorreo): Promise<void> {
    await this.prisma.verificacion.upsert({
      where: { id: v.id },
      update: { canjeado: v.codigo.yaCanjeado, reemplazadoEn: v.reemplazadoEn },
      create: {
        id: v.id,
        cuentaId: v.cuentaId,
        tipo: v.tipo,
        codigo: v.codigo.value,
        expiraEn: v.codigo.expira,
        canjeado: v.codigo.yaCanjeado,
        creadoEn: v.creadoEn,
        reemplazadoEn: v.reemplazadoEn,
      },
    });
  }

  async buscarPorCodigo(codigo: string, tipo: TipoVerificacion): Promise<VerificacionCorreo | null> {
    const fila = await this.prisma.verificacion.findUnique({ where: { codigo } });
    return fila && fila.tipo === tipo ? this.aEntidad(fila) : null;
  }

  async listarRecientes(cuentaId: string, tipo: TipoVerificacion, desde: Date): Promise<VerificacionCorreo[]> {
    const filas = await this.prisma.verificacion.findMany({
      where: { cuentaId, tipo, creadoEn: { gte: desde } },
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map((f) => this.aEntidad(f));
  }

  async reemplazarVigentes(cuentaId: string, tipo: TipoVerificacion, ahora: Date): Promise<number> {
    const r = await this.prisma.verificacion.updateMany({
      where: { cuentaId, tipo, canjeado: false, reemplazadoEn: null },
      data: { reemplazadoEn: ahora },
    });
    return r.count;
  }

  private aEntidad(fila: Verificacion): VerificacionCorreo {
    const codigoVo = CodigoUnUso.desdePersistencia(fila.codigo, fila.expiraEn, fila.canjeado);
    return VerificacionCorreo.desdePersistencia(
      {
        id: fila.id,
        cuentaId: fila.cuentaId,
        tipo: fila.tipo as TipoVerificacion,
        codigo: codigoVo,
        creadoEn: fila.creadoEn,
        reemplazadoEn: fila.reemplazadoEn,
      },
      codigoVo,
    );
  }
}
