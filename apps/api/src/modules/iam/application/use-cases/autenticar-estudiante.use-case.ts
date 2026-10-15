import { BusEventos, crearEvento, ProhibidoError } from '../../../shared-kernel/public-api';
import { MAX_INTENTOS_PIN } from '../../domain/entities/perfil-estudiante';
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
 * Contexto de ingreso (RN-04): dispositivo familiar vinculado, o aula cuyo código y matrícula
 * ya validó el módulo Escuela antes de invocar este caso de uso.
 */
export type ContextoIngreso =
  | { tipo: 'DISPOSITIVO'; tokenDispositivo: string }
  | { tipo: 'AULA_VALIDADA'; aulaId: string };

/**
 * Use Case: AutenticarEstudiante (RF-007, RF-008, RN-03).
 * Contexto + avatar + PIN; 5 PIN incorrectos bloquean el perfil 15 min.
 */
export class AutenticarEstudianteUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly dispositivos: DispositivoRepository,
    private readonly hashService: HashService,
    private readonly tokens: TokenService,
    private readonly emisor: EmisorSesiones,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { perfilId: string; pin: string; contexto: ContextoIngreso }): Promise<SesionEmitida> {
    const ahora = this.ahora();
    const perfil = await this.perfiles.buscarPorId(entrada.perfilId);
    if (!perfil || !perfil.activo) {
      throw new PinIncorrectoError();
    }

    if (entrada.contexto.tipo === 'DISPOSITIVO') {
      const dispositivo = await this.dispositivos.buscarPorHashToken(
        this.tokens.huella(entrada.contexto.tokenDispositivo),
      );
      if (!dispositivo || !dispositivo.estaVigente(ahora) || dispositivo.cuentaId !== perfil.cuentaResponsableId) {
        throw new ProhibidoError('Este dispositivo no está vinculado a tu familia');
      }
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
