import { NoEncontradoError, ProhibidoError } from '../../../shared-kernel/public-api';
import { PerfilEstudiante } from '../../domain/entities/perfil-estudiante';
import { LimiteFamiliaresError, LimitePerfilesError, YaVinculadoError } from '../../domain/errors/errores-iam';
import { GeneradorId, PerfilEstudianteVista, Reloj } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { OrigenVinculo, VinculoRepository } from '../ports/vinculo.repository';
import { vistaPerfil } from '../services/perfiles';
import { MAX_PERFILES_FAMILIA } from './crear-perfil-estudiante.use-case';

/** SRS §7: 1 responsable principal + hasta 2 familiares vinculados por estudiante. */
export const MAX_FAMILIARES_VINCULADOS = 2;

/**
 * Use Case: VincularFamiliar (RF-019, RN-17). Un familiar con cuenta activa pasa a acompañar a un
 * estudiante que no creó él (p. ej. uno matriculado por su docente). Lo invoca Escuela al canjear
 * la invitación; `validar` permite comprobarlo antes de gastar el código de un solo uso.
 */
export class VincularFamiliarUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly vinculos: VinculoRepository,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async validar(entrada: { perfilId: string; cuentaId: string }): Promise<PerfilEstudiante> {
    const cuenta = await this.cuentas.buscarPorId(entrada.cuentaId);
    if (!cuenta || !cuenta.estaActiva() || cuenta.rol.value !== 'FAMILIAR') {
      throw new ProhibidoError('Solo una cuenta familiar activa puede vincularse con un estudiante');
    }
    const perfil = await this.perfiles.buscarPorId(entrada.perfilId);
    if (!perfil || perfil.propsSnapshot.eliminadoEn) {
      throw new NoEncontradoError('Estudiante');
    }

    const vigentes = await this.vinculos.vigentesDePerfil(perfil.id);
    if (perfil.perteneceA(cuenta.id) || vigentes.some((v) => v.cuentaId === cuenta.id)) {
      throw new YaVinculadoError(perfil.alias);
    }
    if (vigentes.length >= MAX_FAMILIARES_VINCULADOS) {
      throw new LimiteFamiliaresError(perfil.alias, MAX_FAMILIARES_VINCULADOS);
    }
    const propios = await this.perfiles.listarPorResponsable(cuenta.id);
    const vinculados = await this.vinculos.perfilesVinculadosA(cuenta.id);
    if (propios.length + vinculados.length >= MAX_PERFILES_FAMILIA) {
      throw new LimitePerfilesError(MAX_PERFILES_FAMILIA);
    }
    return perfil;
  }

  async ejecutar(entrada: { perfilId: string; cuentaId: string; origen: OrigenVinculo }): Promise<PerfilEstudianteVista> {
    const perfil = await this.validar(entrada);
    const ahora = this.ahora();
    await this.vinculos.agregar({
      id: this.generarId(),
      perfilId: perfil.id,
      cuentaId: entrada.cuentaId,
      origen: entrada.origen,
      vinculadoEn: ahora,
    });
    return vistaPerfil(perfil, ahora);
  }
}
