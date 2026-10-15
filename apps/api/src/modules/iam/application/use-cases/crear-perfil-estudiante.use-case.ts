import { BusEventos, crearEvento, ProhibidoError } from '../../../shared-kernel/public-api';
import { PerfilEstudiante } from '../../domain/entities/perfil-estudiante';
import { ConsentimientoRequeridoError } from '../../domain/errors/consentimiento-requerido-error';
import { AliasRepetidoError, LimitePerfilesError } from '../../domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { AnioMesNacimiento } from '../../domain/value-objects/anio-mes-nacimiento';
import { Pin } from '../../domain/value-objects/pin';
import { CrearPerfilEstudianteInput, GeneradorId, PerfilEstudianteVista, Reloj } from '../dto/iam.dto';
import { ConsentimientoRepository } from '../ports/consentimiento.repository';
import { CuentaRepository } from '../ports/cuenta.repository';
import { HashService } from '../ports/hash.service';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { vistaPerfil } from '../services/perfiles';

/** RF-071: máximo de perfiles por cuenta familiar. */
export const MAX_PERFILES_FAMILIA = 6;

/**
 * Use Case: CrearPerfilEstudiante (RF-005, RF-006, RF-015, RF-071).
 * Familia: requiere consentimiento parental vigente y máximo 6 perfiles.
 * Aula: requiere el consentimiento institucional vigente de esa aula (lo invoca Escuela).
 */
export class CrearPerfilEstudianteUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly consentimientos: ConsentimientoRepository,
    private readonly hashService: HashService,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: CrearPerfilEstudianteInput): Promise<PerfilEstudianteVista> {
    const ahora = this.ahora();
    const cuenta = await this.cuentas.buscarPorId(entrada.cuentaResponsableId);
    if (!cuenta || !cuenta.estaActiva()) {
      throw new ProhibidoError();
    }

    let consentimientoId: string | undefined;
    if (entrada.aulaId) {
      const consentimiento = await this.consentimientos.buscarInstitucionalVigente(cuenta.id, entrada.aulaId);
      consentimientoId = consentimiento?.id;
    } else {
      if (cuenta.rol.value !== 'FAMILIAR') {
        throw new ProhibidoError('Los perfiles de casa se crean desde una cuenta familiar');
      }
      const consentimiento = await this.consentimientos.buscarParentalVigente(cuenta.id);
      consentimientoId = consentimiento?.id;

      const existentes = await this.perfiles.listarPorResponsable(cuenta.id);
      if (existentes.length >= MAX_PERFILES_FAMILIA) {
        throw new LimitePerfilesError(MAX_PERFILES_FAMILIA);
      }
      const alias = entrada.alias.trim().toLowerCase();
      if (existentes.some((p) => p.alias.toLowerCase() === alias && p.avatar === entrada.avatar)) {
        throw new AliasRepetidoError();
      }
    }
    if (!consentimientoId) {
      throw new ConsentimientoRequeridoError();
    }

    const anioMes = AnioMesNacimiento.de(entrada.anioNacimiento, entrada.mesNacimiento, ahora);
    const pin = Pin.de(entrada.pin, entrada.anioNacimiento);
    const perfil = PerfilEstudiante.crear({
      id: this.generarId(),
      cuentaResponsableId: cuenta.id,
      consentimientoId,
      alias: entrada.alias,
      anioMesNacimiento: anioMes,
      avatar: entrada.avatar,
      hashPin: await this.hashService.hash(pin.value),
      ahora,
    });
    await this.perfiles.guardar(perfil);

    await this.bus.publicar([
      crearEvento(
        EVENTOS_IAM.PERFIL_CREADO,
        perfil.id,
        { actorId: cuenta.id, aulaId: entrada.aulaId ?? null, rangoEdad: perfil.rangoEdad(ahora) },
        ahora,
      ),
    ]);
    return vistaPerfil(perfil, ahora);
  }
}
