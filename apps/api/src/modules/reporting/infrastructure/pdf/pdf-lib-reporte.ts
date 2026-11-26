import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

import {
  cajaRedondeada,
  destello,
  dibujarAvatar,
  estrella,
  Habilidad,
  HABILIDADES,
  hex,
  NivelCNEB,
  NOMBRE_HABILIDAD,
  RangoEdad,
  textoPdf,
} from '../../../shared-kernel/public-api';
import { ReporteAula } from '../../application/dto/reporting.dto';
import { GeneradorReportePdf } from '../../application/ports/reporting.ports';
import { CONSEJOS_HABITO, consejosPara, habilidadesAReforzar } from '../../domain/services/acompanamiento-familiar';
import { Celda } from '../../domain/services/mapa-calor';
import { FilaReporte } from '../../domain/services/reporte-csv';
import { MotivoRiesgo } from '../../domain/services/riesgo';

// ── Medidas y colores ────────────────────────────────────────────────────────────────────────────
/** A4 horizontal (el aula, para la docente) y vertical (una hoja por estudiante, para su familia). */
const H_ANCHO = 841.89;
const H_ALTO = 595.28;
const V_ANCHO = 595.28;
const V_ALTO = 841.89;

const BLANCO = rgb(1, 1, 1);
const VIOLETA = hex('#5b3fd9');
const VIOLETA_FUERTE = hex('#3d2a9e');
const LILA = hex('#f6f4ff');
const LILA_BORDE = hex('#e4defb');
const AMARILLO = hex('#ffc83d');
const ROSA = hex('#ff8fb8');
const TINTA = hex('#1e1a4d');
const TINTA_SUAVE = hex('#4b4778');
const SOBRE_VIOLETA = hex('#e0daff');

/** La escala del Currículo Nacional (RVM 094-2020-MINEDU) con sus nombres oficiales y su color. */
const NIVEL: Record<NivelCNEB, { nombre: string; rango: string; fondo: string; tinta: string; barra: string; familia: string }> = {
  AD: { nombre: 'Logro destacado', rango: '85 a 100', fondo: '#c6efce', tinta: '#0b5a33', barra: '#2bb673', familia: 'Va más allá de lo esperado para su grado.' },
  A: { nombre: 'Logro esperado', rango: '65 a 84', fondo: '#e2f7e8', tinta: '#0f6b43', barra: '#8fdcb4', familia: 'Logra lo que se espera para su grado.' },
  B: { nombre: 'En proceso', rango: '40 a 64', fondo: '#e3ecff', tinta: '#1d4fa8', barra: '#8fb4f5', familia: 'Está cerca de lograrlo: con práctica lo logrará.' },
  C: { nombre: 'En inicio', rango: '0 a 39', fondo: '#fff0d6', tinta: '#8a5300', barra: '#ffb547', familia: 'Está empezando: necesita más acompañamiento.' },
};
const AUN = { fondo: '#efeafd', tinta: '#5b3fd9', barra: '#c9b6ff' };
const SIN_DATOS = { fondo: '#f3f2f8', tinta: '#8a87a8', barra: '#e4e1ef' };
const ORDEN_NIVEL: NivelCNEB[] = ['C', 'B', 'A', 'AD'];

/** Cada habilidad en palabras de la familia (las mismas que ve el niño en su perfil). */
const HABILIDAD_FAMILIA: Record<Habilidad, { nombre: string; que: string; color: string }> = {
  LIT: { nombre: 'Encuentra lo que dice el texto', que: 'Ubica datos, personajes y hechos que están escritos.', color: '#5b3fd9' },
  INF: { nombre: 'Descubre lo que no se dice', que: 'Deduce causas, sentimientos y lo que podría pasar.', color: '#e5486b' },
  VOC: { nombre: 'Entiende palabras nuevas', que: 'Comprende lo que significan las palabras por el contexto.', color: '#1d8fd1' },
  CRI: { nombre: 'Opina sobre lo que lee', que: 'Dice qué le parece lo que lee y por qué.', color: '#f08a24' },
  ARG: { nombre: 'Da buenas razones', que: 'Explica y defiende sus ideas con un «porque».', color: '#2bb673' },
};

