import * as React from 'react';

export type BotonVariante = 'primario' | 'secundario' | 'exito' | 'peligro' | 'fantasma';

export interface BotonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: BotonVariante;
  tamano?: 'normal' | 'grande' | 'pequeno';
  bloque?: boolean;
  cargando?: boolean;
}

/** Clases del botón, reutilizables en enlaces (`<Link className={clasesBoton(...)}>`). */
export function clasesBoton(
  variante: BotonVariante = 'primario',
  opciones: { tamano?: BotonProps['tamano']; bloque?: boolean } = {},
): string {
  return [
    'la-boton',
    `la-boton--${variante}`,
    opciones.tamano && opciones.tamano !== 'normal' ? `la-boton--${opciones.tamano}` : '',
    opciones.bloque ? 'la-boton--bloque' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Botón accesible: objetivo táctil ≥ 44 px, foco visible y contraste AA. */
export function Boton({
  variante = 'primario',
  tamano = 'normal',
  bloque = false,
  cargando = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: BotonProps) {
  return (
    <button
      type={type}
      className={[clasesBoton(variante, { tamano, bloque }), className].filter(Boolean).join(' ')}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...rest}
    >
      {cargando ? 'Un momento…' : children}
    </button>
  );
}
