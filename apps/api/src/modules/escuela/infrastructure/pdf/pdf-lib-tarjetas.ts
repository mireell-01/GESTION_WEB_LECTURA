import { PDFDocument, PDFFont, PDFPage, rgb, RGB, StandardFonts } from 'pdf-lib';

import { AVATARES_PDF, cajaRedondeada, destello, dibujarAvatar, estrella, hex, textoPdf } from '../../../shared-kernel/public-api';
import { TarjetaAcceso } from '../../application/dto/escuela.dto';
import { GeneradorTarjetasPdf } from '../../application/ports/generador-tarjetas';

/** A4 en puntos tipográficos. */
const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 24;
const COLUMNAS = 2;
const FILAS = 4;
export const TARJETAS_POR_HOJA = COLUMNAS * FILAS;

const VIOLETA = hex('#5b3fd9');
const VIOLETA_CLARO = hex('#7a62e6');
const LILA = hex('#f4f1ff');
const AMARILLO = hex('#ffc83d');
const CREMA = hex('#fff6dc');
const ROSA = hex('#ff8fb8');
const TINTA = hex('#1e1a4d');
const TINTA_SUAVE = hex('#4b4778');
const CORTE = hex('#b9b3d6');

const texto = textoPdf;

/**
 * Para que un alias o un nombre de aula largos no se salgan de la tarjeta: achica la letra hasta
 * `minimo` y, si aun así no cabe, recorta y termina en "...".
 */
export function ajustarAlAncho(
  contenido: string,
  fuente: PDFFont,
  maximo: number,
  minimo: number,
  anchoMax: number,
): { texto: string; tamano: number } {
  let limpio = texto(contenido);
  for (let tamano = maximo; tamano >= minimo; tamano -= 0.5) {
    if (fuente.widthOfTextAtSize(limpio, tamano) <= anchoMax) return { texto: limpio, tamano };
  }
  while (limpio.length > 1 && fuente.widthOfTextAtSize(`${limpio}...`, minimo) > anchoMax) limpio = limpio.slice(0, -1);
  return { texto: `${limpio.trimEnd()}...`, tamano: minimo };
}

/**
 * Adaptador: hoja A4 de tarjetas de acceso (RF-017, CR-01) con pdf-lib, sin dependencias nativas.
 * 8 tarjetas por hoja (2 × 4) con líneas de corte. Cada tarjeta lleva el aula, el avatar dibujado
 * (el mismo animalito que el niño toca en la tablet), el alias y el PIN, con destellos de adorno: es el
 * único lugar donde aparece el PIN en claro. El PDF no se guarda en el servidor.
 */
export class PdfLibTarjetas implements GeneradorTarjetasPdf {
  async generar(datos: { nombreAula: string; tarjetas: TarjetaAcceso[] }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    // Los metadatos admiten Unicode; solo el texto dibujado se limita a la fuente estándar.
    doc.setTitle(`Tarjetas de acceso — ${datos.nombreAula}`);
    doc.setAuthor('LectoAventura');
    doc.setLanguage('es-PE');
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

    const ancho = (ANCHO - 2 * MARGEN) / COLUMNAS;
    const alto = (ALTO - 2 * MARGEN) / FILAS;
    for (let inicio = 0; inicio < datos.tarjetas.length; inicio += TARJETAS_POR_HOJA) {
      const pagina = doc.addPage([ANCHO, ALTO]);
      datos.tarjetas.slice(inicio, inicio + TARJETAS_POR_HOJA).forEach((tarjeta, lugar) => {
        const x = MARGEN + (lugar % COLUMNAS) * ancho;
        const y = ALTO - MARGEN - (Math.floor(lugar / COLUMNAS) + 1) * alto;
        this.dibujarTarjeta(pagina, tarjeta, { x, y, ancho, alto }, normal, negrita);
      });
    }

    return Buffer.from(await doc.save());
  }

