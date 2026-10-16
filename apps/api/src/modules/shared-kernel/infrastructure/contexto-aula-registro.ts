import { Injectable } from '@nestjs/common';

import { AulaDeIngreso, RegistroContextoAula, ResolutorContextoAula } from '../application/contexto-aula';

/** Delegado del contexto de aula: sin módulo Escuela registrado, ninguna aula es válida. */
@Injectable()
export class RegistroContextoAulaDelegado implements RegistroContextoAula {
  private resolutor: ResolutorContextoAula | null = null;

  registrar(resolutor: ResolutorContextoAula): void {
    this.resolutor = resolutor;
  }

  async aulaActiva(aulaId: string): Promise<AulaDeIngreso | null> {
    return this.resolutor ? this.resolutor.aulaActiva(aulaId) : null;
  }

  async estudiantesActivos(aulaId: string): Promise<string[]> {
    return this.resolutor ? this.resolutor.estudiantesActivos(aulaId) : [];
  }

  async estaMatriculado(aulaId: string, estudianteId: string): Promise<boolean> {
    return this.resolutor ? this.resolutor.estaMatriculado(aulaId, estudianteId) : false;
  }
}
