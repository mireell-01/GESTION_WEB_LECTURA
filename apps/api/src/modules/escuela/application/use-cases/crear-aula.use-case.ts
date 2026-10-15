import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { Aula } from '../../domain/entities/aula';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { CodigoAula } from '../../domain/value-objects/codigo-aula';
import { Aleatorio, AulaVista, GeneradorId, Reloj, vistaAula } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';

export interface CrearAulaInput {
  docenteId: string;
  nombre: string;
  grado: string;
  anioLectivo: number;
  institucion: string;
  /** Director(a) o autoridad que firmó el consentimiento institucional (RN-01). */
  autoridadConsentimiento: string;
}

/**
 * Use Case: CrearAula (RF-014). Genera un código de aula único y registra el consentimiento
 * institucional bajo el que se crearán los perfiles de sus estudiantes (RF-015, RN-01).
 */
export class CrearAulaUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly aleatorio: Aleatorio,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: CrearAulaInput): Promise<AulaVista> {
    let codigo = CodigoAula.generar(this.aleatorio);
    while (await this.aulas.existeCodigo(codigo.value)) {
      codigo = CodigoAula.generar(this.aleatorio);
    }

    const ahora = this.ahora();
    const aula = Aula.crear({
      id: this.generarId(),
      docenteId: entrada.docenteId,
      nombre: entrada.nombre,
      grado: entrada.grado,
      anioLectivo: entrada.anioLectivo,
      institucion: entrada.institucion,
      codigo,
      ahora,
    });
    await this.aulas.guardar(aula);
    await this.identidad.registrarConsentimientoInstitucional({
      docenteId: entrada.docenteId,
      aulaId: aula.id,
      otorganteNombre: entrada.autoridadConsentimiento,
    });

    await this.bus.publicar([
      crearEvento(EVENTOS_ESCUELA.AULA_CREADA, aula.id, { actorId: entrada.docenteId, codigo: codigo.value }, ahora),
    ]);
    return vistaAula(aula, 0);
  }
}
