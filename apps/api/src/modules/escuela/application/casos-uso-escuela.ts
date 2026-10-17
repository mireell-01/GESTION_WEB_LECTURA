import { EscuelaFacade } from './escuela.facade';
import { AsignacionRepository } from './ports/asignacion.repository';
import { AulaRepository } from './ports/aula.repository';
import { MatriculaRepository } from './ports/matricula.repository';
import {
  CatalogoDelAulaUseCase,
  ListarAsignacionesUseCase,
  MisionesDelDocenteUseCase,
} from './use-cases/consultar-asignaciones.use-case';
import { ListarAulasUseCase, DetalleAulaUseCase } from './use-cases/consultar-aulas.use-case';
import { CrearAulaUseCase } from './use-cases/crear-aula.use-case';
import { GenerarTarjetasUseCase } from './use-cases/generar-tarjetas.use-case';
import { ArchivarAulaUseCase, RetirarEstudianteUseCase } from './use-cases/gestionar-aula.use-case';
import { CerrarAsignacionUseCase, CrearAsignacionUseCase } from './use-cases/gestionar-asignaciones.use-case';
import {
  CanjearInvitacionFamiliarUseCase,
  GenerarInvitacionFamiliarUseCase,
} from './use-cases/invitaciones-familiar.use-case';
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
  crearAsignacion: CrearAsignacionUseCase;
  listarAsignaciones: ListarAsignacionesUseCase;
  cerrarAsignacion: CerrarAsignacionUseCase;
  catalogoDelAula: CatalogoDelAulaUseCase;
  misionesDelDocente: MisionesDelDocenteUseCase;
  generarInvitacion: GenerarInvitacionFamiliarUseCase;
  canjearInvitacion: CanjearInvitacionFamiliarUseCase;
  aulas: AulaRepository;
  matriculas: MatriculaRepository;
  asignaciones: AsignacionRepository;
  facade: EscuelaFacade;
}

export const CASOS_USO_ESCUELA = Symbol('CASOS_USO_ESCUELA');
