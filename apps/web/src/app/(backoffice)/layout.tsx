import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { MarcoRol } from '@/shared/ui';

/**
 * Grupo de rutas: backoffice (editor, revisor, administración).
 * El layout admite sesiones sin MFA solo para que puedan configurarlo; cada página lo exige.
 */
export default function BackofficeLayout({ children }: { children: ReactNode }) {
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA']} permiteSinMfa>
      <MarcoRol titulo="Backoffice" icono="escudo" menu={[
          { href: '/backoffice', texto: 'Inicio', icono: 'inicio' },
          { href: '/backoffice/lecturas', texto: 'Lecturas', icono: 'libro' },
        ]}>
        {children}
      </MarcoRol>
    </RequiereRol>
  );
}
