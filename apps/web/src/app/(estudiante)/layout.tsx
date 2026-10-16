import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { MarcoEstudiante } from '@/shared/ui';

/** Grupo de rutas: estudiante — la experiencia de aventura lectora. */
export default function EstudianteLayout({ children }: { children: ReactNode }) {
  return (
    <RequiereRol roles={['ESTUDIANTE']}>
      <MarcoEstudiante>{children}</MarcoEstudiante>
    </RequiereRol>
  );
}
