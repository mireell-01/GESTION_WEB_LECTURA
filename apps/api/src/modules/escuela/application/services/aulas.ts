import { NoEncontradoError } from '../../../shared-kernel/public-api';
import { Aula } from '../../domain/entities/aula';
import { AulaRepository } from '../ports/aula.repository';

/** RN-17: el docente solo accede a sus aulas (404 para no revelar aulas ajenas). */
export async function cargarAulaPropia(aulas: AulaRepository, aulaId: string, docenteId: string): Promise<Aula> {
  const aula = await aulas.buscarPorId(aulaId);
  if (!aula || !aula.perteneceA(docenteId)) {
    throw new NoEncontradoError('Aula');
  }
  return aula;
}
