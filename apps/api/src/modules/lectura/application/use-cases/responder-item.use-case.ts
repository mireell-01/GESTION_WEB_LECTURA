/**
 * Use Case: ResponderItemUseCase — capa de aplicación (orquesta el dominio).
 */
export interface ResponderItemInput {
  // TODO: DTO de entrada del caso de uso
}

export interface ResponderItemOutput {
  // TODO: DTO de salida del caso de uso
}

export class ResponderItemUseCase {
  async ejecutar(entrada: ResponderItemInput): Promise<ResponderItemOutput> {
    void entrada;
    throw new Error('TODO: implementar ResponderItemUseCase');
  }
}
