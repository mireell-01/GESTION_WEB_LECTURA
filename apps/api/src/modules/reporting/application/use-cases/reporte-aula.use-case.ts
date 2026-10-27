import { ErrorDeNegocio, NoEncontradoError } from '../../../shared-kernel/public-api';
import { reporteCsv } from '../../domain/services/reporte-csv';
import { ArchivoReporte, PanelAula, ReporteAula } from '../dto/reporting.dto';
import { AulasDocente, GeneradorReportePdf } from '../ports/reporting.ports';
import { PanelAulaUseCase } from './panel-aula.use-case';

export type FormatoReporte = 'pdf' | 'csv';

/** "4.° A — Lectura" → "4-a-lectura" para el nombre del archivo. */
function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'aula'
  );
}

export function aReporte(panel: PanelAula, generadoEn: Date): ReporteAula {
  return {
    aula: panel.aula,
    generadoEn,
    actualizadoEn: panel.actualizadoEn ? new Date(panel.actualizadoEn) : null,
    grupo: panel.grupo,
    filas: panel.estudiantes.map((e) => ({
      alias: e.alias,
      celdas: e.celdas,
      ultimaActividad: e.ultimaActividad ? new Date(e.ultimaActividad) : null,
      lecturasSemana: e.lecturasSemana,
      motivosRiesgo: e.riesgo.motivos,
    })),
    resumen: panel.resumenSemanal.actual,
    enRiesgo: panel.resumenSemanal.enRiesgo,
    refuerzos: panel.refuerzos,
  };
}

/** RF-067: el reporte del aula en PDF o CSV, con los mismos datos del panel. */
export class ReporteAulaUseCase {
  constructor(
    private readonly aulas: AulasDocente,
    private readonly panel: PanelAulaUseCase,
    private readonly pdf: GeneradorReportePdf,
    private readonly ahora: () => Date,
  ) {}

  async reporte(docenteId: string, aulaId: string, formato: string): Promise<ArchivoReporte> {
    if (formato !== 'pdf' && formato !== 'csv') throw new ErrorDeNegocio('Elige el formato del reporte: PDF o CSV');
    const aula = await this.aulas.aulaDe(docenteId, aulaId);
    if (!aula) throw new NoEncontradoError('Aula');
    const ahora = this.ahora();
    const reporte = aReporte(await this.panel.analizar(aula), ahora);
    const nombre = `reporte-${slug(aula.nombre)}-${new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)}`;
    if (formato === 'csv') {
      return { contenido: new TextEncoder().encode(reporteCsv(reporte.filas)), tipo: 'text/csv; charset=utf-8', nombreArchivo: `${nombre}.csv` };
    }
    return { contenido: await this.pdf.generar(reporte), tipo: 'application/pdf', nombreArchivo: `${nombre}.pdf` };
  }
}
