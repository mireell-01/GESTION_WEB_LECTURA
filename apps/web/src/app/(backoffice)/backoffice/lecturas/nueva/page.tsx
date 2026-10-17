'use client';

import { NuevaLectura } from '@/features/contenido/NuevaLectura';
import { RequiereRol } from '@/shared/auth/RequiereRol';

export default function NuevaLecturaPage() {
  return (
    <RequiereRol roles={['EDITOR']}>
      <NuevaLectura />
    </RequiereRol>
  );
}
