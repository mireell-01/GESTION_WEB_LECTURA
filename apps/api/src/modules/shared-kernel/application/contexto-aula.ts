/**
 * Puerto: ResolutorContextoAula — IAM necesita saber si un aula sigue activa, quién es su docente
 * y quién está matriculado para el ingreso de estudiantes desde la tablet del aula (RF-007, RN-04,
 * CR-01), pero las aulas son de Escuela. Escuela registra su implementación al iniciar; así IAM no
 * depende de Escuela (sin ciclos).
 */
export interface AulaDeIngreso {
  aulaId: string;
  nombre: string;
  docenteId: string;
}

export interface ResolutorContextoAula {
  aulaActiva(aulaId: string): Promise<AulaDeIngreso | null>;
  estudiantesActivos(aulaId: string): Promise<string[]>;
  estaMatriculado(aulaId: string, estudianteId: string): Promise<boolean>;
}

export interface RegistroContextoAula extends ResolutorContextoAula {
  registrar(resolutor: ResolutorContextoAula): void;
}

export const CONTEXTO_AULA = Symbol('CONTEXTO_AULA');
