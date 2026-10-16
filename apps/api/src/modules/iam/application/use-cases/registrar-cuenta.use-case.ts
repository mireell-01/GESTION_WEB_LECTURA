import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { Cuenta } from '../../domain/entities/cuenta';
import { ContrasenaFiltradaError, EmailYaRegistradoError } from '../../domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Contrasena } from '../../domain/value-objects/contrasena';
import { Email } from '../../domain/value-objects/email';
import { Rol } from '../../domain/value-objects/rol';
import { GeneradorId, RegistrarCuentaInput, Reloj } from '../dto/iam.dto';
import { ContrasenasFiltradasRepository } from '../ports/contrasenas-filtradas.repository';
import { CorreoService } from '../ports/correo.service';
import { CuentaRepository } from '../ports/cuenta.repository';
import { HashService } from '../ports/hash.service';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';
import { enviarEnlaceVerificacion } from '../services/enlaces-verificacion';

/**
 * Use Case: RegistrarCuenta (RF-001, RF-002).
 * Crea una cuenta adulta en PENDIENTE_VERIFICACION y envía el enlace de verificación (24 h).
 */
export class RegistrarCuentaUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly hashService: HashService,
    private readonly filtradas: ContrasenasFiltradasRepository,
    private readonly tokens: TokenService,
    private readonly correo: CorreoService,
    private readonly bus: BusEventos,
    private readonly urlWeb: string,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: RegistrarCuentaInput): Promise<{ cuentaId: string; estado: string }> {
    const email = Email.de(entrada.email);
    const contrasena = Contrasena.de(entrada.contrasena);

    if (await this.cuentas.existeEmail(email.value)) {
      throw new EmailYaRegistradoError();
    }
    if (await this.filtradas.estaFiltrada(contrasena.value, { email: email.value, nombre: entrada.nombre })) {
      throw new ContrasenaFiltradaError();
    }

    const ahora = this.ahora();
    const cuenta = Cuenta.registrar({
      id: this.generarId(),
      nombre: entrada.nombre,
      email,
      contrasena,
      rol: Rol.de(entrada.rol),
      hashContrasena: await this.hashService.hash(contrasena.value),
      ahora,
    });
    await this.cuentas.guardar(cuenta);

    // RF-002: enlace de un solo uso; en la base solo se guarda su huella.
    await enviarEnlaceVerificacion(
      { verificaciones: this.verificaciones, tokens: this.tokens, correo: this.correo, urlWeb: this.urlWeb, generarId: this.generarId },
      { id: cuenta.id, nombre: cuenta.nombre, email: email.value },
      ahora,
    );

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.CUENTA_CREADA, cuenta.id, { actorId: cuenta.id, rol: entrada.rol }, ahora),
    ]);

    return { cuentaId: cuenta.id, estado: cuenta.estado.value };
  }
}
