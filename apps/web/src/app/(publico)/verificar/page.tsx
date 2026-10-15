import { Suspense } from 'react';

import { VerificarCorreo } from '@/features/iam/VerificarCorreo';

export const metadata = { title: 'Verificar correo' };

export default function VerificarPage() {
  return (
    <div className="publico__panel">
      <Suspense>
        <VerificarCorreo />
      </Suspense>
    </div>
  );
}
