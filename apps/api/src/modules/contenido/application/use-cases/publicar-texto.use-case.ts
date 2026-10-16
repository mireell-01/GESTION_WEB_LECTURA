/**
 * Use Case: PublicarTextoUseCase — capa de aplicación (orquesta el dominio).
 */
export interface PublicarTextoInput {
  // TODO: DTO de entrada del caso de uso
}

export interface PublicarTextoOutput {
  // TODO: DTO de salida del caso de uso
}

export class PublicarTextoUseCase {
  async ejecutar(entrada: PublicarTextoInput): Promise<PublicarTextoOutput> {
    void entrada;
    throw new Error('TODO: implementar PublicarTextoUseCase');
  }
}
