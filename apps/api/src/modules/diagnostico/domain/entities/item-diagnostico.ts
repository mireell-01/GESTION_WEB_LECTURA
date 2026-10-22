import { Habilidad, RangoEdad } from '../../../shared-kernel/public-api';
import { Forma } from '../value-objects/plan-diagnostico';

/**
 * Ítem del banco del diagnóstico (RF-034): una pregunta de opción sobre una lectura breve. Las
 * lecturas tienen una pregunta por habilidad; `orden` es su posición dentro de la forma y la edad.
 */
export interface ItemDiagnostico {
  id: string;
  rangoEdad: RangoEdad;
  forma: Forma;
  orden: number;
  habilidad: Habilidad;
  nivelDificultad: number;
  enunciado: string;
  lectura: { clave: string; titulo: string; texto: string };
  opciones: string[];
  /** Nunca sale del servidor. */
  indiceCorrecto: number;
}
