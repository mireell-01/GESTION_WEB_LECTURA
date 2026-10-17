/**
 * Dobles de prueba de Escuela: implementaciones en memoria de los puertos de la capa de aplicación,
 * con reloj controlado y un IAM simulado (Escuela solo lo conoce por su puerto anticorrupción).
 */
import type {
  CatalogoAsignable,
  ContenidoAsignable,
  ErrorDeNegocio,
  TipoAsignable,
} from '../../../src/modules/shared-kernel/public-api';
import type { TarjetaAcceso } from '../../../src/modules/escuela/application/dto/escuela.dto';
import type { AsignacionRepository } from '../../../src/modules/escuela/application/ports/asignacion.repository';
import type { AulaRepository } from '../../../src/modules/escuela/application/ports/aula.repository';
import type { GeneradorTarjetasPdf } from '../../../src/modules/escuela/application/ports/generador-tarjetas';
import type { InvitacionRepository } from '../../../src/modules/escuela/application/ports/invitacion.repository';
import type { MatriculaRepository } from '../../../src/modules/escuela/application/ports/matricula.repository';
import type { EstudianteIdentidad, ServicioIdentidad } from '../../../src/modules/escuela/application/ports/servicio-identidad';
import { Asignacion } from '../../../src/modules/escuela/domain/entities/asignacion';
import { Aula } from '../../../src/modules/escuela/domain/entities/aula';
import { InvitacionFamiliar, InvitacionFamiliarProps } from '../../../src/modules/escuela/domain/entities/invitacion-familiar';
import { Matricula } from '../../../src/modules/escuela/domain/entities/matricula';
import { CodigoAula } from '../../../src/modules/escuela/domain/value-objects/codigo-aula';
import { BusEspia, Reloj } from '../iam/dobles';

export class AulasEnMemoria implements AulaRepository {
  readonly filas = new Map<string, Aula>();
  async guardar(a: Aula) { this.filas.set(a.id, a); }
  async buscarPorId(id: string) { return this.filas.get(id) ?? null; }
  async existeCodigo(codigo: string) { return [...this.filas.values()].some((a) => a.codigo.value === codigo); }
  async listarPorDocente(docenteId: string) { return [...this.filas.values()].filter((a) => a.docenteId === docenteId); }
  async buscarPorIds(ids: string[]) { return ids.map((id) => this.filas.get(id)).filter((a): a is Aula => !!a); }
}

export class MatriculasEnMemoria implements MatriculaRepository {
  readonly filas: Matricula[] = [];
  async guardar(m: Matricula) {
    const i = this.filas.findIndex((f) => f.aulaId === m.aulaId && f.estudianteId === m.estudianteId);
    if (i >= 0) this.filas[i] = m;
    else this.filas.push(m);
  }
  async buscar(aulaId: string, estudianteId: string) {
    return this.filas.find((m) => m.aulaId === aulaId && m.estudianteId === estudianteId) ?? null;
  }
  async listarActivasPorAula(aulaId: string) { return this.filas.filter((m) => m.aulaId === aulaId && m.activa); }
  async listarPorEstudiante(estudianteId: string) { return this.filas.filter((m) => m.estudianteId === estudianteId); }
  async contarActivasPorAulas(aulaIds: string[]) {
    return Object.fromEntries(aulaIds.map((id) => [id, this.filas.filter((m) => m.aulaId === id && m.activa).length]));
  }
}

export class AsignacionesEnMemoria implements AsignacionRepository {
  readonly filas = new Map<string, Asignacion>();
  guardadas = 0;
  async guardar(a: Asignacion) { this.filas.set(a.id, a); this.guardadas++; }
  async buscarPorId(id: string) { return this.filas.get(id) ?? null; }
  async listarPorAulas(aulaIds: string[]) { return [...this.filas.values()].filter((a) => aulaIds.includes(a.aulaId)); }
}

/** Guarda copias de las filas, como una base real: cada lectura devuelve un objeto nuevo. */
export class InvitacionesEnMemoria implements InvitacionRepository {
  readonly filas = new Map<string, InvitacionFamiliarProps>();
  async guardar(i: InvitacionFamiliar) { this.filas.set(i.id, { ...i.propsSnapshot }); }
  async buscarPorHash(hash: string) {
    const f = [...this.filas.values()].find((p) => p.hashCodigo === hash);
    return f ? InvitacionFamiliar.desdePersistencia({ ...f }) : null;
  }
  async existeHash(hash: string) { return [...this.filas.values()].some((p) => p.hashCodigo === hash); }
  async contarVigentesDeEstudiante(estudianteId: string, ahora: Date) {
    return [...this.filas.values()].filter((p) => p.estudianteId === estudianteId && !p.usadaEn && ahora < p.expiraEn).length;
  }
  async reclamar(i: InvitacionFamiliar) {
    const actual = this.filas.get(i.id);
    if (!actual || actual.usadaEn) return false;
    this.filas.set(i.id, { ...i.propsSnapshot });
    return true;
  }
  async liberar(i: InvitacionFamiliar) {
    const actual = this.filas.get(i.id);
    if (actual) this.filas.set(i.id, { ...actual, usadaEn: null, cuentaFamiliarId: null });
  }
}

