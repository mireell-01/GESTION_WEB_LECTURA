import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { Cuenta } from '../../domain/entities/cuenta';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { PoliticaRutas } from '../../domain/services/politica-rutas';
import { Email } from '../../domain/value-objects/email';
import { Rol } from '../../domain/value-objects/rol';
import { GeneradorId, Reloj, SesionEmitida } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { FirmadorEnlaces } from '../ports/exportaciones';
import { HashService } from '../ports/hash.service';
import { IdentidadGoogle, ProveedorGoogle } from '../ports/proveedor-google';
import { TokenService } from '../ports/token.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

export type IntencionGoogle = 'INGRESAR' | 'REGISTRAR' | 'VINCULAR';

/** Por qué no se pudo completar: la web lo muestra con palabras simples (`?google=<codigo>`). */
export type CodigoGoogle =
  | 'no-disponible'
  | 'cancelado'
  | 'vencido'
  | 'correo-no-verificado'
  | 'sin-cuenta'
  | 'no-permitido'
  | 'suspendida'
  | 'ya-vinculada'
  | 'error';

/** Lo que viaja en la cookie firmada mientras la persona está en Google (10 minutos como máximo). */
interface Flujo {
  state: string;
  nonce: string;
  verificador: string;
  intencion: IntencionGoogle;
  rol?: 'DOCENTE' | 'FAMILIAR';
  cuentaId?: string;
  expira: number;
}

const VIGENCIA_FLUJO_MS = 10 * 60_000;
const ROLES_REGISTRO = new Set(['DOCENTE', 'FAMILIAR']);

/**
 * Use Case: IngresoConGoogle — docentes y familias ingresan, se registran o vinculan su cuenta con Google
 * (OpenID Connect con PKCE). Los niños siguen entrando con avatar y PIN (RN-02: identidad mínima) y el equipo
 * de contenidos y la administración, con contraseña y MFA (RF-011).
 *
 * - Ingresar: la cuenta vinculada a esa cuenta de Google; si no hay, la de ese correo (Google lo verificó),
 *   que queda vinculada. Sin cuenta, se invita a registrarse.
 * - Registrar: lo mismo; si no hay cuenta, la crea ACTIVA con el rol elegido (docente o familiar).
 * - Vincular: una persona que ya ingresó vincula su cuenta de Google desde su panel.
 * Nunca se sigue si Google no verificó el correo, si la cuenta está suspendida o si usa verificación en dos pasos.
 */
