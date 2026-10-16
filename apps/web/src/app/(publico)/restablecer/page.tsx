import { Suspense } from 'react';

import { RestablecerContrasena } from '@/features/iam/RecuperarContrasena';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Nueva contraseña' };

export default function RestablecerPage() {
  return (
    <MarcoPublico>
      <Suspense>
        <RestablecerContrasena />
      </Suspense>
    </MarcoPublico>
  );
}
