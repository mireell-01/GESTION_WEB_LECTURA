import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { MarcoRol } from '@/shared/ui';

/** Grupo de rutas: familia (RF-068 a RF-071). */
export default function FamiliaLayout({ children }: { children: ReactNode }) {
  return (
    <RequiereRol roles={['FAMILIAR']}>
      <MarcoRol titulo="Familia" icono="familia" menu={[
          { href: '/familia', texto: 'Mis hijos', icono: 'familia' },
          { href: '/familia/biblioteca', texto: 'Biblioteca', icono: 'libro' },
        ]}>
        {children}
      </MarcoRol>
    </RequiereRol>
  );
}
