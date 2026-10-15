import { NoEncontradoError, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { Reloj, UsuarioActualVista } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';

/** Use Case: ObtenerUsuarioActual — datos mínimos para personalizar la interfaz del rol. */
export class ObtenerUsuarioActualUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(usuario: UsuarioAutenticado): Promise<UsuarioActualVista> {
    if (usuario.rol === 'ESTUDIANTE') {
      const perfil = await this.perfiles.buscarPorId(usuario.sub);
      if (!perfil) throw new NoEncontradoError('Perfil');
      return {
        id: perfil.id,
        rol: usuario.rol,
        mfa: false,
        alias: perfil.alias,
        avatar: perfil.avatar,
        rangoEdad: perfil.rangoEdad(this.ahora()),
      };
    }

    const cuenta = await this.cuentas.buscarPorId(usuario.sub);
    if (!cuenta) throw new NoEncontradoError('Cuenta');
    return {
      id: cuenta.id,
      rol: usuario.rol,
      mfa: usuario.mfa,
      nombre: cuenta.nombre,
      email: cuenta.email.value,
      mfaHabilitado: cuenta.mfaHabilitado,
    };
  }
}
