/**
 * Dobles de prueba de IAM: implementaciones en memoria de los puertos de la capa de aplicación.
 * Permiten probar los casos de uso sin base de datos, sin criptografía lenta y con reloj controlado.
 */
import type {
  BusEventos,
  EventoDominio,
  ManejadorEvento,
  RecolectorDatosEstudiante,
  ResolutorContextoAula,
} from '../../../src/modules/shared-kernel/public-api';
import type { AlmacenExportaciones, DatosExportacion, GeneradorPdfExportacion } from '../../../src/modules/iam/application/ports/exportaciones';
import { Exportacion, FormatoExportacion } from '../../../src/modules/iam/domain/entities/exportacion';
import { HmacFirmador } from '../../../src/modules/iam/infrastructure/crypto/hmac-firmador';
import type { ConsentimientoRepository } from '../../../src/modules/iam/application/ports/consentimiento.repository';
import type { ContrasenasFiltradasRepository } from '../../../src/modules/iam/application/ports/contrasenas-filtradas.repository';
import type { CorreoService } from '../../../src/modules/iam/application/ports/correo.service';
import type { CuentaRepository } from '../../../src/modules/iam/application/ports/cuenta.repository';
import type { DispositivoRepository } from '../../../src/modules/iam/application/ports/dispositivo.repository';
import type { HashService } from '../../../src/modules/iam/application/ports/hash.service';
import type { PerfilEstudianteRepository } from '../../../src/modules/iam/application/ports/perfil-estudiante.repository';
import type { SesionRepository } from '../../../src/modules/iam/application/ports/sesion.repository';
import type { DatosAccessToken, TokenService } from '../../../src/modules/iam/application/ports/token.service';
import type { TotpService } from '../../../src/modules/iam/application/ports/totp.service';
import type { VerificacionRepository } from '../../../src/modules/iam/application/ports/verificacion.repository';
import { EmisorSesiones } from '../../../src/modules/iam/application/services/emisor-sesiones';
import { Consentimiento } from '../../../src/modules/iam/domain/entities/consentimiento';
import { Cuenta } from '../../../src/modules/iam/domain/entities/cuenta';
import { DispositivoFamiliar } from '../../../src/modules/iam/domain/entities/dispositivo-familiar';
import { PerfilEstudiante } from '../../../src/modules/iam/domain/entities/perfil-estudiante';
import { Sesion } from '../../../src/modules/iam/domain/entities/sesion';
import { TipoVerificacion, VerificacionCorreo } from '../../../src/modules/iam/domain/entities/verificacion-correo';
import { AnioMesNacimiento } from '../../../src/modules/iam/domain/value-objects/anio-mes-nacimiento';
import { Contrasena } from '../../../src/modules/iam/domain/value-objects/contrasena';
import { Email } from '../../../src/modules/iam/domain/value-objects/email';
import { Rol, RolValor } from '../../../src/modules/iam/domain/value-objects/rol';

export class CuentasEnMemoria implements CuentaRepository {
  readonly filas = new Map<string, Cuenta>();
  async guardar(c: Cuenta) { this.filas.set(c.id, c); }
  async buscarPorId(id: string) { return this.filas.get(id) ?? null; }
  async buscarPorEmail(email: string) { return [...this.filas.values()].find((c) => c.email.value === email) ?? null; }
  async existeEmail(email: string) { return !!(await this.buscarPorEmail(email)); }
  async listar() { return [...this.filas.values()]; }
}

export class PerfilesEnMemoria implements PerfilEstudianteRepository {
  readonly filas = new Map<string, PerfilEstudiante>();
  async guardar(p: PerfilEstudiante) { this.filas.set(p.id, p); }
  async buscarPorId(id: string) { return this.filas.get(id) ?? null; }
  async buscarPorIds(ids: string[]) { return ids.map((id) => this.filas.get(id)).filter((p): p is PerfilEstudiante => !!p); }
  async listarPorResponsable(cuentaId: string) {
    return [...this.filas.values()].filter((p) => p.cuentaResponsableId === cuentaId && !p.propsSnapshot.eliminadoEn);
  }
}

export class ConsentimientosEnMemoria implements ConsentimientoRepository {
  readonly filas = new Map<string, Consentimiento>();
  async guardar(c: Consentimiento) { this.filas.set(c.id, c); }
  async buscarParentalVigente(cuentaId: string) {
    return [...this.filas.values()].find((c) => c.cuentaResponsableId === cuentaId && c.tipo === 'PARENTAL' && c.vigente) ?? null;
  }
  async buscarInstitucionalVigente(cuentaId: string, aulaId: string) {
    return [...this.filas.values()].find((c) => c.cuentaResponsableId === cuentaId && c.tipo === 'INSTITUCIONAL' && c.aulaId === aulaId && c.vigente) ?? null;
  }
  async listarPorIds(ids: string[]) { return ids.map((id) => this.filas.get(id)).filter((c): c is Consentimiento => !!c); }
}

