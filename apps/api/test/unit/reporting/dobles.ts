/**
 * Dobles de prueba de Reporting: las vistas del schema `reporting` en memoria, el aula de Escuela, los
 * perfiles de IAM, el correo de la docente, el PDF, las fichas de Contenido y el historial de Lectura.
 */
import type {
  FichaLecturaPublicada,
  FuenteFichasLectura,
  RangoEdad,
  ResolutorHistorialLectura,
  SesionDeHistorial,
} from '../../../src/modules/shared-kernel/public-api';
import type { ReporteAula } from '../../../src/modules/reporting/application/dto/reporting.dto';
import type {
  AulaActiva,
  AulasDocente,
  DesempenoHabilidad,
  GeneradorReportePdf,
  IdentidadEstudiantes,
  NotificadorDocente,
  ReportesRepository,
} from '../../../src/modules/reporting/application/ports/reporting.ports';
import { DetalleEstudianteUseCase } from '../../../src/modules/reporting/application/use-cases/detalle-estudiante.use-case';
import { PanelAulaUseCase } from '../../../src/modules/reporting/application/use-cases/panel-aula.use-case';
import { ReporteAulaUseCase } from '../../../src/modules/reporting/application/use-cases/reporte-aula.use-case';
import { ResumenSemanalUseCase } from '../../../src/modules/reporting/application/use-cases/resumen-semanal.use-case';
import { MaestriaMedida } from '../../../src/modules/reporting/domain/services/mapa-calor';
import { ActividadSemanal } from '../../../src/modules/reporting/domain/services/resumen-semanal';
import { Reloj } from '../iam/dobles';

export class ReportesEnMemoria implements ReportesRepository {
  refresco: Date | null = new Date('2026-10-21T14:55:00Z');
  refrescos = 0;
  readonly matriculas: { aulaId: string; estudianteId: string; matriculadoEn: Date }[] = [];
  readonly medidas: (MaestriaMedida & { aulaId: string; estudianteId: string })[] = [];
  readonly desempenos = new Map<string, DesempenoHabilidad[]>();
  readonly actividad = new Map<string, Date>();
  readonly semanal: ActividadSemanal[] = [];
  readonly aulas: AulaActiva[] = [];
  readonly resumenes = new Set<string>();

  async refrescadoEn() {
    return this.refresco;
  }
  async refrescar() {
    this.refrescos += 1;
  }
  async estudiantesDeAula(aulaId: string) {
    return this.matriculas.filter((m) => m.aulaId === aulaId).map(({ estudianteId, matriculadoEn }) => ({ estudianteId, matriculadoEn }));
  }
  async maestrias(aulaId: string) {
    return this.medidas.filter((m) => m.aulaId === aulaId);
  }
  async desempeno(aulaId: string) {
    return this.desempenos.get(aulaId) ?? [];
  }
  async ultimaActividad(ids: string[]) {
    return new Map([...this.actividad].filter(([id]) => ids.includes(id)));
  }
  async actividadSemanal(ids: string[], semanas: string[]) {
    return this.semanal.filter((a) => ids.includes(a.estudianteId) && semanas.includes(a.semana));
  }
  async aulasActivas() {
    return this.aulas;
  }
  async registrarResumen(docenteId: string, semana: string) {
    const llave = `${docenteId}:${semana}`;
    if (this.resumenes.has(llave)) return false;
    this.resumenes.add(llave);
    return true;
  }
  async liberarResumen(docenteId: string, semana: string) {
    this.resumenes.delete(`${docenteId}:${semana}`);
  }

  /** Atajo: un estudiante con su maestría en las 5 habilidades (6 preguntas cada una). */
  estudiante(aulaId: string, estudianteId: string, valores: Record<string, number> | null, matriculadoEn = new Date('2026-10-01T15:00:00Z')) {
    this.matriculas.push({ aulaId, estudianteId, matriculadoEn });
    if (valores) for (const [habilidad, valor] of Object.entries(valores)) this.medidas.push({ aulaId, estudianteId, habilidad, valor, items: 6 });
  }
}

export class AulasFalsas implements AulasDocente {
  readonly aulas = new Map<string, { id: string; nombre: string; grado: string; estado: string; docenteId: string }>();
  async aula(aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a ? { id: a.id, nombre: a.nombre, grado: a.grado, estado: a.estado } : null;
  }
  async aulaDe(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? this.aula(aulaId) : null;
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { id: string; alias: string; avatar: string; rangoEdad: RangoEdad }>();
  async perfiles(ids: string[]) {
    return ids.flatMap((id) => (this.perfilesPorId.has(id) ? [this.perfilesPorId.get(id)!] : []));
  }
}

export class CorreoFalso implements NotificadorDocente {
  readonly enviados: { docenteId: string; asunto: string; texto: string; enlace?: string }[] = [];
  activo = true;
  /** Docentes a las que el servidor de correo rechaza el envío. */
  readonly fallaPara = new Set<string>();
  async notificar(docenteId: string, mensaje: { asunto: string; texto: string; enlace?: string }) {
    if (!this.activo) return false;
    if (this.fallaPara.has(docenteId)) throw new Error('SMTP no disponible');
    this.enviados.push({ docenteId, ...mensaje });
    return true;
  }
}

export class PdfFalso implements GeneradorReportePdf {
  ultimo: ReporteAula | null = null;
  async generar(r: ReporteAula) {
    this.ultimo = r;
    return new TextEncoder().encode('%PDF-falso');
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly lista: FichaLecturaPublicada[] = [];
  consultas = 0;
  async fichas(ids: string[]) {
    return this.lista.filter((f) => ids.includes(f.id));
  }
  async publicadas(rango: RangoEdad) {
    this.consultas += 1;
    return this.lista.filter((f) => f.rangoEdad === rango);
  }
}

export class HistorialFalso implements ResolutorHistorialLectura {
  readonly sesiones = new Map<string, SesionDeHistorial[]>();
  limitePedido: number | null = null;
  async historialDe(estudianteId: string, limite: number) {
    this.limitePedido = limite;
    return (this.sesiones.get(estudianteId) ?? []).slice(0, limite);
  }
}

/** Ensambla los casos de uso con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoReporting() {
  const reloj = new Reloj(new Date('2026-10-21T15:00:00Z')); // miércoles 21, 10:00 en Lima
  const repo = new ReportesEnMemoria();
  const aulas = new AulasFalsas();
  const identidad = new IdentidadFalsa();
  const fichas = new FichasFalsas();
  const historial = new HistorialFalso();
  const correo = new CorreoFalso();
  const pdf = new PdfFalso();
  const panel = new PanelAulaUseCase(repo, aulas, identidad, fichas, reloj.ahora);
  return {
    reloj,
    repo,
    aulas,
    identidad,
    fichas,
    historial,
    correo,
    pdf,
    panel,
    detalle: new DetalleEstudianteUseCase(repo, aulas, identidad, historial, reloj.ahora),
    reporte: new ReporteAulaUseCase(aulas, panel, pdf, reloj.ahora),
    resumen: new ResumenSemanalUseCase(repo, aulas, panel, correo, 'https://lectoaventura.pe', reloj.ahora),
  };
}

export type EntornoReporting = ReturnType<typeof crearEntornoReporting>;
