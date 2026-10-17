import { CatalogoAsignable, ContenidoAsignable } from '../../../shared-kernel/public-api';
import { Asignacion, EstadoAsignacion } from '../../domain/entities/asignacion';
import { FechaLima } from '../../domain/value-objects/fecha-lima';
import { AsignacionVista, MisionDelDocenteVista, Reloj, vistaAsignacion } from '../dto/escuela.dto';
import { AsignacionRepository } from '../ports/asignacion.repository';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

const ORDEN_ESTADO: Record<EstadoAsignacion, number> = { ACTIVA: 0, PROGRAMADA: 1, VENCIDA: 2, CERRADA: 3 };

/** Guarda el estado de las asignaciones que el paso del tiempo cambió (PROGRAMADA → ACTIVA → VENCIDA). */
async function actualizarEstados(repo: AsignacionRepository, lista: Asignacion[], ahora: Date): Promise<void> {
  for (const a of lista) {
    if (a.actualizarEstado(ahora)) await repo.guardar(a);
  }
}

/** Use Case: ListarAsignaciones (RF-018) — las del aula, en curso primero. También en aulas archivadas. */
export class ListarAsignacionesUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly asignaciones: AsignacionRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string }): Promise<AsignacionVista[]> {
    const ahora = this.ahora();
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    const lista = await this.asignaciones.listarPorAulas([aula.id]);
    await actualizarEstados(this.asignaciones, lista, ahora);

    const ids = [...new Set(lista.flatMap((a) => [...a.estudianteIds]))];
    const porId = new Map((await this.identidad.estudiantes(ids)).map((e) => [e.id, { id: e.id, alias: e.alias, avatar: e.avatar }]));
    return lista
      .map((a) =>
        vistaAsignacion(
          a,
          ahora,
          a.estudianteIds
            .map((id) => porId.get(id))
            .filter((e): e is NonNullable<typeof e> => !!e)
            .sort((x, y) => x.alias.localeCompare(y.alias, 'es')),
        ),
      )
      .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.fechaLimite.localeCompare(b.fechaLimite));
  }
}

/**
 * Use Case: MisionesDelDocente (RF-018) — lo que la docente le dejó al estudiante y está en curso,
 * para mostrarlo en su aventura con el indicador "Misión del docente".
 */
export class MisionesDelDocenteUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly asignaciones: AsignacionRepository,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(estudianteId: string): Promise<MisionDelDocenteVista[]> {
    const ahora = this.ahora();
    const aulaIds = (await this.matriculas.listarPorEstudiante(estudianteId)).filter((m) => m.activa).map((m) => m.aulaId);
    const aulas = (await this.aulas.buscarPorIds(aulaIds)).filter((a) => a.estaActiva);
    const nombres = new Map(aulas.map((a) => [a.id, a.nombre]));

    const lista = await this.asignaciones.listarPorAulas(aulas.map((a) => a.id));
    await actualizarEstados(this.asignaciones, lista, ahora);
    return lista
      .filter((a) => a.esPara(estudianteId) && a.estadoEn(ahora) === 'ACTIVA')
      .map((a) => {
        const p = a.propsSnapshot;
        return {
          id: p.id,
          tipo: p.tipo,
          contenidoId: p.contenidoId,
          titulo: p.titulo,
          fechaLimite: FechaLima.delInstante(p.fechaLimite).value,
          aula: nombres.get(p.aulaId) ?? '',
        };
      })
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  }
}

/** Use Case: CatalogoDelAula (RF-018) — lecturas y misiones publicadas que la docente puede asignar. */
export class CatalogoDelAulaUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly catalogo: CatalogoAsignable,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string }): Promise<{ lecturas: ContenidoAsignable[]; misiones: ContenidoAsignable[] }> {
    await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    const todo = await this.catalogo.listar();
    return { lecturas: todo.filter((c) => c.tipo === 'LECTURA'), misiones: todo.filter((c) => c.tipo === 'MISION') };
  }
}