export class VerificacionesEnMemoria implements VerificacionRepository {
  readonly filas = new Map<string, VerificacionCorreo>();
  async guardar(v: VerificacionCorreo) { this.filas.set(v.id, v); }
  async buscarPorCodigo(codigo: string, tipo: TipoVerificacion) {
    return [...this.filas.values()].find((v) => v.codigo.value === codigo && v.tipo === tipo) ?? null;
  }
}

export class SesionesEnMemoria implements SesionRepository {
  readonly filas = new Map<string, Sesion>();
  readonly refreshUsados = new Map<string, string>();
  async guardar(s: Sesion) { this.filas.set(s.id, s); }
  async buscarPorId(id: string) { return this.filas.get(id) ?? null; }
  async buscarPorHashRefreshToken(hash: string) { return [...this.filas.values()].find((s) => s.hashRefreshToken === hash) ?? null; }
  async revocarTodasDe(sujetoId: string, ahora: Date) {
    for (const s of this.filas.values()) if (s.sujetoId === sujetoId) s.revocar(ahora);
  }
  async registrarRefreshUsado(hash: string, sesionId: string) { this.refreshUsados.set(hash, sesionId); }
  async sesionDeRefreshUsado(hash: string) { return this.refreshUsados.get(hash) ?? null; }
}

/** Aulas y matrículas simuladas (las aporta Escuela en la aplicación real). */
export class ContextoAulaFalso implements ResolutorContextoAula {
  readonly aulas = new Map<string, { aulaId: string; nombre: string; activa: boolean }>();
  readonly matriculas = new Map<string, Set<string>>();
  agregarAula(codigo: string, aulaId: string, estudiantes: string[] = [], activa = true) {
    this.aulas.set(codigo, { aulaId, nombre: `Aula ${codigo}`, activa });
    this.matriculas.set(aulaId, new Set(estudiantes));
  }
  async aulaActivaPorCodigo(codigo: string) {
    const aula = this.aulas.get(codigo);
    return aula && aula.activa ? { aulaId: aula.aulaId, nombre: aula.nombre } : null;
  }
  async estudiantesActivos(aulaId: string) { return [...(this.matriculas.get(aulaId) ?? [])]; }
  async estaMatriculado(aulaId: string, estudianteId: string) { return this.matriculas.get(aulaId)?.has(estudianteId) ?? false; }
}

export class ExportacionesEnMemoria implements AlmacenExportaciones {
  readonly filas = new Map<string, { exportacion: Exportacion; archivos: Record<FormatoExportacion, Buffer> }>();
  async guardar(exportacion: Exportacion, archivos: Record<FormatoExportacion, Buffer>) {
    this.filas.set(exportacion.id, { exportacion, archivos });
  }
  async buscar(id: string) { return this.filas.get(id)?.exportacion ?? null; }
  async archivo(id: string, formato: FormatoExportacion) { return this.filas.get(id)?.archivos[formato] ?? null; }
  async eliminarVencidas(ahora: Date) {
    let n = 0;
    for (const [id, f] of this.filas) if (!f.exportacion.estaVigente(ahora)) { this.filas.delete(id); n++; }
    return n;
  }
}

/** PDF simulado: la generación real con pdf-lib se prueba aparte. */
export class PdfFalso implements GeneradorPdfExportacion {
  readonly recibidos: DatosExportacion[] = [];
  async generar(datos: DatosExportacion) { this.recibidos.push(datos); return Buffer.from('%PDF-falso'); }
}

export class DispositivosEnMemoria implements DispositivoRepository {
  readonly filas = new Map<string, DispositivoFamiliar>();
  async guardar(d: DispositivoFamiliar) { this.filas.set(d.id, d); }
  async buscarPorHashToken(hash: string) {
    return [...this.filas.values()].find((d) => d.propsSnapshot.hashToken === hash) ?? null;
  }
}

/** Hash determinista y rápido (el real es argon2, probado aparte). */
export class HashFalso implements HashService {
  async hash(plano: string) { return `hash:${plano}`; }
  async verificar(plano: string, hash: string) { return hash === `hash:${plano}`; }
}

/** Tokens legibles: el access token es JSON y los opacos son secuenciales. */
export class TokensFalsos implements TokenService {
  private contador = 0;
  emitirAccessToken(datos: DatosAccessToken) { return `access:${JSON.stringify(datos)}`; }
  verificarAccessToken(token: string) {
    return token.startsWith('access:') ? (JSON.parse(token.slice(7)) as DatosAccessToken) : null;
  }
  generarTokenOpaco() { return `opaco-${++this.contador}`; }
  huella(token: string) { return `huella(${token})`; }
}

export class TotpFalso implements TotpService {
  codigoValido = '123456';
  generarSecreto() { return 'SECRETO-TOTP'; }
  urlConfiguracion(email: string, secreto: string) { return `otpauth://totp/LectoAventura:${email}?secret=${secreto}`; }
  verificar(_secreto: string, codigo: string) { return codigo === this.codigoValido; }
}

