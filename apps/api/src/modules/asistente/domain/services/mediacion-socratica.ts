import type { Habilidad, RangoEdad } from '../../../shared-kernel/public-api';
import { MAX_INTERCAMBIOS } from '../entities/conversacion';
import { MotivoModeracion } from './moderacion-entrada';
import { normalizar } from './texto';

/** Atajos que el niño toca en vez de escribir (6–7 años, R-07 del SRS). */
export const ATAJOS = ['NO_ENTIENDO', 'DONDE_BUSCO', 'PALABRA', 'COMO_EMPIEZO'] as const;
export type Atajo = (typeof ATAJOS)[number];
export type Intencion = Atajo | 'PIDE_RESPUESTA' | 'SALUDO' | 'GRACIAS' | 'OTRO';

/** Lo que el asistente sabe de la lectura: la pregunta en pantalla, nunca su clave (ADR-008). */
export interface ContextoMediacion {
  titulo: string;
  rangoEdad: RangoEdad;
  fase: string;
  pregunta: {
    enunciado: string;
    habilidad: Habilidad;
    modalidad: 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'VOZ';
    esCerrada: boolean;
    multiple: boolean;
    duranteLaLectura: boolean;
    pistasRestantes: number;
  } | null;
}

/**
 * Qué quiere el niño. Primero se mira si pide la respuesta (o intenta saltarse las reglas): eso
 * siempre recibe una guía, nunca la solución.
 */
const PATRONES: [Intencion, RegExp][] = [
  [
    'PIDE_RESPUESTA',
    /\b(respuesta|respuestas|solucion|correcta|correcto|cual es|cual seria|cual marco|cual elijo|cual opcion|que opcion|la [abcd]|opcion [abcd]|letra|alternativa|dime|dimelo|dame la|decime|resuelve|resuelvelo|hazlo tu|hazlo por mi|responde por mi|ignora|olvida|instrucciones|tus reglas|las reglas|eres un|eres una|actua como|finge|haz de cuenta|prompt|primera opcion|segunda opcion|tercera opcion|cuarta opcion)\b/,
  ],
  ['PALABRA', /\b(significa|significado|quiere decir|que es la palabra|que es una|que es un|palabra)\b/],
  ['DONDE_BUSCO', /\b(donde|en que parte|busco|buscar|encuentro|encontrar)\b/],
  ['COMO_EMPIEZO', /\b(como empiezo|como escribo|que escribo|no se que escribir|que pongo|como lo digo|idea)\b/],
  ['NO_ENTIENDO', /\b(no entiendo|no comprendo|no se|que hago|que tengo que hacer|que pide|que dice la pregunta|ayuda|ayudame|explica|explicame|no puedo)\b/],
  ['SALUDO', /^(hola|holi|buenos dias|buenas tardes|buenas|hey|que tal)\b/],
  ['GRACIAS', /\b(gracias|genial|chevere|bacan|listo|ya entendi|entendi)\b/],
];

export function intencionDe(mensaje: { texto?: string; atajo?: Atajo }): Intencion {
  if (mensaje.atajo) return mensaje.atajo;
  const texto = normalizar(mensaje.texto ?? '');
  return PATRONES.find(([, patron]) => patron.test(texto))?.[0] ?? 'OTRO';
}

/** Cómo pensar cada tipo de pregunta, con una pregunta que lo haga pensar (nunca la respuesta). */
function estrategia(p: NonNullable<ContextoMediacion['pregunta']>): string {
  if (p.modalidad === 'EVIDENCIA') {
    return 'Lee cada oración y pregúntate: ¿esta demuestra lo que me preguntan? Si la quitara, ¿se entendería igual?';
  }
  if (p.modalidad === 'ORDENAMIENTO') {
    return 'Piensa: ¿qué pasó primero en la historia? Busca palabras como «un día», «después» o «al final» y sigue el camino del texto.';
  }
  if (p.modalidad === 'ESCRITURA' || p.modalidad === 'VOZ') {
    return 'Aquí no hay una sola respuesta: lo importante es lo que tú piensas y por qué. ¿Qué parte del texto te hace pensar eso?';
  }
  const porHabilidad: Record<Habilidad, string> = {
    LIT: 'La respuesta está escrita en el texto. Busca la parte que habla de lo que te preguntan y compárala con cada opción.',
    INF: 'El texto no lo dice directamente: hay que descubrirlo con pistas. ¿Qué hizo o qué le pasó al personaje? ¿Qué te hace pensar eso?',
    VOC: 'Busca la palabra en el texto y lee toda la oración. ¿Qué otras palabras te ayudan a entenderla?',
    CRI: 'Piensa en lo que pasó: ¿fue una buena idea? ¿Por qué? Elige lo que puedas defender con lo que dice el texto.',
    ARG: '¿Qué razón se apoya en lo que dice el texto? Una buena razón se puede comprobar leyendo.',
  };
  const multiple = p.multiple ? ' Recuerda que puede haber más de una opción correcta.' : '';
  return porHabilidad[p.habilidad] + multiple;
}

/** Para 6–7 años: solo la primera oración (corta y directa). */
function aSuEdad(texto: string, rango: RangoEdad): string {
  if (rango !== 'R1') return texto;
  const [primera] = texto.match(/^[^.?!]*[.?!]/) ?? [texto];
  return primera.trim();
}

const ANIMOS = ['¡Vamos a pensarlo juntos!', '¡Buena pregunta!', '¡Tú puedes!'];

