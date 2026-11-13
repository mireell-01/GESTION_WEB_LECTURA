import { ReactElement, useId } from 'react';

/**
 * El dibujo de cada mundo de la aventura (RF-030), animado y con algo que contar: el campamento del
 * Explorador, el pueblo de noche del Detective, el observatorio del Investigador, el búho sabio del
 * Crítico y el castillo de los libros del Maestro de la Lectura. Lo importante va al centro: la tarjeta
 * lo recorta en cuadrado en el celular y a lo ancho en la computadora. Es decorativo (aria-hidden).
 */
export function ArteMundo({ numero, className }: { numero: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const Escena = ESCENAS[numero] ?? Explorador;
  return (
    <svg
      viewBox="0 0 240 180"
      preserveAspectRatio="xMidYMid slice"
      className={['la-ilustracion', 'arte-mundo', `arte-mundo--${numero}`, className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      data-mundo={numero}
    >
      <Escena id={id} />
    </svg>
  );
}

type PropsEscena = { id: string };

/** Mundo 1 · Explorador: amanecer en el bosque, la carpa con su bandera, el camino y una mariposa. */
function Explorador({ id }: PropsEscena) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bdeaff" />
          <stop offset="1" stopColor="#e6fbe9" />
        </linearGradient>
      </defs>
      <rect width="240" height="180" fill={`url(#${id}c)`} />
      <g transform="translate(186 40)">
        <g className="arte__rayos">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((g) => (
            <rect key={g} x="-2" y="-30" width="4" height="10" rx="2" fill="#ffc83d" transform={`rotate(${g})`} />
          ))}
        </g>
      </g>
      <circle cx="186" cy="40" r="16" fill="#ffd23f" />
      <path d="M-10 130 50 62 110 130z" fill="#7cc79a" />
      <path d="M60 130 130 50 200 130z" fill="#4fae7a" />
      <path d="M130 50 141 63 134 61 130 68 125 61 119 63z" fill="#fff" />
      <path d="M150 130 205 74 260 130z" fill="#7cc79a" />
      <path d="M0 180V122c50-14 120-10 240-18v76z" fill="#5cc27e" />
      <path d="M118 180c4-22 22-30 40-40 10-6 6-14-6-16" fill="none" stroke="#f3dca5" strokeWidth="12" strokeLinecap="round" />
      {[24, 44, 210].map((x, i) => (
        <g key={x} className="arte__pino" style={{ animationDelay: `${i * -0.7}s` }}>
          <rect x={x - 2} y="128" width="4" height="12" fill="#8a5a3c" />
          <path d={`M${x - 13} 132 ${x} 100 ${x + 13} 132z`} fill="#2f8f5b" />
          <path d={`M${x - 10} 118 ${x} 92 ${x + 10} 118z`} fill="#3aa569" />
        </g>
      ))}
      <path d="M70 150 96 112 122 150z" fill="#ff8a3d" />
      <path d="M96 112 106 150h-20z" fill="#e5662a" />
      <path d="M92 150 96 132 100 150z" fill="#7a3b1c" />
      <line x1="96" y1="112" x2="96" y2="92" stroke="#7a3b1c" strokeWidth="2.5" strokeLinecap="round" />
      <path className="arte__bandera" d="M96 92h18l-5 6 5 6H96z" fill="#e5484d" />
      <g className="arte__mariposa">
        <ellipse cx="160" cy="98" rx="6" ry="4.5" fill="#c42b67" transform="rotate(-25 160 98)" />
        <ellipse cx="168" cy="98" rx="6" ry="4.5" fill="#ff7fa8" transform="rotate(25 168 98)" />
        <rect x="163" y="94" width="2" height="9" rx="1" fill="#1e1a4d" />
      </g>
      <circle cx="56" cy="160" r="5" fill="#ff7fa8" />
      <circle cx="196" cy="156" r="5" fill="#ffd23f" />
    </>
  );
}

