'use client';

import { Tarjeta } from '@lectoaventura/ui';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { useSesion } from '@/shared/auth/sesion';

export default function BackofficeHomePage() {
  const { usuario } = useSesion();
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA']}>
      <Tarjeta titulo={`Hola, ${usuario?.nombre ?? ''}`} nivel={1}>
        <p className="texto-suave">Gestiona contenido, revisión, usuarios, configuración y auditoría.</p>
      </Tarjeta>
    </RequiereRol>
  );
}
