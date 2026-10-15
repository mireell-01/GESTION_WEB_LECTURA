import { NoEncontradoError } from '../../../shared-kernel/public-api';
import { PerfilEstudiante } from '../../domain/entities/perfil-estudiante';
import { PerfilEstudianteVista } from '../dto/iam.dto';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';

/** Vista del perfil para su responsable: nunca expone el hash del PIN. */
export function vistaPerfil(perfil: PerfilEstudiante, ahora: Date): PerfilEstudianteVista {
  const p = perfil.propsSnapshot;
  return {
    id: p.id,
    alias: p.alias,
    avatar: p.avatar,
    anioNacimiento: p.anioMesNacimiento.anio,
    mesNacimiento: p.anioMesNacimiento.mes,
    rangoEdad: perfil.rangoEdad(ahora),
    activo: perfil.activo,
    bloqueadoHasta: perfil.estaBloqueado(ahora) ? (p.bloqueadoHasta as Date).toISOString() : null,
    creadoEn: p.creadoEn.toISOString(),
  };
}

/**
 * RN-17: un adulto solo gestiona los perfiles de los que es responsable.
 * Se responde 404 (no 403) para no revelar perfiles ajenos.
 */
export async function cargarPerfilPropio(
  perfiles: PerfilEstudianteRepository,
  perfilId: string,
  cuentaId: string,
): Promise<PerfilEstudiante> {
  const perfil = await perfiles.buscarPorId(perfilId);
  if (!perfil || !perfil.perteneceA(cuentaId) || perfil.propsSnapshot.eliminadoEn) {
    throw new NoEncontradoError('Perfil');
  }
  return perfil;
}
