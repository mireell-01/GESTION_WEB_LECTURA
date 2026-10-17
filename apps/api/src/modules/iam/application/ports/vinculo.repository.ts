/** Origen del vínculo de un familiar adicional con un estudiante (`iam.vinculo_responsable`). */
export type OrigenVinculo = 'INVITACION_DOCENTE' | 'INVITACION_FAMILIAR';

export interface VinculoFamiliar {
  perfilId: string;
  cuentaId: string;
  origen: OrigenVinculo;
  vinculadoEn: Date;
}

/**
 * Puerto de salida: vínculos de familiares adicionales (RF-019). El responsable principal no
 * está aquí: es `perfil_estudiante.cuenta_responsable_id`.
 */
export interface VinculoRepository {
  /** Crea el vínculo o reactiva uno revocado. */
  agregar(vinculo: VinculoFamiliar & { id: string }): Promise<void>;
  vigentesDePerfil(perfilId: string): Promise<VinculoFamiliar[]>;
  /** Ids de los perfiles con los que la cuenta tiene un vínculo vigente. */
  perfilesVinculadosA(cuentaId: string): Promise<string[]>;
  contarVigentesPorPerfiles(perfilIds: string[]): Promise<Record<string, number>>;
}
