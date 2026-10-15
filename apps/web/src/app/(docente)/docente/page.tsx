'use client';

import { Tarjeta } from '@lectoaventura/ui';

import { useSesion } from '@/shared/auth/sesion';

export default function DocenteHomePage() {
  const { usuario } = useSesion();
  return (
    <Tarjeta titulo={`Hola, ${usuario?.nombre?.split(' ')[0] ?? ''} 👋`}>
      <p className="texto-suave">Aquí administrarás tus aulas, estudiantes y asignaciones.</p>
    </Tarjeta>
  );
}
