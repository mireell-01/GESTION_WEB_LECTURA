import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** RF-008 / RN-03: perfil bloqueado 15 min tras 5 PIN incorrectos. */
export class PerfilBloqueadoError extends ErrorDeNegocio {
  constructor(readonly desbloqueaEn: Date) {
    super('Perfil bloqueado por varios PIN incorrectos. Pide ayuda a un adulto.', 'BLOQUEADO', {
      desbloqueaEn: desbloqueaEn.toISOString(),
    });
  }
}
