import { Provider } from '@nestjs/common';

import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import {
  FICHAS_LECTURA,
  FuenteFichasLectura,
  HISTORIAL_LECTURA,
  PrismaService,
  ResolutorHistorialLectura,
} from '../../shared-kernel/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../application/casos-uso-reporting';
import { DetalleEstudianteUseCase } from '../application/use-cases/detalle-estudiante.use-case';
import { PanelAulaUseCase } from '../application/use-cases/panel-aula.use-case';
import { ReporteAulaUseCase } from '../application/use-cases/reporte-aula.use-case';
import { ResumenSemanalUseCase } from '../application/use-cases/resumen-semanal.use-case';
import { AulasDocenteEscuela, IdentidadEstudiantesIam, NotificadorDocenteIam } from './anticorrupcion';
import { PdfLibReporteAula } from './pdf/pdf-lib-reporte';
import { PrismaReportesRepository } from './persistence/prisma-reportes-repository';
import { TrabajosReporting } from './trabajos-reporting';

/** Composition root de Reporting (paneles de seguimiento). */
export function crearCasosUsoReporting(
  prisma: PrismaService,
  escuela: EscuelaFacade,
  iam: IamFacade,
  fichas: FuenteFichasLectura,
  historial: ResolutorHistorialLectura,
): CasosUsoReporting {
  const ahora = () => new Date();
  const repo = new PrismaReportesRepository(prisma);
  const aulas = new AulasDocenteEscuela(escuela);
  const identidad = new IdentidadEstudiantesIam(iam);
  const panel = new PanelAulaUseCase(repo, aulas, identidad, fichas, ahora);
  return {
    panel,
    detalle: new DetalleEstudianteUseCase(repo, aulas, identidad, historial, ahora),
    reporte: new ReporteAulaUseCase(aulas, panel, new PdfLibReporteAula(), ahora),
    resumen: new ResumenSemanalUseCase(repo, aulas, panel, new NotificadorDocenteIam(iam), process.env['WEB_ORIGIN'] ?? 'http://localhost:3002', ahora),
    vistas: repo,
  };
}

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const reportingProviders: Provider[] = [
  {
    provide: CASOS_USO_REPORTING,
    useFactory: crearCasosUsoReporting,
    inject: [PrismaService, EscuelaFacade, IamFacade, FICHAS_LECTURA, HISTORIAL_LECTURA],
  },
  TrabajosReporting,
];
