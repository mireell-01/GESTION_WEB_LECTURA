/**
 * Use Case: IniciarConversacionUseCase — capa de aplicación (orquesta el dominio).
 */
export interface IniciarConversacionInput {
  // TODO: DTO de entrada del caso de uso
}

export interface IniciarConversacionOutput {
  // TODO: DTO de salida del caso de uso
}

export class IniciarConversacionUseCase {
  async ejecutar(entrada: IniciarConversacionInput): Promise<IniciarConversacionOutput> {
    void entrada;
    throw new Error('TODO: implementar IniciarConversacionUseCase');
  }
}
