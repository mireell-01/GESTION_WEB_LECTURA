import { BusEventos, crearEvento, ProhibidoError, ResolutorContextoAula } from '../../../shared-kernel/public-api';
import { MAX_INTENTOS_PIN } from '../../domain/entities/perfil-estudiante';
import { CodigoAulaInvalidoError } from '../../domain/errors/errores-iam';
import { PerfilBloqueadoError } from '../../domain/errors/perfil-bloqueado-error';
import { PinIncorrectoError } from '../../domain/errors/pin-incorrecto-error';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj, SesionEmitida } from '../dto/iam.dto';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { HashService } from '../ports/hash.service';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { TokenService } from '../ports/token.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

/** Contexto de ingreso (RN-04): código de aula vigente o dispositivo familiar vinculado. */
export type ContextoIngreso =
  | { tipo: 'AULA'; codigoAula: string }
  | { tipo: 'DISPOSITIVO'; tokenDispositivo: string };

/**
 * Use Case: AutenticarEstudiante (RF-007, RF-008, RN-03, RN-04).
 * Contexto + avatar + PIN; 5 PIN incorrectos bloquean el perfil 15 min.
 */
export class AutenticarEstudianteUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly dispositivos: DispositivoRepository,
    private readonly contextoAula: ResolutorContextoAula,
    private readonly hashService: HashService,
    private readonly tokens: TokenService,
    private readonly emisor: EmisorSesiones,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { perfilId: string; pin: string; contexto: ContextoIngreso }): Promise<SesionEmitida> {
    const ahora = this.ahora();
    const perfil = await this.perfiles.buscarPorId(entrada.perfilId);

    if (entrada.contexto.tipo === 'AULA') {
      const aula = await this.contextoAula.aulaActivaPorCodigo(entrada.contexto.codigoAula.trim().toUpperCase());
      if (!aula) throw new CodigoAulaInvalidoError();
      if (!perfil || !(await this.contextoAula.estaMatriculado(aula.aulaId, perfil.id))) {
        throw new ProhibidoError('No perteneces a esta aula');
      }
    } else {
      const dispositivo = await this.dispositivos.buscarPorHashToken(this.tokens.huella(entrada.contexto.tokenDispositivo));
      if (!dispositivo || !dispositivo.estaVigente(ahora) || !perfil || dispositivo.cuentaId !== perfil.cuentaResponsableId) {
        throw new ProhibidoError('Este dispositivo no está vinculado a tu familia');
      }
    }

    if (!perfil || !perfil.activo) {
      throw new PinIncorrectoError();
    }
    perfil.asegurarNoBloqueado(ahora);
    if (!(await this.hashService.verificar(entrada.pin, perfil.hashPin))) {
      perfil.registrarIntentoFallido(ahora);
      await this.perfiles.guardar(perfil);
      if (perfil.estaBloqueado(ahora)) {
        await this.bus.publicar([
          crearEvento(
            EVENTOS_IAM.ESTUDIANTE_BLOQUEADO,
            perfil.id,
            { actorId: perfil.id, hasta: (perfil.bloqueadoHasta as Date).toISOString() },
            ahora,
          ),
        ]);
        throw new PerfilBloqueadoError(perfil.bloqueadoHasta as Date);
      }
      throw new PinIncorrectoError(MAX_INTENTOS_PIN - perfil.intentosFallidos);
    }

    perfil.registrarIntentoCorrecto();
    await this.perfiles.guardar(perfil);
    return this.emisor.abrir({ sujetoId: perfil.id, rol: 'ESTUDIANTE', mfa: false });
  }
}
