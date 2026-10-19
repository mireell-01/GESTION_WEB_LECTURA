'use client';

import { useParams } from 'next/navigation';

import { MisionesDelMundo } from '@/features/aventura/MisionesDelMundo';

/** RF-032: misiones de un mundo. */
export default function MundoPage() {
  const { id } = useParams<{ id: string }>();
  return <MisionesDelMundo mundoId={id} />;
}
