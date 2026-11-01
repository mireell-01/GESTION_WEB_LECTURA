import type { DocenteAdministrado } from '../../../iam/public-api';
import type { AulasDeDocente, InstitucionVista } from '../../../escuela/public-api';
import type { ParametrosVigentesVista, VersionParametrosVista } from '../../../gamificacion/public-api';

/** Anticorrupción hacia IAM: las cuentas docentes y quién es cada actor de la auditoría. */
export interface GestionCuentas {
  listarDocentes(filtro: { texto?: string; estado?: DocenteAdministrado['estado'] }): Promise<DocenteAdministrado[]>;
  docente(id: string): Promise<DocenteAdministrado>;
  darDeAltaDocente(entrada: { nombre: string; email: string; adminId: string }): Promise<DocenteAdministrado>;
  suspenderDocente(id: string, adminId: string): Promise<DocenteAdministrado>;
  reactivarDocente(id: string, adminId: string): Promise<DocenteAdministrado>;
  /** Nombre y rol de las cuentas adultas (los estudiantes no aparecen: se muestran por su id). */
  actores(ids: string[]): Promise<Map<string, { nombre: string; rol: string }>>;
}

/** Anticorrupción hacia Escuela: instituciones y aulas de cada docente. */
export interface GestionEscuela {
  listarInstituciones(): Promise<InstitucionVista[]>;
  crearInstitucion(entrada: { nombre: string; codigoModular?: string | null; region?: string | null; adminId: string }): Promise<InstitucionVista>;
  cambiarEstadoInstitucion(id: string, estado: InstitucionVista['estado'], adminId: string): Promise<InstitucionVista>;
  aulasDeDocentes(docenteIds: string[]): Promise<Map<string, AulasDeDocente>>;
}

/** Anticorrupción hacia Gamificación: los parámetros versionados (RF-078). */
export interface GestionGamificacion {
  vigentes(): Promise<ParametrosVigentesVista>;
  historial(): Promise<VersionParametrosVista[]>;
  publicar(entrada: unknown, adminId: string): Promise<ParametrosVigentesVista>;
}
