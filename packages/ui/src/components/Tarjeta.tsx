import * as React from 'react';

export interface TarjetaProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  titulo?: React.ReactNode;
  /** Botones o enlaces que se alinean a la derecha del título. */
  acciones?: React.ReactNode;
  children?: React.ReactNode;
}

/** Tarjeta: contenedor base con sombra suave y radio grande. */
export function Tarjeta({ titulo, acciones, children, className, ...rest }: TarjetaProps) {
  return (
    <section className={['la-tarjeta', className].filter(Boolean).join(' ')} {...rest}>
      {titulo || acciones ? (
        <div className="la-tarjeta__encabezado">
          {titulo ? <h2 className="la-tarjeta__titulo">{titulo}</h2> : <span />}
          {acciones}
        </div>
      ) : null}
      {children}
    </section>
  );
}
