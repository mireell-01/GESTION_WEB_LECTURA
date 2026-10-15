/**
 * Use Case: IniciarAventuraUseCase — capa de aplicación (orquesta el dominio).
 */
export interface IniciarAventuraInput {
  // TODO: DTO de entrada del caso de uso
}

export interface IniciarAventuraOutput {
  // TODO: DTO de salida del caso de uso
}

export class IniciarAventuraUseCase {
  async ejecutar(entrada: IniciarAventuraInput): Promise<IniciarAventuraOutput> {
    void entrada;
    throw new Error('TODO: implementar IniciarAventuraUseCase');
  }
}
