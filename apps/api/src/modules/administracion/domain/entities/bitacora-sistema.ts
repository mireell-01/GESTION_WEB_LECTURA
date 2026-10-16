/**
 * Entity: BitacoraSistema — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface BitacoraSistemaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class BitacoraSistema {
  private constructor(private readonly props: BitacoraSistemaProps) {}

  static crear(props: BitacoraSistemaProps): BitacoraSistema {
    // TODO: validar invariantes de negocio
    return new BitacoraSistema(props);
  }
}
