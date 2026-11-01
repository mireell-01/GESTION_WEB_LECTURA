import { RegistrarAuditoriaUseCase } from './use-cases/registrar-auditoria.use-case';
import { AuditoriaUseCase, DocentesAdminUseCase, InstitucionesAdminUseCase, ParametrosGamificacionUseCase } from './use-cases/plataforma.use-cases';

/** Casos de uso de Administración (RF-076 a RF-078) que ensambla el composition root. */
export interface CasosUsoAdministracion {
  docentes: DocentesAdminUseCase;
  instituciones: InstitucionesAdminUseCase;
  parametros: ParametrosGamificacionUseCase;
  auditoria: AuditoriaUseCase;
  registrarAuditoria: RegistrarAuditoriaUseCase;
}

export const CASOS_USO_ADMINISTRACION = Symbol('CASOS_USO_ADMINISTRACION');