  private dibujarTarjeta(
    p: PDFPage,
    t: TarjetaAcceso,
    caja: { x: number; y: number; ancho: number; alto: number },
    normal: PDFFont,
    negrita: PDFFont,
  ): void {
    const { x, y, ancho, alto } = caja;
    const avatar = AVATARES_PDF[t.avatar] ?? { nombre: t.avatar, fondo: '#ede8ff' };
    const centrado = (contenido: string, fuente: PDFFont, tamano: number, cy: number, color: RGB, cx = x + ancho / 2) => {
      const limpio = texto(contenido);
      p.drawText(limpio, { x: cx - fuente.widthOfTextAtSize(limpio, tamano) / 2, y: cy, size: tamano, font: fuente, color });
    };

    // Línea de corte punteada alrededor de la tarjeta.
    p.drawRectangle({ x, y, width: ancho, height: alto, borderColor: CORTE, borderWidth: 0.8, borderDashArray: [4, 3] });

    // La tarjeta: esquinas redondeadas y franja violeta arriba con la marca (y su estrellita) y el aula.
    const m = 9;
    const x0 = x + m;
    const y0 = y + m;
    const w = ancho - 2 * m;
    const h = alto - 2 * m;
    const arriba = y0 + h;
    cajaRedondeada(p, { x: x0, y: y0, ancho: w, alto: h, radio: 14 }, { color: rgb(1, 1, 1) });
    cajaRedondeada(p, { x: x0, y: arriba - 34, ancho: w, alto: 34, radio: 14 }, { color: VIOLETA });
    p.drawRectangle({ x: x0, y: arriba - 34, width: w, height: 16, color: VIOLETA });
    estrella(p, x0 + 17, arriba - 17, 7.5, AMARILLO);
    p.drawText('Lecto', { x: x0 + 29, y: arriba - 21.5, size: 12.5, font: negrita, color: rgb(1, 1, 1) });
    p.drawText('Aventura', { x: x0 + 29 + negrita.widthOfTextAtSize('Lecto', 12.5), y: arriba - 21.5, size: 12.5, font: negrita, color: AMARILLO });
    destello(p, x0 + 128, arriba - 10, 3.5, AMARILLO, 0.9);
    destello(p, x0 + 140, arriba - 25, 2.5, rgb(1, 1, 1), 0.7);
    // El aula, en una pastilla a la derecha de la franja.
    const libreFranja = w - 29 - negrita.widthOfTextAtSize('LectoAventura', 12.5) - 40;
    const aula = ajustarAlAncho(t.nombreAula, normal, 9.5, 7, libreFranja);
    const anchoAula = normal.widthOfTextAtSize(aula.texto, aula.tamano) + 16;
    cajaRedondeada(p, { x: x0 + w - 10 - anchoAula, y: arriba - 26, ancho: anchoAula, alto: 18, radio: 9 }, { color: VIOLETA_CLARO });
    p.drawText(aula.texto, { x: x0 + w - 2 - anchoAula, y: arriba - 20.5, size: aula.tamano, font: normal, color: rgb(1, 1, 1) });

    // El avatar: su animalito en un aro dorado, con destellos alrededor, y su nombre en una pastilla.
    const cx = x0 + 58;
    const cy = y0 + 92;
    p.drawCircle({ x: cx, y: cy, size: 35, color: AMARILLO });
    p.drawCircle({ x: cx, y: cy, size: 32.5, color: rgb(1, 1, 1) });
    if (!dibujarAvatar(p, t.avatar, cx, cy, 30)) centrado(avatar.nombre.charAt(0).toUpperCase(), negrita, 26, cy - 9, TINTA, cx);
    destello(p, cx + 33, cy + 31, 6, AMARILLO);
    destello(p, cx - 37, cy + 22, 4, ROSA);
    destello(p, cx + 40, cy - 14, 3, hex('#c9b6ff'));
    p.drawCircle({ x: cx - 34, y: cy - 22, size: 1.8, color: AMARILLO });
    const anchoNombre = normal.widthOfTextAtSize(texto(avatar.nombre), 9) + 18;
    cajaRedondeada(p, { x: cx - anchoNombre / 2, y: cy - 55, ancho: anchoNombre, alto: 15, radio: 7.5 }, { color: hex(avatar.fondo), borde: hex('#e6e0fb'), grosor: 0.8 });
    centrado(avatar.nombre, normal, 9, cy - 50.5, TINTA, cx);

    // Alias y PIN (el PIN, dígito por dígito, en cajitas de crema con sombra dorada).
    const columna = x0 + 118;
    p.drawText('¡Hola! Soy', { x: columna, y: cy + 30, size: 9.5, font: negrita, color: VIOLETA });
    const alias = ajustarAlAncho(t.alias, negrita, 20, 11, x0 + w - 10 - columna);
    p.drawText(alias.texto, { x: columna, y: cy + 10, size: alias.tamano, font: negrita, color: TINTA });
    this.candado(p, columna + 4, cy - 6);
    p.drawText('Mi PIN', { x: columna + 12, y: cy - 9.5, size: 9, font: normal, color: TINTA_SUAVE });
    t.pin.split('').forEach((digito, i) => {
      const bx = columna + i * 31;
      cajaRedondeada(p, { x: bx + 1.5, y: cy - 49.5, ancho: 26, alto: 31, radio: 6 }, { color: hex('#f2cf6b') });
      cajaRedondeada(p, { x: bx, y: cy - 48, ancho: 26, alto: 31, radio: 6 }, { color: CREMA, borde: AMARILLO, grosor: 1.3 });
      centrado(digito, negrita, 18, cy - 39, TINTA, bx + 13);
    });

    // Instrucciones para la niña o el niño (y para quien le ayude), en una franja lila.
    cajaRedondeada(p, { x: x0 + 8, y: y0 + 6, ancho: w - 16, alto: 25, radio: 9 }, { color: LILA });
    centrado('Toca tu avatar en la tablet del aula y escribe tu PIN.', normal, 7.8, y0 + 20.5, TINTA_SUAVE);
    centrado('Tu PIN es secreto: no lo compartas.', negrita, 7.8, y0 + 11, VIOLETA);

    // El borde violeta va al final, por encima de todo.
    cajaRedondeada(p, { x: x0, y: y0, ancho: w, alto: h, radio: 14 }, { borde: VIOLETA, grosor: 1.6 });
  }

  /** Un candadito junto a «Mi PIN». */
  private candado(p: PDFPage, cx: number, cy: number): void {
    p.drawSvgPath('M -2.6 -1 L -2.6 -3.2 Q -2.6 -6 0 -6 Q 2.6 -6 2.6 -3.2 L 2.6 -1', { x: cx, y: cy, borderColor: TINTA_SUAVE, borderWidth: 1.1 });
    cajaRedondeada(p, { x: cx - 3.8, y: cy - 4.5, ancho: 7.6, alto: 5.8, radio: 1.4 }, { color: TINTA_SUAVE });
  }
}
