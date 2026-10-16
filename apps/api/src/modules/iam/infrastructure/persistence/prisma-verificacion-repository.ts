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
      update: { canjeado: v.codigo.yaCanjeado },
      create: {
        id: v.id,
        cuentaId: v.cuentaId,
        tipo: v.tipo,
        codigo: v.codigo.value,
        expiraEn: v.codigo.expira,
        canjeado: v.codigo.yaCanjeado,
      },
    });
  }

  async buscarPorCodigo(codigo: string, tipo: TipoVerificacion): Promise<VerificacionCorreo | null> {
    const fila = await this.prisma.verificacion.findUnique({ where: { codigo } });
    if (!fila || fila.tipo !== tipo) return null;
    const codigoVo = CodigoUnUso.desdePersistencia(fila.codigo, fila.expiraEn, fila.canjeado);
    return VerificacionCorreo.desdePersistencia(
      { id: fila.id, cuentaId: fila.cuentaId, tipo: fila.tipo as TipoVerificacion, codigo: codigoVo },
      codigoVo,
    );
  }
}