/** Mundo 2 · Detective: el pueblo de noche, ventanas encendidas y una lupa que sigue unas huellas. */
function Detective({ id }: PropsEscena) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2170" />
          <stop offset="1" stopColor="#5b3fd9" />
        </linearGradient>
      </defs>
      <rect width="240" height="180" fill={`url(#${id}c)`} />
      <circle cx="186" cy="38" r="15" fill="#fff6dc" />
      <circle cx="193" cy="33" r="13" fill="#3a2d8f" />
      <g className="arte__estrellas">
        {[[34, 28], [70, 44], [112, 22], [150, 50], [216, 70], [58, 70]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="#fff" style={{ animationDelay: `${i * -0.4}s` }} />
        ))}
      </g>
      <path d="M0 120h240v60H0z" fill="#3d2a9e" />
      {[
        [20, 82, 44, '#7c64ef'],
        [62, 70, 40, '#9a86f5'],
        [100, 88, 36, '#7c64ef'],
        [136, 66, 46, '#8d77f3'],
        [180, 80, 44, '#7c64ef'],
      ].map(([x, y, w, color], i) => (
        <g key={i}>
          <rect x={x as number} y={y as number} width={w as number} height={130 - (y as number)} fill={color as string} />
          <path d={`M${(x as number) - 4} ${y} ${(x as number) + (w as number) / 2} ${(y as number) - 16} ${(x as number) + (w as number) + 4} ${y}z`} fill="#4b33b8" />
          <rect className="arte__ventana" x={(x as number) + 8} y={(y as number) + 10} width="10" height="12" rx="2" fill="#ffd23f" style={{ animationDelay: `${i * -0.9}s` }} />
          <rect x={(x as number) + (w as number) - 18} y={(y as number) + 10} width="10" height="12" rx="2" fill={i % 2 ? '#ffd23f' : '#2b2170'} />
        </g>
      ))}
      <path d="M0 132c60-6 160-6 240 0v48H0z" fill="#2b2170" />
      {[[40, 160], [62, 152], [86, 160], [110, 152], [134, 160]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="5" ry="3.5" fill="#c9bfff" opacity=".8" />
      ))}
      <g className="arte__lupa">
        <circle cx="160" cy="148" r="17" fill="#e0daff" fillOpacity=".35" stroke="#ffc83d" strokeWidth="6" />
        <circle cx="153" cy="141" r="5" fill="#fff" opacity=".7" />
        <rect x="171" y="160" width="8" height="24" rx="4" fill="#8a5a3c" transform="rotate(-45 175 172)" />
      </g>
    </>
  );
}

/** Mundo 3 · Investigador: el observatorio en la montaña, un planeta con anillos y una estrella fugaz. */
function Investigador({ id }: PropsEscena) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f2a6b" />
          <stop offset="1" stopColor="#3f7fd9" />
        </linearGradient>
      </defs>
      <rect width="240" height="180" fill={`url(#${id}c)`} />
      <g className="arte__estrellas">
        {[[30, 30], [80, 20], [120, 46], [200, 24], [216, 90], [44, 76]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.8" fill="#fff" style={{ animationDelay: `${i * -0.5}s` }} />
        ))}
      </g>
      <g className="arte__fugaz">
        <line x1="30" y1="22" x2="58" y2="34" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".9" />
        <circle cx="58" cy="34" r="3" fill="#fff" />
      </g>
      <g className="arte__planeta">
        <circle cx="168" cy="54" r="20" fill="#ff9f6b" />
        <path d="M150 50c6 4 30 6 36 0" stroke="#ff7a45" strokeWidth="4" fill="none" />
        <ellipse cx="168" cy="56" rx="34" ry="8" fill="none" stroke="#ffd23f" strokeWidth="4" transform="rotate(-14 168 56)" />
      </g>
      <path d="M-10 180 90 96 200 180z" fill="#5a6fc9" />
      <path d="M120 180 200 110 270 180z" fill="#4659b3" />
      <path d="M0 160c60-10 160-12 240-4v24H0z" fill="#33449a" />
      <rect x="66" y="112" width="48" height="34" fill="#e0daff" />
      <path d="M62 114a28 28 0 0 1 56 0z" fill="#fff" />
      <rect x="86" y="88" width="10" height="26" fill="#9aa6e8" />
      <rect className="arte__telescopio" x="84" y="84" width="40" height="11" rx="5" fill="#ffc83d" transform="rotate(-32 90 96)" />
      <rect x="84" y="126" width="12" height="20" rx="2" fill="#5b3fd9" />
      <circle cx="104" cy="124" r="4" fill="#ffd23f" />
      <g className="arte__burbujas">
        <path d="M150 130h14l-2 10 10 18a6 6 0 0 1-5 9h-20a6 6 0 0 1-5-9l10-18z" fill="#ddf7ea" stroke="#fff" strokeWidth="2" />
        <path d="M142 158h30l-1 2a6 6 0 0 1-5 7h-18a6 6 0 0 1-6-7z" fill="#2bb673" />
        <circle cx="156" cy="150" r="2.5" fill="#2bb673" />
        <circle cx="161" cy="143" r="2" fill="#2bb673" />
      </g>
    </>
  );
}

