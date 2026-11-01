'use client';

import { Docentes } from '@/features/administracion/Docentes';
import { RequiereRol } from '@/shared/auth/RequiereRol';

/** RF-076: cuentas docentes (solo la administración, con MFA). */
export default function DocentesPage() {
  return (
    <RequiereRol roles={['ADMIN_PLATAFORMA']}>
      <Docentes />
    </RequiereRol>
  );
}
