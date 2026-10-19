import { esUuid, RangoEdad, RANGOS_EDAD } from '../../../shared-kernel/public-api';
import { DatoMisionInvalidoError } from '../errors/errores-aventura';

/** SRS §7: Mundo — Misión 1 : 3..20 (aquí, por cada rango de edad). */
export const MAX_MISIONES_POR_MUNDO = 20;
export const MAX_LECTURAS_POR_MISION = 10;

export interface DatosMision {
  titulo: string;
  descripcion: string;
  /** En el orden en que el niño las encontrará. */
  lecturaIds: string[];
}

/**
 * Entidad Misión (RF-032): un paso del mundo, con una o más lecturas publicadas del mismo rango
 * de edad que la misión. El equipo de contenidos las arma desde el backoffice.
 */
export class Mision {
  private constructor(
    readonly id: string,
    readonly mundoId: string,
    readonly rangoEdad: RangoEdad,
    private ordenActual: number,
    private datos: DatosMision,
  ) {}

  static crear(p: { id: string; mundoId: string; rangoEdad: RangoEdad; orden: number; datos: DatosMision }): Mision {
    if (!RANGOS_EDAD.includes(p.rangoEdad)) throw new DatoMisionInvalidoError('Elige la edad de la misión');
    return new Mision(p.id, p.mundoId, p.rangoEdad, validarOrden(p.orden), validarDatos(p.datos));
  }

  static desdePersistencia(p: { id: string; mundoId: string; rangoEdad: RangoEdad; orden: number; datos: DatosMision }): Mision {
    return new Mision(p.id, p.mundoId, p.rangoEdad, p.orden, { ...p.datos, lecturaIds: [...p.datos.lecturaIds] });
  }

  get orden(): number {
    return this.ordenActual;
  }

  get titulo(): string {
    return this.datos.titulo;
  }

  get descripcion(): string {
    return this.datos.descripcion;
  }

  get lecturaIds(): string[] {
    return [...this.datos.lecturaIds];
  }

  actualizar(datos: DatosMision): void {
    this.datos = validarDatos(datos);
  }

  moverA(orden: number): void {
    this.ordenActual = validarOrden(orden);
  }
}

function validarOrden(orden: number): number {
  if (!Number.isInteger(orden) || orden < 1 || orden > MAX_MISIONES_POR_MUNDO) {
    throw new DatoMisionInvalidoError(`La posición de la misión va de 1 a ${MAX_MISIONES_POR_MUNDO}`);
  }
  return orden;
}

function validarDatos(d: DatosMision): DatosMision {
  const titulo = (d.titulo ?? '').trim().replace(/\s+/g, ' ');
  if (titulo.length < 3 || titulo.length > 80) throw new DatoMisionInvalidoError('El título de la misión debe tener entre 3 y 80 caracteres');
  const descripcion = (d.descripcion ?? '').trim();
  if (descripcion.length > 300) throw new DatoMisionInvalidoError('La descripción de la misión admite hasta 300 caracteres');
  const lecturaIds = Array.isArray(d.lecturaIds) ? d.lecturaIds : [];
  if (lecturaIds.length < 1) throw new DatoMisionInvalidoError('Una misión necesita al menos una lectura');
  if (lecturaIds.length > MAX_LECTURAS_POR_MISION) throw new DatoMisionInvalidoError(`Una misión admite hasta ${MAX_LECTURAS_POR_MISION} lecturas`);
  if (!lecturaIds.every((id) => esUuid(id))) throw new DatoMisionInvalidoError('Hay una lectura que no existe');
  if (new Set(lecturaIds).size !== lecturaIds.length) throw new DatoMisionInvalidoError('Una lectura aparece dos veces en la misión');
  return { titulo, descripcion, lecturaIds: [...lecturaIds] };
}
