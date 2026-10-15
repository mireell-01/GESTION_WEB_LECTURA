import { BusEventos, crearEvento, ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { generarPinTarjeta } from '../../domain/services/politica-matricula';
import { Aleatorio, Reloj, TarjetaAcceso } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

/**
 * Use Case: GenerarTarjetas (RF-017). Como el PIN solo se guarda cifrado, imprimir tarjetas
 * asigna un PIN nuevo a los estudiantes elegidos; el PIN es visible solo en la tarjeta impresa.
 */
export class GenerarTarjetasUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly aleatorio: Aleatorio,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string; estudianteIds: string[] }): Promise<TarjetaAcceso[]> {
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.asegurarEditable();

    const matriculados = new Set((await this.matriculas.listarActivasPorAula(aula.id)).map((m) => m.estudianteId));
    const ids = entrada.estudianteIds.filter((id) => matriculados.has(id));
    if (ids.length === 0) {
      throw new ErrorDeNegocio('Elige al menos un estudiante del aula', 'VALIDACION');
    }

    const tarjetas: TarjetaAcceso[] = [];
    for (const estudiante of await this.identidad.estudiantes(ids)) {
      const pin = generarPinTarjeta(this.aleatorio, 0);
      await this.identidad.restablecerPin({ responsableId: entrada.docenteId, perfilId: estudiante.id, pinNuevo: pin });
      tarjetas.push({
        estudianteId: estudiante.id,
        alias: estudiante.alias,
        avatar: estudiante.avatar,
        codigoAula: aula.codigo.value,
        nombreAula: aula.nombre,
        pin,
      });
    }

    await this.bus.publicar([
      crearEvento(EVENTOS_ESCUELA.TARJETAS_GENERADAS, aula.id, { actorId: entrada.docenteId, cantidad: tarjetas.length }, this.ahora()),
    ]);
    return tarjetas.sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
  }
}
