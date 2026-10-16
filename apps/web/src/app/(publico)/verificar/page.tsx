import { Suspense } from 'react';

import { VerificarCorreo } from '@/features/iam/VerificarCorreo';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Verificar correo' };

export default function VerificarPage() {
  return (
    <MarcoPublico>
      <Suspense>
        <VerificarCorreo />
      </Suspense>
    </MarcoPublico>
  );
}
