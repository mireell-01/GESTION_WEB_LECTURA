import { PDFDocument, PDFFont, PDFPage, rgb, RGB, StandardFonts } from 'pdf-lib';

import { HABILIDADES, NivelCNEB, NOMBRE_HABILIDAD } from '../../../shared-kernel/public-api';
import { ReporteAula } from '../../application/dto/reporting.dto';
import { GeneradorReportePdf } from '../../application/ports/reporting.ports';
import { Celda } from '../../domain/services/mapa-calor';
import { TEXTO_MOTIVO } from '../../domain/services/reporte-csv';

/** A4 horizontal en puntos: la tabla del aula tiene 5 habilidades y 4 columnas más. */
const ANCHO = 841.89;
const ALTO = 595.28;
const MARGEN = 36;
const FILA = 20;

const TINTA = hex('#1e1a4d');
const TINTA_SUAVE = hex('#4b4778');
const VIOLETA = hex('#5b3fd9');
const LINEA = hex('#d9d4f2');
/** Colores del nivel CNEB, los mismos del panel web. */
const FONDO_NIVEL: Record<NivelCNEB | 'NADA', RGB> = {
  C: hex('#ffe2b3'),
  B: hex('#dbe7ff'),
  A: hex('#d9f5d0'),
  AD: hex('#9be3a5'),
  NADA: hex('#f0eef8'),
};

