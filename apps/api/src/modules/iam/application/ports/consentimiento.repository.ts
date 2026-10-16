import { Consentimiento } from '../../domain/entities/consentimiento';

/** Puerto de salida: persistencia de consentimientos (RF-005). */
export interface ConsentimientoRepository {
  guardar(consentimiento: Consentimiento): Promise<void>;
  buscarParentalVigente(cuentaResponsableId: string): Promise<Consentimiento | null>;
  buscarInstitucionalVigente(cuentaResponsableId: string, aulaId: string): Promise<Consentimiento | null>;
  listarPorIds(ids: string[]): Promise<Consentimiento[]>;
}
