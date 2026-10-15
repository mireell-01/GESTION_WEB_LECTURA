'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

import { Avatar, Boton } from '@lectoaventura/ui';

import { useSesion } from '../auth/sesion';

export interface EnlaceMenu {
  href: string;
  texto: string;
}

/**
 * Marco visual de cada experiencia por rol: encabezado con color propio, menú y botón de salir.
 */
export function MarcoRol({
  titulo,
  icono,
  color,
  menu = [],
  children,
}: {
  titulo: string;
  icono: string;
  color: string;
  menu?: EnlaceMenu[];
  children: ReactNode;
}) {
  const { usuario, salir } = useSesion();
  const ruta = usePathname();

  const cerrar = () => salir(usuario?.rol === 'ESTUDIANTE' ? '/ingresar/estudiante' : '/');

  return (
    <div className="marco">
      <header className="marco__encabezado" style={{ background: color }}>
        <div className="marco__fila contenedor">
          <span className="marco__titulo">
            <span aria-hidden="true">{icono}</span> {titulo}
          </span>
          {menu.length > 0 ? (
            <nav aria-label="Secciones" className="marco__menu">
              {menu.map((m) => {
                const activo = ruta === m.href || (m.href !== menu[0]?.href && ruta.startsWith(m.href));
                return (
                  <Link key={m.href} href={m.href} className="marco__enlace" aria-current={activo ? 'page' : undefined}>
                    {m.texto}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          <div className="marco__usuario">
            {usuario?.avatar ? <Avatar clave={usuario.avatar} tamano={36} decorativo /> : null}
            <span className="marco__nombre">{usuario?.alias ?? usuario?.nombre}</span>
            <Boton variante="fantasma" tamano="pequeno" onClick={cerrar} className="marco__salir">
              Salir
            </Boton>
          </div>
        </div>
      </header>
      <main className="contenedor marco__contenido">{children}</main>
    </div>
  );
}