export class CorreoEspia implements CorreoService {
  readonly enviados: Parameters<CorreoService['enviar']>[0][] = [];
  async enviar(m: Parameters<CorreoService['enviar']>[0]) { this.enviados.push(m); }
}

export class FiltradasFalsas implements ContrasenasFiltradasRepository {
  async estaFiltrada(c: string) { return c === 'contrasena-filtrada'; }
}

export class BusEspia implements BusEventos {
  readonly publicados: EventoDominio<object>[] = [];
  async publicar(eventos: EventoDominio<object>[]) { this.publicados.push(...eventos); }
  suscribir<T extends object>(_n: string, _m: ManejadorEvento<T>) {}
  nombres() { return this.publicados.map((e) => e.nombreEvento); }
}

export class RecolectorFalso implements RecolectorDatosEstudiante {
  registrar() {}
  async recolectar() { return { progreso: { lecturas: 3 } }; }
}

/** Reloj controlable para probar vencimientos (inactividad, bloqueos, enlaces). */
export class Reloj {
  constructor(public actual = new Date('2026-10-15T15:00:00Z')) {}
  readonly ahora = () => new Date(this.actual);
  avanzarMin(min: number) { this.actual = new Date(this.actual.getTime() + min * 60_000); }
}

/** Ensambla todos los dobles; cada prueba crea su propio entorno limpio. */
export function crearEntorno() {
  let secuencia = 0;
  const reloj = new Reloj();
  const generarId = () => `id-${++secuencia}`;
  const sesiones = new SesionesEnMemoria();
  const tokens = new TokensFalsos();
  return {
    reloj,
    generarId,
    cuentas: new CuentasEnMemoria(),
    perfiles: new PerfilesEnMemoria(),
    consentimientos: new ConsentimientosEnMemoria(),
    verificaciones: new VerificacionesEnMemoria(),
    sesiones,
    dispositivos: new DispositivosEnMemoria(),
    hash: new HashFalso(),
    tokens,
    totp: new TotpFalso(),
    correo: new CorreoEspia(),
    filtradas: new FiltradasFalsas(),
    bus: new BusEspia(),
    recolector: new RecolectorFalso(),
    contextoAula: new ContextoAulaFalso(),
    exportaciones: new ExportacionesEnMemoria(),
    pdf: new PdfFalso(),
    firmador: new HmacFirmador('secreto-de-pruebas-unitarias-con-mas-de-32-caracteres', 'exportaciones'),
    emisor: new EmisorSesiones(sesiones, tokens, generarId, reloj.ahora),
  };
}

export type Entorno = ReturnType<typeof crearEntorno>;

/** Crea y guarda una cuenta adulta ya verificada (estado ACTIVA). */
export async function cuentaActiva(
  e: Entorno,
  datos: { id?: string; email?: string; rol?: RolValor; contrasena?: string; verificada?: boolean } = {},
): Promise<Cuenta> {
  const contrasena = datos.contrasena ?? 'Lectura-Segura-2026';
  const cuenta = Cuenta.registrar({
    id: datos.id ?? e.generarId(),
    nombre: 'Ana Ríos',
    email: Email.de(datos.email ?? `ana.${e.generarId()}@lectoaventura.test`),
    contrasena: Contrasena.de(contrasena),
    rol: Rol.de(datos.rol ?? 'FAMILIAR'),
    hashContrasena: await e.hash.hash(contrasena),
    ahora: e.reloj.ahora(),
  });
  if (datos.verificada !== false) cuenta.verificar();
  await e.cuentas.guardar(cuenta);
  return cuenta;
}

export async function consentimientoParental(e: Entorno, cuentaId: string): Promise<Consentimiento> {
  const c = Consentimiento.otorgar({
    id: e.generarId(),
    cuentaResponsableId: cuentaId,
    tipo: 'PARENTAL',
    versionPolitica: '2026-09',
    otorganteNombre: 'Ana Ríos',
    medio: 'DIGITAL',
    ahora: e.reloj.ahora(),
  });
  await e.consentimientos.guardar(c);
  return c;
}

export async function perfilEstudiante(
  e: Entorno,
  cuentaId: string,
  datos: { alias?: string; avatar?: string; pin?: string; consentimientoId?: string } = {},
): Promise<PerfilEstudiante> {
  const p = PerfilEstudiante.crear({
    id: e.generarId(),
    cuentaResponsableId: cuentaId,
    consentimientoId: datos.consentimientoId ?? 'consentimiento-x',
    alias: datos.alias ?? 'Lucía',
    anioMesNacimiento: AnioMesNacimiento.de(2018, 5, e.reloj.ahora()),
    avatar: datos.avatar ?? 'zorro',
    hashPin: await e.hash.hash(datos.pin ?? '2580'),
    ahora: e.reloj.ahora(),
  });
  await e.perfiles.guardar(p);
  return p;
}
