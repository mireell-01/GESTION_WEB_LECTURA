import { Suspense } from 'react';

import { FormularioIngreso } from '@/features/iam/FormularioIngreso';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Ingresar' };

export default function IngresarPage() {
  return (
    <MarcoPublico>
      <Suspense>
        <FormularioIngreso />
      </Suspense>
    </MarcoPublico>
  );
}
