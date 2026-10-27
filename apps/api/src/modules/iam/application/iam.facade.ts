import { NoEncontradoError, RangoEdad } from '../../shared-kernel/public-api';
import { MedioConsentimiento } from '../domain/entities/consentimiento';
import { PerfilEstudianteVista, PerfilFamiliaVista, Reloj } from './dto/iam.dto';
import { CorreoService } from './ports/correo.service';
import { CuentaRepository } from './ports/cuenta.repository';
import { PerfilEstudianteRepository } from './ports/perfil-estudiante.repository';
import { VinculoRepository } from './ports/vinculo.repository';
import { CrearPerfilEstudianteUseCase } from './use-cases/crear-perfil-estudiante.use-case';
import { ListarPerfilesUseCase } from './use-cases/listar-perfiles.use-case';
import { RegistrarConsentimientoUseCase } from './use-cases/registrar-consentimiento.use-case';
import { RestablecerPinUseCase } from './use-cases/restablecer-pin.use-case';
import { VincularFamiliarUseCase } from './use-cases/vincular-familiar.use-case';
import { vistaPerfil } from './services/perfiles';

export interface ResumenEstudiante {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: RangoEdad;
  activo: boolean;
  bloqueado: boolean;
  cuentaResponsableId: string;
  /** RF-019: familiares adicionales vinculados (máximo 2). */
  familiaresVinculados: number;
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
    private readonly vincularFamiliarUseCase: VincularFamiliarUseCase,
    private readonly vinculos: VinculoRepository,
    private readonly ahora: Reloj,
    private readonly correo: CorreoService | null = null,
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
    const vinculados = await this.vinculos.contarVigentesPorPerfiles(perfiles.map((p) => p.id));
    return perfiles.map((p) => ({
      id: p.id,
      alias: p.alias,
      avatar: p.avatar,
      rangoEdad: p.rangoEdad(ahora),
      activo: p.activo,
      bloqueado: p.estaBloqueado(ahora),
      cuentaResponsableId: p.cuentaResponsableId,
      familiaresVinculados: vinculados[p.id] ?? 0,
    }));
  }

  /** RF-019: comprueba que el familiar puede vincularse, sin guardar nada. */
  async validarVinculoFamiliar(params: { perfilId: string; cuentaFamiliarId: string }): Promise<void> {
    await this.vincularFamiliarUseCase.validar({ perfilId: params.perfilId, cuentaId: params.cuentaFamiliarId });
  }

  /** RF-019: el familiar pasa a acompañar al estudiante (lo invoca Escuela al canjear la invitación). */
  vincularFamiliar(params: { perfilId: string; cuentaFamiliarId: string }): Promise<PerfilEstudianteVista> {
    return this.vincularFamiliarUseCase.ejecutar({
      perfilId: params.perfilId,
      cuentaId: params.cuentaFamiliarId,
      origen: 'INVITACION_DOCENTE',
    });
  }

  async estudiante(id: string): Promise<ResumenEstudiante> {
    const [resumen] = await this.resumenEstudiantes([id]);
    if (!resumen) throw new NoEncontradoError('Estudiante');
    return resumen;
  }

  /**
   * RF-068 (Módulo 10): los hijos que la familia acompaña — los propios y los vinculados por invitación
   * de su docente (RF-019) —, como en su panel. RN-17: solo esos.
   */
  hijosDeFamilia(cuentaId: string): Promise<PerfilFamiliaVista[]> {
    return new ListarPerfilesUseCase(this.perfiles, this.vinculos, this.ahora).ejecutar(cuentaId);
  }

  async estudiantesDeResponsable(cuentaId: string): Promise<PerfilEstudianteVista[]> {
    const ahora = this.ahora();
    return (await this.perfiles.listarPorResponsable(cuentaId)).map((p) => vistaPerfil(p, ahora));
  }

  /**
   * RF-065 (Módulo 9): un aviso por correo a una cuenta adulta activa, como el resumen semanal del
   * docente. La dirección no sale de IAM. Devuelve si se envió.
   */
  async notificarCuenta(cuentaId: string, mensaje: { asunto: string; texto: string; enlace?: string; bajaUrl?: string }): Promise<boolean> {
    if (!this.correo) return false;
    const cuenta = await this.cuentas.buscarPorId(cuentaId);
    if (!cuenta || cuenta.estado.value !== 'ACTIVA') return false;
    await this.correo.enviar({ para: cuenta.email.value, ...mensaje });
    return true;
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