/** Mundo 4 · Crítico: el búho sabio con lentes sobre una pila de libros, con sus preguntas y opiniones. */
function Critico({ id }: PropsEscena) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9a8" />
          <stop offset="1" stopColor="#ffeccf" />
        </linearGradient>
      </defs>
      <rect width="240" height="180" fill={`url(#${id}c)`} />
      <circle cx="44" cy="44" r="18" fill="#ffb648" />
      <path d="M-10 150c50-34 100-34 140-10 40-26 90-28 120-6v46H-10z" fill="#f2c27e" />
      <path d="M-10 166c70-20 160-22 260-6v20H-10z" fill="#e3a961" />
      <g transform="translate(148 120)">
        <rect x="-8" y="-22" width="16" height="30" rx="3" fill="#2bb673" />
        <rect x="-16" y="-10" width="8" height="14" rx="3" fill="#2bb673" />
        <rect x="8" y="-16" width="8" height="12" rx="3" fill="#2bb673" />
      </g>
      <rect x="78" y="146" width="84" height="14" rx="3" fill="#5b3fd9" />
      <rect x="84" y="132" width="72" height="14" rx="3" fill="#e5484d" />
      <rect x="90" y="118" width="60" height="14" rx="3" fill="#2bb673" />
      <rect x="84" y="136" width="72" height="3" fill="#fff" opacity=".5" />
      <g className="arte__buho">
        <ellipse cx="120" cy="92" rx="26" ry="28" fill="#a0703f" />
        <ellipse cx="120" cy="100" rx="16" ry="18" fill="#f3dca5" />
        <path d="M98 70 104 58 112 68zM142 70 136 58 128 68z" fill="#8a5a3c" />
        <circle cx="110" cy="82" r="10" fill="#fff" stroke="#1e1a4d" strokeWidth="2.5" />
        <circle cx="130" cy="82" r="10" fill="#fff" stroke="#1e1a4d" strokeWidth="2.5" />
        <path d="M118 81h4" stroke="#1e1a4d" strokeWidth="2.5" />
        <g className="arte__ojos">
          <circle cx="111" cy="83" r="4" fill="#1e1a4d" />
          <circle cx="131" cy="83" r="4" fill="#1e1a4d" />
        </g>
        <path d="M116 92h8l-4 7z" fill="#ffb648" />
        <path d="M100 116c6 4 34 4 40 0" stroke="#8a5a3c" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
      <g className="arte__globo">
        <rect x="40" y="70" width="38" height="28" rx="12" fill="#fff" stroke="#5b3fd9" strokeWidth="2.5" />
        <path d="M66 96l8 10-14-8z" fill="#fff" stroke="#5b3fd9" strokeWidth="2.5" strokeLinejoin="round" />
        <text x="59" y="91" textAnchor="middle" fontSize="18" fontWeight="700" fill="#5b3fd9" style={{ fontFamily: 'var(--la-font-titulo)' }}>¿?</text>
      </g>
      <g className="arte__globo arte__globo--2">
        <rect x="166" y="46" width="36" height="28" rx="12" fill="#fff" stroke="#e5484d" strokeWidth="2.5" />
        <path d="M172 72l-6 10 12-8z" fill="#fff" stroke="#e5484d" strokeWidth="2.5" strokeLinejoin="round" />
        <text x="184" y="67" textAnchor="middle" fontSize="18" fontWeight="700" fill="#e5484d" style={{ fontFamily: 'var(--la-font-titulo)' }}>¡!</text>
      </g>
    </>
  );
}

