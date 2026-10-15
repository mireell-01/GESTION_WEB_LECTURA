import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { MarcoRol } from '@/shared/ui';

/** Grupo de rutas: familia (RF-068 a RF-071). */
export default function FamiliaLayout({ children }: { children: ReactNode }) {
  return (
    <RequiereRol roles={['FAMILIAR']}>
      <MarcoRol titulo="Familia" icono="🏡" color="var(--la-color-exito-fuerte)" menu={[{ href: '/familia', texto: 'Mis hijos' }]}>
        {children}
      </MarcoRol>
    </RequiereRol>
  );
}
