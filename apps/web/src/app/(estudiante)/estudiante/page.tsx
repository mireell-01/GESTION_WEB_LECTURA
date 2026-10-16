'use client';

import { Avatar, Tarjeta } from '@lectoaventura/ui';

import { useSesion } from '@/shared/auth/sesion';

export default function EstudianteHomePage() {
  const { usuario } = useSesion();
  return (
    <Tarjeta className="texto-centro">
      {usuario?.avatar ? <Avatar clave={usuario.avatar} tamano={96} /> : null}
      <h1 style={{ marginTop: 'var(--la-espacio-2)' }}>¡Hola, {usuario?.alias}!</h1>
      <p className="texto-suave">Tu mapa de aventuras se está preparando. ¡Muy pronto empezamos a leer!</p>
    </Tarjeta>
  );
}
