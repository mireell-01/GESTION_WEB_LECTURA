/**
 * Entity: Auditoria (RF-077) — registro inmutable de una acción sensible: actor, acción, recurso,
 * fecha e IP. Solo se agrega; la base rechaza cambios y borrados (trigger append-only).
 */
export interface AuditoriaProps {
  id: string;
  actorId: string | null;
  actorRol: string | null;
  accion: string;
  recursoTipo: string;
  recursoId: string | null;
  /** IPv4 o IPv6; null si no se conoce. */
  ip: string | null;
  datos: Record<string, unknown>;
  ocurridoEn: Date;
}

export class Auditoria {
  private constructor(private readonly props: AuditoriaProps) {}

  static registrar(props: AuditoriaProps): Auditoria {
    if (!props.accion.trim() || !props.recursoTipo.trim()) {
      throw new Error('La auditoría necesita la acción y el tipo de recurso');
    }
    return new Auditoria({ ...props, datos: { ...props.datos } });
  }

  get propsSnapshot(): Readonly<AuditoriaProps> {
    return this.props;
  }
}
