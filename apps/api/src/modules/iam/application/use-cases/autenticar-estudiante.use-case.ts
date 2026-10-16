import { BusEventos, crearEvento, ProhibidoError, ResolutorContextoAula } from '../../../shared-kernel/public-api';
import { MAX_INTENTOS_PIN, PerfilEstudiante } from '../../domain/entities/perfil-estudiante';
import { PerfilBloqueadoError } from '../../domain/errors/perfil-bloqueado-error';
import { PinIncorrectoError } from '../../domain/errors/pin-incorrecto-error';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj, SesionEmitida } from '../dto/iam.dto';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { HashService } from '../ports/hash.service';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { TokenService } from '../ports/token.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

/**
 * Use Case: AutenticarEstudiante (RF-007, RF-008, RN-03, RN-04, CR-01).
 * Dispositivo activado (de la familia o del aula) + avatar + PIN; 5 PIN incorrectos bloquean
 * el perfil 15 min. El niño solo puede entrar desde una tablet activada para él.
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

  async ejecutar(entrada: { perfilId: string; pin: string; tokenDispositivo: string }): Promise<SesionEmitida> {
    const ahora = this.ahora();
    const perfil = await this.perfiles.buscarPorId(entrada.perfilId);
    await this.asegurarContexto(entrada.tokenDispositivo, perfil, ahora);

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

  /** RN-04: el perfil debe pertenecer a la familia o al aula para la que se activó la tablet. */
  private async asegurarContexto(tokenDispositivo: string, perfil: PerfilEstudiante | null, ahora: Date): Promise<void> {
    const dispositivo = await this.dispositivos.buscarPorHashToken(this.tokens.huella(tokenDispositivo));
    if (!dispositivo || !dispositivo.estaVigente(ahora)) {
      throw new ProhibidoError('Esta tablet no está activada. Pide a tu profe o a tu familia que la active.');
    }
    const contexto = dispositivo.contexto;
    if (contexto.tipo === 'FAMILIA') {
      if (!perfil || dispositivo.cuentaId !== perfil.cuentaResponsableId) {
        throw new ProhibidoError('Esta tablet no está activada para tu familia');
      }
      return;
    }
    const aula = await this.contextoAula.aulaActiva(contexto.aulaId);
    if (!aula || !perfil || !(await this.contextoAula.estaMatriculado(aula.aulaId, perfil.id))) {
      throw new ProhibidoError('No perteneces a esta aula');
    }
  }
}
