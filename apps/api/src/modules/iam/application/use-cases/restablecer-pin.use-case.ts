import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Pin } from '../../domain/value-objects/pin';
import { Reloj } from '../dto/iam.dto';
import { HashService } from '../ports/hash.service';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { SesionRepository } from '../ports/sesion.repository';
import { cargarPerfilPropio } from '../services/perfiles';

/**
 * Use Case: RestablecerPin (RF-008, RN-03). Solo el responsable (familiar o docente del aula)
 * puede hacerlo; desbloquea el perfil y queda registrado en auditoría.
 */
export class RestablecerPinUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly sesiones: SesionRepository,
    private readonly hashService: HashService,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaId: string; perfilId: string; pinNuevo: string }): Promise<{ ok: true }> {
    const ahora = this.ahora();
    const perfil = await cargarPerfilPropio(this.perfiles, entrada.perfilId, entrada.cuentaId);
    const pin = Pin.de(entrada.pinNuevo, perfil.propsSnapshot.anioMesNacimiento.anio);

    perfil.restablecerPin(await this.hashService.hash(pin.value));
    await this.perfiles.guardar(perfil);
    await this.sesiones.revocarTodasDe(perfil.id, ahora);

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.PIN_RESTABLECIDO, perfil.id, { actorId: entrada.cuentaId }, ahora),
    ]);
    return { ok: true };
  }
}
