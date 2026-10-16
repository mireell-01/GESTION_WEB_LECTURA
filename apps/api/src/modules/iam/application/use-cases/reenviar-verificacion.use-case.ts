import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { CorreoService } from '../ports/correo.service';
import { CuentaRepository } from '../ports/cuenta.repository';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';
import { enviarEnlaceVerificacion, ESPERA_REENVIO_SEG, MAX_ENLACES_POR_HORA } from '../services/enlaces-verificacion';

/**
 * Use Case: ReenviarVerificacion (RF-002). Permite pedir otro enlace si el anterior se perdió o
 * venció. La respuesta es siempre la misma, exista o no la cuenta (anti-enumeración, como RF-004):
 * - cuenta pendiente: los enlaces anteriores quedan reemplazados y se envía uno nuevo, salvo que
 *   el último se haya enviado hace menos de 60 s o ya se hayan enviado 5 en la última hora;
 * - cuenta ya verificada: se le avisa por correo que puede ingresar (sin enlace);
 * - cuenta inexistente o suspendida: no se envía nada.
 */
export class ReenviarVerificacionUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly tokens: TokenService,
    private readonly correo: CorreoService,
    private readonly bus: BusEventos,
    private readonly urlWeb: string,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(email: string): Promise<{ ok: true; reintentarEnSeg: number }> {
    const respuesta = { ok: true as const, reintentarEnSeg: ESPERA_REENVIO_SEG };
    const cuenta = await this.cuentas.buscarPorEmail(email.trim().toLowerCase());
    if (!cuenta || cuenta.estaSuspendida()) return respuesta;

    const ahora = this.ahora();
    if (cuenta.estaActiva()) {
      await this.correo.enviar({
        para: cuenta.email.value,
        asunto: 'Tu correo ya está verificado en LectoAventura',
        texto: `Hola, ${cuenta.nombre}. Tu cuenta ya está activa: ingresa con tu correo y tu contraseña. Si no pediste este mensaje, puedes ignorarlo.`,
        enlace: `${this.urlWeb}/ingresar`,
      });
      return respuesta;
    }

    const ultimaHora = await this.verificaciones.listarRecientes(cuenta.id, 'CORREO', new Date(ahora.getTime() - 3_600_000));
    const ultimo = Math.max(0, ...ultimaHora.map((v) => v.creadoEn.getTime()));
    if (ahora.getTime() - ultimo < ESPERA_REENVIO_SEG * 1000 || ultimaHora.length >= MAX_ENLACES_POR_HORA) {
      return respuesta;
    }

    // Solo el enlace más nuevo sirve: los anteriores dejan de funcionar.
    await this.verificaciones.reemplazarVigentes(cuenta.id, 'CORREO', ahora);
    await enviarEnlaceVerificacion(
      { verificaciones: this.verificaciones, tokens: this.tokens, correo: this.correo, urlWeb: this.urlWeb, generarId: this.generarId },
      { id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email.value },
      ahora,
    );
    await this.bus.publicar([crearEvento(EVENTOS_IAM.VERIFICACION_REENVIADA, cuenta.id, { actorId: cuenta.id }, ahora)]);
    return respuesta;
  }
}
