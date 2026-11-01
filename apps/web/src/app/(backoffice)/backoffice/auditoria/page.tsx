'use client';

import { Auditoria } from '@/features/administracion/Auditoria';
import { RequiereRol } from '@/shared/auth/RequiereRol';

/** RF-077: auditoría de acciones sensibles (solo la administración, con MFA). */
export default function AuditoriaPage() {
  return (
    <RequiereRol roles={['ADMIN_PLATAFORMA']}>
      <Auditoria />
    </RequiereRol>
  );
}
