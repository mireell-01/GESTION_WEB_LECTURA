import { Suspense } from 'react';

import { IngresoEstudiante } from '@/features/iam/IngresoEstudiante';

export const metadata = { title: '¡A leer!' };

export default function IngresoEstudiantePage() {
  return (
    <Suspense>
      <IngresoEstudiante />
    </Suspense>
  );
}
