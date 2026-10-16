import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import '@lectoaventura/ui/styles.css';
import './globals.css';

import { SesionProvider } from '@/shared/auth/sesion';

/** Tipografía redondeada del design system: se descarga al compilar y se sirve desde la app. */
const fredoka = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--la-fuente-fredoka', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--la-fuente-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'LectoAventura', template: '%s · LectoAventura' },
  description: 'Plataforma de lectura interactiva y gamificada para niñas y niños de 6 a 12 años.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#5b3fd9',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        <SesionProvider>{children}</SesionProvider>
      </body>
    </html>
  );
}
