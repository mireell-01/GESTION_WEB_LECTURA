'use client';

import { useParams } from 'next/navigation';

import { PanelHijo } from '@/features/acompanamiento/PanelHijo';

/** RF-068, RF-069: el avance de un hijo y cómo acompañarle en casa. */
export default function PanelHijoPage() {
  const { id } = useParams<{ id: string }>();
  return <PanelHijo estudianteId={id} />;
}
