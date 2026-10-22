'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { SesionLectura } from '@/features/lectura/SesionLectura';

function Lectura() {
  const { id } = useParams<{ id: string }>();
  const asignacion = useSearchParams().get('asignacion');
  return <SesionLectura key={id} lecturaId={id} asignacionId={asignacion} />;
}

/** RF-038 a RF-050: leer una lectura con sus actividades (con `?asignacion=` si viene de su docente). */
export default function LecturaPage() {
  return (
    <Suspense>
      <Lectura />
    </Suspense>
  );
}
