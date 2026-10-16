import Link from 'next/link';
import { ReactNode } from 'react';

import { Mascota, Paisaje } from '@lectoaventura/ui';

/**
 * Marco de las páginas públicas para adultos (ingreso, registro, recuperación). Computadora y
 * tablet horizontal: panel ilustrado a la izquierda y formulario a la derecha. Tablet vertical y
 * celular: barra con la marca y el formulario a todo el ancho.
 */
export function MarcoPublico({ children, ancho = false }: { children: ReactNode; ancho?: boolean }) {
  return (
    <div className="pub">
      <aside className="pub-lado">
        <Link href="/" className="marca marca--clara">
          <Mascota tamano={44} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </Link>
        <div className="pub-lado__lema">
          <Mascota tamano={150} flota />
          <p>Cada lectura es una aventura.</p>
        </div>
        <Paisaje className="pub-lado__paisaje" />
      </aside>
      <main className="pub-principal">
        <div className={`pub-panel${ancho ? ' pub-panel--ancho' : ''}`}>{children}</div>
      </main>
    </div>
  );
}
