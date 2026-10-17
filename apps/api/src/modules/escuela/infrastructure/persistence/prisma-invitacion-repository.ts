import type { InvitacionFamiliar as InvitacionFila } from '@prisma/client';

import { PrismaService } from '../../../shared-kernel/public-api';
import { InvitacionRepository } from '../../application/ports/invitacion.repository';
import { InvitacionFamiliar } from '../../domain/entities/invitacion-familiar';

/** Adaptador: invitaciones familiares en `escuela.invitacion_familiar` (solo la huella del código). */
export class PrismaInvitacionRepository implements InvitacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(invitacion: InvitacionFamiliar): Promise<void> {
    await this.prisma.invitacionFamiliar.create({ data: { ...invitacion.propsSnapshot } });
  }

  async buscarPorHash(hashCodigo: string): Promise<InvitacionFamiliar | null> {
    const fila = await this.prisma.invitacionFamiliar.findUnique({ where: { hashCodigo } });
    return fila ? this.aDominio(fila) : null;
  }

  async existeHash(hashCodigo: string): Promise<boolean> {
    return (await this.prisma.invitacionFamiliar.count({ where: { hashCodigo } })) > 0;
  }

  async contarVigentesDeEstudiante(estudianteId: string, ahora: Date): Promise<number> {
    return this.prisma.invitacionFamiliar.count({ where: { estudianteId, usadaEn: null, expiraEn: { gt: ahora } } });
  }

  async reclamar(invitacion: InvitacionFamiliar): Promise<boolean> {
    const p = invitacion.propsSnapshot;
    // Una sola sentencia condicional: si dos familiares envían el mismo código, solo uno la actualiza.
    const { count } = await this.prisma.invitacionFamiliar.updateMany({
      where: { id: p.id, usadaEn: null, expiraEn: { gt: p.usadaEn ?? new Date() } },
      data: { usadaEn: p.usadaEn, cuentaFamiliarId: p.cuentaFamiliarId },
    });
    return count === 1;
  }

  async liberar(invitacion: InvitacionFamiliar): Promise<void> {
    const p = invitacion.propsSnapshot;
    await this.prisma.invitacionFamiliar.updateMany({
      where: { id: p.id, cuentaFamiliarId: p.cuentaFamiliarId },
      data: { usadaEn: null, cuentaFamiliarId: null },
    });
  }

  private aDominio(f: InvitacionFila): InvitacionFamiliar {
    return InvitacionFamiliar.desdePersistencia({ ...f });
  }
}
