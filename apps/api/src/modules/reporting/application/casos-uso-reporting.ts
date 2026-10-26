import { ReportesRepository } from './ports/reporting.ports';
import { DetalleEstudianteUseCase } from './use-cases/detalle-estudiante.use-case';
import { PanelAulaUseCase } from './use-cases/panel-aula.use-case';
import { ReporteAulaUseCase } from './use-cases/reporte-aula.use-case';
import { ResumenSemanalUseCase } from './use-cases/resumen-semanal.use-case';

/** Casos de uso de Reporting (paneles de seguimiento) que ensambla el composition root. */
export interface CasosUsoReporting {
  panel: PanelAulaUseCase;
  detalle: DetalleEstudianteUseCase;
  reporte: ReporteAulaUseCase;
  resumen: ResumenSemanalUseCase;
  /** El worker refresca las vistas cada 5 minutos (SRS §7). */
  vistas: Pick<ReportesRepository, 'refrescar'>;
}

export const CASOS_USO_REPORTING = Symbol('CASOS_USO_REPORTING');
