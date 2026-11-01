import type { DocenteAdministrado } from '../../../iam/public-api';
import type { InstitucionVista } from '../../../escuela/public-api';
import type { ParametrosVigentesVista, VersionParametrosVista } from '../../../gamificacion/public-api';
import { ACCIONES_AUDITADAS, AccionAuditada, etiquetaAccion } from '../../domain/services/acciones-auditadas';
import { cursorDe, filtroAuditoria, inicioRetencion, POR_PAGINA } from '../../domain/services/consulta-auditoria';
import { AuditoriaRepository } from '../ports/auditoria.repository';
import { GestionCuentas, GestionEscuela, GestionGamificacion } from '../ports/plataforma.ports';

/** Una cuenta docente con sus aulas, como la ve la administración (RF-076). */
export interface DocenteVista extends DocenteAdministrado {
  aulas: number;
  estudiantes: number;
  /** Suspendido con aulas: sus niños siguen leyendo, pero nadie cambia sus aulas. */
  aulasEnSoloLectura: boolean;
}

/**
 * RF-076: la administración da de alta, suspende y reactiva cuentas docentes. Suspender (decisión del
 * Product Owner, 30/10/2026): el docente pierde el acceso al instante y sus aulas quedan en solo
 * lectura; sus estudiantes siguen entrando y leyendo como siempre.
 */
export class DocentesAdminUseCase {
  constructor(
    private readonly cuentas: GestionCuentas,
    private readonly escuela: GestionEscuela,
  ) {}

  async listar(filtro: { texto?: string; estado?: DocenteAdministrado['estado'] }): Promise<DocenteVista[]> {
    const docentes = await this.cuentas.listarDocentes(filtro);
    const aulas = await this.escuela.aulasDeDocentes(docentes.map((d) => d.id));
    return docentes.map((d) => this.vista(d, aulas.get(d.id)));
  }

  async darDeAlta(entrada: { nombre: string; email: string }, adminId: string): Promise<DocenteVista> {
    return this.vista(await this.cuentas.darDeAltaDocente({ ...entrada, adminId }));
  }

  async suspender(id: string, adminId: string): Promise<DocenteVista> {
    return this.conAulas(await this.cuentas.suspenderDocente(id, adminId));
  }

  async reactivar(id: string, adminId: string): Promise<DocenteVista> {
    return this.conAulas(await this.cuentas.reactivarDocente(id, adminId));
  }

  private async conAulas(d: DocenteAdministrado): Promise<DocenteVista> {
    return this.vista(d, (await this.escuela.aulasDeDocentes([d.id])).get(d.id));
  }

  private vista(d: DocenteAdministrado, aulas = { aulas: 0, estudiantes: 0 }): DocenteVista {
    return { ...d, ...aulas, aulasEnSoloLectura: d.estado === 'SUSPENDIDA' && aulas.aulas > 0 };
  }
}

/** RF-076: las instituciones educativas (suspender solo la marca: ya no se elige para aulas nuevas). */
export class InstitucionesAdminUseCase {
  constructor(private readonly escuela: GestionEscuela) {}

  listar(): Promise<InstitucionVista[]> {
    return this.escuela.listarInstituciones();
  }

  crear(entrada: { nombre: string; codigoModular?: string | null; region?: string | null }, adminId: string): Promise<InstitucionVista> {
    return this.escuela.crearInstitucion({ ...entrada, adminId });
  }

  cambiarEstado(id: string, estado: InstitucionVista['estado'], adminId: string): Promise<InstitucionVista> {
    return this.escuela.cambiarEstadoInstitucion(id, estado, adminId);
  }
}

/** RF-078: los parámetros de gamificación; cada publicación es una versión nueva que aplica desde ese momento. */
export class ParametrosGamificacionUseCase {
  constructor(private readonly gamificacion: GestionGamificacion) {}

  vigentes(): Promise<ParametrosVigentesVista> {
    return this.gamificacion.vigentes();
  }

  historial(): Promise<VersionParametrosVista[]> {
    return this.gamificacion.historial();
  }

  publicar(entrada: unknown, adminId: string): Promise<ParametrosVigentesVista> {
    return this.gamificacion.publicar(entrada, adminId);
  }
}

/** Un registro de auditoría como lo ve la administración. */
export interface RegistroAuditoriaVista {
  id: string;
  ocurridoEn: string;
  accion: string;
  etiqueta: string;
  actor: { id: string | null; nombre: string | null; rol: string | null };
  recurso: { tipo: string; id: string | null };
  ip: string | null;
  datos: Record<string, unknown>;
}

export interface PaginaAuditoria {
  registros: RegistroAuditoriaVista[];
  /** Para pedir los anteriores; null si no hay más. */
  siguiente: string | null;
}

/** Datos del evento que no aportan a quien revisa (ya están en otras columnas). */
const OCULTOS = new Set(['evento', 'agregadoId', 'actorId', 'rol', 'ip']);

/**
 * RF-077: consultar la auditoría (de lo más reciente a lo más antiguo, por páginas de 50) con filtros
 * por fecha, acción, actor y recurso; y depurar lo que superó la retención de 2 años.
 */
export class AuditoriaUseCase {
  constructor(
    private readonly repo: AuditoriaRepository,
    private readonly cuentas: GestionCuentas,
  ) {}

  acciones(): { accion: AccionAuditada; etiqueta: string }[] {
    return (Object.keys(ACCIONES_AUDITADAS) as AccionAuditada[]).map((accion) => ({ accion, etiqueta: ACCIONES_AUDITADAS[accion] }));
  }

  async consultar(consulta: Parameters<typeof filtroAuditoria>[0]): Promise<PaginaAuditoria> {
    const filtro = filtroAuditoria(consulta);
    const filas = await this.repo.consultar(filtro, POR_PAGINA + 1);
    const pagina = filas.slice(0, POR_PAGINA);
    const actores = await this.cuentas.actores([...new Set(pagina.flatMap((f) => (f.actorId ? [f.actorId] : [])))]);
    return {
      registros: pagina.map((f) => {
        const actor = f.actorId ? actores.get(f.actorId) : undefined;
        return {
          id: f.id,
          ocurridoEn: f.ocurridoEn.toISOString(),
          accion: f.accion,
          etiqueta: etiquetaAccion(f.accion),
          actor: { id: f.actorId, nombre: actor?.nombre ?? null, rol: f.actorRol ?? actor?.rol ?? null },
          recurso: { tipo: f.recursoTipo, id: f.recursoId },
          ip: f.ip,
          datos: Object.fromEntries(Object.entries(f.datos).filter(([clave]) => !OCULTOS.has(clave))),
        };
      }),
      siguiente: filas.length > POR_PAGINA ? cursorDe(pagina[pagina.length - 1] as { ocurridoEn: Date; id: string }) : null,
    };
  }

  /**
   * Borra lo anterior a la retención (2 años); devuelve cuántos registros. Un día de margen: la base
   * solo deja borrar lo que superó los 2 años según su propio reloj, que puede ir algo detrás del de la API.
   */
  depurar(ahora: Date): Promise<number> {
    return this.repo.borrarAnterioresA(new Date(inicioRetencion(ahora).getTime() - 86_400_000));
  }
}
