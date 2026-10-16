/**
 * Value Object: CodigoUnUso — enlace de un solo uso con vigencia (RF-002 y RF-004).
 * Se usa para verificación de correo (24 h) y recuperación de contraseña (30 min).
 */
export class CodigoUnUso {
  private constructor(
    private readonly valor: string,
    private readonly expiraEn: Date,
    private canjeado: boolean,
  ) {

  }

  static crear(valor: string, expiraEn: Date): CodigoUnUso {
    return new CodigoUnUso(valor, expiraEn, false);
  }

  static desdePersistencia(valor: string, expiraEn: Date, canjeado: boolean): CodigoUnUso {
    return new CodigoUnUso(valor, expiraEn, canjeado);
  }

  get value(): string {
    return this.valor;
  }

  get expira(): Date {
    return this.expiraEn;
  }

  get yaCanjeado(): boolean {
    return this.canjeado;
  }

  estaVigente(ahora: Date): boolean {
    return !this.canjeado && ahora.getTime() <= this.expiraEn.getTime();
  }

  canjear(ahora: Date): boolean {
    if (this.canjeado) return false;
    if (ahora.getTime() > this.expiraEn.getTime()) return false;
    this.canjeado = true;
    return true;
  }
}
