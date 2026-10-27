'use client';

import { useParams } from 'next/navigation';

import { DetalleEstudiante } from '@/features/seguimiento/DetalleEstudiante';

/** RF-064: detalle de un estudiante del aula por habilidad, con sus últimas sesiones. */
export default function DetalleEstudiantePage() {
  const { id, estudianteId } = useParams<{ id: string; estudianteId: string }>();
  return <DetalleEstudiante aulaId={id} estudianteId={estudianteId} />;
}
