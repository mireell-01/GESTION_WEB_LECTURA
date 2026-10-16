'use client';

import Link from 'next/link';

import { Alerta, clasesBoton } from '@lectoaventura/ui';

import { RUTA_POR_ROL, useSesion } from '@/shared/auth/sesion';

/** Si ya hay una sesión abierta en este navegador, ofrece volver a ella. */
export function ContinuarSesion() {
  const { usuario } = useSesion();
  if (!usuario) return null;
  return (
    <Alerta tipo="info">
      <div className="fila fila--entre">
        <span>
          Ya ingresaste como <strong>{usuario.alias ?? usuario.nombre}</strong>.
        </span>
        <Link href={RUTA_POR_ROL[usuario.rol]} className={clasesBoton('primario', { tamano: 'pequeno' })}>
          Continuar
        </Link>
      </div>
    </Alerta>
  );
}
