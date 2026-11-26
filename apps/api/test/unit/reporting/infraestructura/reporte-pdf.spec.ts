import { inflateSync } from 'node:zlib';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { ReporteAula } from '../../../../src/modules/reporting/application/dto/reporting.dto';
import { Celda } from '../../../../src/modules/reporting/domain/services/mapa-calor';
import { PdfLibReporteAula, textoCelda } from '../../../../src/modules/reporting/infrastructure/pdf/pdf-lib-reporte';
import { textosDelPdf } from '../../../support/pdf-texto';

/** Los textos de cada página por separado (cada página dibuja su propio stream). */
function textosPorPagina(pdf: Uint8Array): string[][] {
  const paginas: string[][] = [];
  for (const m of Buffer.from(pdf).toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let datos = Buffer.from(m[1] ?? '', 'latin1');
    try {
      datos = inflateSync(datos);
    } catch {
      // sin comprimir
    }
    const contenido = datos.toString('latin1');
    const textos = [...contenido.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((h) => Buffer.from(h[1] ?? '', 'hex').toString('latin1'));
    if (textos.length > 0) paginas.push(textos);
  }
  return paginas;
}

const celda = (habilidad: Celda['habilidad'], valor: number | null, items: number): Celda => ({
  habilidad,
  valor,
  items,
  nivel: valor === null || items < 5 ? null : valor >= 85 ? 'AD' : valor >= 65 ? 'A' : valor >= 40 ? 'B' : 'C',
});

const REPORTE: ReporteAula = {
  aula: { id: 'a1', nombre: '3.° B', grado: '3', estado: 'ACTIVA' },
  generadoEn: new Date('2026-11-26T14:44:00Z'),
  actualizadoEn: new Date('2026-11-26T14:40:00Z'),
  grupo: (['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const).map((habilidad) => ({
    habilidad,
    promedio: 70,
    distribucion: { AD: 1, A: 0, B: 0, C: 1, descubriendo: 0 },
    sinDatos: 0,
  })),
  filas: [
    {
      alias: 'Camila',
      avatar: 'delfin',
      celdas: [celda('LIT', 91, 6), celda('INF', 100, 3), celda('VOC', 70, 5), celda('CRI', 50, 5), celda('ARG', null, 0)],
      ultimaActividad: new Date('2026-11-25T15:00:00Z'),
      lecturasSemana: 2,
      motivosRiesgo: [],
    },
    {
      alias: 'Mateo',
      avatar: 'zorro',
      celdas: [celda('LIT', 30, 6), celda('INF', 35, 5), celda('VOC', 52, 5), celda('CRI', 30, 5), celda('ARG', 45, 5)],
      ultimaActividad: null,
      lecturasSemana: 0,
      motivosRiesgo: ['SIN_ACTIVIDAD', 'HABILIDADES_EN_INICIO'],
    },
  ],
  resumen: { semana: '2026-11-23', estudiantesActivos: 1, totalEstudiantes: 2, lecturasFinalizadas: 2, minutosLectura: 30, respuestas: 12 },
  enRiesgo: 1,
  refuerzos: [],
};

describe('[Reporting][Menor][Fast] PDF del reporte del aula y de los informes para las familias (RF-067, RF-069)', () => {
  it('la celda dice el nivel y su valor, o cuántas preguntas lleva si aún no hay nivel', () => {
    expect(textoCelda(celda('LIT', 91, 6))).toBe('AD · 91');
    expect(textoCelda(celda('INF', 100, 3))).toBe('Aún · 3 de 5 preg.');
    expect(textoCelda(celda('ARG', null, 0))).toBe('-');
  });

  it('el reporte de la docente: A4 horizontal, la semana en cifras, la escala del CNEB y cada estudiante con su situación', async () => {
    const pdf = await new PdfLibReporteAula().generar(REPORTE);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
    const textos = textosDelPdf(Buffer.from(pdf));
    expect(textos).toEqual(
      expect.arrayContaining([
        'Reporte del aula «3.° B»',
        '1 de 2',
        'leyeron esta semana',
        'Cómo leer los niveles (escala del CNEB)',
        'Logro destacado (85 a 100)',
        'En inicio (0 a 39)',
        'Camila',
        'Mateo',
        'AD · 91',
        'Aún · 3 de 5 preg.',
        '7+ días sin leer',
        '2+ en inicio',
        'Al día',
      ]),
    );
  });

  it('los informes para las familias: una hoja A4 por estudiante, con solo sus datos', async () => {
    const pdf = await new PdfLibReporteAula().informesFamilia(REPORTE);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });

    const [camila, mateo] = textosPorPagina(pdf);
    expect(camila).toEqual(
      expect.arrayContaining([
        'Informe de lectura para la familia',
        'Camila',
        'Esta semana terminó 2 lecturas. ¡Felicítenle!',
        '¿Cómo va en lectura?',
        'AD · Logro destacado',
        'A · Logro esperado',
        'B · En proceso',
        'Aún descubriendo',
        'Aún sin datos',
        '¿Qué significa cada nivel?',
        'Ideas para acompañar en casa',
      ]),
    );
    expect(camila).not.toContain('Mateo');
    expect(mateo).toEqual(expect.arrayContaining(['Mateo', 'C · En inicio', 'Todavía no ha leído en LectoAventura: ¡anímenle a empezar!']));
    expect(mateo).not.toContain('Camila');
    // Sus ideas para la casa empiezan por la habilidad que más lo necesita (Literal y Crítico, con 30).
    expect(mateo.join(' ')).toContain('quién aparece');
  });

  it('un aula sin estudiantes da una hoja que lo dice', async () => {
    const pdf = await new PdfLibReporteAula().informesFamilia({ ...REPORTE, filas: [] });
    expect(textosDelPdf(Buffer.from(pdf))).toContain('El aula aún no tiene estudiantes matriculados.');
  });
});