function sinPregunta(c: ContextoMediacion): string {
  switch (c.fase) {
    case 'PREDICCION':
      return `Antes de leer, imagina: con el título «${c.titulo}», ¿qué crees que pasará? Aquí no hay respuesta incorrecta: lo que pienses está bien.`;
    case 'HISTORIA':
      return 'Tú decides el camino. Piensa en qué te gustaría que pasara y elige: ¡la historia sigue con cualquiera de los dos!';
    case 'CIERRE':
      return 'Compara lo que pensaste al principio con lo que pasó. ¿En qué se parecen? ¿Qué te sorprendió?';
    case 'FINALIZADA':
    case 'ABANDONADA':
      return '¡Terminaste esta lectura! Puedes elegir otra en tu biblioteca.';
    default:
      return 'Lee con calma y, cuando aparezca una pregunta, aquí estaré para ayudarte a pensar.';
  }
}

const AVISO_MODERACION: Record<Exclude<MotivoModeracion, null>, string> = {
  DATOS_PERSONALES: 'Aquí no compartas datos personales como nombres completos, direcciones, teléfonos o correos: esos datos son solo tuyos.',
  INAPROPIADO: 'Usemos palabras amables, ¿sí?',
};

/**
 * RF-072: el asistente socrático sin conexión. Orienta con preguntas y estrategias según lo que pide el
 * niño, el tipo de pregunta, la habilidad y su edad; nunca da la respuesta ni reemplaza las pistas
 * oficiales (cuestan puntaje, RN-07): invita a usarlas. Es el motor por defecto y el de respaldo si un
 * modelo externo falla (RNF-011).
 */
export function mediar(c: ContextoMediacion, intencion: Intencion, moderacion: MotivoModeracion, intercambio: number): string {
  const partes: string[] = [];
  if (moderacion) partes.push(AVISO_MODERACION[moderacion]);
  const p = c.pregunta;
  if (!p) {
    partes.push(intencion === 'GRACIAS' ? '¡De nada! Sigue leyendo, lo estás haciendo muy bien.' : sinPregunta(c));
    return partes.join(' ');
  }
  const animo = ANIMOS[(intercambio - 1) % ANIMOS.length] as string;
  const pista = p.esCerrada && p.pistasRestantes > 0 ? ' Si lo necesitas, usa el botón «Pedir una pista».' : '';
  switch (intencion) {
    case 'PIDE_RESPUESTA':
      partes.push(`No te voy a decir la respuesta, ¡pero sé que puedes descubrirla! ${aSuEdad(estrategia(p), c.rangoEdad)}${pista}`);
      break;
    case 'NO_ENTIENDO': {
      const que: Record<typeof p.modalidad, string> = {
        SELECCION: p.multiple ? 'Te pide elegir las opciones correctas: puede haber más de una.' : 'Te pide elegir una opción: léelas todas antes de decidir.',
        EVIDENCIA: 'Te pide tocar en el texto las oraciones que lo demuestran.',
        ORDENAMIENTO: 'Te pide ordenar lo que pasó, de lo primero a lo último.',
        ESCRITURA: 'Te pide escribir lo que tú piensas, con tus palabras.',
        VOZ: 'Te pide decir lo que tú piensas, con tus palabras.',
      };
      partes.push(`Leamos la pregunta despacio: «${p.enunciado}». ${que[p.modalidad]} ¿Qué palabra de la pregunta es la más importante?`);
      break;
    }
    case 'DONDE_BUSCO':
      partes.push(
        p.duranteLaLectura
          ? 'Vuelve a leer con calma la parte del texto que está antes de la pregunta: ahí está lo que necesitas.'
          : 'Puedes buscar en todo el texto. Lee párrafo por párrafo y pregúntate: ¿esto me ayuda a responder?',
      );
      break;
    case 'PALABRA':
      partes.push('Busca la palabra en el texto y lee toda la oración. ¿Qué otras palabras te dan una pista? Prueba a cambiarla por otra que conozcas: ¿la oración sigue teniendo sentido?');
      break;
    case 'COMO_EMPIEZO':
      partes.push(
        p.esCerrada
          ? `${animo} ${aSuEdad(estrategia(p), c.rangoEdad)}`
          : 'Puedes empezar con «Yo creo que…» y luego decir por qué: «…porque en el texto dice…». ¿Qué piensas tú?',
      );
      break;
    case 'SALUDO':
      partes.push(`¡Hola! Estoy aquí para ayudarte a pensar. ${aSuEdad(estrategia(p), c.rangoEdad)}`);
      break;
    case 'GRACIAS':
      partes.push('¡De nada! Sigue así, lo estás haciendo muy bien.');
      break;
    default:
      partes.push(`Hablemos de la lectura. ${aSuEdad(estrategia(p), c.rangoEdad)}`);
  }
  return partes.join(' ');
}

/** RF-074: el intercambio número 11 recibe un cierre amable, sin contar ni guardarse. */
export const MENSAJE_CIERRE = `¡Hoy ya conversamos ${MAX_INTERCAMBIOS} veces en esta lectura! Ahora sigue tú: vuelve a leer con calma y confía en lo que piensas. Si lo necesitas, usa el botón «Pedir una pista».`;

/** Cómo queda guardado un atajo como mensaje del niño. */
export const TEXTO_ATAJO: Record<Atajo, string> = {
  NO_ENTIENDO: 'No entiendo la pregunta',
  DONDE_BUSCO: '¿Dónde busco?',
  PALABRA: '¿Qué significa una palabra?',
  COMO_EMPIEZO: '¿Cómo empiezo?',
};
