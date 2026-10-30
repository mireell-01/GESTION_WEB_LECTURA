import { filtrarPalabras } from '../../../shared-kernel/public-api';

/** Lo más largo que puede escribir el niño en un mensaje al asistente. */
export const MAX_CARACTERES_MENSAJE = 300;

export type MotivoModeracion = 'DATOS_PERSONALES' | 'INAPROPIADO' | null;

/** Cada patrón de dato personal y con qué se reemplaza (RN-02, RN-16: el asistente no los guarda ni los usa). */
const DATOS_PERSONALES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]'],
  [/\b(?:https?:\/\/|www\.)\S+/gi, '[enlace]'],
  // Teléfonos, DNI y otros números largos (6 dígitos o más, con espacios o guiones).
  [/(?:\+?\d[\s-]?){6,}/g, '[número] '],
  // "Me llamo ana quispe", "mi mamá se llama Rosa": el nombre aunque esté en minúsculas (hasta 4 palabras, sin cruzar "y", "pero"…).
  [
    /\b(me llamo|mi nombre es|mi nombre completo es|mi apellido es|mis apellidos son|mi (?:pap[aá]|mam[aá]|herman[oa]|abuel[oa]|t[ií][oa]|prim[oa]|profe|profesora|profesor|amig[oa]) se llama)\s+\p{L}+(?:\s+(?!(?:y|e|o|pero|porque|que|con|en|tengo|soy|estoy|vivo|me|mi|no)(?!\p{L}))\p{L}+){0,3}/giu,
    '$1 [nombre]',
  ],
  // "Soy Ana Quispe", pero no "soy feliz": solo si sigue un nombre con mayúscula.
  [/\b([Ss]oy)\s+[A-ZÁÉÍÓÚÑ]\p{L}+(?:\s+[A-ZÁÉÍÓÚÑ]\p{L}+){0,3}/gu, '$1 [nombre]'],
  [/\b(vivo en|mi casa (?:queda|est[aá]) en|mi direcci[oó]n es)\s+[^.,;!?\n]+/gi, '$1 [dirección]'],
  [/\b(calle|avenida|av\.?|jir[oó]n|jr\.?|pasaje|psje\.?|urbanizaci[oó]n|urb\.?|mz\.?)\s+[^.,;!?\n]*\d+[^.,;!?\n]*/gi, '[dirección]'],
  [/\b(mi colegio (?:es|se llama)|estudio en el colegio|voy al colegio)\s+[^.,;!?\n]+/gi, '$1 [colegio]'],
];

/** "Urb.", "Jr.", "Av.": sin el punto, para que una dirección no se corte ahí. */
const ABREVIATURAS = /\b(urb|av|jr|psje|mz|lt|nro|dpto)\./gi;

/**
 * RF-073 (moderación de entrada): quita los datos personales que el niño escriba y tapa las groserías
 * antes de guardar o usar el mensaje. Lo que quede es lo único que se conserva (30 días).
 */
export function moderarEntrada(mensaje: string): { texto: string; motivo: MotivoModeracion } {
  let texto = mensaje.replace(/\s+/g, ' ').trim().slice(0, MAX_CARACTERES_MENSAJE).replace(ABREVIATURAS, '$1');
  let personales = false;
  for (const [patron, reemplazo] of DATOS_PERSONALES) {
    const nuevo = texto.replace(patron, reemplazo);
    if (nuevo !== texto) personales = true;
    texto = nuevo;
  }
  const { texto: limpio, filtrado } = filtrarPalabras(texto.replace(/\s+/g, ' ').trim());
  return { texto: limpio, motivo: personales ? 'DATOS_PERSONALES' : filtrado ? 'INAPROPIADO' : null };
}
