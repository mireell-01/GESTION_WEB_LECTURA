import type { Maestrias } from './progreso-lector';

/**
 * Eventos de integración que publicarán los módulos posteriores y que Aventura ya escucha
 * (SAD §6, "Eventos de dominio principales"). Se definen aquí para que el contrato exista antes
 * que sus emisores, sin dependencias entre módulos.
 */
export const EVENTOS_INTEGRACION = {
  /** Diagnóstico → Aventura posiciona al estudiante en su mundo inicial (RF-033). */
  DIAGNOSTICO_FINALIZADO: 'diagnostico.DiagnosticoFinalizado',
  /** Lectura → Aventura actualiza el estado de las misiones que contienen la lectura (RF-032). */
  SESION_LECTURA_INICIADA: 'lectura.SesionLecturaIniciada',
  SESION_LECTURA_FINALIZADA: 'lectura.SesionLecturaFinalizada',
  /** Progreso → Aventura evalúa el desbloqueo del mundo siguiente (RF-031, RN-09). */
  MAESTRIA_ACTUALIZADA: 'progreso.MaestriaActualizada',
} as const;

export interface DatosDiagnosticoFinalizado {
  estudianteId: string;
  maestrias: Maestrias;
}

export interface DatosSesionLectura {
  estudianteId: string;
  lecturaId: string;
}

export interface DatosMaestriaActualizada {
  estudianteId: string;
}
