import * as React from 'react';

/**
 * Avatares ilustrados (nunca fotos reales del menor, RN-02). Las claves coinciden con la API;
 * cada animal tiene su color de fondo para que los niños lo reconozcan de un vistazo.
 */
export const AVATARES: Record<string, { emoji: string; nombre: string; fondo: string }> = {
  zorro: { emoji: '🦊', nombre: 'Zorro', fondo: '#ffe2c2' },
  panda: { emoji: '🐼', nombre: 'Panda', fondo: '#e4e9f2' },
  leon: { emoji: '🦁', nombre: 'León', fondo: '#ffefb8' },
  rana: { emoji: '🐸', nombre: 'Rana', fondo: '#d9f5d0' },
  pulpo: { emoji: '🐙', nombre: 'Pulpo', fondo: '#ffdde8' },
  buho: { emoji: '🦉', nombre: 'Búho', fondo: '#ede3ff' },
  tortuga: { emoji: '🐢', nombre: 'Tortuga', fondo: '#ddf3e4' },
  unicornio: { emoji: '🦄', nombre: 'Unicornio', fondo: '#f6ddff' },
  abeja: { emoji: '🐝', nombre: 'Abeja', fondo: '#fff4b8' },
  delfin: { emoji: '🐬', nombre: 'Delfín', fondo: '#d6ecff' },
  tigre: { emoji: '🐯', nombre: 'Tigre', fondo: '#ffe0b3' },
  koala: { emoji: '🐨', nombre: 'Koala', fondo: '#e8e6f0' },
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
  const avatar = AVATARES[clave] ?? { emoji: '🙂', nombre: 'Avatar', fondo: '#ede8ff' };
  return (
    <span
      className="la-avatar"
      {...(decorativo ? { 'aria-hidden': true } : { role: 'img', 'aria-label': etiqueta ?? avatar.nombre })}
      style={{ width: tamano, height: tamano, fontSize: tamano * 0.6, background: avatar.fondo }}
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
