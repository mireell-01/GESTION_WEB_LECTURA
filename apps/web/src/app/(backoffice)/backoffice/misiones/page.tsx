'use client';

import { MisionesBackoffice } from '@/features/aventura/MisionesBackoffice';
import { RequiereRol } from '@/shared/auth/RequiereRol';

/** RF-032: misiones de cada mundo (editores las arman; revisores las consultan; con MFA). */
export default function MisionesPage() {
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR']}>
      <MisionesBackoffice />
    </RequiereRol>
  );
}