/** IAM simulado: perfiles, consentimientos, PIN y vínculos familiares. */
export class IdentidadFalsa implements ServicioIdentidad {
  readonly perfiles = new Map<string, EstudianteIdentidad & { pin: string; anioNacimiento: number }>();
  readonly consentimientos: { docenteId: string; aulaId: string; otorganteNombre: string }[] = [];
  readonly vinculos: { perfilId: string; cuentaFamiliarId: string }[] = [];
  /** Si se define, validar y vincular lanzan este error (p. ej. familia completa). */
  errorAlVincular: ErrorDeNegocio | null = null;
  /** Alias rechazados por IAM (p. ej. edad fuera de rango). */
  readonly rechazar = new Map<string, ErrorDeNegocio>();
  private secuencia = 0;

  async registrarConsentimientoInstitucional(p: { docenteId: string; aulaId: string; otorganteNombre: string }) {
    this.consentimientos.push(p);
  }
  async crearPerfilEnAula(p: { alias: string; avatar: string; pin: string; anioNacimiento: number }) {
    const error = this.rechazar.get(p.alias);
    if (error) throw error;
    const id = `est-${++this.secuencia}`;
    const perfil = { id, alias: p.alias.trim(), avatar: p.avatar, rangoEdad: 'R2' as const, activo: true, bloqueado: false, pin: p.pin, anioNacimiento: p.anioNacimiento };
    this.perfiles.set(id, perfil);
    return perfil;
  }
  async estudiantes(ids: string[]) {
    return ids
      .map((id) => this.perfiles.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ ...p, familiaresVinculados: this.vinculos.filter((v) => v.perfilId === p.id).length }));
  }
  async restablecerPin(p: { perfilId: string; pinNuevo: string }) {
    const perfil = this.perfiles.get(p.perfilId);
    if (perfil) perfil.pin = p.pinNuevo;
  }
  avatares() { return ['zorro', 'panda', 'leon', 'rana'] as const; }
  async validarVinculoFamiliar() {
    if (this.errorAlVincular) throw this.errorAlVincular;
  }
  async vincularFamiliar(p: { perfilId: string; cuentaFamiliarId: string }) {
    if (this.errorAlVincular) throw this.errorAlVincular;
    this.vinculos.push(p);
  }
}

export class CatalogoFalso implements CatalogoAsignable {
  readonly contenidos: ContenidoAsignable[] = [
    { id: 'lectura-1', tipo: 'LECTURA', titulo: 'El zorro y la luna', detalle: '8–9 años · nivel 2' },
    { id: 'lectura-2', tipo: 'LECTURA', titulo: 'Rimas del río', detalle: '6–7 años · nivel 1' },
    { id: 'mision-1', tipo: 'MISION', titulo: 'El mapa perdido', detalle: 'Mundo 1 · Explorador' },
  ];
  async listar() { return this.contenidos; }
  async buscar(tipo: TipoAsignable, id: string) { return this.contenidos.find((c) => c.tipo === tipo && c.id === id) ?? null; }
}

export class TarjetasEspia implements GeneradorTarjetasPdf {
  readonly hojas: { nombreAula: string; tarjetas: TarjetaAcceso[] }[] = [];
  async generar(datos: { nombreAula: string; tarjetas: TarjetaAcceso[] }) {
    this.hojas.push(datos);
    return Buffer.from('%PDF-falso');
  }
}

/** Ensambla todos los dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoEscuela() {
  let secuencia = 0;
  let aleatorios: number[] = [];
  const reloj = new Reloj(new Date('2026-10-15T15:00:00Z')); // jueves 15 de octubre, 10:00 en Lima
  return {
    reloj,
    generarId: () => `id-${++secuencia}`,
    /** Fuente "aleatoria" controlable: usa la cola si hay valores; si no, un ciclo determinista. */
    aleatorio: (n: number) => (aleatorios.length ? (aleatorios.shift() as number) : secuencia++ % n),
    encolarAleatorios: (valores: number[]) => { aleatorios = [...aleatorios, ...valores]; },
    huella: (texto: string) => `huella(${texto})`,
    aulas: new AulasEnMemoria(),
    matriculas: new MatriculasEnMemoria(),
    asignaciones: new AsignacionesEnMemoria(),
    invitaciones: new InvitacionesEnMemoria(),
    identidad: new IdentidadFalsa(),
    catalogo: new CatalogoFalso(),
    tarjetas: new TarjetasEspia(),
    bus: new BusEspia(),
  };
}

export type EntornoEscuela = ReturnType<typeof crearEntornoEscuela>;

/** Aula activa de una docente, ya guardada. */
export async function aulaDe(e: EntornoEscuela, docenteId: string, datos: { id?: string; nombre?: string } = {}): Promise<Aula> {
  const aula = Aula.crear({
    id: datos.id ?? e.generarId(),
    docenteId,
    nombre: datos.nombre ?? '3.° B',
    grado: '3',
    anioLectivo: 2026,
    institucion: 'IE 1234 Santa Rosa',
    codigo: CodigoAula.desdePersistencia(`ABC${String(e.aulas.filas.size).padStart(3, '2')}`),
    ahora: e.reloj.ahora(),
  });
  await e.aulas.guardar(aula);
  return aula;
}

/** Estudiante con perfil en IAM y matrícula activa en el aula. */
export async function estudianteEn(e: EntornoEscuela, aula: Aula, alias = 'Mateo', avatar = 'leon'): Promise<string> {
  const perfil = await e.identidad.crearPerfilEnAula({ alias, avatar, pin: '4826', anioNacimiento: 2017 });
  await e.matriculas.guardar(Matricula.crear({ id: e.generarId(), aulaId: aula.id, estudianteId: perfil.id, ahora: e.reloj.ahora() }));
  return perfil.id;
}
