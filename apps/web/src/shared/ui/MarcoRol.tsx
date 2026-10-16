'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

import { Avatar, Icono, Mascota, NombreIcono } from '@lectoaventura/ui';

import { useSesion } from '../auth/sesion';

export interface EnlaceMenu {
  href: string;
  texto: string;
  icono?: NombreIcono;
}

/**
 * Marco de las experiencias adultas (familia, docente, backoffice). En computadora y tablet
 * horizontal: barra lateral blanca con la marca, el menú y la cuenta. En tablet vertical y
 * celular: barra superior compacta y el menú como pestañas desplazables.
 */
export function MarcoRol({
  titulo,
  icono,
  menu = [],
  children,
}: {
  titulo: string;
  icono: NombreIcono;
  menu?: EnlaceMenu[];
  children: ReactNode;
}) {
  const { usuario, salir } = useSesion();
  const ruta = usePathname();
  const nombre = usuario?.alias ?? usuario?.nombre ?? '';
  const cerrar = () => salir('/');

  const enlaces = menu.map((m) => {
    const activo = ruta === m.href || (m.href !== menu[0]?.href && ruta.startsWith(m.href));
    return (
      <Link key={m.href} href={m.href} className="adu-menu__enlace" aria-current={activo ? 'page' : undefined}>
        <Icono nombre={m.icono ?? icono} />
        <span>{m.texto}</span>
      </Link>
    );
  });

  return (
    <div className="adu">
      <aside className="adu-lado">
        <Link href="/" className="marca">
          <Mascota tamano={46} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </Link>
        <span className="adu-rol">
          <Icono nombre={icono} tamano={20} />
          {titulo}
        </span>
        {menu.length > 0 ? (
          <nav aria-label="Secciones" className="adu-menu">
            {enlaces}
          </nav>
        ) : null}
        <div className="adu-cuenta">
          <span className="adu-cuenta__nombre">
            {usuario?.avatar ? <Avatar clave={usuario.avatar} tamano={36} decorativo /> : <span className="adu-inicial" aria-hidden="true">{nombre.charAt(0)}</span>}
            <span>{nombre}</span>
          </span>
          <button type="button" className="la-boton la-boton--fantasma la-boton--bloque" onClick={cerrar}>
            <Icono nombre="salir" tamano={20} />
            Salir
          </button>
        </div>
      </aside>

      <header className="adu-top">
        <Link href="/" className="marca marca--compacta">
          <Mascota tamano={36} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </Link>
        <span className="adu-rol adu-rol--compacto">
          <Icono nombre={icono} tamano={18} />
          {titulo}
        </span>
        <button type="button" className="adu-top__salir" onClick={cerrar}>
          <Icono nombre="salir" tamano={20} />
          Salir
        </button>
        {menu.length > 1 ? (
          <nav aria-label="Secciones" className="adu-pestanas">
            {enlaces}
          </nav>
        ) : null}
      </header>

      <main className="adu-main">
        <div className="adu-contenido">{children}</div>
      </main>
    </div>
  );
}
