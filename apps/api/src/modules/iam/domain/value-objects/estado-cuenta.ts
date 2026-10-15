/**
 * Value Object: EstadoCuenta — PENDIENTE_VERIFICACION → ACTIVA ⇄ SUSPENDIDA (RF-002, RF-076).
 */
export type EstadoCuentaValor = 'PENDIENTE_VERIFICACION' | 'ACTIVA' | 'SUSPENDIDA';

export class EstadoCuenta {
  private constructor(private readonly valor: EstadoCuentaValor) {}

  static pendiente(): EstadoCuenta {
    return new EstadoCuenta('PENDIENTE_VERIFICACION');
  }

  static activa(): EstadoCuenta {
    return new EstadoCuenta('ACTIVA');
  }

  static suspendida(): EstadoCuenta {
    return new EstadoCuenta('SUSPENDIDA');
  }

  static desdePersistencia(valor: string): EstadoCuenta {
    return new EstadoCuenta(valor as EstadoCuentaValor);
  }

  get value(): EstadoCuentaValor {
    return this.valor;
  }

  esActiva(): boolean {
    return this.valor === 'ACTIVA';
  }

  esSuspendida(): boolean {
    return this.valor === 'SUSPENDIDA';
  }
}
