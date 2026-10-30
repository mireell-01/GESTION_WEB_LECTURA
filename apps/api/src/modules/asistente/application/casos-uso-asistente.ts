import { ConversacionRepository } from './ports/asistente.ports';
import { ActivacionUseCase } from './use-cases/activacion.use-case';
import { BorradorUseCase } from './use-cases/borrador.use-case';
import { ConversarUseCase } from './use-cases/conversar.use-case';

/** Casos de uso del asistente de lectura (Módulo 11) que ensambla el composition root. */
export interface CasosUsoAsistente {
  conversar: ConversarUseCase;
  activacion: ActivacionUseCase;
  borrador: BorradorUseCase;
  /** El trabajo de retención borra las conversaciones de más de 30 días. */
  retencion: Pick<ConversacionRepository, 'borrarVencidas'>;
}

export const CASOS_USO_ASISTENTE = Symbol('CASOS_USO_ASISTENTE');
