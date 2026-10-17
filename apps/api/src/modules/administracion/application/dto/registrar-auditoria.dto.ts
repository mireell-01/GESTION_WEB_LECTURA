/**
 * DTO de entrada/salida del caso de uso RegistrarAuditoria.
 */
export interface RegistrarAuditoriaCommand {
  actorId: string | null;
  actorRol: string | null;
  accion: string;
  recursoTipo: string;
  recursoId: string | null;
  ip: string | null;
  datos: Record<string, unknown>;
  ocurridoEn: Date;
}

export interface RegistrarAuditoriaResult {
  id: string;
}
