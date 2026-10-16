import { AulaProps } from '../domain/entities/aula';
import { AulaRepository } from './ports/aula.repository';
import { MatriculaRepository } from './ports/matricula.repository';

export interface AulaResumen {
  id: string;
  nombre: string;
  grado: string;
  anioLectivo: number;
  codigo: string;
  docenteId: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

/** Fachada pública de Escuela para otros módulos (seguimiento docente, asignaciones, aventura). */
export class EscuelaFacade {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
  ) {}

  async aulasDeDocente(docenteId: string): Promise<AulaResumen[]> {
    return (await this.aulas.listarPorDocente(docenteId)).map((a) => this.resumen(a.propsSnapshot));
  }

  async aula(aulaId: string): Promise<AulaResumen | null> {
    const aula = await this.aulas.buscarPorId(aulaId);
    return aula ? this.resumen(aula.propsSnapshot) : null;
  }

  async estudiantesDeAula(aulaId: string): Promise<string[]> {
    return (await this.matriculas.listarActivasPorAula(aulaId)).map((m) => m.estudianteId);
  }

  /** Aulas en las que el estudiante tiene matrícula activa. */
  async aulasDeEstudiante(estudianteId: string): Promise<AulaResumen[]> {
    const matriculas = (await this.matriculas.listarPorEstudiante(estudianteId)).filter((m) => m.activa);
    const aulas = await this.aulas.buscarPorIds(matriculas.map((m) => m.aulaId));
    return aulas.map((a) => this.resumen(a.propsSnapshot));
  }

  /** RN-17: el docente accede a estudiantes matriculados en sus aulas activas o archivadas. */
  async docenteAccedeAEstudiante(docenteId: string, estudianteId: string): Promise<boolean> {
    const matriculas = await this.matriculas.listarPorEstudiante(estudianteId);
    const aulas = await this.aulas.buscarPorIds(matriculas.map((m) => m.aulaId));
    return aulas.some((a) => a.perteneceA(docenteId));
  }

  private resumen(p: Readonly<AulaProps>): AulaResumen {
    return {
      id: p.id,
      nombre: p.nombre,
      grado: p.grado,
      anioLectivo: p.anioLectivo,
      codigo: p.codigo.value,
      docenteId: p.docenteId,
      estado: p.estado,
    };
  }
}
