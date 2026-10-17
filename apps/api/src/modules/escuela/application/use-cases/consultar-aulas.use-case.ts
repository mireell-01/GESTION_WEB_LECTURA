import { AulaVista, EstudianteAulaVista, vistaAula } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

/** Use Case: ListarAulas — aulas del docente (activas primero) con su número de estudiantes. */
export class ListarAulasUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
  ) {}

  async ejecutar(docenteId: string): Promise<AulaVista[]> {
    const lista = await this.aulas.listarPorDocente(docenteId);
    const totales = await this.matriculas.contarActivasPorAulas(lista.map((a) => a.id));
    return lista
      .map((a) => vistaAula(a, totales[a.id] ?? 0))
      .sort((a, b) => (a.estado === b.estado ? b.anioLectivo - a.anioLectivo : a.estado === 'ACTIVA' ? -1 : 1));
  }
}

/** Use Case: DetalleAula — datos del aula y sus estudiantes matriculados. */
export class DetalleAulaUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly identidad: ServicioIdentidad,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string }): Promise<{ aula: AulaVista; estudiantes: EstudianteAulaVista[] }> {
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    const matriculas = await this.matriculas.listarActivasPorAula(aula.id);
    const identidades = await this.identidad.estudiantes(matriculas.map((m) => m.estudianteId));
    const porId = new Map(identidades.map((e) => [e.id, e]));

    const estudiantes = matriculas
      .map((m) => {
        const e = porId.get(m.estudianteId);
        return e
          ? {
              id: e.id,
              alias: e.alias,
              avatar: e.avatar,
              rangoEdad: e.rangoEdad,
              activo: e.activo,
              bloqueado: e.bloqueado ?? false,
              familiaresVinculados: e.familiaresVinculados ?? 0,
              matriculadoEn: m.propsSnapshot.creadaEn.toISOString(),
            }
          : null;
      })
      .filter((e): e is EstudianteAulaVista => e !== null)
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));

    return { aula: vistaAula(aula, estudiantes.length), estudiantes };
  }
}
