import { EscuelaFacade } from './escuela.facade';
import { AulaRepository } from './ports/aula.repository';
import { MatriculaRepository } from './ports/matricula.repository';
import { ListarAulasUseCase, DetalleAulaUseCase } from './use-cases/consultar-aulas.use-case';
import { CrearAulaUseCase } from './use-cases/crear-aula.use-case';
import { GenerarTarjetasUseCase } from './use-cases/generar-tarjetas.use-case';
import { ArchivarAulaUseCase, RetirarEstudianteUseCase } from './use-cases/gestionar-aula.use-case';
import { MatricularEstudiantesUseCase } from './use-cases/matricular-estudiantes.use-case';

/** Casos de uso de Escuela ensamblados en infrastructure/escuela.providers.ts. */
export interface CasosUsoEscuela {
  crearAula: CrearAulaUseCase;
  listarAulas: ListarAulasUseCase;
  detalleAula: DetalleAulaUseCase;
  matricular: MatricularEstudiantesUseCase;
  generarTarjetas: GenerarTarjetasUseCase;
  archivarAula: ArchivarAulaUseCase;
  retirarEstudiante: RetirarEstudianteUseCase;
  aulas: AulaRepository;
  matriculas: MatriculaRepository;
  facade: EscuelaFacade;
}

export const CASOS_USO_ESCUELA = Symbol('CASOS_USO_ESCUELA');
