'use client';

import { useParams } from 'next/navigation';

import { DetalleAula } from '@/features/escuela/DetalleAula';

/** Modo escuela: detalle de un aula (estudiantes, tarjetas, asignaciones, invitaciones). */
export default function AulaPage() {
  const { id } = useParams<{ id: string }>();
  return <DetalleAula aulaId={id} />;
}
