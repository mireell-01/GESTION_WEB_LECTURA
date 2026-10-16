import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { MarcoRol } from '@/shared/ui';

/** Grupo de rutas: estudiante — la experiencia de aventura lectora. */
export default function EstudianteLayout({ children }: { children: ReactNode }) {
  return (
    <RequiereRol roles={['ESTUDIANTE']}>
      <MarcoRol titulo="LectoAventura" icono="📚" color="var(--la-color-primario)">
        {children}
      </MarcoRol>
    </RequiereRol>
  );
}
