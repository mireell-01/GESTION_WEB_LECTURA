import { EscuelaFacade } from '../../escuela/public-api';
import { GamificacionFacade } from '../../gamificacion/public-api';
import { IamFacade } from '../../iam/public-api';
import { GestionCuentas, GestionEscuela, GestionGamificacion } from '../application/ports/plataforma.ports';

/** Adaptador anticorrupción sobre la fachada de IAM. */
export class GestionCuentasIam implements GestionCuentas {
  constructor(private readonly iam: IamFacade) {}

  listarDocentes(filtro: Parameters<GestionCuentas['listarDocentes']>[0]) {
    return this.iam.listarDocentes(filtro);
  }
  docente(id: string) {
    return this.iam.docenteAdministrado(id);
  }
  darDeAltaDocente(entrada: { nombre: string; email: string; adminId: string }) {
    return this.iam.darDeAltaDocente(entrada);
  }
  suspenderDocente(id: string, adminId: string) {
    return this.iam.suspenderDocente(id, adminId);
  }
  reactivarDocente(id: string, adminId: string) {
    return this.iam.reactivarDocente(id, adminId);
  }
  async actores(ids: string[]) {
    return new Map((await this.iam.resumenCuentas(ids)).map((c) => [c.id, { nombre: c.nombre, rol: c.rol }]));
  }
}

/** Adaptador anticorrupción sobre la fachada de Escuela. */
export class GestionEscuelaFacade implements GestionEscuela {
  constructor(private readonly escuela: EscuelaFacade) {}

  listarInstituciones() {
    return this.escuela.listarInstituciones();
  }
  crearInstitucion(entrada: Parameters<GestionEscuela['crearInstitucion']>[0]) {
    return this.escuela.crearInstitucion(entrada);
  }
  cambiarEstadoInstitucion(id: string, estado: 'ACTIVA' | 'SUSPENDIDA', adminId: string) {
    return this.escuela.cambiarEstadoInstitucion(id, estado, adminId);
  }
  aulasDeDocentes(docenteIds: string[]) {
    return this.escuela.aulasDeDocentes(docenteIds);
  }
}

/** Adaptador anticorrupción sobre la fachada de Gamificación. */
export class GestionGamificacionFacade implements GestionGamificacion {
  constructor(private readonly gamificacion: GamificacionFacade) {}

  vigentes() {
    return this.gamificacion.parametrosVigentes();
  }
  historial() {
    return this.gamificacion.historialParametros();
  }
  publicar(entrada: unknown, adminId: string) {
    return this.gamificacion.publicarParametros(entrada, adminId);
  }
}
