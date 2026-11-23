import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { AulaDelEstudiante, IdentidadEstudiantes } from '../application/ports/gamificacion.ports';

/** Anticorrupción hacia IAM: alias, avatar y rango de edad del estudiante activo. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async perfil(estudianteId: string) {
    const [p] = await this.iam.resumenEstudiantes([estudianteId]).catch(() => []);
    return p?.activo ? { alias: p.alias, avatar: p.avatar, rangoEdad: p.rangoEdad } : null;
  }

  async perfilesDe(estudianteIds: string[]) {
    const resumen = await this.iam.resumenEstudiantes(estudianteIds);
    return new Map(resumen.filter((p) => p.activo).map((p) => [p.id, { alias: p.alias, avatar: p.avatar }]));
  }
}

/** Anticorrupción hacia Escuela: el aula activa del niño con sus compañeros, para la Copa Lectora. */
export class AulaDelEstudianteEscuela implements AulaDelEstudiante {
  constructor(private readonly escuela: EscuelaFacade) {}

  async aulaDe(estudianteId: string) {
    // Si estuviera en más de un aula activa, compite en la primera por nombre: siempre la misma.
    const activas = (await this.escuela.aulasDeEstudiante(estudianteId))
      .filter((a) => a.estado === 'ACTIVA')
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const aula = activas[0];
    if (!aula) return null;
    return { nombre: aula.nombre, estudianteIds: await this.escuela.estudiantesDeAula(aula.id) };
  }
}
