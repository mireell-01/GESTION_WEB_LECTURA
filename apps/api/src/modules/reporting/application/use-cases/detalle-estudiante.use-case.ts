import { NoEncontradoError, ResolutorHistorialLectura } from '../../../shared-kernel/public-api';
import { celdasDe } from '../../domain/services/mapa-calor';
import { evaluarRiesgo } from '../../domain/services/riesgo';
import { tasaSinPista, tasasPorHabilidad } from '../../domain/services/tasa-sin-pista';
import { DetalleEstudiante } from '../dto/reporting.dto';
import { AulasDocente, IdentidadEstudiantes, ReportesRepository } from '../ports/reporting.ports';

/** RF-064: el historial de las últimas 20 sesiones. */
export const SESIONES_DETALLE = 20;

/**
 * RF-064: el detalle de un estudiante del aula por habilidad, con sus últimas 20 sesiones: cada respuesta,
 * las evidencias que eligió, las pistas que usó y la tasa de acierto sin pista. Solo para su docente y
 * solo si el estudiante está matriculado en esa aula (RN-17).
 */
export class DetalleEstudianteUseCase {
  constructor(
    private readonly repo: ReportesRepository,
    private readonly aulas: AulasDocente,
    private readonly identidad: IdentidadEstudiantes,
    private readonly historial: ResolutorHistorialLectura,
    private readonly ahora: () => Date,
  ) {}

  async detalle(docenteId: string, aulaId: string, estudianteId: string): Promise<DetalleEstudiante> {
    const aula = await this.aulas.aulaDe(docenteId, aulaId);
    if (!aula) throw new NoEncontradoError('Aula');
    const matricula = (await this.repo.estudiantesDeAula(aula.id)).find((m) => m.estudianteId === estudianteId);
    if (!matricula) throw new NoEncontradoError('Estudiante');

    const [[perfil], maestrias, ultima, sesiones, refrescadoEn] = await Promise.all([
      this.identidad.perfiles([estudianteId]),
      this.repo.maestrias(aula.id),
      this.repo.ultimaActividad([estudianteId]),
      this.historial.historialDe(estudianteId, SESIONES_DETALLE),
      this.repo.refrescadoEn(),
    ]);
    const celdas = celdasDe(maestrias.filter((m) => m.estudianteId === estudianteId));
    const respuestas = sesiones.flatMap((s) => s.respuestas);
    const porHabilidad = tasasPorHabilidad(respuestas);
    const ultimaActividad = ultima.get(estudianteId) ?? null;

    return {
      aula,
      estudiante: { id: estudianteId, alias: perfil?.alias ?? 'Estudiante', avatar: perfil?.avatar ?? '' },
      actualizadoEn: refrescadoEn?.toISOString() ?? null,
      habilidades: celdas.map((c) => ({ ...c, tasa: porHabilidad[c.habilidad] })),
      tasaSinPista: tasaSinPista(respuestas),
      ultimaActividad: ultimaActividad?.toISOString() ?? null,
      riesgo: evaluarRiesgo({ ultimaActividad, matriculadoEn: matricula.matriculadoEn, celdas, ahora: this.ahora() }),
      sesiones: sesiones.map((s) => ({
        id: s.sesionId,
        lecturaId: s.lecturaId,
        titulo: s.titulo,
        estado: s.estado,
        esRepeticion: s.esRepeticion,
        iniciadaEn: s.iniciadaEn.toISOString(),
        finalizadaEn: s.finalizadaEn?.toISOString() ?? null,
        tasa: tasaSinPista(s.respuestas),
        respuestas: s.respuestas,
      })),
    };
  }
}
