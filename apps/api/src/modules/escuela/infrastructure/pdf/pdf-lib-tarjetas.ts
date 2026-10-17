import { PDFDocument, PDFFont, PDFPage, rgb, RGB, StandardFonts } from 'pdf-lib';

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
const VIOLETA_SUAVE = hex('#ede8ff');
const AMARILLO = hex('#ffc83d');
const TINTA = hex('#1e1a4d');
const TINTA_SUAVE = hex('#4b4778');
const CORTE = hex('#b9b3d6');

/** Nombre y color de fondo de cada avatar (los mismos de la web, en @lectoaventura/ui). */
const AVATARES: Record<string, { nombre: string; fondo: string }> = {
  zorro: { nombre: 'Zorro', fondo: '#ffe2c2' },
  panda: { nombre: 'Panda', fondo: '#e4e9f2' },
  leon: { nombre: 'León', fondo: '#ffefb8' },
  rana: { nombre: 'Rana', fondo: '#d9f5d0' },
  pulpo: { nombre: 'Pulpo', fondo: '#ffdde8' },
  buho: { nombre: 'Búho', fondo: '#ede3ff' },
  tortuga: { nombre: 'Tortuga', fondo: '#ddf3e4' },
  unicornio: { nombre: 'Unicornio', fondo: '#f6ddff' },
  abeja: { nombre: 'Abeja', fondo: '#fff4b8' },
  delfin: { nombre: 'Delfín', fondo: '#d6ecff' },
  tigre: { nombre: 'Tigre', fondo: '#ffe0b3' },
  koala: { nombre: 'Koala', fondo: '#e8e6f0' },
};

function hex(color: string): RGB {
  const n = parseInt(color.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Las fuentes estándar del PDF usan WinAnsi: se conservan tildes y ñ, se reemplaza lo demás. */
function texto(valor: string): string {
  return valor.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

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
 * 8 tarjetas por hoja (2 × 4) con líneas de corte. Cada tarjeta lleva el aula, el avatar, el alias
 * y el PIN: es el único lugar donde aparece el PIN en claro. El PDF no se guarda en el servidor.
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
    const avatar = AVATARES[t.avatar] ?? { nombre: t.avatar, fondo: '#ede8ff' };
    const centrado = (contenido: string, fuente: PDFFont, tamano: number, cy: number, color: RGB, cx = x + ancho / 2) => {
      const limpio = texto(contenido);
      p.drawText(limpio, { x: cx - fuente.widthOfTextAtSize(limpio, tamano) / 2, y: cy, size: tamano, font: fuente, color });
    };

    // Línea de corte punteada alrededor de la tarjeta.
    p.drawRectangle({ x, y, width: ancho, height: alto, borderColor: CORTE, borderWidth: 0.8, borderDashArray: [4, 3] });

    // Tarjeta con franja superior violeta: marca y aula.
    const m = 10;
    p.drawRectangle({ x: x + m, y: y + m, width: ancho - 2 * m, height: alto - 2 * m, color: rgb(1, 1, 1), borderColor: VIOLETA, borderWidth: 1.5 });
    p.drawRectangle({ x: x + m, y: y + alto - m - 30, width: ancho - 2 * m, height: 30, color: VIOLETA });
    p.drawText('Lecto', { x: x + m + 10, y: y + alto - m - 20, size: 13, font: negrita, color: rgb(1, 1, 1) });
    p.drawText('Aventura', { x: x + m + 10 + negrita.widthOfTextAtSize('Lecto', 13), y: y + alto - m - 20, size: 13, font: negrita, color: AMARILLO });
    // El aula ocupa lo que queda de la franja a la derecha de la marca.
    const libreFranja = ancho - 2 * m - 20 - negrita.widthOfTextAtSize('LectoAventura', 13) - 12;
    const aula = ajustarAlAncho(t.nombreAula, normal, 10, 7, libreFranja);
    p.drawText(aula.texto, {
      x: x + ancho - m - 10 - normal.widthOfTextAtSize(aula.texto, aula.tamano),
      y: y + alto - m - 19,
      size: aula.tamano,
      font: normal,
      color: hex('#e0daff'),
    });

    // Avatar: círculo de su color con la inicial, y su nombre debajo.
    const cx = x + m + 52;
    const cy = y + alto / 2 + 2;
    p.drawCircle({ x: cx, y: cy, size: 30, color: hex(avatar.fondo), borderColor: VIOLETA_SUAVE, borderWidth: 2 });
    centrado(avatar.nombre.charAt(0).toUpperCase(), negrita, 26, cy - 9, TINTA, cx);
    centrado(avatar.nombre, normal, 10, cy - 46, TINTA_SUAVE, cx);

    // Alias y PIN.
    const columna = x + m + 108;
    p.drawText('Soy', { x: columna, y: cy + 26, size: 10, font: normal, color: TINTA_SUAVE });
    const alias = ajustarAlAncho(t.alias, negrita, 19, 11, x + ancho - m - 10 - columna);
    p.drawText(alias.texto, { x: columna, y: cy + 8, size: alias.tamano, font: negrita, color: TINTA });
    p.drawText('Mi PIN', { x: columna, y: cy - 12, size: 10, font: normal, color: TINTA_SUAVE });
    t.pin.split('').forEach((digito, i) => {
      const bx = columna + i * 30;
      p.drawRectangle({ x: bx, y: cy - 46, width: 25, height: 29, color: hex('#fff6dc'), borderColor: AMARILLO, borderWidth: 1.2 });
      centrado(digito, negrita, 18, cy - 39, TINTA, bx + 12.5);
    });

    // Instrucciones para la niña o el niño (y para quien le ayude).
    centrado('Toca tu avatar en la tablet del aula y escribe tu PIN.', normal, 8.5, y + m + 20, TINTA_SUAVE);
    centrado('Tu PIN es secreto: no lo compartas.', negrita, 8.5, y + m + 9, VIOLETA);
  }
}
