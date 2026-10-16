import { VerificacionCorreo } from '../../domain/entities/verificacion-correo';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { CorreoService } from '../ports/correo.service';
import { CuentaRepository } from '../ports/cuenta.repository';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';

/**
 * Use Case: RecuperarContrasena (RF-004).
 * Respuesta idéntica exista o no el correo (anti-enumeración); enlace de un solo uso de 30 min.
 */
export class RecuperarContrasenaUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly tokens: TokenService,
    private readonly correo: CorreoService,
    private readonly urlWeb: string,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(email: string): Promise<{ ok: true }> {
    const cuenta = await this.cuentas.buscarPorEmail(email.trim().toLowerCase());
    if (!cuenta || cuenta.estaSuspendida()) {
      return { ok: true };
    }

    const codigo = this.tokens.generarTokenOpaco();
    await this.verificaciones.guardar(
      VerificacionCorreo.paraRecuperacionContrasena({
        id: this.generarId(),
        cuentaId: cuenta.id,
        codigo: this.tokens.huella(codigo),
        ahora: this.ahora(),
      }),
    );
    await this.correo.enviar({
      para: cuenta.email.value,
      asunto: 'Recupera tu contraseña de LectoAventura',
      texto: 'Recibimos una solicitud para cambiar tu contraseña. El enlace vence en 30 minutos. Si no fuiste tú, ignora este correo.',
      enlace: `${this.urlWeb}/restablecer?codigo=${codigo}`,
    });
    return { ok: true };
  }
}
