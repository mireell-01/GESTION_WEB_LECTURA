import { Auditoria } from '../../domain/entities/auditoria';

/**
 * Puerto de salida: AuditoriaRepository — interfaz hacia persistencia.
 * Inversión de dependencias: el dominio no conoce el adaptador. Solo se agrega (RF-077).
 */
export interface AuditoriaRepository {
  agregar(registro: Auditoria): Promise<void>;
}
