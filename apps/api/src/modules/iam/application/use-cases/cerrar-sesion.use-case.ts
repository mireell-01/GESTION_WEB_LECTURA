import { Reloj } from '../dto/iam.dto';
import { SesionRepository } from '../ports/sesion.repository';

/**
 * Use Case: CerrarSesion (RF-010). La sesión queda revocada: la siguiente petición
 * con su access token devuelve 401.
 */
export class CerrarSesionUseCase {
  constructor(
    private readonly sesiones: SesionRepository,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(sesionId: string): Promise<{ ok: true }> {
    const sesion = await this.sesiones.buscarPorId(sesionId);
    if (sesion) {
      sesion.revocar(this.ahora());
      await this.sesiones.guardar(sesion);
    }
    return { ok: true };
  }
}
