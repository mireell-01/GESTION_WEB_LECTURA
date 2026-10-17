/**
 * Puerto: CatalogoAsignable — el docente asigna lecturas (Contenido) o misiones (Aventura) a su aula
 * (RF-018), pero Escuela no conoce esos módulos. Cada uno registra al iniciar la fuente de lo que
 * ya está publicado; así no hay dependencias entre ellos ni ciclos.
 */
export type TipoAsignable = 'LECTURA' | 'MISION';

export interface ContenidoAsignable {
  id: string;
  tipo: TipoAsignable;
  titulo: string;
  /** Dato breve para elegir (p. ej. "Mundo 1 · Explorador" o "8–9 años · nivel 2"). */
  detalle: string;
}

export interface FuenteAsignable {
  tipo: TipoAsignable;
  listar(): Promise<ContenidoAsignable[]>;
  buscar(id: string): Promise<ContenidoAsignable | null>;
}

export interface CatalogoAsignable {
  listar(): Promise<ContenidoAsignable[]>;
  buscar(tipo: TipoAsignable, id: string): Promise<ContenidoAsignable | null>;
}

export interface RegistroCatalogoAsignable extends CatalogoAsignable {
  registrar(fuente: FuenteAsignable): void;
}

export const CATALOGO_ASIGNABLE = Symbol('CATALOGO_ASIGNABLE');
