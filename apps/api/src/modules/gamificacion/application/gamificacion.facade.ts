import { ParametrosAdminUseCase, ParametrosVigentesVista, VersionParametrosVista } from './use-cases/parametros-admin.use-case';

/** Fachada pública de Gamificación: lo que la administración puede usar de este bounded context (RF-078). */
export class GamificacionFacade {
  constructor(private readonly parametros: ParametrosAdminUseCase) {}

  parametrosVigentes(): Promise<ParametrosVigentesVista> {
    return this.parametros.vigentes();
  }

  historialParametros(): Promise<VersionParametrosVista[]> {
    return this.parametros.historial();
  }

  publicarParametros(entrada: unknown, adminId: string): Promise<ParametrosVigentesVista> {
    return this.parametros.publicar(entrada, adminId);
  }
}
