/**
 * Puerto: RecolectorDatosEstudiante — reúne los datos de un estudiante que guarda cada módulo,
 * para la exportación de datos personales y de progreso (RF-012, derechos ARCO).
 * Cada módulo registra su aportante al iniciar; IAM no depende de los demás módulos.
 */
export type AportanteDatos = (estudianteId: string) => Promise<unknown>;

export interface RecolectorDatosEstudiante {
  registrar(seccion: string, aportante: AportanteDatos): void;
  recolectar(estudianteId: string): Promise<Record<string, unknown>>;
}

export const RECOLECTOR_DATOS = Symbol('RECOLECTOR_DATOS');
