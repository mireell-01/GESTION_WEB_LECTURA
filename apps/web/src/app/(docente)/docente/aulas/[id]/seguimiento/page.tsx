'use client';

import { useParams } from 'next/navigation';

import { PanelAula } from '@/features/seguimiento/PanelAula';

/** RF-063 a RF-067: seguimiento del aula (mapa de calor, alertas, refuerzos y reportes). */
export default function SeguimientoAulaPage() {
  const { id } = useParams<{ id: string }>();
  return <PanelAula aulaId={id} />;
}
