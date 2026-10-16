/**
 * Identificadores tipados (branded types) — evita intercambiar IDs de distintas entidades.
 */
export type EntityId<T extends string> = string & { readonly __marca: T };

export type SesionId = EntityId<'SesionId'>;
export type EstudianteId = EntityId<'EstudianteId'>;
export type TextoId = EntityId<'TextoId'>;
export type ItemId = EntityId<'ItemId'>;
export type AventuraId = EntityId<'AventuraId'>;
export type UsuarioId = EntityId<'UsuarioId'>;

export function entityId<T extends string>(valor: string): EntityId<T> {
  return valor as EntityId<T>;
}
