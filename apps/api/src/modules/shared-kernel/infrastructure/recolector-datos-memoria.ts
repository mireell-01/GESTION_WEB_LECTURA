import { Injectable } from '@nestjs/common';

import { AportanteDatos, RecolectorDatosEstudiante } from '../application/recolector-datos';

/** Implementación en memoria del recolector: consulta a cada aportante registrado. */
@Injectable()
export class RecolectorDatosMemoria implements RecolectorDatosEstudiante {
  private readonly aportantes = new Map<string, AportanteDatos>();

  registrar(seccion: string, aportante: AportanteDatos): void {
    this.aportantes.set(seccion, aportante);
  }

  async recolectar(estudianteId: string): Promise<Record<string, unknown>> {
    const resultado: Record<string, unknown> = {};
    for (const [seccion, aportante] of this.aportantes) {
      resultado[seccion] = await aportante(estudianteId);
    }
    return resultado;
  }
}
