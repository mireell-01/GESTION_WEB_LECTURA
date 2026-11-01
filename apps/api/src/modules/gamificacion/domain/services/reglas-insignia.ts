import { esHabilidad, Habilidad, NivelCNEB } from '../../../shared-kernel/public-api';

/**
 * RF-058: la regla con que se gana cada insignia (columna `regla` del catálogo). Las de conteo
 * (lecturas, evidencias) guardan su avance; las demás se evalúan con el evento que las cumple.
 */
export type ReglaInsignia =
  | { tipo: 'LECTURAS'; meta: number }
  | { tipo: 'EVIDENCIAS'; meta: number }
  | { tipo: 'NIVEL_HABILIDAD'; habilidad: Habilidad; nivel: NivelCNEB }
  | { tipo: 'RACHA'; dias: number }
  | { tipo: 'MUNDO'; numero: number };

export type Contador = 'LECTURAS' | 'EVIDENCIAS';

export interface InsigniaCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  regla: ReglaInsignia;
}

const NIVELES: NivelCNEB[] = ['C', 'B', 'A', 'AD'];
const ORDEN_TIPO: ReglaInsignia['tipo'][] = ['LECTURAS', 'EVIDENCIAS', 'NIVEL_HABILIDAD', 'RACHA', 'MUNDO'];

function positivo(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) > 0;
}

/** Una regla mal formada deja la insignia fuera del juego (no se puede ganar) en lugar de fallar. */
export function leerRegla(json: unknown): ReglaInsignia | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as Record<string, unknown>;
  switch (r['tipo']) {
    case 'LECTURAS':
    case 'EVIDENCIAS':
      return positivo(r['meta']) ? { tipo: r['tipo'], meta: r['meta'] } : null;
    case 'NIVEL_HABILIDAD':
      return esHabilidad(r['habilidad']) && NIVELES.includes(r['nivel'] as NivelCNEB)
        ? { tipo: 'NIVEL_HABILIDAD', habilidad: r['habilidad'], nivel: r['nivel'] as NivelCNEB }
        : null;
    case 'RACHA':
      return positivo(r['dias']) ? { tipo: 'RACHA', dias: r['dias'] } : null;
    case 'MUNDO':
      return positivo(r['numero']) ? { tipo: 'MUNDO', numero: r['numero'] } : null;
    default:
      return null;
  }
}

/** Cuánto pide la insignia, para mostrar "3 de 5" en el pasaporte (null: no se cuenta). */
export function metaDe(regla: ReglaInsignia): number | null {
  if (regla.tipo === 'LECTURAS' || regla.tipo === 'EVIDENCIAS') return regla.meta;
  if (regla.tipo === 'RACHA') return regla.dias;
  return null;
}

/** Las insignias que se ganan contando: su umbral (lecturas, evidencias o días) se puede ajustar (RF-078). */
export function tieneUmbral(regla: ReglaInsignia): boolean {
  return metaDe(regla) !== null;
}

/**
 * RF-078: el catálogo con los umbrales de la versión vigente de los parámetros. Una insignia sin umbral
 * configurado conserva el del catálogo; las de nivel y de mundo no tienen umbral.
 */
export function aplicarUmbrales(catalogo: InsigniaCatalogo[], umbrales: Record<string, number>): InsigniaCatalogo[] {
  return catalogo.map((i) => {
    const umbral = umbrales[i.codigo];
    if (!umbral) return i;
    if (i.regla.tipo === 'LECTURAS' || i.regla.tipo === 'EVIDENCIAS') return { ...i, regla: { ...i.regla, meta: umbral } };
    if (i.regla.tipo === 'RACHA') return { ...i, regla: { ...i.regla, dias: umbral } };
    return i;
  });
}

/** El nivel declarado llega al que pide la regla (AD ⊃ A ⊃ B ⊃ C). */
export function alcanzaNivel(actual: NivelCNEB, requerido: NivelCNEB): boolean {
  return NIVELES.indexOf(actual) >= NIVELES.indexOf(requerido);
}

/** Orden del pasaporte: primero las de lectura, luego habilidad, racha y los rangos del mapa. */
export function ordenarCatalogo(lista: InsigniaCatalogo[]): InsigniaCatalogo[] {
  const clave = (r: ReglaInsignia) => ('numero' in r ? r.numero : 'meta' in r ? r.meta : 'dias' in r ? r.dias : 0);
  return [...lista].sort(
    (a, b) => ORDEN_TIPO.indexOf(a.regla.tipo) - ORDEN_TIPO.indexOf(b.regla.tipo) || clave(a.regla) - clave(b.regla) || a.codigo.localeCompare(b.codigo),
  );
}
