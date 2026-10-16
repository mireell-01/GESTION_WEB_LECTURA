'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { leerTokenDispositivo } from '@/shared/auth/dispositivo';
import { useSesion } from '@/shared/auth/sesion';

/**
 * CR-01: en una tablet activada para un aula o una familia, abrir la app lleva directo a los
 * avatares de los niños. Si ya hay una sesión abierta, se respeta la portada para continuarla.
 */
export function RedirigirTabletActivada() {
  const router = useRouter();
  const { usuario, cargando } = useSesion();

  useEffect(() => {
    if (!cargando && !usuario && leerTokenDispositivo()) router.replace('/ingresar/estudiante');
  }, [cargando, usuario, router]);

  return null;
}
