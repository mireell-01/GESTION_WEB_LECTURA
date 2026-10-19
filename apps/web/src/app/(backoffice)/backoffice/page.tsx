'use client';

import Link from 'next/link';

import { clasesBoton, Tarjeta } from '@lectoaventura/ui';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { useSesion } from '@/shared/auth/sesion';

export default function BackofficeHomePage() {
  const { usuario } = useSesion();
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA']}>
      <Tarjeta titulo={`Hola, ${usuario?.nombre ?? ''}`} nivel={1}>
        <p className="texto-suave">Gestiona contenido, revisión, usuarios, configuración y auditoría.</p>
        {usuario?.rol === 'EDITOR' || usuario?.rol === 'REVISOR' ? (
          <div className="fila">
            <Link href="/backoffice/lecturas" className={clasesBoton('primario')}>
              {usuario.rol === 'EDITOR' ? 'Escribir y editar lecturas' : 'Revisar lecturas'}
            </Link>
            <Link href="/backoffice/misiones" className={clasesBoton('secundario')}>
              {usuario.rol === 'EDITOR' ? 'Armar las misiones' : 'Ver las misiones'}
            </Link>
          </div>
        ) : null}
      </Tarjeta>
    </RequiereRol>
  );
}
