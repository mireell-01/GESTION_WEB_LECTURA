/**
 * Use Case: ClasificarTextoUseCase — capa de aplicación (orquesta el dominio).
 */
export interface ClasificarTextoInput {
  // TODO: DTO de entrada del caso de uso
}

export interface ClasificarTextoOutput {
  // TODO: DTO de salida del caso de uso
}

export class ClasificarTextoUseCase {
  async ejecutar(entrada: ClasificarTextoInput): Promise<ClasificarTextoOutput> {
    void entrada;
    throw new Error('TODO: implementar ClasificarTextoUseCase');
  }
}
