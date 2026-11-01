import { Auditoria, AuditoriaProps } from '../../domain/entities/auditoria';
import { FiltroAuditoria } from '../../domain/services/consulta-auditoria';

/**
 * Puerto de salida: AuditoriaRepository — `admin.auditoria` (RF-077). Solo se agrega; la base rechaza
 * modificar y solo deja borrar lo que superó la retención de 2 años.
 */
export interface AuditoriaRepository {
  agregar(registro: Auditoria): Promise<void>;
  /** De lo más reciente a lo más antiguo (por fecha y id), hasta `limite` registros. */
  consultar(filtro: FiltroAuditoria, limite: number): Promise<AuditoriaProps[]>;
  /** Borra lo ocurrido antes de `limite`; devuelve cuántos registros. */
  borrarAnterioresA(limite: Date): Promise<number>;
}
