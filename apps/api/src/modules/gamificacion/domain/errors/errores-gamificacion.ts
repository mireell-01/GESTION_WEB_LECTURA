import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** RF-062: la recompensa cuesta más monedas de las que tiene el niño. */
export class MonedasInsuficientesError extends ErrorDeNegocio {
  constructor(readonly faltan: number) {
    super(`Te faltan ${faltan} ${faltan === 1 ? 'moneda' : 'monedas'} para esta recompensa`, 'CONFLICTO', { faltan });
  }
}

/** RF-062: cada personaje o accesorio se canjea una sola vez. */
export class RecompensaYaCanjeadaError extends ErrorDeNegocio {
  constructor() {
    super('Esta recompensa ya es tuya', 'CONFLICTO');
  }
}

/** RF-062: solo se puede poner un personaje o accesorio que ya se canjeó. */
export class RecompensaNoEsTuyaError extends ErrorDeNegocio {
  constructor() {
    super('Primero canjea esta recompensa en la tienda', 'CONFLICTO');
  }
}
