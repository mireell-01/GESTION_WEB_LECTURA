import * as React from 'react';

/** Avatares ilustrados (nunca fotos reales del menor, RN-02). Las claves coinciden con la API. */
export const AVATARES: Record<string, { emoji: string; nombre: string }> = {
  zorro: { emoji: '🦊', nombre: 'Zorro' },
  panda: { emoji: '🐼', nombre: 'Panda' },
  leon: { emoji: '🦁', nombre: 'León' },
  rana: { emoji: '🐸', nombre: 'Rana' },
  pulpo: { emoji: '🐙', nombre: 'Pulpo' },
  buho: { emoji: '🦉', nombre: 'Búho' },
  tortuga: { emoji: '🐢', nombre: 'Tortuga' },
  unicornio: { emoji: '🦄', nombre: 'Unicornio' },
  abeja: { emoji: '🐝', nombre: 'Abeja' },
  delfin: { emoji: '🐬', nombre: 'Delfín' },
  tigre: { emoji: '🐯', nombre: 'Tigre' },
  koala: { emoji: '🐨', nombre: 'Koala' },
};

/** `decorativo`: el avatar acompaña un texto que ya nombra a la persona, así que se oculta al lector. */
export function Avatar({
  clave,
  tamano = 48,
  etiqueta,
  decorativo = false,
}: {
  clave: string;
  tamano?: number;
  etiqueta?: string;
  decorativo?: boolean;
}) {
  const avatar = AVATARES[clave] ?? { emoji: '🙂', nombre: 'Avatar' };
  return (
    <span
      className="la-avatar"
      {...(decorativo ? { 'aria-hidden': true } : { role: 'img', 'aria-label': etiqueta ?? avatar.nombre })}
      style={{ width: tamano, height: tamano, fontSize: tamano * 0.6 }}
    >
      {avatar.emoji}
    </span>
  );
}

/** Botón grande de selección de avatar (ingreso del estudiante y formularios de perfil). */
export function BotonAvatar({
  clave,
  texto,
  seleccionado,
  onClick,
}: {
  clave: string;
  texto: string;
  seleccionado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="la-avatar-boton"
      aria-pressed={seleccionado === undefined ? undefined : seleccionado}
      aria-label={texto}
      onClick={onClick}
    >
      <Avatar clave={clave} tamano={72} decorativo />
      <span aria-hidden="true">{texto}</span>
    </button>
  );
}
