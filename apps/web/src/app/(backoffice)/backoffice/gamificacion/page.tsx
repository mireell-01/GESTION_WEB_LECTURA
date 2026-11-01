'use client';

import { ParametrosGamificacion } from '@/features/administracion/ParametrosGamificacion';
import { RequiereRol } from '@/shared/auth/RequiereRol';

/** RF-078: parámetros de gamificación versionados (solo la administración, con MFA). */
export default function GamificacionPage() {
  return (
    <RequiereRol roles={['ADMIN_PLATAFORMA']}>
      <ParametrosGamificacion />
    </RequiereRol>
  );
}
