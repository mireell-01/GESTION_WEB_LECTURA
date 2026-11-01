'use client';

import { Instituciones } from '@/features/administracion/Instituciones';
import { RequiereRol } from '@/shared/auth/RequiereRol';

/** RF-076: instituciones educativas (solo la administración, con MFA). */
export default function InstitucionesPage() {
  return (
    <RequiereRol roles={['ADMIN_PLATAFORMA']}>
      <Instituciones />
    </RequiereRol>
  );
}
