'use client';

import type { ReactNode } from 'react';

import { RequiereRol } from '@/shared/auth/RequiereRol';
import { useSesion } from '@/shared/auth/sesion';
import { MarcoRol } from '@/shared/ui';

/**
 * Grupo de rutas: backoffice (editor, revisor, administración).
 * El layout admite sesiones sin MFA solo para que puedan configurarlo; cada página lo exige.
 * Cada rol ve su menú: contenido (editor, revisor) o la administración de la plataforma (RF-076 a RF-078).
 */
export default function BackofficeLayout({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const menu =
    usuario?.rol === 'ADMIN_PLATAFORMA'
      ? [
          { href: '/backoffice', texto: 'Inicio', icono: 'inicio' as const },
          { href: '/backoffice/instituciones', texto: 'Instituciones', icono: 'aula' as const },
          { href: '/backoffice/docentes', texto: 'Docentes', icono: 'perfil' as const },
          { href: '/backoffice/auditoria', texto: 'Auditoría', icono: 'escudo' as const },
          { href: '/backoffice/gamificacion', texto: 'Gamificación', icono: 'estrella' as const },
        ]
      : [
          { href: '/backoffice', texto: 'Inicio', icono: 'inicio' as const },
          { href: '/backoffice/lecturas', texto: 'Lecturas', icono: 'libro' as const },
          { href: '/backoffice/misiones', texto: 'Misiones', icono: 'globo' as const },
        ];
  return (
    <RequiereRol roles={['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA']} permiteSinMfa>
      <MarcoRol titulo="Backoffice" icono="escudo" menu={menu}>
        {children}
      </MarcoRol>
    </RequiereRol>
  );
}
