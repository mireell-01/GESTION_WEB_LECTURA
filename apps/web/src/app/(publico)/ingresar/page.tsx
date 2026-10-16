import { Suspense } from 'react';

import { FormularioIngreso } from '@/features/iam/FormularioIngreso';

export const metadata = { title: 'Ingresar' };

export default function IngresarPage() {
  return (
    <div className="publico__panel">
      <Suspense>
        <FormularioIngreso />
      </Suspense>
    </div>
  );
}
