import { Injectable } from '@nestjs/common';

import { RegistroNivelLector, ResolutorNivelLector } from '../application/nivel-lector';

/** Delegado del nivel lector: sin Progreso registrado, el nivel aún no se conoce. */
@Injectable()
export class RegistroNivelLectorDelegado implements RegistroNivelLector {
  private resolutor: ResolutorNivelLector | null = null;

  registrar(resolutor: ResolutorNivelLector): void {
    this.resolutor = resolutor;
  }

  async nivelDe(estudianteId: string): Promise<number | null> {
    return this.resolutor ? this.resolutor.nivelDe(estudianteId) : null;
  }
}
