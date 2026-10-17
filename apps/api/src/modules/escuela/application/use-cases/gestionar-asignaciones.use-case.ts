import { BusEventos, CatalogoAsignable, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { Asignacion, TipoAsignacion } from '../../domain/entities/asignacion';
import {
  AsignacionDuplicadaError,
  ContenidoNoDisponibleError,
  DatoAsignacionInvalidoError,
} from '../../domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { FechaLima } from '../../domain/value-objects/fecha-lima';
import { AsignacionVista, EstudianteResumido, GeneradorId, Reloj, vistaAsignacion } from '../dto/escuela.dto';
import { AsignacionRepository } from '../ports/asignacion.repository';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

export interface CrearAsignacionInput {
  docenteId: string;
  aulaId: string;
  tipo: TipoAsignacion;
  contenidoId: string;
  /** Día de Lima (AAAA-MM-DD); si no se indica, hoy. */
  fechaInicio?: string;
  fechaLimite: string;
  /** Vacío o sin indicar: para toda el aula. */
  estudianteIds?: string[];
}

/**
 * Use Case: CrearAsignacion (RF-018). La docente asigna una lectura o misión publicada a toda su
 * aula o a estudiantes matriculados en ella, con fecha límite. No se repite una que siga abierta.
 */
export class CrearAsignacionUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly asignaciones: AsignacionRepository,
    private readonly catalogo: CatalogoAsignable,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: CrearAsignacionInput): Promise<AsignacionVista> {
    const ahora = this.ahora();
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.asegurarEditable();

    const contenido = await this.catalogo.buscar(entrada.tipo, entrada.contenidoId);
    if (!contenido) throw new ContenidoNoDisponibleError(entrada.tipo);

    const estudianteIds = [...new Set(entrada.estudianteIds ?? [])];
    if (estudianteIds.length > 0) {
      const matriculados = new Set((await this.matriculas.listarActivasPorAula(aula.id)).map((m) => m.estudianteId));
      if (estudianteIds.some((id) => !matriculados.has(id))) {
        throw new DatoAsignacionInvalidoError('Elige solo estudiantes matriculados en esta aula');
      }
    }

    // Primero las reglas propias de la asignación (fechas), después lo que depende del aula.
    const asignacion = Asignacion.crear({
      id: this.generarId(),
      aulaId: aula.id,
      docenteId: entrada.docenteId,
      tipo: entrada.tipo,
      contenidoId: contenido.id,
      titulo: contenido.titulo,
      estudianteIds,
      desde: entrada.fechaInicio ? FechaLima.de(entrada.fechaInicio) : FechaLima.hoy(ahora),
      hasta: FechaLima.de(entrada.fechaLimite),
      ahora,
    });
    const existentes = await this.asignaciones.listarPorAulas([aula.id]);
    if (existentes.some((a) => a.contenidoId === contenido.id && a.estaAbierta(ahora))) {
      throw new AsignacionDuplicadaError();
    }
    await this.asignaciones.guardar(asignacion);
    await this.bus.publicar([
      crearEvento(
        EVENTOS_ESCUELA.ASIGNACION_CREADA,
        asignacion.id,
        {
          actorId: entrada.docenteId,
          aulaId: aula.id,
          tipo: entrada.tipo,
          contenidoId: contenido.id,
          estudianteIds,
          fechaLimite: asignacion.propsSnapshot.fechaLimite.toISOString(),
        },
        ahora,
      ),
    ]);

    const destinatarios: EstudianteResumido[] = (await this.identidad.estudiantes(estudianteIds))
      .map((e) => ({ id: e.id, alias: e.alias, avatar: e.avatar }))
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
    return vistaAsignacion(asignacion, ahora, destinatarios);
  }
}

/** Use Case: CerrarAsignacion (RF-018) — la docente la da por terminada; deja de verse en la aventura. */
export class CerrarAsignacionUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly asignaciones: AsignacionRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string; asignacionId: string }): Promise<{ ok: true }> {
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.asegurarEditable();
    const asignacion = await this.asignaciones.buscarPorId(entrada.asignacionId);
    if (!asignacion || asignacion.aulaId !== aula.id) {
      throw new NoEncontradoError('Asignación');
    }
    if (asignacion.estado !== 'CERRADA') {
      asignacion.cerrar();
      await this.asignaciones.guardar(asignacion);
      await this.bus.publicar([
        crearEvento(EVENTOS_ESCUELA.ASIGNACION_CERRADA, asignacion.id, { actorId: entrada.docenteId, aulaId: aula.id }, this.ahora()),
      ]);
    }
    return { ok: true };
  }
}
