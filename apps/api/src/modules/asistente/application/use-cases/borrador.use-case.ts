import { NoEncontradoError, ResolutorRespuestasAbiertas } from '../../../shared-kernel/public-api';
import { borradorRetroalimentacion } from '../../domain/services/borrador-retroalimentacion';
import { BorradorRetroalimentacion } from '../dto/asistente.dto';

/**
 * RF-075: un borrador de retroalimentación para una respuesta abierta de un estudiante de la docente
 * (RN-17). No se guarda ni se publica: la docente lo edita y lo guarda con su valoración, y solo
 * entonces lo ve el estudiante.
 */
export class BorradorUseCase {
  constructor(private readonly respuestas: ResolutorRespuestasAbiertas) {}

  async borrador(docenteId: string, respuestaId: string): Promise<BorradorRetroalimentacion> {
    const r = await this.respuestas.respuestaParaDocente(docenteId, respuestaId);
    if (!r) throw new NoEncontradoError('Respuesta');
    return { respuestaId: r.respuestaId, ...borradorRetroalimentacion(r) };
  }
}
