import { filtrarPalabras } from '../../../shared-kernel/public-api';
import { normalizar, palabrasClave } from './texto';

export type MotivoBloqueo = 'CLAVE' | 'DATOS_PERSONALES' | 'INAPROPIADO';

/** Lo que dice el asistente cuando bloquea una respuesta: una guía que no revela nada. */
export const RESPUESTA_SEGURA = 'Prefiero que lo descubras tú. Vuelve a leer con calma la parte del texto que habla de la pregunta: ¡tú puedes!';

/** Frases que confirman o señalan una opción ("la respuesta es…", "marca la b", "la segunda"). */
const CONFIRMA_RESPUESTA =
  /\b(la respuesta (correcta )?es|la correcta es|la opcion correcta|es correcta|es incorrecta|marca la|elige la|escoge la|la opcion [abcd]|la [abcd]\b|la (primera|segunda|tercera|cuarta|ultima) opcion|el orden es|primero va|las oraciones son|la oracion es)\b/;

/** Pedir datos personales (RN-16): nombre, apellido, dónde vive, teléfono, correo, colegio o edad. */
const PIDE_DATOS =
  /\b(como te llamas|cual es tu nombre|tu nombre completo|tu apellido|donde vives|tu direccion|tu telefono|tu celular|tu numero|tu correo|tu email|en que colegio|tu colegio|cuantos anos tienes|tu edad|tu contrasena|tu pin|tus papas se llaman)\b/;

const DATO_PERSONAL = /[\w.+-]+@[\w-]+(\.[\w-]+)+|(?:\+?\d[\s-]?){6,}|\bhttps?:\/\//i;

/** Palabras de cualquier guía de lectura: no distinguen una clave ("lo dice el texto", "lee la pregunta"). */
const DE_LECTURA = new Set(
  'texto textos dice dicen decir lee leer lees leyendo pregunta preguntas respuesta opcion opciones parte palabra palabras oracion oraciones parrafo historia lectura cuento porque piensa pienso piensas creo crees'.split(' '),
);

/**
 * ¿El texto dice una de las claves? La frase completa, o casi todas sus palabras distintivas si es
 * larga (similitud léxica: al menos 3 y el 60 %).
 */
function revelaClave(texto: string, claves: string[]): boolean {
  const normal = ` ${normalizar(texto)} `;
  const palabrasTexto = new Set(palabrasClave(texto));
  return claves.some((clave) => {
    const frase = normalizar(clave);
    const contenido = palabrasClave(clave);
    // Claves muy cortas ("Sí", "No"): solo cuentan si se confirman con una frase (CONFIRMA_RESPUESTA).
    if (frase.length >= 4 && contenido.length >= 1 && normal.includes(` ${frase} `)) return true;
    const distintivas = contenido.filter((p) => !DE_LECTURA.has(p));
    const comunes = distintivas.filter((p) => palabrasTexto.has(p)).length;
    return distintivas.length >= 3 && comunes >= 3 && comunes / distintivas.length >= 0.6;
  });
}

/**
 * RF-073, RN-16: revisa lo que el asistente va a decir antes de mostrarlo. Bloquea si revela la clave
 * (la opción correcta, las oraciones de evidencia, el orden o la explicación), si confirma o señala una
 * opción, si pide o contiene datos personales, o si tiene palabras no apropiadas. En ese caso dice
 * RESPUESTA_SEGURA. Es la última barrera: con el motor sin conexión no debería bloquear nunca, y es la
 * que protege a los niños si se conecta un modelo externo (ADR-008). Citar tal cual el `enunciado` (la
 * pregunta que el niño ya tiene en pantalla) no revela nada: se revisa todo lo demás.
 */
export function revisarSalida(texto: string, claves: string[], enunciado?: string): { texto: string; bloqueado: boolean; motivo: MotivoBloqueo | null } {
  const revisable = enunciado?.trim() ? texto.split(enunciado).join(' ') : texto;
  const normal = normalizar(revisable);
  let motivo: MotivoBloqueo | null = null;
  if (revelaClave(revisable, claves) || CONFIRMA_RESPUESTA.test(normal)) motivo = 'CLAVE';
  else if (PIDE_DATOS.test(normal) || DATO_PERSONAL.test(revisable)) motivo = 'DATOS_PERSONALES';
  else if (filtrarPalabras(texto).filtrado) motivo = 'INAPROPIADO';
  return motivo ? { texto: RESPUESTA_SEGURA, bloqueado: true, motivo } : { texto, bloqueado: false, motivo: null };
}
