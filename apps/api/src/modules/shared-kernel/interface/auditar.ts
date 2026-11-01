import { SetMetadata } from '@nestjs/common';

/** Qué se audita de un endpoint: la acción, el tipo de recurso y el parámetro de ruta con su id. */
export interface ReglaAuditoria {
  accion: string;
  recurso: string;
  parametro?: string;
}

export const AUDITAR = 'la:auditar';

/**
 * RF-077: el acceso a datos sensibles (el detalle de un estudiante, un reporte) queda en la auditoría
 * cuando el endpoint responde bien. Administración registra quién, desde qué IP y a qué recurso.
 */
export const Auditar = (regla: ReglaAuditoria) => SetMetadata(AUDITAR, regla);
