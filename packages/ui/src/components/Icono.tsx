import * as React from 'react';

const TRAZO = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Íconos redondeados del design system (24 × 24). Siempre acompañan un texto visible. */
const ICONOS = {
  inicio: <path d="M3.5 11.2 12 4l8.5 7.2V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" fill="currentColor" />,
  libro: (
    <>
      <path d="M12 6.5C9.6 4.8 6.6 4.4 3 5.2v13.6c3.6-.8 6.6-.4 9 1.3 2.4-1.7 5.4-2.1 9-1.3V5.2c-3.6-.8-6.6-.4-9 1.3z" fill="currentColor" />
      <path d="M12 7v12.6" stroke="#000" strokeOpacity=".22" strokeWidth="1.6" />
    </>
  ),
  progreso: (
    <>
      <rect x="3.5" y="12" width="4.5" height="8.5" rx="1.6" fill="currentColor" />
      <rect x="9.75" y="7.5" width="4.5" height="13" rx="1.6" fill="currentColor" />
      <rect x="16" y="3.5" width="4.5" height="17" rx="1.6" fill="currentColor" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="4.3" fill="currentColor" />
      <path d="M4 20.5c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor" />
    </>
  ),
  candado: (
    <>
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...TRAZO} strokeWidth="2.8" />
      <rect x="5" y="10" width="14" height="11" rx="3" fill="currentColor" />
    </>
  ),
  salir: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" {...TRAZO} strokeWidth="2.4" />
      <path d="M14.5 8 19 12l-4.5 4M19 12H9.5" {...TRAZO} strokeWidth="2.4" />
    </>
  ),
  flecha: <path d="M4.5 12h14M13 6l6 6-6 6" {...TRAZO} strokeWidth="2.8" />,
  chevron: <path d="m9 5.5 6.5 6.5L9 18.5" {...TRAZO} strokeWidth="3" />,
  tablet: (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="3" fill="currentColor" />
      <rect x="6.5" y="5" width="11" height="12.5" rx="1.2" fill="#fff" opacity=".9" />
      <circle cx="12" cy="19.4" r="1" fill="#fff" />
    </>
  ),
  escudo: <path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 8.4 7.5 9.6 4.3-1.2 7.5-5 7.5-9.6v-6zm-1.2 12.8-3.3-3.3 1.6-1.6 1.7 1.7 4.4-4.4 1.6 1.6z" fill="currentColor" />,
  familia: (
    <>
      <circle cx="8" cy="7" r="3" fill="currentColor" />
      <circle cx="16.5" cy="8.5" r="2.5" fill="currentColor" />
      <path d="M2.5 19.5c0-3.4 2.5-5.6 5.5-5.6s5.5 2.2 5.5 5.6zM13 19.5c.2-2.6 1.6-4.3 3.5-4.3s3.5 1.7 3.5 4.3z" fill="currentColor" />
    </>
  ),
  aula: (
    <>
      <path d="M12 3 2.5 8 12 13l9.5-5z" fill="currentColor" />
      <path d="M6 10.6v4.6c0 1.6 2.7 3.3 6 3.3s6-1.7 6-3.3v-4.6L12 13.8z" fill="currentColor" opacity=".75" />
      <path d="M21 8.2v6" {...TRAZO} strokeWidth="2" />
    </>
  ),
  brujula: (
    <>
      <circle cx="12" cy="12" r="10" fill="#fff" />
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="#c9bfff" strokeWidth="1.4" />
      <path d="M12 4.6 14 12l-2 7.4L10 12z" fill="#5b3fd9" />
      <path d="M12 4.6 14 12h-4z" fill="#f0508a" />
      <circle cx="12" cy="12" r="1.7" fill="#ffc83d" />
    </>
  ),
  globo: (
    <>
      <circle cx="12" cy="12" r="10.5" fill="#3b8beb" />
      <path
        d="M6 7.5c2-.8 3.8.2 4.3 1.7.4 1.4-1 2-2.1 2.8-1 .8-.6 2.6-2 2.8C5 15 3.9 12.6 4.1 10.6 4.3 9.2 5 8 6 7.5zM14.5 12.5c1.5-.6 3.3.1 3.8 1.5.4 1.3-.5 2.9-1.9 3.6-1.3.6-2.6-.2-2.8-1.6-.2-1.3-.3-2.9.9-3.5zM14 4.6c1.5.2 3 1 3.6 2.1-.9.6-2.2.4-3-.3-.5-.4-.8-1.1-.6-1.8z"
        fill="#3cc46b"
      />
    </>
  ),
  estrella: (
    <path
      d="M12 2.6 14.8 8.7l6.6.6-5 4.4 1.5 6.5L12 16.8l-5.9 3.4 1.5-6.5-5-4.4 6.6-.6z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path d="M12 7v5.3l3.3 2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;

export type NombreIcono = keyof typeof ICONOS;

export function Icono({ nombre, tamano = 24, className }: { nombre: NombreIcono; tamano?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      className={['la-icono', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      {ICONOS[nombre]}
    </svg>
  );
}
