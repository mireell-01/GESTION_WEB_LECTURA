import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class ConsentimientoRequeridoError extends ErrorDeNegocio {
  constructor() {
    super('Se requiere el consentimiento vigente del adulto responsable para crear el perfil', 'CONFLICTO');
  }
}
