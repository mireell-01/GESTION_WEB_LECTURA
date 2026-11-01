/**
 * Dobles de prueba de Administración (Módulo 12): la auditoría en memoria (con la regla de la base: no
 * se modifica y solo se borra lo de más de 2 años) y las fachadas de IAM, Escuela y Gamificación.
 */
import type { DocenteAdministrado } from '../../../src/modules/iam/public-api';
import type { AulasDeDocente, InstitucionVista } from '../../../src/modules/escuela/public-api';
import type { ParametrosVigentesVista } from '../../../src/modules/gamificacion/public-api';
import type { AuditoriaRepository } from '../../../src/modules/administracion/application/ports/auditoria.repository';
import type { GestionCuentas, GestionEscuela, GestionGamificacion } from '../../../src/modules/administracion/application/ports/plataforma.ports';
import { AuditoriaUseCase, DocentesAdminUseCase, InstitucionesAdminUseCase, ParametrosGamificacionUseCase } from '../../../src/modules/administracion/application/use-cases/plataforma.use-cases';
import { RegistrarAuditoriaUseCase } from '../../../src/modules/administracion/application/use-cases/registrar-auditoria.use-case';
import { Auditoria, AuditoriaProps } from '../../../src/modules/administracion/domain/entities/auditoria';
import { FiltroAuditoria, inicioRetencion } from '../../../src/modules/administracion/domain/services/consulta-auditoria';
import { Reloj } from '../iam/dobles';

export class AuditoriaEnMemoria implements AuditoriaRepository {
  readonly filas: AuditoriaProps[] = [];
  constructor(private readonly ahora: () => Date) {}

  async agregar(r: Auditoria) {
    this.filas.push({ ...r.propsSnapshot });
  }

  async consultar(f: FiltroAuditoria, limite: number) {
    return this.filas
      .filter(
        (r) =>
          (!f.desde || r.ocurridoEn >= f.desde) &&
          (!f.hasta || r.ocurridoEn <= f.hasta) &&
          (!f.accion || r.accion === f.accion) &&
          (!f.actorId || r.actorId === f.actorId) &&
          (!f.recursoTipo || r.recursoTipo === f.recursoTipo) &&
          (!f.recursoId || r.recursoId === f.recursoId) &&
          (!f.antesDe || r.ocurridoEn < f.antesDe.ocurridoEn || (r.ocurridoEn.getTime() === f.antesDe.ocurridoEn.getTime() && r.id < f.antesDe.id)),
      )
      .sort((a, b) => b.ocurridoEn.getTime() - a.ocurridoEn.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limite);
  }

  /** Como el trigger de la base: si alguno no superó los 2 años, no se borra nada. */
  async borrarAnterioresA(limite: Date) {
    const borrar = this.filas.filter((r) => r.ocurridoEn < limite);
    if (borrar.some((r) => r.ocurridoEn >= inicioRetencion(this.ahora()))) throw new Error('La auditoría solo admite agregar registros');
    for (const r of borrar) this.filas.splice(this.filas.indexOf(r), 1);
    return borrar.length;
  }
}

export class CuentasFalsas implements GestionCuentas {
  readonly docentes = new Map<string, DocenteAdministrado>();
  readonly adultos = new Map<string, { nombre: string; rol: string }>();
  readonly acciones: string[] = [];

  async listarDocentes(filtro: { texto?: string; estado?: DocenteAdministrado['estado'] }) {
    return [...this.docentes.values()].filter((d) => !filtro.estado || d.estado === filtro.estado);
  }
  async docente(id: string) {
    const d = this.docentes.get(id);
    if (!d) throw new Error('Docente no encontrado');
    return d;
  }
  async darDeAltaDocente(e: { nombre: string; email: string; adminId: string }) {
    const d: DocenteAdministrado = { id: `doc-${this.docentes.size + 1}`, nombre: e.nombre, email: e.email, estado: 'PENDIENTE_VERIFICACION', creadoEn: '2026-10-30T15:00:00.000Z' };
    this.docentes.set(d.id, d);
    this.acciones.push(`alta:${e.adminId}`);
    return d;
  }
  async suspenderDocente(id: string, adminId: string) {
    const d = await this.docente(id);
    d.estado = 'SUSPENDIDA';
    this.acciones.push(`suspender:${id}:${adminId}`);
    return d;
  }
  async reactivarDocente(id: string, adminId: string) {
    const d = await this.docente(id);
    d.estado = 'ACTIVA';
    this.acciones.push(`reactivar:${id}:${adminId}`);
    return d;
  }
  async actores(ids: string[]) {
    return new Map(ids.filter((id) => this.adultos.has(id)).map((id) => [id, this.adultos.get(id)!]));
  }
}

export class EscuelaFalsa implements GestionEscuela {
  readonly instituciones: InstitucionVista[] = [];
  readonly aulas = new Map<string, AulasDeDocente>();
  async listarInstituciones() {
    return this.instituciones;
  }
  async crearInstitucion(e: { nombre: string; codigoModular?: string | null; region?: string | null; adminId: string }) {
    const i: InstitucionVista = { id: `inst-${this.instituciones.length + 1}`, nombre: e.nombre, codigoModular: e.codigoModular ?? null, region: e.region ?? null, estado: 'ACTIVA', creadaEn: '2026-10-30T15:00:00.000Z', aulas: 0, docentes: 0, estudiantes: 0 };
    this.instituciones.push(i);
    return i;
  }
  async cambiarEstadoInstitucion(id: string, estado: InstitucionVista['estado']) {
    const i = this.instituciones.find((x) => x.id === id)!;
    i.estado = estado;
    return i;
  }
  async aulasDeDocentes(ids: string[]) {
    return new Map(ids.map((id) => [id, this.aulas.get(id) ?? { aulas: 0, estudiantes: 0 }]));
  }
}

export class GamificacionFalsa implements GestionGamificacion {
  readonly publicadas: { entrada: unknown; adminId: string }[] = [];
  async vigentes() {
    return { version: 1 } as ParametrosVigentesVista;
  }
  async historial() {
    return [{ version: 1, vigenteDesde: '2026-10-01T00:00:00.000Z', creadoPor: null }];
  }
  async publicar(entrada: unknown, adminId: string) {
    this.publicadas.push({ entrada, adminId });
    return { version: 2 } as ParametrosVigentesVista;
  }
}

export function crearEntornoAdministracion() {
  let secuencia = 0;
  const reloj = new Reloj(new Date('2026-10-30T15:00:00Z'));
  const auditoria = new AuditoriaEnMemoria(reloj.ahora);
  const cuentas = new CuentasFalsas();
  const escuela = new EscuelaFalsa();
  const gamificacion = new GamificacionFalsa();
  // Ids ordenables como los UUID v7 (hexadecimales crecientes).
  const generarId = () => `0192f000-0000-7000-8000-${String(++secuencia).padStart(12, '0')}`;
  return {
    reloj,
    auditoria,
    cuentas,
    escuela,
    gamificacion,
    docentes: new DocentesAdminUseCase(cuentas, escuela),
    instituciones: new InstitucionesAdminUseCase(escuela),
    parametros: new ParametrosGamificacionUseCase(gamificacion),
    consulta: new AuditoriaUseCase(auditoria, cuentas),
    registrar: new RegistrarAuditoriaUseCase(auditoria, generarId),
  };
}

export type EntornoAdministracion = ReturnType<typeof crearEntornoAdministracion>;
