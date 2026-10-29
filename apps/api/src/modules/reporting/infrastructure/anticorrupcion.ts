import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { esUuid } from '../../shared-kernel/public-api';
import { HijosFamilia, NotificadorFamilia } from '../application/ports/familia.ports';
import { AulasDocente, IdentidadEstudiantes, NotificadorDocente } from '../application/ports/reporting.ports';

/** Anticorrupción hacia Escuela: el aula (activa o archivada) y su docente (RN-17). */
export class AulasDocenteEscuela implements AulasDocente {
  constructor(private readonly escuela: EscuelaFacade) {}

  async aula(aulaId: string) {
    if (!esUuid(aulaId)) return null;
    const a = await this.escuela.aula(aulaId);
    return a ? { id: a.id, nombre: a.nombre, grado: a.grado, estado: a.estado, docenteId: a.docenteId } : null;
  }

  async aulaDe(docenteId: string, aulaId: string) {
    const a = await this.aula(aulaId);
    if (!a || a.docenteId !== docenteId) return null;
    return { id: a.id, nombre: a.nombre, grado: a.grado, estado: a.estado };
  }
}

/** Anticorrupción hacia IAM: alias, avatar y edad de los estudiantes. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async perfiles(ids: string[]) {
    return (await this.iam.resumenEstudiantes(ids.filter(esUuid))).map((p) => ({ id: p.id, alias: p.alias, avatar: p.avatar, rangoEdad: p.rangoEdad }));
  }
}

/** Anticorrupción hacia IAM: el correo de la docente lo resuelve y envía IAM. */
export class NotificadorDocenteIam implements NotificadorDocente {
  constructor(private readonly iam: IamFacade) {}

  notificar(docenteId: string, mensaje: { asunto: string; texto: string; enlace?: string }) {
    return this.iam.notificarCuenta(docenteId, mensaje);
  }
}

/** Anticorrupción hacia IAM: los hijos que la familia acompaña, propios o por invitación (RN-17). */
export class HijosFamiliaIam implements HijosFamilia {
  constructor(private readonly iam: IamFacade) {}

  async hijosDe(cuentaId: string) {
    return (await this.iam.hijosDeFamilia(cuentaId)).map((h) => ({
      id: h.id,
      alias: h.alias,
      avatar: h.avatar,
      rangoEdad: h.rangoEdad,
      activo: h.activo,
      relacion: h.relacion,
    }));
  }
}

/** Anticorrupción hacia IAM: el correo de la familia lo resuelve y envía IAM. */
export class NotificadorFamiliaIam implements NotificadorFamilia {
  constructor(private readonly iam: IamFacade) {}

  notificar(cuentaId: string, mensaje: { asunto: string; texto: string; enlace?: string; bajaUrl?: string }) {
    return this.iam.notificarCuenta(cuentaId, mensaje);
  }
}
