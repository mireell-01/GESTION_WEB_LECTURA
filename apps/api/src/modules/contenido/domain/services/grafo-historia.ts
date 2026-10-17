import { DatoLecturaInvalidoError } from '../errors/errores-contenido';

export const MAX_NODOS = 60;
export const MAX_OPCIONES = 3;

export interface OpcionNodo {
  texto: string;
  /** Clave del nodo al que lleva la decisión. */
  destino: string;
}

/** Nodo de una historia ramificada (RF-029, RF-048). */
export interface NodoHistoria {
  id: string;
  clave: string;
  contenido: string;
  esInicio: boolean;
  esFinal: boolean;
  opciones: OpcionNodo[];
}

export interface NodoNuevo {
  id?: string;
  clave: string;
  contenido: string;
  esInicio?: boolean;
  esFinal?: boolean;
  opciones?: { texto: string; destino: string }[];
}

/**
 * Al guardar se exige que el grafo sea coherente (claves únicas, opciones que llevan a nodos que
 * existen); que sea una historia completa (un inicio, sin ciclos, todo nodo llega a un final) se
 * valida antes de enviar a revisión, para que el editor pueda guardar mientras la arma.
 */
export function construirGrafo(entrada: NodoNuevo[], generarId: () => string): NodoHistoria[] {
  if (entrada.length > MAX_NODOS) throw new DatoLecturaInvalidoError(`Una historia admite hasta ${MAX_NODOS} nodos`);
  const claves = entrada.map((n) => n.clave.trim());
  if (claves.some((c) => c.length < 1 || c.length > 40)) throw new DatoLecturaInvalidoError('Cada nodo necesita un nombre corto (hasta 40 caracteres)');
  if (new Set(claves).size !== claves.length) throw new DatoLecturaInvalidoError('Hay nodos con el mismo nombre');
  return entrada.map((n, i) => {
    const contenido = n.contenido.trim();
    if (contenido.length < 3 || contenido.length > 2000) throw new DatoLecturaInvalidoError(`Nodo "${claves[i]}": escribe su texto (3 a 2000 caracteres)`);
    const opciones = (n.opciones ?? []).map((o) => ({ texto: o.texto.trim(), destino: o.destino.trim() }));
    if (opciones.length > MAX_OPCIONES) throw new DatoLecturaInvalidoError(`Nodo "${claves[i]}": hasta ${MAX_OPCIONES} decisiones`);
    for (const o of opciones) {
      if (o.texto.length < 1 || o.texto.length > 120) throw new DatoLecturaInvalidoError(`Nodo "${claves[i]}": escribe el texto de cada decisión`);
      if (!claves.includes(o.destino)) throw new DatoLecturaInvalidoError(`Nodo "${claves[i]}": la decisión lleva a un nodo que no existe`);
    }
    return { id: n.id ?? generarId(), clave: claves[i] as string, contenido, esInicio: !!n.esInicio, esFinal: !!n.esFinal, opciones };
  });
}

/** RF-029: un inicio, finales sin decisiones, sin ciclos, todo nodo alcanzable y que llega a un final. */
export function problemasDelGrafo(nodos: NodoHistoria[]): string[] {
  if (nodos.length === 0) return [];
  const problemas: string[] = [];
  const porClave = new Map(nodos.map((n) => [n.clave, n]));
  const inicios = nodos.filter((n) => n.esInicio);
  if (inicios.length !== 1) problemas.push('La historia debe tener exactamente un nodo de inicio');
  if (!nodos.some((n) => n.esFinal)) problemas.push('La historia necesita al menos un final');
  for (const n of nodos) {
    if (n.esFinal && n.opciones.length > 0) problemas.push(`El final "${n.clave}" no debe tener decisiones`);
    if (!n.esFinal && n.opciones.length === 0) problemas.push(`El nodo "${n.clave}" necesita al menos una decisión o ser un final`);
    if (n.opciones.some((o) => o.destino === n.clave)) problemas.push(`El nodo "${n.clave}" no puede llevar a sí mismo`);
  }

  // Ciclos: búsqueda en profundidad con nodos "en curso".
  const estado = new Map<string, 'en-curso' | 'listo'>();
  let hayCiclo = false;
  const visitar = (clave: string) => {
    if (estado.get(clave) === 'listo' || hayCiclo) return;
    if (estado.get(clave) === 'en-curso') {
      hayCiclo = true;
      return;
    }
    estado.set(clave, 'en-curso');
    for (const o of porClave.get(clave)?.opciones ?? []) visitar(o.destino);
    estado.set(clave, 'listo');
  };
  nodos.forEach((n) => visitar(n.clave));
  if (hayCiclo) problemas.push('La historia tiene un ciclo: ninguna decisión puede volver a un nodo anterior');

  // Alcanzables desde el inicio.
  const inicio = inicios[0];
  if (inicio) {
    const vistos = new Set<string>();
    const pendientes = [inicio.clave];
    while (pendientes.length) {
      const c = pendientes.pop() as string;
      if (vistos.has(c)) continue;
      vistos.add(c);
      pendientes.push(...(porClave.get(c)?.opciones ?? []).map((o) => o.destino));
    }
    const sueltos = nodos.filter((n) => !vistos.has(n.clave)).map((n) => `"${n.clave}"`);
    if (sueltos.length) problemas.push(`No se llega desde el inicio a: ${sueltos.join(', ')}`);
  }

  // Todo nodo llega a un final (sin ciclos, basta con que cada camino termine en un final).
  if (!hayCiclo) {
    const llega = new Map<string, boolean>();
    const llegaAFinal = (c: string): boolean => {
      if (llega.has(c)) return llega.get(c) as boolean;
      const n = porClave.get(c);
      const r = !!n && (n.esFinal || (n.opciones.length > 0 && n.opciones.every((o) => llegaAFinal(o.destino))));
      llega.set(c, r);
      return r;
    };
    const sinFinal = nodos.filter((n) => !llegaAFinal(n.clave)).map((n) => `"${n.clave}"`);
    if (sinFinal.length) problemas.push(`Desde estos nodos no se llega a un final: ${sinFinal.join(', ')}`);
  }
  return problemas;
}
