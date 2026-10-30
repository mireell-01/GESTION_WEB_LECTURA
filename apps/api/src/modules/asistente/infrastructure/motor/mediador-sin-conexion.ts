import { EntradaMotor, MotorAsistente } from '../../application/ports/asistente.ports';
import { mediar } from '../../domain/services/mediacion-socratica';

/**
 * Adaptador: el mediador socrático sin conexión (decisión del Product Owner, 29/10/2026: sin IA
 * externa por ahora). Responde al instante (RNF-007) y sin costo. Para conectar un modelo externo
 * (ADR-008) basta otro adaptador de `MotorAsistente`; este queda como respaldo (RNF-011).
 */
export class MediadorSinConexion implements MotorAsistente {
  async responder(e: EntradaMotor): Promise<string> {
    return mediar(e.contexto, e.intencion, e.moderacion, e.intercambio);
  }
}
