const TRAZO = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2.2 } as const;

/** Íconos propios de la lectura (micrófono y parlante), con el mismo trazo redondeado del design system. */
const ICONOS = {
  microfono: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" {...TRAZO} />
    </>
  ),
  parlante: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" {...TRAZO} />
    </>
  ),
};

export function IconoLectura({ nombre, tamano = 24 }: { nombre: keyof typeof ICONOS; tamano?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} className="la-icono" aria-hidden="true" focusable="false">
      {ICONOS[nombre]}
    </svg>
  );
}
