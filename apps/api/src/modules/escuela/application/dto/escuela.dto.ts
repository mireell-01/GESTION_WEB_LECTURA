import { RangoEdad } from '../../../shared-kernel/public-api';
import { Aula } from '../../domain/entities/aula';

export type Reloj = () => Date;
export type GeneradorId = () => string;
/** Entero uniforme en [0, n) de una fuente criptográfica. */
export type Aleatorio = (n: number) => number;

export interface AulaVista {
  id: string;
  nombre: string;
  grado: string;
  anioLectivo: number;
  institucion: string;
  codigo: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
  totalEstudiantes: number;
  creadaEn: string;
}

export interface EstudianteAulaVista {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: RangoEdad;
  activo: boolean;
  bloqueado: boolean;
  matriculadoEn: string;
}

/** Datos de una tarjeta de acceso imprimible (RF-017). El PIN solo existe aquí, en claro. */
export interface TarjetaAcceso {
  estudianteId: string;
  alias: string;
  avatar: string;
  codigoAula: string;
  nombreAula: string;
  pin: string;
}

export function vistaAula(aula: Aula, totalEstudiantes: number): AulaVista {
  const p = aula.propsSnapshot;
  return {
    id: p.id,
    nombre: p.nombre,
    grado: p.grado,
    anioLectivo: p.anioLectivo,
    institucion: p.institucion,
    codigo: p.codigo.value,
    estado: p.estado,
    totalEstudiantes,
    creadaEn: p.creadaEn.toISOString(),
  };
}
