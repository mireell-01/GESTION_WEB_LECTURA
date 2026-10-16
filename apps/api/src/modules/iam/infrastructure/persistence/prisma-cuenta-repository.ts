import type { Cuenta as CuentaFila } from '@prisma/client';

import { PrismaService } from '../../../shared-kernel/public-api';
import { CuentaRepository } from '../../application/ports/cuenta.repository';
import { Cuenta } from '../../domain/entities/cuenta';
import { Email } from '../../domain/value-objects/email';
import { EstadoCuenta } from '../../domain/value-objects/estado-cuenta';
import { Rol, RolValor } from '../../domain/value-objects/rol';

/** Adaptador: PrismaCuentaRepository — traducción ORM ↔ dominio de la cuenta adulta. */
export class PrismaCuentaRepository implements CuentaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(cuenta: Cuenta): Promise<void> {
    const p = cuenta.propsSnapshot;
    const datos = {
      nombre: p.nombre,
      email: p.email.value,
      hashContrasena: p.hashContrasena,
      rol: p.rol.value,
      estado: p.estado.value,
      mfaHabilitado: p.mfaHabilitado,
      mfaSecret: p.mfaSecret,
      mfaSecretPendiente: p.mfaSecretPendiente,
    };
    await this.prisma.cuenta.upsert({
      where: { id: p.id },
      update: datos,
      create: { id: p.id, creadoEn: p.creadoEn, ...datos },
    });
  }

  async buscarPorId(id: string): Promise<Cuenta | null> {
    const fila = await this.prisma.cuenta.findUnique({ where: { id } });
    return fila ? this.aDominio(fila) : null;
  }

  async buscarPorEmail(email: string): Promise<Cuenta | null> {
    const fila = await this.prisma.cuenta.findUnique({ where: { email } });
    return fila ? this.aDominio(fila) : null;
  }

  async existeEmail(email: string): Promise<boolean> {
    return (await this.prisma.cuenta.count({ where: { email } })) > 0;
  }

  async listar(filtro: { rol?: string; texto?: string }): Promise<Cuenta[]> {
    const filas = await this.prisma.cuenta.findMany({
      where: {
        rol: filtro.rol,
        OR: filtro.texto
          ? [
              { nombre: { contains: filtro.texto, mode: 'insensitive' } },
              { email: { contains: filtro.texto, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    });
    return filas.map((f) => this.aDominio(f));
  }

  private aDominio(fila: CuentaFila): Cuenta {
    return Cuenta.desdePersistencia({
      id: fila.id,
      nombre: fila.nombre,
      email: Email.desdePersistencia(fila.email),
      hashContrasena: fila.hashContrasena,
      rol: Rol.de(fila.rol as RolValor),
      estado: EstadoCuenta.desdePersistencia(fila.estado),
      mfaHabilitado: fila.mfaHabilitado,
      mfaSecret: fila.mfaSecret,
      mfaSecretPendiente: fila.mfaSecretPendiente,
      creadoEn: fila.creadoEn,
    });
  }
}
