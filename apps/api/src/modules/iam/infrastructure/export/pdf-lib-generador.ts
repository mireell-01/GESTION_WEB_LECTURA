import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

import { DatosExportacion, GeneradorPdfExportacion } from '../../application/ports/exportaciones';

const MARGEN = 50;
const ANCHO = 595.28; // A4
const ALTO = 841.89;
const AZUL = rgb(0.12, 0.31, 0.82);
const GRIS = rgb(0.31, 0.35, 0.43);

const TITULOS: Record<string, string> = {
  perfil: 'Perfil del estudiante',
  consentimiento: 'Consentimiento',
  aulas: 'Aulas',
};

const ETIQUETAS: Record<string, string> = {
  id: 'Identificador',
  alias: 'Alias',
  avatar: 'Avatar',
  anioNacimiento: 'Año de nacimiento',
  mesNacimiento: 'Mes de nacimiento',
  rangoEdad: 'Rango de edad',
  activo: 'Activo',
  creadoEn: 'Creado el',
  tipo: 'Tipo',
  versionPolitica: 'Versión de la política',
  otorgadoEn: 'Otorgado el',
  otorgante: 'Otorgante',
  medio: 'Medio',
  aula: 'Aula',
  grado: 'Grado',
  anioLectivo: 'Año lectivo',
};

/** Las fuentes estándar del PDF usan WinAnsi: se conservan tildes y ñ, se reemplaza lo demás. */
function texto(valor: unknown): string {
  const plano =
    valor === null || valor === undefined
      ? '—'
      : typeof valor === 'boolean'
        ? valor
          ? 'Sí'
          : 'No'
        : String(valor);
  return plano.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
}

/** Adaptador: genera el PDF de la exportación (RF-012) con pdf-lib, sin dependencias nativas. */
export class PdfLibGenerador implements GeneradorPdfExportacion {
  async generar(datos: DatosExportacion): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle('Datos del estudiante — LectoAventura');
    doc.setLanguage('es-PE');
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

    let pagina = doc.addPage([ANCHO, ALTO]);
    let y = ALTO - MARGEN;

    const linea = (contenido: string, fuente: PDFFont, tamano: number, color = rgb(0.08, 0.13, 0.24), sangria = 0) => {
      for (const parte of this.ajustar(contenido, fuente, tamano, ANCHO - 2 * MARGEN - sangria)) {
        if (y < MARGEN + tamano) {
          pagina = doc.addPage([ANCHO, ALTO]);
          y = ALTO - MARGEN;
        }
        pagina.drawText(parte, { x: MARGEN + sangria, y, size: tamano, font: fuente, color });
        y -= tamano * 1.45;
      }
    };

    linea('LectoAventura', negrita, 20, AZUL);
    linea('Datos personales y de progreso del estudiante', negrita, 14);
    linea(`Generado el ${new Date(datos.generadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima' })}`, normal, 10, GRIS);
    linea(texto(datos.aviso), normal, 10, GRIS);
    y -= 8;

    const { generadoEn: _g, aviso: _a, ...secciones } = datos;
    for (const [clave, valor] of Object.entries(secciones)) {
      y -= 6;
      linea(TITULOS[clave] ?? clave.charAt(0).toUpperCase() + clave.slice(1), negrita, 13, AZUL);
      this.escribirValor(valor, (t, sangria = 0, enNegrita = false) => linea(t, enNegrita ? negrita : normal, 10.5, undefined, sangria));
    }

    this.numerarPaginas(doc.getPages(), normal);
    return Buffer.from(await doc.save());
  }

  private escribirValor(valor: unknown, escribir: (t: string, sangria?: number, negrita?: boolean) => void, sangria = 0): void {
    if (valor === null || valor === undefined) {
      escribir('Sin datos', sangria);
    } else if (Array.isArray(valor)) {
      if (valor.length === 0) escribir('Sin registros', sangria);
      valor.forEach((elemento, i) => {
        escribir(`${i + 1}.`, sangria, true);
        this.escribirValor(elemento, escribir, sangria + 14);
      });
    } else if (typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        if (v !== null && typeof v === 'object') {
          escribir(`${ETIQUETAS[k] ?? k}:`, sangria, true);
          this.escribirValor(v, escribir, sangria + 14);
        } else {
          escribir(`${ETIQUETAS[k] ?? k}: ${texto(v)}`, sangria);
        }
      }
    } else {
      escribir(texto(valor), sangria);
    }
  }

  private ajustar(contenido: string, fuente: PDFFont, tamano: number, anchoMax: number): string[] {
    const lineas: string[] = [];
    let actual = '';
    for (const palabra of texto(contenido).split(' ')) {
      const candidata = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(candidata, tamano) > anchoMax && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = candidata;
      }
    }
    lineas.push(actual);
    return lineas;
  }

  private numerarPaginas(paginas: PDFPage[], fuente: PDFFont): void {
    paginas.forEach((p, i) =>
      p.drawText(`Página ${i + 1} de ${paginas.length}`, { x: ANCHO - MARGEN - 80, y: 25, size: 9, font: fuente, color: GRIS }),
    );
  }
}
