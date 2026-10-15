'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

import { Cargando } from '@lectoaventura/ui';

import { Rol, RUTA_POR_ROL, useSesion } from './sesion';

const BACKOFFICE: Rol[] = ['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA'];

/**
 * Protege un grupo de rutas (RF-009): sin sesión lleva al ingreso; con otro rol, a su propia
 * experiencia. La API vuelve a comprobar todo: esto solo evita mostrar pantallas ajenas.
 */
export function RequiereRol({
  roles,
  children,
  permiteSinMfa = false,
}: {
  roles: Rol[];
  children: ReactNode;
  permiteSinMfa?: boolean;
}) {
  const { usuario, cargando } = useSesion();
  const router = useRouter();
  const ruta = usePathname();

  const rolValido = !!usuario && roles.includes(usuario.rol);
  const faltaMfa = !!usuario && BACKOFFICE.includes(usuario.rol) && !usuario.mfa && !permiteSinMfa;

  useEffect(() => {
    if (cargando) return;
    if (!usuario) {
      router.replace(roles.includes('ESTUDIANTE') ? '/ingresar/estudiante' : `/ingresar?volver=${encodeURIComponent(ruta)}`);
    } else if (!rolValido) {
      router.replace(RUTA_POR_ROL[usuario.rol]);
    } else if (faltaMfa) {
      router.replace('/backoffice/mfa');
    }
  }, [cargando, usuario, rolValido, faltaMfa, roles, router, ruta]);

  if (cargando || !rolValido || faltaMfa) {
    return <Cargando />;
  }
  return <>{children}</>;
}