export class IngresoGoogleUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly hash: HashService,
    private readonly tokens: TokenService,
    private readonly firmador: FirmadorEnlaces,
    private readonly emisor: EmisorSesiones,
    private readonly bus: BusEventos,
    private readonly proveedor: ProveedorGoogle | null,
    private readonly urlWeb: string,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  disponible(): { disponible: boolean; simulado: boolean } {
    return { disponible: this.proveedor !== null, simulado: this.proveedor?.modo === 'SIMULADO' };
  }

  /** Arma el viaje a Google: la URL y la cookie firmada con lo necesario para volver (state, nonce y PKCE). */
  iniciar(p: { intencion: IntencionGoogle; rol?: string; cuentaId?: string; pista?: string }): { url: string; cookie: string } | { destino: string } {
    if (!this.proveedor) return { destino: this.destinoError('no-disponible', p.intencion) };
    if (p.intencion === 'REGISTRAR' && !ROLES_REGISTRO.has(p.rol ?? '')) return { destino: this.destinoError('no-permitido', 'REGISTRAR') };
    if (p.intencion === 'VINCULAR' && !p.cuentaId) return { destino: this.destinoError('error', 'INGRESAR') };
    const flujo: Flujo = {
      state: this.tokens.generarTokenOpaco(),
      nonce: this.tokens.generarTokenOpaco(),
      verificador: this.tokens.generarTokenOpaco(),
      intencion: p.intencion,
      ...(p.intencion === 'REGISTRAR' ? { rol: p.rol as 'DOCENTE' | 'FAMILIAR' } : {}),
      ...(p.cuentaId ? { cuentaId: p.cuentaId } : {}),
      expira: this.ahora().getTime() + VIGENCIA_FLUJO_MS,
    };
    const datos = Buffer.from(JSON.stringify(flujo)).toString('base64url');
    const pista = p.pista?.trim();
    return {
      url: this.proveedor.urlAutorizacion({ state: flujo.state, nonce: flujo.nonce, codeVerifier: flujo.verificador, ...(pista ? { pista } : {}) }),
      cookie: `${datos}.${this.firmador.firmar(datos)}`,
    };
  }

  /**
   * La vuelta de Google: valida la cookie y el state, canjea el código y resuelve la cuenta. Siempre devuelve a
   * dónde ir; con `sesion`, la persona queda dentro (la cookie de refresh la deja el controlador).
   */
  async completar(p: { cookie?: string; state?: string; codigo?: string; errorProveedor?: string }): Promise<{ destino: string; sesion?: SesionEmitida }> {
    const flujo = this.leerFlujo(p.cookie);
    if (!flujo) return { destino: this.destinoError('vencido', 'INGRESAR') };
    const error = (codigo: CodigoGoogle, rol?: string) => ({ destino: this.destinoError(codigo, flujo.intencion, rol) });
    if (!this.proveedor) return error('no-disponible');
    if (p.errorProveedor) return error('cancelado');
    if (!p.state || p.state !== flujo.state || !p.codigo) return error('vencido');

    let identidad: IdentidadGoogle;
    try {
      identidad = await this.proveedor.canjearCodigo({ codigo: p.codigo, codeVerifier: flujo.verificador, nonce: flujo.nonce });
    } catch {
      return error('error');
    }
    if (!identidad.emailVerificado) return error('correo-no-verificado');

    if (flujo.intencion === 'VINCULAR') {
      const cuenta = flujo.cuentaId ? await this.cuentas.buscarPorId(flujo.cuentaId) : null;
      if (!cuenta) return error('error');
      const otra = await this.cuentas.buscarPorGoogleSub(identidad.sub);
      if (otra && otra.id !== cuenta.id) return error('ya-vinculada', cuenta.rol.value);
      if (cuenta.estaSuspendida()) return error('suspendida', cuenta.rol.value);
      if (!cuenta.puedeUsarGoogle()) return error('no-permitido', cuenta.rol.value);
      await this.vincular(cuenta, identidad.sub);
      return { destino: `${this.urlWeb}${PoliticaRutas.rutaInicial(cuenta.rol.value)}?google=vinculada` };
    }

    let cuenta = await this.cuentas.buscarPorGoogleSub(identidad.sub);
    if (!cuenta) {
      let email: Email;
      try {
        email = Email.de(identidad.email);
      } catch {
        return error('error');
      }
      const porCorreo = await this.cuentas.buscarPorEmail(email.value);
      if (porCorreo) {
        if (porCorreo.estaSuspendida()) return error('suspendida');
        if (!porCorreo.puedeUsarGoogle()) return error('no-permitido');
        // Google verificó que el correo es suyo: la cuenta de ese correo queda vinculada (y verificada).
        await this.vincular(porCorreo, identidad.sub);
        cuenta = porCorreo;
      } else if (flujo.intencion === 'REGISTRAR' && flujo.rol) {
        cuenta = await this.registrar(identidad, email, flujo.rol);
      } else {
        return error('sin-cuenta');
      }
    }
    if (cuenta.estaSuspendida()) return error('suspendida');
    if (!cuenta.puedeUsarGoogle()) return error('no-permitido');

    const sesion = await this.emisor.abrir({ sujetoId: cuenta.id, rol: cuenta.rol.value, mfa: false });
    return { destino: `${this.urlWeb}${sesion.rutaInicial}`, sesion };
  }

  /** Desde su panel: deja de ingresar con Google (sigue pudiendo entrar con su contraseña). */
  async desvincular(cuentaId: string): Promise<{ vinculada: false }> {
    const cuenta = await this.cuentas.buscarPorId(cuentaId);
    if (cuenta?.googleSub) {
      cuenta.desvincularGoogle();
      await this.cuentas.guardar(cuenta);
      await this.bus.publicar([crearEvento(EVENTOS_IAM.GOOGLE_DESVINCULADA, cuenta.id, { actorId: cuenta.id }, this.ahora())]);
    }
    return { vinculada: false };
  }

  async estado(cuentaId: string): Promise<{ disponible: boolean; simulado: boolean; vinculada: boolean; puedeUsar: boolean }> {
    const cuenta = await this.cuentas.buscarPorId(cuentaId);
    return { ...this.disponible(), vinculada: !!cuenta?.googleSub, puedeUsar: !!cuenta?.puedeUsarGoogle() };
  }

  private async vincular(cuenta: Cuenta, sub: string): Promise<void> {
    cuenta.vincularGoogle(sub);
    await this.cuentas.guardar(cuenta);
    await this.bus.publicar([crearEvento(EVENTOS_IAM.GOOGLE_VINCULADA, cuenta.id, { actorId: cuenta.id }, this.ahora())]);
  }

  private async registrar(identidad: IdentidadGoogle, email: Email, rol: 'DOCENTE' | 'FAMILIAR'): Promise<Cuenta> {
    const ahora = this.ahora();
    const cuenta = Cuenta.registrarConGoogle({
      id: this.generarId(),
      nombre: identidad.nombre?.trim() || email.value.split('@')[0] || 'Persona',
      email,
      rol: Rol.de(rol),
      // Una contraseña al azar que nadie conoce: si quiere usar contraseña, la crea con "¿Olvidaste tu contraseña?".
      hashContrasena: await this.hash.hash(this.tokens.generarTokenOpaco()),
      googleSub: identidad.sub,
      ahora,
    });
    await this.cuentas.guardar(cuenta);
    await this.bus.publicar([crearEvento(EVENTOS_IAM.CUENTA_CREADA, cuenta.id, { actorId: cuenta.id, rol, via: 'GOOGLE' }, ahora)]);
    return cuenta;
  }

  /** La cookie del viaje: firmada por la API, sin vencer y con los datos completos; si no, no vale. */
  private leerFlujo(cookie?: string): Flujo | null {
    const [datos, firma] = (cookie ?? '').split('.');
    if (!datos || !firma || !this.firmador.verificar(datos, firma)) return null;
    try {
      const flujo = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as Flujo;
      if (typeof flujo.expira !== 'number' || flujo.expira < this.ahora().getTime()) return null;
      if (!flujo.state || !flujo.nonce || !flujo.verificador) return null;
      return flujo;
    } catch {
      return null;
    }
  }

  /** Vuelve a donde empezó: vincular, a su panel; registrar, al registro; ingresar, al ingreso. */
  private destinoError(codigo: CodigoGoogle, intencion: IntencionGoogle, rol?: string): string {
    const pagina = intencion === 'VINCULAR' && rol ? PoliticaRutas.rutaInicial(rol) : intencion === 'REGISTRAR' ? '/registro' : '/ingresar';
    return `${this.urlWeb}${pagina}?google=${codigo}`;
  }
}
