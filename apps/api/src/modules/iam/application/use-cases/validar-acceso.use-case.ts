import { RolUsuario, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { SesionInvalidaError } from '../../domain/errors/errores-iam';
import { Reloj } from '../dto/iam.dto';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';

/**
 * Use Case: ValidarAcceso — lo ejecuta el guard en cada petición protegida.
 * Verifica la firma del token y que la sesión siga viva (no revocada ni inactiva, RF-010),
 * y refresca la ventana de inactividad.
 */
export class ValidarAccesoUseCase {
  constructor(
    private readonly sesiones: SesionRepository,
    private readonly tokens: TokenService,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(accessToken: string | undefined): Promise<UsuarioAutenticado> {
    const datos = accessToken ? this.tokens.verificarAccessToken(accessToken) : null;
    if (!datos) {
      throw new SesionInvalidaError();
    }

    const ahora = this.ahora();
    const sesion = await this.sesiones.buscarPorId(datos.sid);
    if (!sesion || sesion.sujetoId !== datos.sub) {
      throw new SesionInvalidaError();
    }
    if (!sesion.estaViva(ahora)) {
      throw new SesionInvalidaError(
        sesion.revocadaEn ? 'Tu sesión se cerró.' : 'Tu sesión se cerró por inactividad. Vuelve a ingresar.',
      );
    }
    if (sesion.registrarActividad(ahora)) {
      await this.sesiones.guardar(sesion);
    }

    return { sub: sesion.sujetoId, rol: sesion.rol as RolUsuario, mfa: sesion.mfa, sid: sesion.id };
  }
}
