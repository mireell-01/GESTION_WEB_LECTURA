import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EnlaceInvalidoError } from '../../domain/errors/enlace-invalido-error';
import { ContrasenaFiltradaError } from '../../domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Contrasena } from '../../domain/value-objects/contrasena';
import { Reloj } from '../dto/iam.dto';
import { ContrasenasFiltradasRepository } from '../ports/contrasenas-filtradas.repository';
import { CuentaRepository } from '../ports/cuenta.repository';
import { HashService } from '../ports/hash.service';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';

/**
 * Use Case: RestablecerContrasena (RF-004). Canjea el enlace de un solo uso,
 * cambia la contraseña y cierra todas las sesiones abiertas de la cuenta.
 */
export class RestablecerContrasenaUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly hashService: HashService,
    private readonly filtradas: ContrasenasFiltradasRepository,
    private readonly tokens: TokenService,
    private readonly sesiones: SesionRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { codigo: string; contrasenaNueva: string }): Promise<{ ok: true }> {
    const contrasena = Contrasena.de(entrada.contrasenaNueva);
    const verificacion = await this.verificaciones.buscarPorCodigo(
      this.tokens.huella(entrada.codigo),
      'RECUPERACION_CONTRASENA',
    );
    const ahora = this.ahora();
    if (!verificacion || !verificacion.estaVigente(ahora)) {
      throw new EnlaceInvalidoError();
    }
    const cuenta = await this.cuentas.buscarPorId(verificacion.cuentaId);
    if (!cuenta) {
      throw new EnlaceInvalidoError();
    }
    if (await this.filtradas.estaFiltrada(contrasena.value, { email: cuenta.email.value, nombre: cuenta.nombre })) {
      throw new ContrasenaFiltradaError();
    }

    verificacion.canjear(ahora);
    await this.verificaciones.guardar(verificacion);

    cuenta.cambiarContrasena(await this.hashService.hash(contrasena.value));
    // Quien recibe el enlace demuestra que controla el correo.
    cuenta.verificar();
    await this.cuentas.guardar(cuenta);
    await this.sesiones.revocarTodasDe(cuenta.id, ahora);

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.CONTRASENA_RESTABLECIDA, cuenta.id, { actorId: cuenta.id }, ahora),
    ]);
    return { ok: true };
  }
}
