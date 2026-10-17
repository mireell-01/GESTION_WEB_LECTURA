import { BusEventos, crearEvento, ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { generarPinTarjeta } from '../../domain/services/politica-matricula';
import { Aleatorio, Reloj, TarjetaAcceso } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { GeneradorTarjetasPdf } from '../ports/generador-tarjetas';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

export interface HojaTarjetas {
  pdf: Buffer;
  nombreArchivo: string;
  cantidad: number;
}

/** Nombre de archivo seguro y legible: "tarjetas-3-b.pdf". */
function nombreArchivo(nombreAula: string): string {
  const base = nombreAula
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `tarjetas-${base || 'aula'}.pdf`;
}

/**
 * Use Case: GenerarTarjetas (RF-017, CR-01). El PIN solo se guarda cifrado, así que imprimir
 * asigna un PIN nuevo a cada estudiante elegido y lo pone únicamente en el PDF (A4, 8 por hoja).
 * Las tarjetas impresas antes dejan de servir. La tarjeta lleva avatar, alias y PIN: los niños
 * entran desde la tablet del aula, sin código.
 */
export class GenerarTarjetasUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly generador: GeneradorTarjetasPdf,
    private readonly bus: BusEventos,
    private readonly aleatorio: Aleatorio,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string; estudianteIds: string[] }): Promise<HojaTarjetas> {
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.asegurarEditable();

    const matriculados = new Set((await this.matriculas.listarActivasPorAula(aula.id)).map((m) => m.estudianteId));
    const ids = [...new Set(entrada.estudianteIds)].filter((id) => matriculados.has(id));
    if (ids.length === 0) {
      throw new ErrorDeNegocio('Elige al menos un estudiante del aula', 'VALIDACION');
    }

    const tarjetas: TarjetaAcceso[] = [];
    for (const estudiante of await this.identidad.estudiantes(ids)) {
      const pin = generarPinTarjeta(this.aleatorio, 0);
      await this.identidad.restablecerPin({ responsableId: entrada.docenteId, perfilId: estudiante.id, pinNuevo: pin });
      tarjetas.push({ estudianteId: estudiante.id, alias: estudiante.alias, avatar: estudiante.avatar, nombreAula: aula.nombre, pin });
    }
    tarjetas.sort((a, b) => a.alias.localeCompare(b.alias, 'es'));

    const pdf = await this.generador.generar({ nombreAula: aula.nombre, tarjetas });
    await this.bus.publicar([
      crearEvento(EVENTOS_ESCUELA.TARJETAS_GENERADAS, aula.id, { actorId: entrada.docenteId, cantidad: tarjetas.length }, this.ahora()),
    ]);
    return { pdf, nombreArchivo: nombreArchivo(aula.nombre), cantidad: tarjetas.length };
  }
}