/** Mundo 5 · Maestro de la Lectura: el castillo en las nubes, un libro gigante abierto y un arcoíris. */
function Maestro({ id }: PropsEscena) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7b8ff" />
          <stop offset="1" stopColor="#ffe3f0" />
        </linearGradient>
      </defs>
      <rect width="240" height="180" fill={`url(#${id}c)`} />
      <g fill="none" strokeWidth="7" opacity=".85">
        <path d="M20 150a100 100 0 0 1 200 0" stroke="#e5484d" />
        <path d="M28 150a92 92 0 0 1 184 0" stroke="#ffb648" />
        <path d="M36 150a84 84 0 0 1 168 0" stroke="#ffd23f" />
        <path d="M44 150a76 76 0 0 1 152 0" stroke="#2bb673" />
        <path d="M52 150a68 68 0 0 1 136 0" stroke="#3f7fd9" />
      </g>
      <g className="arte__brillos">
        {([[36, 40], [204, 36], [120, 18], [70, 70], [176, 74]] as [number, number][]).map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 6}l2 4 4 2-4 2-2 4-2-4-4-2 4-2z`} fill="#fff" style={{ animationDelay: `${i * -0.35}s` }} />
        ))}
      </g>
      <rect x="92" y="78" width="56" height="52" fill="#fff6dc" />
      <rect x="80" y="64" width="20" height="66" fill="#ffe6a6" />
      <rect x="140" y="64" width="20" height="66" fill="#ffe6a6" />
      <path d="M78 64 90 46 102 64zM138 64 150 46 162 64z" fill="#5b3fd9" />
      <path d="M108 78 120 56 132 78z" fill="#7c64ef" />
      <line x1="120" y1="56" x2="120" y2="40" stroke="#8a5a3c" strokeWidth="2" />
      <path className="arte__bandera" d="M120 40h14l-4 5 4 5h-14z" fill="#ffc83d" />
      <path d="M112 130v-16a8 8 0 0 1 16 0v16z" fill="#8d77f3" />
      <rect x="86" y="80" width="8" height="10" rx="4" fill="#5b3fd9" />
      <rect x="146" y="80" width="8" height="10" rx="4" fill="#5b3fd9" />
      <g className="arte__nube">
        <ellipse cx="70" cy="136" rx="34" ry="14" fill="#fff" />
        <ellipse cx="120" cy="140" rx="44" ry="16" fill="#fff" />
        <ellipse cx="172" cy="136" rx="34" ry="14" fill="#fff" />
      </g>
      <g className="arte__libro">
        <path d="M120 152c-14-8-34-8-48-2v22c14-6 34-6 48 2z" fill="#fff" stroke="#5b3fd9" strokeWidth="3" strokeLinejoin="round" />
        <path d="M120 152c14-8 34-8 48-2v22c-14-6-34-6-48 2z" fill="#fff" stroke="#5b3fd9" strokeWidth="3" strokeLinejoin="round" />
        <path d="M82 158c10-3 20-3 30 0M82 164c10-3 20-3 30 0M128 158c10-3 20-3 30 0M128 164c10-3 20-3 30 0" stroke="#c9bfff" strokeWidth="2" fill="none" />
        <path className="arte__pagina" d="M120 152c10-10 26-12 38-8v22c-12-4-28-2-38 8z" fill="#fff6dc" stroke="#5b3fd9" strokeWidth="2" strokeLinejoin="round" />
      </g>
    </>
  );
}

const ESCENAS: Record<number, (p: PropsEscena) => ReactElement> = { 1: Explorador, 2: Detective, 3: Investigador, 4: Critico, 5: Maestro };
