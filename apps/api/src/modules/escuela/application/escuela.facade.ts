import { AulaProps } from '../domain/entities/aula';
import { MisionDelDocenteVista } from './dto/escuela.dto';
import { AulaRepository } from './ports/aula.repository';
import { MatriculaRepository } from './ports/matricula.repository';
import { AulasDeDocente, ResumenAulasRepository } from './ports/resumen-aulas';
import { MisionesDelDocenteUseCase } from './use-cases/consultar-asignaciones.use-case';
import { InstitucionesUseCase, InstitucionVista } from './use-cases/instituciones.use-case';

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
    private readonly misiones: MisionesDelDocenteUseCase,
    private readonly institucionesUseCase: InstitucionesUseCase | null = null,
    private readonly resumenAulas: ResumenAulasRepository | null = null,
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

  /** RF-018 / RN-20: asignaciones en curso del estudiante (aventura y recomendaciones). */
  misionesDelDocente(estudianteId: string): Promise<MisionDelDocenteVista[]> {
    return this.misiones.ejecutar(estudianteId);
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

  // RF-076 (Módulo 12): la administración gestiona las instituciones y ve las aulas de cada docente.
  listarInstituciones(): Promise<InstitucionVista[]> {
    return this.gestionInstituciones().listar();
  }

  crearInstitucion(entrada: { nombre: string; codigoModular?: string | null; region?: string | null; adminId: string }): Promise<InstitucionVista> {
    return this.gestionInstituciones().crear(entrada);
  }

  cambiarEstadoInstitucion(id: string, estado: InstitucionVista['estado'], adminId: string): Promise<InstitucionVista> {
    return this.gestionInstituciones().cambiarEstado(id, estado, adminId);
  }

  async aulasDeDocentes(docenteIds: string[]): Promise<Map<string, AulasDeDocente>> {
    if (!this.resumenAulas) throw new Error('El resumen de aulas no está configurado');
    return this.resumenAulas.porDocentes(docenteIds);
  }

  private gestionInstituciones(): InstitucionesUseCase {
    if (!this.institucionesUseCase) throw new Error('La gestión de instituciones no está configurada');
    return this.institucionesUseCase;
  }
}
