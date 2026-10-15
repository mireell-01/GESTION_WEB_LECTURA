import { AVATARES, IamFacade, SesionEmitida } from '../../../iam/public-api';
import { EstudianteIdentidad, ServicioIdentidad } from '../../application/ports/servicio-identidad';

/** Adaptador: implementa el puerto anticorrupción de Escuela sobre la fachada pública de IAM. */
export class ServicioIdentidadIam implements ServicioIdentidad {
  constructor(private readonly iam: IamFacade) {}

  async registrarConsentimientoInstitucional(params: { docenteId: string; aulaId: string; otorganteNombre: string }): Promise<void> {
    await this.iam.registrarConsentimientoInstitucional({ ...params, medio: 'FISICO' });
  }

  async crearPerfilEnAula(params: Parameters<IamFacade['crearPerfilEnAula']>[0]): Promise<EstudianteIdentidad> {
    const p = await this.iam.crearPerfilEnAula(params);
    return { id: p.id, alias: p.alias, avatar: p.avatar, rangoEdad: p.rangoEdad, activo: p.activo, bloqueado: false };
  }

  async estudiantes(ids: string[]): Promise<EstudianteIdentidad[]> {
    return (await this.iam.resumenEstudiantes(ids)).map((e) => ({
      id: e.id,
      alias: e.alias,
      avatar: e.avatar,
      rangoEdad: e.rangoEdad,
      activo: e.activo,
      bloqueado: e.bloqueado,
    }));
  }

  async restablecerPin(params: { responsableId: string; perfilId: string; pinNuevo: string }): Promise<void> {
    await this.iam.restablecerPin(params);
  }

  autenticarEnAula(params: { perfilId: string; pin: string; aulaId: string }): Promise<SesionEmitida> {
    return this.iam.autenticarEstudianteEnAula(params);
  }

  avatares(): readonly string[] {
    return AVATARES;
  }
}
