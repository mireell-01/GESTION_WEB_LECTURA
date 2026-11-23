// El contenido inicial: 5 mundos × 5 misiones × 3 rangos de edad. Las 3 primeras misiones de cada mundo son
// cuentos propios (con su valor y su moraleja en valores.mjs); la 4 y la 5, clásicos de dominio público adaptados.
// Además, la biblioteca tiene lecturas de los otros tipos de texto (poemas, instructivos, anuncios…) para cada edad,
// al menos 5 lecturas por temática para cada edad (biblioteca-temas.mjs) y para cada nivel de lector
// (biblioteca-niveles.mjs), y al menos 5 poemas, anuncios y textos instructivos para cada edad y nivel
// (biblioteca-generos.mjs).
import { LECTURAS_BIBLIOTECA as DE_TIPOS } from './biblioteca.mjs';
import { LECTURAS_GENEROS } from './biblioteca-generos.mjs';
import { LECTURAS_NIVELES } from './biblioteca-niveles.mjs';
import { LECTURAS_TEMAS } from './biblioteca-temas.mjs';
import { CLASICOS } from './clasicos.mjs';
import { CUENTOS_6_7 } from './cuentos-6-7.mjs';
import { CUENTOS_8_9 } from './cuentos-8-9.mjs';
import { CUENTOS_10_12 } from './cuentos-10-12.mjs';
import { MENSAJES } from './valores.mjs';

const PROPIOS = [...CUENTOS_6_7, ...CUENTOS_8_9, ...CUENTOS_10_12].map((cuento) => ({ ...cuento, ...MENSAJES[cuento.clave] }));

export const CUENTOS = [...PROPIOS, ...CLASICOS];

/** Las lecturas de la biblioteca (sin misión): las de cada tipo de texto y las de cada temática. */
export const LECTURAS_BIBLIOTECA = [...DE_TIPOS, ...LECTURAS_TEMAS, ...LECTURAS_NIVELES, ...LECTURAS_GENEROS];

/** Todo lo que se publica: los cuentos de las misiones y las lecturas de la biblioteca. */
export const TODAS = [...CUENTOS, ...LECTURAS_BIBLIOTECA];
