import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@lectoaventura/ui/styles.css';
import './globals.css';

import { SesionProvider } from '@/shared/auth/sesion';

export const metadata: Metadata = {
  title: { default: 'LectoAventura', template: '%s · LectoAventura' },
  description: 'Plataforma de lectura interactiva y gamificada para niñas y niños de 6 a 12 años.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f6df6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE">
      <body>
        <SesionProvider>{children}</SesionProvider>
      </body>
    </html>
  );
}
