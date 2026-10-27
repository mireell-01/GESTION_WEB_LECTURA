import { ReportesRepository } from './ports/reporting.ports';
import { DetalleEstudianteUseCase } from './use-cases/detalle-estudiante.use-case';
import { PanelAulaUseCase } from './use-cases/panel-aula.use-case';
import { PanelHijoUseCase } from './use-cases/panel-hijo.use-case';
import { PreferenciasFamiliaUseCase } from './use-cases/preferencias-familia.use-case';
import { ReporteAulaUseCase } from './use-cases/reporte-aula.use-case';
import { ResumenFamiliarUseCase } from './use-cases/resumen-familiar.use-case';
import { ResumenSemanalUseCase } from './use-cases/resumen-semanal.use-case';

/** Casos de uso de Reporting (paneles de seguimiento) que ensambla el composition root. */
export interface CasosUsoReporting {
  /** Módulo 9: seguimiento docente. */
  panel: PanelAulaUseCase;
  detalle: DetalleEstudianteUseCase;
  reporte: ReporteAulaUseCase;
  resumen: ResumenSemanalUseCase;
  /** Módulo 10: acompañamiento familiar. */
  panelHijo: PanelHijoUseCase;
  preferencias: PreferenciasFamiliaUseCase;
  resumenFamiliar: ResumenFamiliarUseCase;
  /** El worker refresca las vistas cada 5 minutos (SRS §7). */
  vistas: Pick<ReportesRepository, 'refrescar'>;
}

export const CASOS_USO_REPORTING = Symbol('CASOS_USO_REPORTING');
