import type { Cuenta as CuentaFila, FactorMfa as FactorMfaFila } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { CuentaRepository } from '../../application/ports/cuenta.repository';
import { Cuenta } from '../../domain/entities/cuenta';
import { Email } from '../../domain/value-objects/email';
import { EstadoCuenta } from '../../domain/value-objects/estado-cuenta';
import { Rol, RolValor } from '../../domain/value-objects/rol';

type FilaConMfa = CuentaFila & { factorMfa: FactorMfaFila | null };

/**
 * Adaptador: PrismaCuentaRepository — traducción ORM ↔ dominio de la cuenta adulta.
 * El agregado Cuenta incluye su segundo factor; en la base vive en `iam.factor_mfa` (SRS §7).
 */
export class PrismaCuentaRepository implements CuentaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(cuenta: Cuenta): Promise<void> {
    const p = cuenta.propsSnapshot;
    const datos = { nombre: p.nombre, email: p.email.value, hashContrasena: p.hashContrasena, rol: p.rol.value, estado: p.estado.value };
    const tieneMfa = p.mfaHabilitado || p.mfaSecret !== null || p.mfaSecretPendiente !== null;
    const mfa = { habilitado: p.mfaHabilitado, secreto: p.mfaSecret, secretoPendiente: p.mfaSecretPendiente };

    await this.prisma.$transaction([
      this.prisma.cuenta.upsert({
        where: { id: p.id },
        update: datos,
        create: { id: p.id, creadoEn: p.creadoEn, ...datos },
      }),
      tieneMfa
        ? this.prisma.factorMfa.upsert({ where: { cuentaId: p.id }, update: mfa, create: { cuentaId: p.id, ...mfa } })
        : this.prisma.factorMfa.deleteMany({ where: { cuentaId: p.id } }),
    ]);
  }

  async buscarPorId(id: string): Promise<Cuenta | null> {
    if (!esUuid(id)) return null;
    const fila = await this.prisma.cuenta.findUnique({ where: { id }, include: { factorMfa: true } });
    return fila ? this.aDominio(fila) : null;
  }

  async buscarPorEmail(email: string): Promise<Cuenta | null> {
    const fila = await this.prisma.cuenta.findUnique({ where: { email }, include: { factorMfa: true } });
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
      include: { factorMfa: true },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    });
    return filas.map((f) => this.aDominio(f));
  }

  private aDominio(fila: FilaConMfa): Cuenta {
    return Cuenta.desdePersistencia({
      id: fila.id,
      nombre: fila.nombre,
      email: Email.desdePersistencia(fila.email),
      hashContrasena: fila.hashContrasena,
      rol: Rol.de(fila.rol as RolValor),
      estado: EstadoCuenta.desdePersistencia(fila.estado),
      mfaHabilitado: fila.factorMfa?.habilitado ?? false,
      mfaSecret: fila.factorMfa?.secreto ?? null,
      mfaSecretPendiente: fila.factorMfa?.secretoPendiente ?? null,
      creadoEn: fila.creadoEn,
    });
  }
}
