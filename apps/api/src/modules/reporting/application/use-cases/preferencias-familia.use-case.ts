import { ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { PreferenciasFamilia } from '../dto/familia.dto';
import { FirmaBaja, ReportesFamiliaRepository } from '../ports/familia.ports';

export class EnlaceBajaInvalidoError extends ErrorDeNegocio {
  constructor() {
    super('El enlace no es válido. Puedes cambiar esta opción desde tu panel de familia.', 'VALIDACION');
  }
}

/**
 * RF-070: si la familia recibe el resumen semanal. Lo cambia desde su panel o, sin iniciar sesión, con
 * el enlace firmado del propio correo (baja con un clic, y deshacerla desde la misma página).
 */
export class PreferenciasFamiliaUseCase {
  constructor(
    private readonly repo: ReportesFamiliaRepository,
    private readonly firma: FirmaBaja,
  ) {}

  async consultar(cuentaId: string): Promise<PreferenciasFamilia> {
    return { resumenSemanal: (await this.repo.preferencias([cuentaId])).get(cuentaId) ?? true };
  }

  async cambiar(cuentaId: string, resumenSemanal: boolean): Promise<PreferenciasFamilia> {
    await this.repo.guardarPreferencia(cuentaId, resumenSemanal);
    return { resumenSemanal };
  }

  async porEnlace(token: string, resumenSemanal: boolean): Promise<PreferenciasFamilia> {
    const cuentaId = this.firma.cuentaDe(token);
    if (!cuentaId) throw new EnlaceBajaInvalidoError();
    return this.cambiar(cuentaId, resumenSemanal);
  }
}
