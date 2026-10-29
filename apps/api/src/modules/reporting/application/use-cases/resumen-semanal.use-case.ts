import { NOMBRE_HABILIDAD } from '../../../shared-kernel/public-api';
import { semanaPorResumir } from '../../domain/services/resumen-semanal';
import { PanelAula } from '../dto/reporting.dto';
import { AulasDocente, NotificadorDocente, ReportesRepository } from '../ports/reporting.ports';
import { PanelAulaUseCase } from './panel-aula.use-case';

const fechaLarga = (semana: string) =>
  new Date(`${semana}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** El párrafo de un aula en el correo: actividad de la semana, alertas y refuerzos (sin más datos del menor que su alias). */
function parrafoAula(p: PanelAula, semana: string): string {
  const s = p.resumenSemanal.anterior.semana === semana ? p.resumenSemanal.anterior : p.resumenSemanal.actual;
  const lineas = [
    `${p.aula.nombre}: ${s.estudiantesActivos} de ${s.totalEstudiantes} estudiantes leyeron; ${s.lecturasFinalizadas} lecturas terminadas (${s.minutosLectura} min).`,
  ];
  if (p.alertas.length > 0) {
    lineas.push(`  Para acompañar (${p.alertas.length}): ${p.alertas.slice(0, 10).map((a) => a.alias).join(', ')}${p.alertas.length > 10 ? '…' : ''}.`);
  }
  for (const r of p.refuerzos) {
    lineas.push(`  Refuerzo grupal sugerido: ${NOMBRE_HABILIDAD[r.habilidad].toLowerCase()} (${r.porcentaje} % del aula en inicio).`);
  }
  return lineas.join('\n');
}

/**
 * RF-065: el resumen semanal de cada docente. Desde el lunes a las 07:00 de Lima se envía el de la
 * semana anterior, una sola vez por docente y semana, con la actividad, las alertas y los refuerzos de
 * cada una de sus aulas activas. Lo invoca el worker de reportes.
 */
export class ResumenSemanalUseCase {
  constructor(
    private readonly repo: ReportesRepository,
    private readonly aulas: AulasDocente,
    private readonly panel: PanelAulaUseCase,
    private readonly notificador: NotificadorDocente,
    private readonly urlWeb: string,
    private readonly ahora: () => Date,
  ) {}

  /**
   * Devuelve a cuántas docentes se les envió. Si el correo de una falla, se libera su registro (se
   * reintenta en el próximo ciclo), se sigue con las demás y al final se informa el error.
   */
  async enviarPendientes(ahora = this.ahora()): Promise<number> {
    const semana = semanaPorResumir(ahora);
    if (!semana) return 0;
    const porDocente = new Map<string, string[]>();
    for (const a of await this.repo.aulasActivas()) porDocente.set(a.docenteId, [...(porDocente.get(a.docenteId) ?? []), a.aulaId]);

    let enviados = 0;
    const fallas: unknown[] = [];
    for (const [docenteId, aulaIds] of porDocente) {
      // Se registra antes de enviar: si dos procesos coinciden, solo uno lo envía.
      if (!(await this.repo.registrarResumen(docenteId, semana, aulaIds.length))) continue;
      try {
        if (await this.enviar(docenteId, aulaIds, semana)) enviados += 1;
      } catch (error) {
        await this.repo.liberarResumen(docenteId, semana);
        fallas.push(error);
      }
    }
    if (fallas.length) throw new Error(`No salió el resumen semanal de ${fallas.length} docente(s); se reintentará`, { cause: fallas[0] });
    return enviados;
  }

  private async enviar(docenteId: string, aulaIds: string[], semana: string): Promise<boolean> {
    const paneles: PanelAula[] = [];
    for (const id of aulaIds) {
      const aula = await this.aulas.aula(id);
      if (aula) paneles.push(await this.panel.analizar(aula));
    }
    const texto = [
      `Hola. Así les fue a tus aulas en la semana del ${fechaLarga(semana)}:`,
      '',
      ...paneles.map((p) => parrafoAula(p, semana)),
      '',
      'En el panel de cada aula verás el detalle por habilidad y podrás asignar los refuerzos con un clic.',
    ].join('\n');
    return this.notificador.notificar(docenteId, { asunto: `Resumen semanal de tus aulas (semana del ${fechaLarga(semana)})`, texto, enlace: `${this.urlWeb}/docente` });
  }
}
