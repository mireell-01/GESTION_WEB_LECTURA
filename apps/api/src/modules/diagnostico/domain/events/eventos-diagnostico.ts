import { EVENTOS_INTEGRACION } from '../../../shared-kernel/public-api';

/**
 * Eventos de dominio del Diagnóstico. `DiagnosticoFinalizado` es un evento de integración (SAD §6):
 * Aventura posiciona al estudiante (RF-033) y Progreso inicializará el perfil lector (Módulo 7).
 */
export const EVENTOS_DIAGNOSTICO = {
  INICIADO: 'diagnostico.DiagnosticoIniciado',
  PAUSADO: 'diagnostico.DiagnosticoPausado',
  FINALIZADO: EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO,
  REEVALUACION_ASIGNADA: 'diagnostico.ReevaluacionAsignada',
} as const;
