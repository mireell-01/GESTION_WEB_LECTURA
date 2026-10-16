import { VerificacionCorreo } from '../../domain/entities/verificacion-correo';
import { GeneradorId } from '../dto/iam.dto';
import { CorreoService } from '../ports/correo.service';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';

/** Tiempo mínimo entre dos enlaces de verificación para la misma cuenta. */
export const ESPERA_REENVIO_SEG = 60;
/** Como máximo, enlaces de verificación por cuenta en una hora. */
export const MAX_ENLACES_POR_HORA = 5;

/**
 * Crea un enlace de verificación (RF-002) y lo envía por correo: token aleatorio de un solo uso,
 * vigente 24 h; en la base solo queda su huella. Lo usan el registro y el reenvío.
 */
export async function enviarEnlaceVerificacion(
  deps: {
    verificaciones: VerificacionRepository;
    tokens: TokenService;
    correo: CorreoService;
    urlWeb: string;
    generarId: GeneradorId;
  },
  cuenta: { id: string; nombre: string; email: string },
  ahora: Date,
): Promise<void> {
  const codigo = deps.tokens.generarTokenOpaco();
  await deps.verificaciones.guardar(
    VerificacionCorreo.paraVerificacionCorreo({
      id: deps.generarId(),
      cuentaId: cuenta.id,
      codigo: deps.tokens.huella(codigo),
      ahora,
    }),
  );
  await deps.correo.enviar({
    para: cuenta.email,
    asunto: 'Confirma tu correo en LectoAventura',
    texto: `Hola, ${cuenta.nombre}. Confirma tu correo para activar tu cuenta. El enlace vence en 24 horas y solo funciona una vez.`,
    enlace: `${deps.urlWeb}/verificar?codigo=${codigo}`,
  });
}
