import { InvitacionFamiliar } from '../../domain/entities/invitacion-familiar';

/** Puerto de salida: invitaciones familiares (RF-019). */
export interface InvitacionRepository {
  guardar(invitacion: InvitacionFamiliar): Promise<void>;
  buscarPorHash(hashCodigo: string): Promise<InvitacionFamiliar | null>;
  existeHash(hashCodigo: string): Promise<boolean>;
  contarVigentesDeEstudiante(estudianteId: string, ahora: Date): Promise<number>;
  /**
   * Marca la invitación como usada solo si nadie la usó antes y no venció (operación atómica).
   * false si otra petición la ganó: el código es de un solo uso aun con dos intentos simultáneos.
   */
  reclamar(invitacion: InvitacionFamiliar): Promise<boolean>;
  /** Devuelve el código a su estado sin usar si el vínculo no pudo completarse. */
  liberar(invitacion: InvitacionFamiliar): Promise<void>;
}
