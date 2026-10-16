import type { ReactNode } from 'react';

/**
 * Grupo de rutas públicas. Cada página elige su marco: `MarcoPublico` para los formularios de
 * adultos y la pantalla propia del niño en `/ingresar/estudiante`.
 */
export default function PublicoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
