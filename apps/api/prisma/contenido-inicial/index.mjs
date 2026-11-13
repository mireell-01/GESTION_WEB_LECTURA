// El contenido inicial: 5 mundos × 5 misiones × 3 rangos de edad. Las 3 primeras misiones de cada mundo son
// cuentos propios (con su valor y su moraleja en valores.mjs); la 4 y la 5, clásicos de dominio público adaptados.
// Además, la biblioteca tiene lecturas de los otros tipos de texto (poemas, instructivos, anuncios…) para cada edad.
import { LECTURAS_BIBLIOTECA } from './biblioteca.mjs';
import { CLASICOS } from './clasicos.mjs';
import { CUENTOS_6_7 } from './cuentos-6-7.mjs';
import { CUENTOS_8_9 } from './cuentos-8-9.mjs';
import { CUENTOS_10_12 } from './cuentos-10-12.mjs';
import { MENSAJES } from './valores.mjs';

const PROPIOS = [...CUENTOS_6_7, ...CUENTOS_8_9, ...CUENTOS_10_12].map((cuento) => ({ ...cuento, ...MENSAJES[cuento.clave] }));

export const CUENTOS = [...PROPIOS, ...CLASICOS];

export { LECTURAS_BIBLIOTECA };

/** Todo lo que se publica: los cuentos de las misiones y las lecturas de la biblioteca. */
export const TODAS = [...CUENTOS, ...LECTURAS_BIBLIOTECA];
