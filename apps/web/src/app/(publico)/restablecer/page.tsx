import { Suspense } from 'react';

import { RestablecerContrasena } from '@/features/iam/RecuperarContrasena';

export const metadata = { title: 'Nueva contraseña' };

export default function RestablecerPage() {
  return (
    <div className="publico__panel">
      <Suspense>
        <RestablecerContrasena />
      </Suspense>
    </div>
  );
}
