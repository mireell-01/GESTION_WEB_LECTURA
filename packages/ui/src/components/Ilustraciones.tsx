import * as React from 'react';

/**
 * Ilustraciones del mundo LectoAventura en SVG (livianas para RNF-004/RNF-006 y nítidas en
 * cualquier pantalla). Son decorativas: el texto que las acompaña ya dice lo importante.
 * Versión provisional simplificada: se reemplazan por las ilustraciones finales sin tocar
 * las pantallas que las usan.
 */

const ESTRELLA = 'M50 8 62.3 35 93.8 37.8 70 58.5 77 89.2 50 73 23 89.2 30 58.5 6.2 37.8 37.7 35z';

/** Estrella mascota de LectoAventura. */
export function Mascota({ tamano = 96, flota = false, className }: { tamano?: number; flota?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={tamano}
      height={tamano}
      className={['la-mascota', flota ? 'la-flota' : '', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ESTRELLA} fill="#ffc83d" stroke="#ffc83d" strokeWidth="8" strokeLinejoin="round" />
      <path d="M50 22 58 40 78 42 63 55 67 75 50 64z" fill="#ffdb6e" />
      <ellipse cx="41" cy="50" rx="5" ry="6.5" fill="#1e1a4d" />
      <ellipse cx="59" cy="50" rx="5" ry="6.5" fill="#1e1a4d" />
      <circle cx="42.6" cy="47.6" r="1.9" fill="#fff" />
      <circle cx="60.6" cy="47.6" r="1.9" fill="#fff" />
      <path d="M42 60q8 8 16 0" fill="none" stroke="#1e1a4d" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="33" cy="59" r="4.6" fill="#ff8fb1" opacity=".75" />
      <circle cx="67" cy="59" r="4.6" fill="#ff8fb1" opacity=".75" />
    </svg>
  );
}

/** Paisaje con montañas y el castillo de la aventura (cabecera del estudiante y portada). */
export function Paisaje({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="xMaxYMax slice"
      className={['la-ilustracion', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="#fff" opacity=".85">
        <ellipse cx="90" cy="70" rx="46" ry="16" />
        <ellipse cx="120" cy="58" rx="30" ry="20" />
        <ellipse cx="300" cy="42" rx="40" ry="13" />
        <ellipse cx="326" cy="33" rx="24" ry="15" />
        <ellipse cx="610" cy="58" rx="40" ry="14" />
      </g>
      <path d="M150 240 290 92 430 240z" fill="#8e86f0" />
      <path d="M290 92 312 115 300 112 290 124 280 110 268 114z" fill="#f4f2ff" />
      <path d="M330 240 470 70 620 240z" fill="#7a70e8" />
      <path d="M470 70 494 99 481 96 470 108 459 95 446 99z" fill="#f4f2ff" />
      <rect x="478" y="128" width="116" height="92" fill="#f6e9d3" />
      <g fill="#f6e9d3">
        <rect x="478" y="119" width="11" height="10" />
        <rect x="498" y="119" width="11" height="10" />
        <rect x="563" y="119" width="11" height="10" />
        <rect x="583" y="119" width="11" height="10" />
      </g>
      <rect x="466" y="100" width="30" height="120" fill="#f1e0c4" />
      <rect x="576" y="96" width="30" height="124" fill="#f1e0c4" />
      <rect x="516" y="78" width="40" height="84" fill="#f6e9d3" />
      <path d="M462 102 481 58 500 102z" fill="#6a4bf0" />
      <path d="M572 98 591 52 610 98z" fill="#6a4bf0" />
      <path d="M511 80 536 28 561 80z" fill="#5b3fd9" />
      <path d="M536 28V12M481 58V46" stroke="#7a5a3a" strokeWidth="2.4" />
      <path d="M536 12h17l-5 4 5 4h-17zM481 46h13l-4 3 4 3h-13z" fill="#f0508a" />
      <g fill="#5b3fd9">
        <rect x="476" y="118" width="10" height="15" rx="5" />
        <rect x="586" y="114" width="10" height="15" rx="5" />
        <rect x="530" y="96" width="12" height="17" rx="6" />
        <rect x="497" y="150" width="10" height="15" rx="5" />
        <rect x="565" y="150" width="10" height="15" rx="5" />
      </g>
      <path d="M524 220v-28a12 12 0 0 1 24 0v28z" fill="#9b6a43" />
      <path d="M0 240v-44c90-34 190-20 290-6 100 14 170-26 250-30 40-2 72 6 100 14v66z" fill="#5fcb86" />
      <path d="M0 240v-24c110-22 220-6 330-8 110-2 200-24 310-14v46z" fill="#3dae6b" />
      <rect x="402" y="176" width="6" height="22" fill="#7a5a3a" />
      <circle cx="405" cy="170" r="16" fill="#2e9e5b" />
      <rect x="622" y="168" width="6" height="24" fill="#7a5a3a" />
      <circle cx="625" cy="160" r="18" fill="#2e9e5b" />
      <circle cx="440" cy="194" r="12" fill="#27904f" />
      <g fill="#ff7fa8">
        <circle cx="360" cy="222" r="5" />
        <circle cx="560" cy="228" r="5" />
        <circle cx="250" cy="226" r="4" />
      </g>
      <g fill="#ffd23f">
        <circle cx="360" cy="222" r="2" />
        <circle cx="560" cy="228" r="2" />
      </g>
    </svg>
  );
}

/** Letrero de madera "Leer · Explorar · Imaginar · Crecer" (barra lateral del estudiante). */
export function Letrero({ className }: { className?: string }) {
  const tablas: [string, number, number, string][] = [
    ['Leer', -6, 48, '#d49a5a'],
    ['Explorar', 5, 106, '#c98a4b'],
    ['Imaginar', -5, 164, '#d49a5a'],
    ['Crecer', 4, 222, '#c98a4b'],
  ];
  return (
    <svg viewBox="0 0 240 300" className={['la-ilustracion', className].filter(Boolean).join(' ')} aria-hidden="true" focusable="false">
      <circle cx="40" cy="74" r="46" fill="#2fa866" />
      <circle cx="92" cy="40" r="40" fill="#3dbe76" />
      <circle cx="208" cy="92" r="44" fill="#2fa866" />
      <rect x="104" y="40" width="16" height="244" rx="4" fill="#8b5a2b" />
      {tablas.map(([texto, giro, y, color]) => (
        <g key={texto} transform={`rotate(${giro} 112 ${y + 22})`}>
          <rect x="36" y={y} width="156" height="44" rx="10" fill={color} stroke="#8b5a2b" strokeWidth="4" />
          <text x="114" y={y + 31} textAnchor="middle" fontFamily="Fredoka, 'Segoe UI', sans-serif" fontWeight="600" fontSize="24" fill="#4a2c12">
            {texto}
          </text>
        </g>
      ))}
      <ellipse cx="120" cy="290" rx="72" ry="12" fill="#8a93a8" />
      <g fill="#ff7fa8">
        <circle cx="40" cy="286" r="7" />
        <circle cx="205" cy="284" r="7" />
      </g>
      <g fill="#ffd23f">
        <circle cx="40" cy="286" r="3" />
        <circle cx="205" cy="284" r="3" />
      </g>
    </svg>
  );
}

const TONOS = {
  bosque: { cielo: '#cdefd6', lejos: '#7acb8f', cerca: '#3dae6b' },
  valle: { cielo: '#e4ddff', lejos: '#b7a9f5', cerca: '#9c8cf0' },
  montana: { cielo: '#d7ebff', lejos: '#a9b8f2', cerca: '#7d93e8' },
  desierto: { cielo: '#fff1d6', lejos: '#f6c27a', cerca: '#e79f4f' },
  cielo: { cielo: '#ffe3ef', lejos: '#f4a7c5', cerca: '#e0709c' },
} as const;

export type TonoMundo = keyof typeof TONOS;

/** Escena pequeña de un mundo del mapa de aventuras (RF-030). */
export function EscenaMundo({ tono, className }: { tono: TonoMundo; className?: string }) {
  const t = TONOS[tono];
  return (
    <svg
      viewBox="0 0 240 180"
      preserveAspectRatio="xMidYMid slice"
      className={['la-ilustracion', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="240" height="180" fill={t.cielo} />
      <circle cx="196" cy="40" r="18" fill="#fff" opacity=".7" />
      <path d="M-10 180 70 70 150 180z" fill={t.lejos} />
      <path d="M80 180 170 54 260 180z" fill={t.cerca} />
      <path d="M170 54 184 72 176 70 170 78 164 69 156 72z" fill="#fff" />
      <path d="M0 180v-30c60-18 140-10 240-22v52z" fill={t.lejos} opacity=".9" />
      <circle cx="40" cy="160" r="6" fill="#ff7fa8" />
      <circle cx="206" cy="166" r="6" fill="#ffd23f" />
    </svg>
  );
}
