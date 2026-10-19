'use client';

import { ListaLecturas } from '@/features/contenido/ListaLecturas';
import { RequiereRol } from '@/shared/auth/RequiereRol';

/** RF-021, RF-026: lecturas del backoffice (editores y revisores, con MFA). */
export default function LecturasPage() {
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR']}>
      <ListaLecturas />
    </RequiereRol>
  );
}
