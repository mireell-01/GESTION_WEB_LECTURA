/**
 * Puerto: ResolutorContextoAula — IAM necesita saber si un código de aula está vigente y quién está
 * matriculado para el ingreso de estudiantes (RF-007, RN-04), pero las aulas son de Escuela.
 * Escuela registra su implementación al iniciar; así IAM no depende de Escuela (sin ciclos).
 */
export interface AulaDeIngreso {
  aulaId: string;
  nombre: string;
}

export interface ResolutorContextoAula {
  aulaActivaPorCodigo(codigo: string): Promise<AulaDeIngreso | null>;
  estudiantesActivos(aulaId: string): Promise<string[]>;
  estaMatriculado(aulaId: string, estudianteId: string): Promise<boolean>;
}

export interface RegistroContextoAula extends ResolutorContextoAula {
  registrar(resolutor: ResolutorContextoAula): void;
}

export const CONTEXTO_AULA = Symbol('CONTEXTO_AULA');