function hex(color: string): RGB {
  const n = parseInt(color.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Las fuentes estándar usan WinAnsi: se conservan tildes y ñ, se reemplaza lo demás. */
function texto(valor: string): string {
  return valor.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function recortar(valor: string, fuente: PDFFont, tamano: number, anchoMax: number): string {
  let t = texto(valor);
  if (fuente.widthOfTextAtSize(t, tamano) <= anchoMax) return t;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}...`, tamano) > anchoMax) t = t.slice(0, -1);
  return `${t}...`;
}

const fechaHora = (d: Date) =>
  new Date(d.getTime() - 5 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16);

const celdaTexto = (c: Celda) => (c.valor === null ? '-' : `${c.nivel ?? 'Aún'} · ${Math.round(c.valor)}`);

/**
 * RF-067: el reporte del aula en PDF (A4 horizontal): resumen de la semana, el grupo por habilidad, los
 * refuerzos sugeridos y una fila por estudiante con su nivel CNEB en cada habilidad. Sin datos personales
 * más allá del alias (RN-02). 40 estudiantes caben en 2 hojas y se generan en milisegundos.
 */
export class PdfLibReporteAula implements GeneradorReportePdf {
  async generar(r: ReporteAula): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(texto(`Reporte del aula ${r.aula.nombre}`));
    pdf.setProducer('LectoAventura');
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    let pagina = pdf.addPage([ANCHO, ALTO]);
    let y = ALTO - MARGEN;

    const escribir = (p: PDFPage, valor: string, x: number, yy: number, tamano = 10, fuente = normal, color = TINTA) =>
      p.drawText(texto(valor), { x, y: yy, size: tamano, font: fuente, color });

    // Cabecera.
    escribir(pagina, `Reporte del aula ${r.aula.nombre}`, MARGEN, y - 18, 20, negrita, VIOLETA);
    y -= 38;
    escribir(pagina, `Generado: ${fechaHora(r.generadoEn)} (hora de Lima)${r.actualizadoEn ? ` · Datos al ${fechaHora(r.actualizadoEn)}` : ''}`, MARGEN, y, 9, normal, TINTA_SUAVE);
    y -= 22;

    // Resumen de la semana (RF-065).
    const s = r.resumen;
    escribir(pagina, 'Esta semana', MARGEN, y, 12, negrita);
    y -= 16;
    escribir(
      pagina,
      `${s.estudiantesActivos} de ${s.totalEstudiantes} estudiantes leyeron · ${s.lecturasFinalizadas} lecturas terminadas · ${s.minutosLectura} min de lectura · ${r.enRiesgo} en riesgo`,
      MARGEN,
      y,
      10,
    );
    y -= 24;

    // El grupo por habilidad (RF-063).
    escribir(pagina, 'El aula por habilidad', MARGEN, y, 12, negrita);
    y -= 16;
    for (const g of r.grupo) {
      const d = g.distribucion;
      escribir(
        pagina,
        `${NOMBRE_HABILIDAD[g.habilidad]}: promedio ${g.promedio ?? '-'} · AD ${d.AD} · A ${d.A} · B ${d.B} · C ${d.C} · aún descubriendo ${d.descubriendo}${g.sinDatos ? ` · sin datos ${g.sinDatos}` : ''}`,
        MARGEN,
        y,
        9.5,
      );
      y -= 14;
    }
    if (r.refuerzos.length > 0) {
      y -= 6;
      escribir(pagina, 'Refuerzos grupales sugeridos', MARGEN, y, 12, negrita);
      y -= 16;
      for (const f of r.refuerzos) {
        escribir(pagina, `${NOMBRE_HABILIDAD[f.habilidad]}: ${f.porcentaje} % del aula en inicio${f.lectura ? ` · lectura sugerida «${f.lectura.titulo}»` : ''}`, MARGEN, y, 9.5);
        y -= 14;
      }
    }
    y -= 10;

    // Una fila por estudiante.
    const columnas = [
      { titulo: 'Estudiante', ancho: 150 },
      ...HABILIDADES.map((h) => ({ titulo: NOMBRE_HABILIDAD[h], ancho: 86 })),
      { titulo: 'Última actividad', ancho: 92 },
      { titulo: 'Lecturas (sem.)', ancho: 70 },
      { titulo: 'En riesgo', ancho: ANCHO - 2 * MARGEN - 150 - 86 * 5 - 92 - 70 },
    ];
    const cabeceraTabla = () => {
      let x = MARGEN;
      for (const c of columnas) {
        escribir(pagina, recortar(c.titulo, negrita, 8.5, c.ancho - 6), x + 3, y, 8.5, negrita, TINTA_SUAVE);
        x += c.ancho;
      }
      y -= 8;
      pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1, color: LINEA });
      y -= FILA - 6;
    };
    cabeceraTabla();
    for (const f of r.filas) {
      if (y < MARGEN + FILA) {
        pagina = pdf.addPage([ANCHO, ALTO]);
        y = ALTO - MARGEN - 10;
        cabeceraTabla();
      }
      let x = MARGEN;
      escribir(pagina, recortar(f.alias, negrita, 9.5, columnas[0]!.ancho - 6), x + 3, y, 9.5, negrita);
      x += columnas[0]!.ancho;
      for (const c of f.celdas) {
        pagina.drawRectangle({ x: x + 2, y: y - 5, width: 82, height: 16, color: FONDO_NIVEL[c.nivel ?? 'NADA'] });
        escribir(pagina, celdaTexto(c), x + 6, y, 9);
        x += 86;
      }
      escribir(pagina, f.ultimaActividad ? fechaHora(f.ultimaActividad).slice(0, 10) : 'Sin actividad', x + 3, y, 9);
      x += 92;
      escribir(pagina, String(f.lecturasSemana), x + 3, y, 9);
      x += 70;
      const riesgo = f.motivosRiesgo.map((m) => TEXTO_MOTIVO[m]).join('; ');
      escribir(pagina, recortar(riesgo || 'No', normal, 8.5, columnas.at(-1)!.ancho - 6), x + 3, y, 8.5);
      y -= FILA;
    }
    if (r.filas.length === 0) escribir(pagina, 'El aula aún no tiene estudiantes matriculados.', MARGEN, y, 10);

    const paginas = pdf.getPages();
    paginas.forEach((p, i) =>
      p.drawText(texto(`LectoAventura · ${r.aula.nombre} · ${i + 1} de ${paginas.length}`), { x: MARGEN, y: 18, size: 8, font: normal, color: TINTA_SUAVE }),
    );
    return pdf.save();
  }
}
