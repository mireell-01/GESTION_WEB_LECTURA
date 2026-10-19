'use client';

import { useParams } from 'next/navigation';

import { EditorLectura } from '@/features/contenido/EditorLectura';
import { RequiereRol } from '@/shared/auth/RequiereRol';

export default function LecturaBackofficePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR']}>
      <EditorLectura lecturaId={id} />
    </RequiereRol>
  );
}
