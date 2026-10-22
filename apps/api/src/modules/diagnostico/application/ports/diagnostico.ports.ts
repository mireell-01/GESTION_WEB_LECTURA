import { RangoEdad } from '../../../shared-kernel/public-api';
import { Diagnostico } from '../../domain/entities/diagnostico';
import { ItemDiagnostico } from '../../domain/entities/item-diagnostico';
import { Forma, TipoDiagnostico } from '../../domain/value-objects/plan-diagnostico';

/** Persistencia de los diagnósticos y sus respuestas (schema `diagnostico`). */
export interface DiagnosticoRepository {
  buscar(id: string): Promise<Diagnostico | null>;
  /** Crea el diagnóstico; false si otro pedido simultáneo ya creó uno (único por estudiante, tipo y secuencia). */
  crear(diagnostico: Diagnostico): Promise<boolean>;
  /** Guarda el estado, el resultado y las respuestas nuevas. */
  guardar(diagnostico: Diagnostico): Promise<void>;
  /** El reto sin terminar del estudiante (a lo sumo uno). */
  pendienteDe(estudianteId: string): Promise<Diagnostico | null>;
  inicialDe(estudianteId: string): Promise<Diagnostico | null>;
  ultimaSecuencia(estudianteId: string, tipo: TipoDiagnostico): Promise<number>;
  /** Todos los diagnósticos de esos estudiantes (para el panel de reevaluación). */
  deEstudiantes(estudianteIds: string[]): Promise<Diagnostico[]>;
}

/** Banco de ítems (cargado por migración y validado por el líder pedagógico). */
export interface BancoItems {
  items(rangoEdad: RangoEdad, forma: Forma): Promise<ItemDiagnostico[]>;
}

/** Anticorrupción hacia IAM. */
export interface IdentidadEstudiantes {
  perfiles(ids: string[]): Promise<{ id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean }[]>;
}

/** Anticorrupción hacia Escuela (RF-037: el docente reevalúa a los estudiantes de su aula). */
export interface AulasDocente {
  /** null si el aula no existe o no es de ese docente (RN-17). */
  aulaDelDocente(docenteId: string, aulaId: string): Promise<{ id: string; nombre: string; activa: boolean } | null>;
  estudiantes(aulaId: string): Promise<string[]>;
}
