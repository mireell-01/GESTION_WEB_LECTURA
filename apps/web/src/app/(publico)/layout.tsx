import Link from 'next/link';
import type { ReactNode } from 'react';

/** Grupo de rutas públicas: ingreso, registro y recuperación de cuenta. */
export default function PublicoLayout({ children }: { children: ReactNode }) {
  return (
    <main className="publico">
      <Link href="/" className="publico__marca">
        <span aria-hidden="true">🚀</span> LectoAventura
      </Link>
      {children}
    </main>
  );
}
