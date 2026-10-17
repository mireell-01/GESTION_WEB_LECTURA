/**
 * Lo que la capa interface necesita del dominio (límites y formas de entrada), expuesto por la
 * aplicación: la interface nunca importa el dominio directamente (regla de dependencias, SRS §5).
 */
export { MAX_ACTIVIDADES } from '../../domain/services/actividades';
export type { ActividadNueva } from '../../domain/services/actividades';
export { MAX_NODOS } from '../../domain/services/grafo-historia';
export type { NodoNuevo } from '../../domain/services/grafo-historia';
export { MAX_CARACTERES_TEXTO } from '../../domain/services/segmentador';
export { MAX_BYTES_AUDIO } from '../../domain/services/politica-recursos';
export { HABILIDADES, RANGOS_EDAD, TIPOS_TEXTO } from '../../domain/value-objects/metadatos-lectura';
