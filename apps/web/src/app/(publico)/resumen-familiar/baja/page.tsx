import { Suspense } from 'react';

import { BajaResumen } from '@/features/acompanamiento/BajaResumen';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Resumen semanal' };

/** RF-070: baja con un clic del resumen semanal de la familia (enlace del correo). */
export default function BajaResumenPage() {
  return (
    <MarcoPublico>
      <Suspense>
        <BajaResumen />
      </Suspense>
    </MarcoPublico>
  );
}
