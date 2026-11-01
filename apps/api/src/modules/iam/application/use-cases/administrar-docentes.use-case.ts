import { BusEventos, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { Cuenta } from '../../domain/entities/cuenta';
import { VerificacionCorreo } from '../../domain/entities/verificacion-correo';
import { EmailYaRegistradoError } from '../../domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Contrasena } from '../../domain/value-objects/contrasena';
import { Email } from '../../domain/value-objects/email';
import { EstadoCuentaValor } from '../../domain/value-objects/estado-cuenta';
import { Rol } from '../../domain/value-objects/rol';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { CorreoService } from '../ports/correo.service';
import { CuentaRepository } from '../ports/cuenta.repository';
import { HashService } from '../ports/hash.service';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';

/** Una cuenta docente vista por la administración (RF-076): nunca su contraseña ni su MFA. */
export interface DocenteAdministrado {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoCuentaValor;
  creadoEn: string;
}

const vista = (c: Cuenta): DocenteAdministrado => ({
  id: c.id,
  nombre: c.nombre,
  email: c.email.value,
  estado: c.estado.value as EstadoCuentaValor,
  creadoEn: c.propsSnapshot.creadoEn.toISOString(),
});

/**
 * RF-076: la administración de la plataforma gestiona las cuentas docentes.
 * - Alta: la cuenta nace sin contraseña conocida y el docente la crea con un enlace de 72 horas
 *   (al canjearlo, su correo queda verificado).
 * - Suspensión: pierde el acceso al instante (se cierran todas sus sesiones) y ya no puede ingresar.
 * - Reactivación: vuelve a ingresar con su contraseña de siempre.
 * Solo cuentas docentes: cualquier otra responde como si no existiera.
 */
export class AdministrarDocentesUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly hashService: HashService,
    private readonly tokens: TokenService,
    private readonly sesiones: SesionRepository,
    private readonly correo: CorreoService,
    private readonly bus: BusEventos,
    private readonly urlWeb: string,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async listar(filtro: { texto?: string; estado?: EstadoCuentaValor } = {}): Promise<DocenteAdministrado[]> {
    const cuentas = await this.cuentas.listar({ rol: 'DOCENTE', texto: filtro.texto?.trim() || undefined });
    return cuentas.filter((c) => c.rol.value === 'DOCENTE' && (!filtro.estado || c.estado.value === filtro.estado)).map(vista);
  }

  async docente(id: string): Promise<DocenteAdministrado> {
    return vista(await this.cuentaDocente(id));
  }

  async darDeAlta(entrada: { nombre: string; email: string; adminId: string }): Promise<DocenteAdministrado> {
    const email = Email.de(entrada.email);
    if (await this.cuentas.existeEmail(email.value)) throw new EmailYaRegistradoError();
    const ahora = this.ahora();
    // Una contraseña aleatoria que nadie conoce (dos tokens opacos): el docente elige la suya con el enlace.
    const aleatoria = `${this.tokens.generarTokenOpaco()}${this.tokens.generarTokenOpaco()}`;
    const cuenta = Cuenta.registrar({
      id: this.generarId(),
      nombre: entrada.nombre,
      email,
      contrasena: Contrasena.de(aleatoria),
      rol: Rol.de('DOCENTE'),
      hashContrasena: await this.hashService.hash(aleatoria),
      ahora,
    });
    await this.cuentas.guardar(cuenta);

    const codigo = this.tokens.generarTokenOpaco();
    await this.verificaciones.guardar(
      VerificacionCorreo.paraAltaPorAdministracion({ id: this.generarId(), cuentaId: cuenta.id, codigo: this.tokens.huella(codigo), ahora }),
    );
    await this.correo.enviar({
      para: email.value,
      asunto: 'Tu cuenta de docente en LectoAventura',
      texto: `Hola, ${cuenta.nombre}: la administración de LectoAventura creó tu cuenta de docente. Crea tu contraseña con este enlace (vence en 72 horas) y luego ingresa para crear tus aulas.`,
      enlace: `${this.urlWeb}/restablecer?codigo=${codigo}`,
    });
    await this.bus.publicar([crearEvento(EVENTOS_IAM.DOCENTE_DADO_DE_ALTA, cuenta.id, { actorId: entrada.adminId, rol: 'ADMIN_PLATAFORMA' }, ahora)]);
    return vista(cuenta);
  }

  async suspender(id: string, adminId: string): Promise<DocenteAdministrado> {
    const cuenta = await this.cuentaDocente(id);
    if (!cuenta.estaSuspendida()) {
      const ahora = this.ahora();
      cuenta.suspender();
      await this.cuentas.guardar(cuenta);
      // "Pierde acceso inmediato": cada petición valida su sesión, y ya no queda ninguna viva.
      await this.sesiones.revocarTodasDe(cuenta.id, ahora);
      await this.bus.publicar([crearEvento(EVENTOS_IAM.CUENTA_SUSPENDIDA, cuenta.id, { actorId: adminId, rol: 'ADMIN_PLATAFORMA' }, ahora)]);
    }
    return vista(cuenta);
  }

  async reactivar(id: string, adminId: string): Promise<DocenteAdministrado> {
    const cuenta = await this.cuentaDocente(id);
    if (cuenta.estaSuspendida()) {
      const ahora = this.ahora();
      cuenta.reactivar();
      await this.cuentas.guardar(cuenta);
      await this.bus.publicar([crearEvento(EVENTOS_IAM.CUENTA_REACTIVADA, cuenta.id, { actorId: adminId, rol: 'ADMIN_PLATAFORMA' }, ahora)]);
    }
    return vista(cuenta);
  }

  private async cuentaDocente(id: string): Promise<Cuenta> {
    const cuenta = await this.cuentas.buscarPorId(id);
    if (!cuenta || cuenta.rol.value !== 'DOCENTE') throw new NoEncontradoError('Docente');
    return cuenta;
  }
}
