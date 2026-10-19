import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { MarcoRol } from '@/shared/ui';

/** Grupo de rutas: docente — modo escuela. */
export default function DocenteLayout({ children }: { children: ReactNode }) {
  return (
    <RequiereRol roles={['DOCENTE']}>
      <MarcoRol titulo="Modo escuela" icono="aula" menu={[
          { href: '/docente', texto: 'Mis aulas', icono: 'aula' },
          { href: '/docente/biblioteca', texto: 'Biblioteca', icono: 'libro' },
        ]}>
        {children}
      </MarcoRol>
    </RequiereRol>
  );
}
