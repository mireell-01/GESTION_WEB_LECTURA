import { InstitucionInvalidaError } from '../errors/errores-escuela';

export type EstadoInstitucion = 'ACTIVA' | 'SUSPENDIDA';

/** Una institución educativa registrada por la administración (RF-076). */
export interface Institucion {
  id: string;
  nombre: string;
  /** Código modular del MINEDU (7 dígitos), si se conoce. */
  codigoModular: string | null;
  region: string | null;
  estado: EstadoInstitucion;
  creadaEn: Date;
}

/**
 * Para comparar el nombre que escribe la docente al crear su aula con las instituciones registradas:
 * sin tildes, mayúsculas, puntos ni espacios de más ("I.E. N.° 70 001" = "IE N 70 001" = "ie n 70 001").
 */
export function normalizarNombreInstitucion(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.°º]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Valida y limpia los datos de una institución nueva. */
export function datosInstitucion(p: { nombre: string; codigoModular?: string | null; region?: string | null }): Pick<Institucion, 'nombre' | 'codigoModular' | 'region'> {
  const nombre = p.nombre.trim().replace(/\s+/g, ' ');
  if (nombre.length < 3 || nombre.length > 120) throw new InstitucionInvalidaError('El nombre de la institución debe tener entre 3 y 120 caracteres');
  const codigo = p.codigoModular?.trim() || null;
  if (codigo !== null && !/^\d{7}$/.test(codigo)) throw new InstitucionInvalidaError('El código modular tiene 7 dígitos');
  const region = p.region?.trim().replace(/\s+/g, ' ') || null;
  if (region !== null && region.length > 60) throw new InstitucionInvalidaError('La región puede tener hasta 60 caracteres');
  return { nombre, codigoModular: codigo, region };
}