/** Nombres cortos para los títulos de la tabla, y el motivo de riesgo en pocas palabras. */
const HABILIDAD_CORTA: Record<Habilidad, string> = { LIT: 'Literal', INF: 'Inferencial', VOC: 'Vocabulario', CRI: 'Crítico', ARG: 'Argumentación' };
const RIESGO_CORTO: Record<MotivoRiesgo, string> = { SIN_ACTIVIDAD: '7+ días sin leer', HABILIDADES_EN_INICIO: '2+ en inicio' };

const texto = textoPdf;
const LIMA = 'America/Lima';
const fechaHora = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16);
const fechaCorta = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: LIMA });
const fechaLarga = (d: Date) => d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: LIMA });
const diaYMes = (d: Date) => d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: LIMA });
const nombreGrado = (g: string) => (/^\d$/.test(g) ? `${g}.° grado` : g);
const rangoDeGrado = (g: string): RangoEdad => (g === '1' || g === '2' ? 'R1' : g === '5' || g === '6' ? 'R3' : 'R2');

function recortar(valor: string, fuente: PDFFont, tamano: number, anchoMax: number): string {
  let t = texto(valor);
  if (fuente.widthOfTextAtSize(t, tamano) <= anchoMax) return t;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}...`, tamano) > anchoMax) t = t.slice(0, -1);
  return `${t}...`;
}

/** Parte un texto en líneas que caben en `ancho`. */
export function envolver(valor: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto(valor).split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && fuente.widthOfTextAtSize(prueba, tamano) > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Lo que dice la celda de una habilidad: su nivel, o cuántas preguntas lleva si aún no hay nivel. */
export function textoCelda(c: Celda): string {
  if (c.valor === null) return '-';
  if (!c.nivel) return `Aún · ${Math.min(c.items, 4)} de 5 preg.`;
  return `${c.nivel} · ${Math.round(c.valor)}`;
}

interface Fuentes {
  normal: PDFFont;
  negrita: PDFFont;
}

/**
 * RF-067: el reporte del aula en PDF. Para la docente, A4 horizontal: cabecera, la semana en cuatro
 * cifras, el aula por habilidad con barras de colores por nivel CNEB, cómo leer los niveles, los
 * refuerzos sugeridos y una fila por estudiante. Para las familias, una hoja A4 por estudiante con solo
 * sus datos: cómo va en cada habilidad, qué significa cada nivel e ideas para acompañar en casa (RF-069).
 * Sin datos personales más allá del alias (RN-02).
 */
export class PdfLibReporteAula implements GeneradorReportePdf {
  async generar(r: ReporteAula): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(texto(`Reporte del aula ${r.aula.nombre}`));
    pdf.setProducer('LectoAventura');
    pdf.setLanguage('es-PE');
    const f = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrita: await pdf.embedFont(StandardFonts.HelveticaBold) };
    const M = 30;

    let p = pdf.addPage([H_ANCHO, H_ALTO]);
    let y = this.cabecera(p, f, { x: M, arriba: H_ALTO - M, ancho: H_ANCHO - 2 * M, titulo: `Reporte del aula «${r.aula.nombre}»`, subtitulo: `${nombreGrado(r.aula.grado)} · Para la docente`, r });

    // La semana en cuatro cifras (RF-065).
    const s = r.resumen;
    const cifras: { valor: string; etiqueta: string; fondo: string; tinta: string }[] = [
      { valor: `${s.estudiantesActivos} de ${s.totalEstudiantes}`, etiqueta: 'leyeron esta semana', fondo: '#ede8ff', tinta: '#3d2a9e' },
      { valor: String(s.lecturasFinalizadas), etiqueta: s.lecturasFinalizadas === 1 ? 'lectura terminada' : 'lecturas terminadas', fondo: '#ddf7ea', tinta: '#0f6b43' },
      { valor: String(s.minutosLectura), etiqueta: 'minutos de lectura', fondo: '#fff6dc', tinta: '#6b4b00' },
      { valor: String(r.enRiesgo), etiqueta: r.enRiesgo === 1 ? 'estudiante en riesgo' : 'estudiantes en riesgo', fondo: '#ffe3f1', tinta: '#a1235a' },
    ];
    const anchoCifra = (H_ANCHO - 2 * M - 3 * 12) / 4;
    y -= 12;
    cifras.forEach((c, i) => {
      const x = M + i * (anchoCifra + 12);
      cajaRedondeada(p, { x, y: y - 50, ancho: anchoCifra, alto: 50, radio: 12 }, { color: hex(c.fondo) });
      p.drawText(texto(c.valor), { x: x + 14, y: y - 27, size: 20, font: f.negrita, color: hex(c.tinta) });
      p.drawText(texto(c.etiqueta), { x: x + 14, y: y - 42, size: 9, font: f.normal, color: hex(c.tinta) });
    });
    y -= 64;

    // A la izquierda, el aula por habilidad (RF-063); a la derecha, cómo leer los niveles y los refuerzos.
    const anchoIzq = (H_ANCHO - 2 * M) * 0.6;
    const xDer = M + anchoIzq + 14;
    const anchoDer = H_ANCHO - M - xDer;
    const altoBloque = 34 + r.grupo.length * 24 + 24;
    cajaRedondeada(p, { x: M, y: y - altoBloque, ancho: anchoIzq, alto: altoBloque, radio: 14 }, { color: BLANCO, borde: LILA_BORDE, grosor: 1 });
    p.drawText('El aula por habilidad', { x: M + 14, y: y - 22, size: 12, font: f.negrita, color: TINTA });
    p.drawText(texto('cuántos estudiantes hay en cada nivel'), { x: M + 140, y: y - 22, size: 8.5, font: f.normal, color: TINTA_SUAVE });
    const xBarra = M + 132;
    const anchoBarra = anchoIzq - 132 - 70;
    r.grupo.forEach((g, i) => {
      const fy = y - 46 - i * 24;
      p.drawText(texto(NOMBRE_HABILIDAD[g.habilidad]), { x: M + 14, y: fy, size: 9.5, font: f.negrita, color: TINTA });
      const partes = [
        ...(['AD', 'A', 'B', 'C'] as NivelCNEB[]).map((n) => ({ n: g.distribucion[n], color: NIVEL[n].barra, tinta: NIVEL[n].tinta })),
        { n: g.distribucion.descubriendo, color: AUN.barra, tinta: AUN.tinta },
        { n: g.sinDatos, color: SIN_DATOS.barra, tinta: SIN_DATOS.tinta },
      ].filter((x) => x.n > 0);
      const total = partes.reduce((a, x) => a + x.n, 0) || 1;
      let bx = xBarra;
      for (const parte of partes) {
        const w = (parte.n / total) * anchoBarra;
        cajaRedondeada(p, { x: bx + 1, y: fy - 4, ancho: Math.max(2, w - 2), alto: 14, radio: 5 }, { color: hex(parte.color) });
        if (w >= 16) {
          const t = String(parte.n);
          p.drawText(t, { x: bx + w / 2 - f.negrita.widthOfTextAtSize(t, 8) / 2, y: fy - 0.5, size: 8, font: f.negrita, color: hex(parte.tinta) });
        }
        bx += w;
      }
      p.drawText(texto(g.promedio === null ? 'sin datos' : `prom. ${Math.round(g.promedio)}`), { x: xBarra + anchoBarra + 10, y: fy, size: 8.5, font: f.normal, color: TINTA_SUAVE });
    });
    // Leyenda de colores.
    let lx = M + 14;
    const ly = y - altoBloque + 12;
    for (const [nombre, color] of [
      ['AD', NIVEL.AD.barra],
      ['A', NIVEL.A.barra],
      ['B', NIVEL.B.barra],
      ['C', NIVEL.C.barra],
      ['Aún descubriendo', AUN.barra],
      ['Sin datos', SIN_DATOS.barra],
    ] as const) {
      cajaRedondeada(p, { x: lx, y: ly - 1, ancho: 9, alto: 9, radio: 3 }, { color: hex(color) });
      p.drawText(texto(nombre), { x: lx + 13, y: ly, size: 8, font: f.normal, color: TINTA_SUAVE });
      lx += 13 + f.normal.widthOfTextAtSize(texto(nombre), 8) + 14;
    }

    // Cómo leer los niveles.
    const altoEscala = 34 + 5 * 15;
    cajaRedondeada(p, { x: xDer, y: y - altoEscala, ancho: anchoDer, alto: altoEscala, radio: 14 }, { color: LILA });
    p.drawText(texto('Cómo leer los niveles (escala del CNEB)'), { x: xDer + 14, y: y - 22, size: 10.5, font: f.negrita, color: VIOLETA_FUERTE });
    ORDEN_NIVEL.slice()
      .reverse()
      .forEach((n, i) => {
        const fy = y - 42 - i * 15;
        this.chip(p, f, n, xDer + 14, fy - 3, 30, NIVEL[n].fondo, NIVEL[n].tinta);
        p.drawText(texto(`${NIVEL[n].nombre} (${NIVEL[n].rango})`), { x: xDer + 52, y: fy, size: 8.5, font: f.normal, color: TINTA });
      });
    this.chip(p, f, 'Aún', xDer + 14, y - 42 - 4 * 15 - 3, 30, AUN.fondo, AUN.tinta);
    p.drawText(texto('Aún descubriendo: menos de 5 preguntas respondidas'), { x: xDer + 52, y: y - 42 - 4 * 15, size: 8.5, font: f.normal, color: TINTA });

    // Refuerzos sugeridos (RF-066).
    const yRef = y - altoEscala - 10;
    const altoRef = altoBloque - altoEscala - 10;
    cajaRedondeada(p, { x: xDer, y: yRef - altoRef, ancho: anchoDer, alto: altoRef, radio: 14 }, { color: hex('#fff6dc') });
    p.drawText('Refuerzos grupales sugeridos', { x: xDer + 14, y: yRef - 20, size: 10.5, font: f.negrita, color: hex('#6b4b00') });
    if (r.refuerzos.length === 0) {
      p.drawText(texto('Esta semana no hace falta un refuerzo grupal.'), { x: xDer + 14, y: yRef - 36, size: 8.5, font: f.normal, color: TINTA_SUAVE });
    } else {
      r.refuerzos.slice(0, 3).forEach((ref, i) => {
        const t = `${NOMBRE_HABILIDAD[ref.habilidad]}: ${ref.porcentaje} % en inicio${ref.lectura ? ` · «${ref.lectura.titulo}»` : ''}`;
        estrella(p, xDer + 19, yRef - 33 - i * 14, 3.5, AMARILLO);
        p.drawText(recortar(t, f.normal, 8.5, anchoDer - 40), { x: xDer + 27, y: yRef - 36 - i * 14, size: 8.5, font: f.normal, color: TINTA });
      });
    }
    y -= altoBloque + 16;

    // Una fila por estudiante.
    const ANCHO_HAB = 80;
    const columnas = [
      { titulo: 'Estudiante', ancho: 120 },
      ...HABILIDADES.map((h) => ({ titulo: HABILIDAD_CORTA[h], ancho: ANCHO_HAB })),
      { titulo: 'Última vez', ancho: 58 },
      { titulo: 'Lecturas', ancho: 66 },
    ];
    const anchoTabla = H_ANCHO - 2 * M;
    const anchoUltima = anchoTabla - columnas.reduce((a, c) => a + c.ancho, 0);
    columnas.push({ titulo: 'Situación', ancho: anchoUltima });
    const FILA = 24;
    const cabeceraTabla = () => {
      cajaRedondeada(p, { x: M, y: y - 8, ancho: anchoTabla, alto: 22, radio: 8 }, { color: hex('#ede8ff') });
      let x = M;
      for (const c of columnas) {
        p.drawText(recortar(c.titulo, f.negrita, 8.5, c.ancho - 10), { x: x + 8, y, size: 8.5, font: f.negrita, color: VIOLETA_FUERTE });
        x += c.ancho;
      }
      y -= FILA + 2;
    };
    if (y < M + 60) {
      p = pdf.addPage([H_ANCHO, H_ALTO]);
      y = H_ALTO - M - 10;
    }
    cabeceraTabla();
    r.filas.forEach((fila, i) => {
      if (y < M + 30) {
        p = pdf.addPage([H_ANCHO, H_ALTO]);
        y = H_ALTO - M - 10;
        cabeceraTabla();
      }
      if (i % 2 === 1) cajaRedondeada(p, { x: M, y: y - 8, ancho: anchoTabla, alto: FILA - 2, radio: 7 }, { color: hex('#faf9ff') });
      let x = M;
      dibujarAvatar(p, fila.avatar ?? '', x + 16, y + 3, 9);
      p.drawText(recortar(fila.alias, f.negrita, 9.5, columnas[0]!.ancho - 38), { x: x + 31, y, size: 9.5, font: f.negrita, color: TINTA });
      x += columnas[0]!.ancho;
      for (const c of fila.celdas) {
        const estilo = c.valor === null ? SIN_DATOS : c.nivel ? NIVEL[c.nivel] : AUN;
        const fuente = c.nivel ? f.negrita : f.normal;
        cajaRedondeada(p, { x: x + 3, y: y - 5, ancho: ANCHO_HAB - 6, alto: 16, radio: 6 }, { color: hex(estilo.fondo) });
        const t = recortar(textoCelda(c), fuente, 8, ANCHO_HAB - 10);
        p.drawText(t, { x: x + ANCHO_HAB / 2 - fuente.widthOfTextAtSize(t, 8) / 2, y: y - 0.5, size: 8, font: fuente, color: hex(estilo.tinta) });
        x += ANCHO_HAB;
      }
      p.drawText(fila.ultimaActividad ? fechaCorta(fila.ultimaActividad) : 'Nunca', { x: x + 8, y, size: 9, font: f.normal, color: TINTA });
      x += 58;
      p.drawText(String(fila.lecturasSemana), { x: x + 26, y, size: 9, font: f.negrita, color: TINTA });
      x += 66;
      // En riesgo: una pastilla rosada por motivo; si no, «Al día» en verde.
      if (fila.motivosRiesgo.length > 0) {
        let cx = x + 6;
        for (const m of fila.motivosRiesgo) {
          const w = f.negrita.widthOfTextAtSize(RIESGO_CORTO[m], 8) + 14;
          this.chip(p, f, RIESGO_CORTO[m], cx, y - 5, w, '#ffe3f1', '#a1235a');
          cx += w + 4;
        }
      } else this.chip(p, f, 'Al día', x + 6, y - 5, 44, '#ddf7ea', '#0f6b43');
      y -= FILA;
    });
    if (r.filas.length === 0) p.drawText('El aula aún no tiene estudiantes matriculados.', { x: M, y, size: 10, font: f.normal, color: TINTA });

    this.pies(pdf, f, `LectoAventura · ${r.aula.nombre} · Para la docente: tiene datos de todo el aula. A cada familia, entréguele solo su informe.`);
    return pdf.save();
  }

  /** RF-067, RF-069: una hoja por estudiante para su familia, con solo sus datos. */
  async informesFamilia(r: ReporteAula): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Informes de lectura para las familias — ${r.aula.nombre}`);
    pdf.setProducer('LectoAventura');
    pdf.setLanguage('es-PE');
    const f = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrita: await pdf.embedFont(StandardFonts.HelveticaBold) };
    if (r.filas.length === 0) {
      const p = pdf.addPage([V_ANCHO, V_ALTO]);
      this.cabecera(p, f, { x: 36, arriba: V_ALTO - 36, ancho: V_ANCHO - 72, titulo: 'Informe de lectura para la familia', subtitulo: `Aula ${r.aula.nombre}`, r });
      p.drawText('El aula aún no tiene estudiantes matriculados.', { x: 36, y: V_ALTO - 150, size: 11, font: f.normal, color: TINTA });
    }
    for (const fila of r.filas) this.hojaFamilia(pdf.addPage([V_ANCHO, V_ALTO]), f, r, fila);
    this.pies(pdf, f, `LectoAventura · Aula ${r.aula.nombre} · Informe para la familia: es personal, guárdelo en casa.`);
    return pdf.save();
  }

  private hojaFamilia(p: PDFPage, f: Fuentes, r: ReporteAula, fila: FilaReporte): void {
    const M = 36;
    const ancho = V_ANCHO - 2 * M;
    let y = this.cabecera(p, f, {
      x: M,
      arriba: V_ALTO - M,
      ancho,
      titulo: 'Informe de lectura para la familia',
      subtitulo: `Aula ${r.aula.nombre} · ${nombreGrado(r.aula.grado)} · ${fechaLarga(r.generadoEn)}`,
      r,
    });

    // La niña o el niño: su avatar, su alias y cómo leyó esta semana.
    y -= 14;
    cajaRedondeada(p, { x: M, y: y - 92, ancho, alto: 92, radio: 16 }, { color: LILA, borde: LILA_BORDE, grosor: 1 });
    const cx = M + 56;
    const cy = y - 46;
    p.drawCircle({ x: cx, y: cy, size: 37, color: AMARILLO });
    p.drawCircle({ x: cx, y: cy, size: 34.5, color: BLANCO });
    if (!dibujarAvatar(p, fila.avatar ?? '', cx, cy, 32)) p.drawText(texto(fila.alias.charAt(0)), { x: cx - 9, y: cy - 10, size: 28, font: f.negrita, color: TINTA });
    destello(p, cx + 36, cy + 32, 6.5, AMARILLO);
    destello(p, cx - 40, cy + 22, 4, ROSA);
    p.drawText(recortar(fila.alias, f.negrita, 24, ancho - 140), { x: M + 112, y: cy + 10, size: 24, font: f.negrita, color: TINTA });
    const leyo = fila.lecturasSemana === 0 ? 'Esta semana aún no terminó una lectura.' : `Esta semana terminó ${fila.lecturasSemana} ${fila.lecturasSemana === 1 ? 'lectura' : 'lecturas'}. ¡Felicítenle!`;
    p.drawText(texto(leyo), { x: M + 112, y: cy - 10, size: 10, font: f.normal, color: TINTA });
    const ultima = fila.ultimaActividad ? `La última vez que leyó fue el ${diaYMes(fila.ultimaActividad)}.` : 'Todavía no ha leído en LectoAventura: ¡anímenle a empezar!';
    p.drawText(texto(ultima), { x: M + 112, y: cy - 25, size: 9.5, font: f.normal, color: TINTA_SUAVE });
    y -= 92 + 22;

    // Cómo va en cada habilidad.
    p.drawText(texto('¿Cómo va en lectura?'), { x: M, y, size: 14, font: f.negrita, color: VIOLETA_FUERTE });
    y -= 14;
    p.drawText(texto('Competencia del Currículo Nacional: «Lee diversos tipos de textos escritos en su lengua materna».'), { x: M, y, size: 8.5, font: f.normal, color: TINTA_SUAVE });
    y -= 12;
    const porHabilidad = new Map(fila.celdas.map((c) => [c.habilidad, c]));
    for (const h of HABILIDADES) {
      const c = porHabilidad.get(h) ?? { habilidad: h, valor: null, items: 0, nivel: null };
      const info = HABILIDAD_FAMILIA[h];
      const alto = 50;
      cajaRedondeada(p, { x: M, y: y - alto, ancho, alto, radio: 12 }, { color: BLANCO, borde: LILA_BORDE, grosor: 1 });
      // Su ícono de color.
      p.drawCircle({ x: M + 26, y: y - alto / 2, size: 15, color: hex(info.color) });
      this.icono(p, h, M + 26, y - alto / 2);
      p.drawText(texto(info.nombre), { x: M + 50, y: y - 21, size: 11, font: f.negrita, color: TINTA });
      p.drawText(texto(info.que), { x: M + 50, y: y - 35, size: 8.5, font: f.normal, color: TINTA_SUAVE });
      // Su nivel: la pastilla y una escalera de 4 escalones (C, B, A, AD).
      const xNivel = M + ancho - 170;
      if (c.valor === null) {
        this.chip(p, f, 'Aún sin datos', xNivel, y - 22, 156, SIN_DATOS.fondo, SIN_DATOS.tinta);
        p.drawText(texto('Se verá cuando lea en LectoAventura.'), { x: xNivel, y: y - 38, size: 7.8, font: f.normal, color: TINTA_SUAVE });
      } else if (!c.nivel) {
        this.chip(p, f, 'Aún descubriendo', xNivel, y - 22, 156, AUN.fondo, AUN.tinta);
        p.drawText(texto(`Respondió ${Math.min(c.items, 4)} de las 5 preguntas que hacen falta.`), { x: xNivel, y: y - 38, size: 7.8, font: f.normal, color: TINTA_SUAVE });
      } else {
        const nivel = NIVEL[c.nivel];
        this.chip(p, f, `${c.nivel} · ${nivel.nombre}`, xNivel, y - 22, 156, nivel.fondo, nivel.tinta);
        const alcanzado = ORDEN_NIVEL.indexOf(c.nivel);
        ORDEN_NIVEL.forEach((n, i) => {
          const sx = xNivel + i * 39.5;
          cajaRedondeada(p, { x: sx, y: y - 41, ancho: 36, alto: 9, radio: 4.5 }, { color: hex(i <= alcanzado ? nivel.barra : '#eeebf8') });
          const t = n;
          p.drawText(t, { x: sx + 18 - f.negrita.widthOfTextAtSize(t, 6.5) / 2, y: y - 39, size: 6.5, font: f.negrita, color: i <= alcanzado ? BLANCO : hex('#b3aed0') });
        });
      }
      y -= alto + 8;
    }

    // Qué significa cada nivel.
    y -= 6;
    const altoEscala = 132;
    cajaRedondeada(p, { x: M, y: y - altoEscala, ancho: ancho * 0.48, alto: altoEscala, radio: 14 }, { color: LILA });
    p.drawText(texto('¿Qué significa cada nivel?'), { x: M + 14, y: y - 20, size: 11, font: f.negrita, color: VIOLETA_FUERTE });
    ORDEN_NIVEL.slice()
      .reverse()
      .forEach((n, i) => {
        const fy = y - 38 - i * 17;
        this.chip(p, f, n, M + 14, fy - 3, 28, NIVEL[n].fondo, NIVEL[n].tinta);
        p.drawText(texto(NIVEL[n].familia), { x: M + 48, y: fy, size: 8, font: f.normal, color: TINTA });
      });
    this.chip(p, f, 'Aún', M + 14, y - 38 - 4 * 17 - 3, 28, AUN.fondo, AUN.tinta);
    p.drawText(texto('Aún respondió pocas preguntas de esa habilidad.'), { x: M + 48, y: y - 38 - 4 * 17, size: 8, font: f.normal, color: TINTA });

    // Ideas para acompañar en casa (las de las habilidades que más lo necesitan, para su edad).
    const xIdeas = M + ancho * 0.48 + 12;
    const anchoIdeas = ancho - ancho * 0.48 - 12;
    cajaRedondeada(p, { x: xIdeas, y: y - altoEscala, ancho: anchoIdeas, alto: altoEscala, radio: 14 }, { color: hex('#fff6dc') });
    p.drawText(texto('Ideas para acompañar en casa'), { x: xIdeas + 14, y: y - 20, size: 11, font: f.negrita, color: hex('#6b4b00') });
    const rango = rangoDeGrado(r.aula.grado);
    const ideas = [...habilidadesAReforzar(fila.celdas).flatMap((h) => consejosPara(h.habilidad, rango, 1)), ...CONSEJOS_HABITO].slice(0, 3);
    let iy = y - 36;
    for (const idea of ideas) {
      const lineas = envolver(idea, f.normal, 8, anchoIdeas - 40).slice(0, 3);
      if (iy - lineas.length * 10 < y - altoEscala + 6) break;
      estrella(p, xIdeas + 19, iy + 2.5, 4, AMARILLO);
      lineas.forEach((l, k) => p.drawText(l, { x: xIdeas + 28, y: iy - k * 10, size: 8, font: f.normal, color: TINTA }));
      iy -= lineas.length * 10 + 6;
    }
    y -= altoEscala + 16;

    // Nota para la familia.
    const nota = envolver(
      'Los niveles salen de las respuestas de su hija o hijo en LectoAventura y cambian con cada lectura. La calificación oficial del periodo, con su conclusión descriptiva, la registra su docente.',
      f.normal,
      8,
      ancho,
    );
    nota.forEach((l, k) => p.drawText(l, { x: M, y: y - k * 10, size: 8, font: f.normal, color: TINTA_SUAVE }));
  }

  /** La franja violeta de arriba: la marca, el título, el subtítulo y cuándo se generó. Devuelve dónde termina. */
  private cabecera(
    p: PDFPage,
    f: Fuentes,
    c: { x: number; arriba: number; ancho: number; titulo: string; subtitulo: string; r: ReporteAula },
  ): number {
    const alto = 70;
    cajaRedondeada(p, { x: c.x, y: c.arriba - alto, ancho: c.ancho, alto, radio: 16 }, { color: VIOLETA });
    estrella(p, c.x + 20, c.arriba - 18, 7, AMARILLO);
    p.drawText('Lecto', { x: c.x + 31, y: c.arriba - 22, size: 11, font: f.negrita, color: BLANCO });
    p.drawText('Aventura', { x: c.x + 31 + f.negrita.widthOfTextAtSize('Lecto', 11), y: c.arriba - 22, size: 11, font: f.negrita, color: AMARILLO });
    p.drawText(recortar(c.titulo, f.negrita, 18, c.ancho - 230), { x: c.x + 16, y: c.arriba - 46, size: 18, font: f.negrita, color: BLANCO });
    p.drawText(texto(c.subtitulo), { x: c.x + 16, y: c.arriba - 61, size: 9, font: f.normal, color: SOBRE_VIOLETA });
    const generado = `Generado: ${fechaHora(c.r.generadoEn)} (hora de Lima)`;
    p.drawText(texto(generado), { x: c.x + c.ancho - 16 - f.normal.widthOfTextAtSize(texto(generado), 8), y: c.arriba - 22, size: 8, font: f.normal, color: SOBRE_VIOLETA });
    if (c.r.actualizadoEn) {
      const datos = `Datos al ${fechaHora(c.r.actualizadoEn)}`;
      p.drawText(texto(datos), { x: c.x + c.ancho - 16 - f.normal.widthOfTextAtSize(texto(datos), 8), y: c.arriba - 34, size: 8, font: f.normal, color: SOBRE_VIOLETA });
    }
    destello(p, c.x + c.ancho - 40, c.arriba - 54, 6, AMARILLO);
    destello(p, c.x + c.ancho - 62, c.arriba - 46, 3.5, BLANCO, 0.8);
    destello(p, c.x + c.ancho - 24, c.arriba - 44, 2.5, ROSA);
    return c.arriba - alto;
  }

  /** Una pastilla de color con texto centrado. */
  private chip(p: PDFPage, f: Fuentes, valor: string, x: number, y: number, ancho: number, fondo: string, tinta: string): void {
    cajaRedondeada(p, { x, y, ancho, alto: 14, radio: 7 }, { color: hex(fondo) });
    const t = recortar(valor, f.negrita, 8, ancho - 8);
    p.drawText(t, { x: x + ancho / 2 - f.negrita.widthOfTextAtSize(t, 8) / 2, y: y + 4, size: 8, font: f.negrita, color: hex(tinta) });
  }

  /** Un ícono blanco y sencillo para cada habilidad, dentro de su círculo de color. */
  private icono(p: PDFPage, h: Habilidad, cx: number, cy: number): void {
    const trazo = { x: cx, y: cy, borderColor: BLANCO, borderWidth: 1.8 };
    switch (h) {
      case 'LIT': // una lupa
        p.drawCircle({ x: cx - 1.5, y: cy + 1.5, size: 5, borderColor: BLANCO, borderWidth: 1.8 });
        p.drawSvgPath('M 2 2 L 6.5 6.5', trazo);
        break;
      case 'INF': // un foquito
        p.drawCircle({ x: cx, y: cy + 2, size: 5.5, color: BLANCO });
        p.drawRectangle({ x: cx - 2.6, y: cy - 7, width: 5.2, height: 4, color: BLANCO });
        break;
      case 'VOC': // «Aa»
        p.drawSvgPath('M -7 5 L -4 -5 L -1 5 M -5.8 1.5 L -2.2 1.5 M 6 0.5 Q 6 -1.6 3.5 -1.6 Q 1 -1.6 1 1.8 Q 1 5 3.5 5 Q 6 5 6 2 L 6 5', trazo);
        break;
      case 'CRI': // un globito de diálogo
        p.drawSvgPath('M -6.5 -5 L 6.5 -5 Q 8 -5 8 -3.5 L 8 2.5 Q 8 4 6.5 4 L -1 4 L -4.5 7 L -4 4 L -6.5 4 Q -8 4 -8 2.5 L -8 -3.5 Q -8 -5 -6.5 -5 Z', { x: cx, y: cy, color: BLANCO });
        break;
      case 'ARG': // un visto
        p.drawSvgPath('M -5.5 0 L -1.5 4 L 6 -4.5', { ...trazo, borderWidth: 2.4 });
        break;
    }
  }

  private pies(pdf: PDFDocument, f: Fuentes, leyenda: string): void {
    const paginas = pdf.getPages();
    paginas.forEach((p, i) => {
      const { width } = p.getSize();
      p.drawText(recortar(leyenda, f.normal, 7.5, width - 120), { x: 30, y: 16, size: 7.5, font: f.normal, color: TINTA_SUAVE });
      const num = `${i + 1} de ${paginas.length}`;
      p.drawText(num, { x: width - 30 - f.normal.widthOfTextAtSize(num, 7.5), y: 16, size: 7.5, font: f.normal, color: TINTA_SUAVE });
    });
  }
}
