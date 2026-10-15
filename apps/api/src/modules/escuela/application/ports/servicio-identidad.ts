import type { RangoEdad } from '../../../shared-kernel/public-api';

export interface EstudianteIdentidad {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: RangoEdad;
  activo: boolean;
  /** Bloqueado temporalmente por PIN incorrectos (lo ve el docente para ayudar). */
  bloqueado?: boolean;
}

/**
 * Puerto anticorrupción hacia IAM: lo que Escuela necesita de identidad, sin conocer su modelo.
 * Lo implementa un adaptador sobre la fachada pública de IAM.
 */
export interface ServicioIdentidad {
  registrarConsentimientoInstitucional(params: {
    docenteId: string;
    aulaId: string;
    otorganteNombre: string;
  }): Promise<void>;
  crearPerfilEnAula(params: {
    docenteId: string;
    aulaId: string;
    alias: string;
    anioNacimiento: number;
    mesNacimiento: number;
    avatar: string;
    pin: string;
  }): Promise<EstudianteIdentidad>;
  estudiantes(ids: string[]): Promise<EstudianteIdentidad[]>;
  restablecerPin(params: { responsableId: string; perfilId: string; pinNuevo: string }): Promise<void>;
  avatares(): readonly string[];
}
