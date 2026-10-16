import * as React from 'react';

export interface TarjetaProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  titulo?: React.ReactNode;
  /** Nivel del título: 1 cuando la tarjeta es el contenido principal de la página (un solo h1). */
  nivel?: 1 | 2 | 3;
  /** Botones o enlaces que se alinean a la derecha del título. */
  acciones?: React.ReactNode;
  children?: React.ReactNode;
}

/** Tarjeta: contenedor base con sombra suave y radio grande. */
export function Tarjeta({ titulo, nivel = 2, acciones, children, className, ...rest }: TarjetaProps) {
  const Titulo = `h${nivel}` as const;
  return (
    <section className={['la-tarjeta', className].filter(Boolean).join(' ')} {...rest}>
      {titulo || acciones ? (
        <div className="la-tarjeta__encabezado">
          {titulo ? <Titulo className="la-tarjeta__titulo">{titulo}</Titulo> : <span />}
          {acciones}
        </div>
      ) : null}
      {children}
    </section>
  );
}
