import { NoEncontradoError, RangoEdad } from '../../shared-kernel/public-api';
import { MedioConsentimiento } from '../domain/entities/consentimiento';
import { PerfilEstudianteVista, Reloj } from './dto/iam.dto';
import { CuentaRepository } from './ports/cuenta.repository';
import { PerfilEstudianteRepository } from './ports/perfil-estudiante.repository';
import { CrearPerfilEstudianteUseCase } from './use-cases/crear-perfil-estudiante.use-case';
import { RegistrarConsentimientoUseCase } from './use-cases/registrar-consentimiento.use-case';
import { RestablecerPinUseCase } from './use-cases/restablecer-pin.use-case';
import { vistaPerfil } from './services/perfiles';

export interface ResumenEstudiante {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: RangoEdad;
  activo: boolean;
  bloqueado: boolean;
  cuentaResponsableId: string;
}

export interface ResumenCuenta {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  estado: string;
}

/**
 * Fachada pública de IAM: lo único que otros módulos pueden usar de este bounded context.
 */
export class IamFacade {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly registrarConsentimiento: RegistrarConsentimientoUseCase,
    private readonly crearPerfil: CrearPerfilEstudianteUseCase,
    private readonly restablecerPinUseCase: RestablecerPinUseCase,
    private readonly ahora: Reloj,
  ) {}

  /** RF-015 / RN-01: el docente declara el consentimiento institucional de su aula. */
  registrarConsentimientoInstitucional(params: {
    docenteId: string;
    aulaId: string;
    otorganteNombre: string;
    medio: MedioConsentimiento;
  }) {
    return this.registrarConsentimiento.ejecutar({
      cuentaResponsableId: params.docenteId,
      tipo: 'INSTITUCIONAL',
      aulaId: params.aulaId,
      otorganteNombre: params.otorganteNombre,
      medio: params.medio,
    });
  }

  /** RF-015: crea el perfil de un estudiante del aula (responsable: el docente). */
  crearPerfilEnAula(params: {
    docenteId: string;
    aulaId: string;
    alias: string;
    anioNacimiento: number;
    mesNacimiento: number;
    avatar: string;
    pin: string;
  }): Promise<PerfilEstudianteVista> {
    return this.crearPerfil.ejecutar({
      cuentaResponsableId: params.docenteId,
      aulaId: params.aulaId,
      alias: params.alias,
      anioNacimiento: params.anioNacimiento,
      mesNacimiento: params.mesNacimiento,
      avatar: params.avatar,
      pin: params.pin,
    });
  }

  /** RN-03: el docente del aula restablece el PIN de su estudiante. */
  restablecerPin(params: { responsableId: string; perfilId: string; pinNuevo: string }) {
    return this.restablecerPinUseCase.ejecutar({
      cuentaId: params.responsableId,
      perfilId: params.perfilId,
      pinNuevo: params.pinNuevo,
    });
  }

  async resumenEstudiantes(ids: string[]): Promise<ResumenEstudiante[]> {
    if (ids.length === 0) return [];
    const ahora = this.ahora();
    const perfiles = await this.perfiles.buscarPorIds(ids);
    return perfiles.map((p) => ({
      id: p.id,
      alias: p.alias,
      avatar: p.avatar,
      rangoEdad: p.rangoEdad(ahora),
      activo: p.activo,
      bloqueado: p.estaBloqueado(ahora),
      cuentaResponsableId: p.cuentaResponsableId,
    }));
  }

  async estudiante(id: string): Promise<ResumenEstudiante> {
    const [resumen] = await this.resumenEstudiantes([id]);
    if (!resumen) throw new NoEncontradoError('Estudiante');
    return resumen;
  }

  async estudiantesDeResponsable(cuentaId: string): Promise<PerfilEstudianteVista[]> {
    const ahora = this.ahora();
    return (await this.perfiles.listarPorResponsable(cuentaId)).map((p) => vistaPerfil(p, ahora));
  }

  async resumenCuentas(ids: string[]): Promise<ResumenCuenta[]> {
    const resultado: ResumenCuenta[] = [];
    for (const id of new Set(ids)) {
      const cuenta = await this.cuentas.buscarPorId(id);
      if (cuenta) {
        resultado.push({
          id: cuenta.id,
          nombre: cuenta.nombre,
          email: cuenta.email.value,
          rol: cuenta.rol.value,
          estado: cuenta.estado.value,
        });
      }
    }
    return resultado;
  }
}
