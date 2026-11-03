'use client';

import { ReactElement, useId } from 'react';

import { ArchivoProtegido } from '@/features/contenido/ArchivoProtegido';

/**
 * Ilustraciones de la lectura: cada párrafo va acompañado de una imagen, como en un libro ilustrado.
 * Si la lectura trae imágenes (las sube el editor, RF-023), la del párrafo n es la n-ésima; si no,
 * una escena animada que se elige por lo que cuenta el párrafo (un río, los cerros, la noche, la lluvia…)
 * con sus animales. Son decorativas (el texto dice lo importante) y se quedan quietas para quien
 * prefiere menos movimiento.
 */

/** El cielo y el lugar se eligen por separado: "subió al cerro… la luna" es un cerro de noche. */
export type Cielo = 'dia' | 'amanecer' | 'noche' | 'lluvia';
export type Lugar = 'campo' | 'agua' | 'montana' | 'bosque';
/** Los personajes que caminan por la escena (los que vuelan o nadan van aparte). */
export type Terrestre = 'llama' | 'zorro' | 'perro' | 'gato' | 'cuy' | 'conejo' | 'oveja' | 'rana';
export type Animal = Terrestre | 'aves' | 'peces' | 'mariposa';

const normal = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** En cada lista manda el primero que aparece (si no, un día de sol en el campo). */
const CIELOS: [Cielo, RegExp][] = [
  ['noche', /\b(noche|luna|estrellas?|oscur\w*|dormi\w*|sueno)\b/],
  ['lluvia', /\b(lluvi\w*|llov\w*|tormenta|granizo|charcos?)\b/],
  ['amanecer', /\b(manana|amanec\w*|desayun\w*|madrug\w*)\b/],
];

const LUGARES: [Lugar, RegExp][] = [
  ['agua', /\b(rio|lago|laguna|mar|playa|agua|titicaca|puno|pez|peces|pesca\w*|bote|totora)\b/],
  ['montana', /\b(cerros?|montan\w*|nevados?|volcan\w*|andes|puna|cumbre|condor)\b/],
  ['bosque', /\b(bosque|selva|arbol\w*|planta\w*|flor\w*|jardin|chacra|huerto|semilla\w*)\b/],
];

const ANIMALES: [Animal, RegExp][] = [
  ['llama', /\b(llamas?|alpacas?|vicunas?|guanacos?)\b/],
  ['zorro', /\b(zorr[oa]s?|zorrit[oa]s?|atoq)\b/],
  ['perro', /\b(perr[oa]s?|perrit[oa]s?|cachorr\w*)\b/],
  ['gato', /\b(gat[oa]s?|gatit[oa]s?|michi\w*)\b/],
  ['cuy', /\b(cuy|cuyes|cuyit[oa]s?)\b/],
  ['conejo', /\b(conej\w*|liebres?)\b/],
  ['oveja', /\b(ovejas?|ovejit[ao]s?|corder\w*|carner\w*)\b/],
  ['rana', /\b(ranas?|ranit[ao]s?|sapos?|sapit[oa]s?)\b/],
  ['aves', /\b(pajar\w*|aves?|condor\w*|palomas?|loros?|gallinas?|volar|vuela\w*)\b/],
  ['peces', /\b(pez|peces|pescad\w*|truchas?)\b/],
  ['mariposa', /\b(mariposas?|insectos?|abejas?|flor\w*)\b/],
];

/** Cuando el párrafo cuenta algo alegre, sale un arcoíris. */
const ALEGRE = /\b(feliz|felices|alegr\w*|sonri\w*|content[oa]s?|celebr\w*|fiesta|jug(ar|aron|aba\w*)|bail\w*)\b/;

/** Un número que depende solo del texto: el mismo párrafo siempre se ve igual. */
function semilla(t: string): number {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const esTerrestre = (a: Animal): a is Terrestre => a !== 'aves' && a !== 'peces' && a !== 'mariposa';

/**
 * Qué escena pinta un párrafo (si no dice nada especial, un día de sol en el campo). El `reparto` (el
 * título y el primer párrafo, donde se presenta a los personajes: "El zorro y la luna", "cuidaba a su
 * llama Pancho") acompaña toda la historia aunque el párrafo no los nombre, y va primero: al centro de la
 * escena. La `variante` (el número del párrafo) cambia el dibujo de un párrafo al siguiente aunque cuenten
 * lo mismo: la escena se mira desde el otro lado y, en el campo, aparecen árboles.
 */
export function escenaDe(
  texto: string,
  reparto = '',
  variante = semilla(texto),
): { cielo: Cielo; lugar: Lugar; animales: Animal[]; alegre: boolean; espejo: boolean; arboles: boolean } {
  const t = normal(texto);
  const r = normal(reparto);
  const cielo = CIELOS.find(([, f]) => f.test(t))?.[0] ?? 'dia';
  const lugar = LUGARES.find(([, f]) => f.test(t))?.[0] ?? 'campo';
  // Del reparto, solo los que caminan o vuelan (un pez del primer párrafo no sale a la chacra).
  const delReparto = ANIMALES.filter(([a, x]) => (esTerrestre(a) || a === 'aves') && x.test(r)).map(([a]) => a);
  // Primero los que nombra el párrafo (y entre ellos, los del reparto); después, el resto del reparto.
  const delParrafo = ANIMALES.filter(([, x]) => x.test(t))
    .map(([a]) => a)
    .sort((a, b) => Number(delReparto.includes(b)) - Number(delReparto.includes(a)));
  const animales = [...new Set([...delParrafo, ...delReparto])].filter((a) => a !== 'peces' || lugar === 'agua');
  // En el campo, de día, siempre revolotea una mariposa.
  if (animales.length === 0 && (cielo === 'dia' || cielo === 'amanecer') && (lugar === 'campo' || lugar === 'bosque')) animales.push('mariposa');
  const arboles = lugar === 'bosque' || (lugar === 'campo' && cielo === 'dia' && Math.floor(variante / 2) % 2 === 1);
  return { cielo, lugar, animales, alegre: ALEGRE.test(t), espejo: variante % 2 === 0, arboles };
}

/** Los colores del cielo (de arriba abajo); de día, cada lugar tiene el suyo. */
const COLORES_CIELO: Record<Exclude<Cielo, 'dia'>, [string, string]> = {
  amanecer: ['#ffc9a3', '#fff6dc'],
  noche: ['#241f5c', '#5b3fd9'],
  lluvia: ['#b9b3dc', '#eeeafb'],
};
const COLORES_DIA: Record<Lugar, [string, string]> = {
  campo: ['#bfe3ff', '#f5f3ff'],
  agua: ['#bfe3ff', '#e9f6ff'],
  montana: ['#c9e6ff', '#f5f3ff'],
  bosque: ['#cdeccf', '#f5fff3'],
};

function Nube({ x, y, escala = 1, clase = '' }: { x: number; y: number; escala?: number; clase?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <g className={`escena__nube ${clase}`}>
        <ellipse cx="0" cy="0" rx="22" ry="11" fill="#fff" />
        <ellipse cx="16" cy="-6" rx="15" ry="11" fill="#fff" />
        <ellipse cx="-14" cy="-3" rx="12" ry="9" fill="#fff" />
      </g>
    </g>
  );
}

function Sol({ x, y, sale = false }: { x: number; y: number; sale?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={sale ? 'escena__sol escena__sol--sale' : 'escena__sol'}>
        <g className="escena__rayos" stroke="#ffc83d" strokeWidth="4" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((g) => (
            <line key={g} x1="0" y1="-26" x2="0" y2="-34" transform={`rotate(${g})`} />
          ))}
        </g>
        <circle r="19" fill="#ffc83d" />
        <circle r="13" fill="#ffdb6e" />
      </g>
    </g>
  );
}

function Llama({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="escena__llama">
        {/* patas */}
        {[-16, -6, 8, 18].map((px, i) => (
          <rect key={px} x={px - 3} y="8" width="6" height="22" rx="3" fill={i % 2 ? '#e9dcc8' : '#f3e9dc'} />
        ))}
        {/* cuerpo y manta andina */}
        <ellipse cx="0" cy="4" rx="27" ry="15" fill="#f3e9dc" />
        <circle cx="-26" cy="0" r="5" fill="#f3e9dc" />
        <rect x="-12" y="-11" width="22" height="16" rx="5" fill="#c42b67" />
        <rect x="-12" y="-6" width="22" height="3" fill="#ffc83d" />
        <rect x="-12" y="0" width="22" height="3" fill="#5b3fd9" />
        {/* cuello y cabeza */}
        <g className="escena__llama-cabeza">
          <rect x="14" y="-34" width="11" height="38" rx="5.5" fill="#f3e9dc" />
          <ellipse cx="22" cy="-38" rx="10" ry="8" fill="#f3e9dc" />
          <ellipse cx="29" cy="-35" rx="5" ry="4" fill="#e9dcc8" />
          <ellipse cx="16" cy="-49" rx="3" ry="7" fill="#f3e9dc" transform="rotate(-12 16 -49)" />
          <ellipse cx="25" cy="-49" rx="3" ry="7" fill="#f3e9dc" transform="rotate(12 25 -49)" />
          <circle cx="23" cy="-40" r="2" fill="#1e1a4d" />
          <circle cx="12" cy="-44" r="3" fill="#c42b67" />
          <circle cx="29" cy="-45" r="3" fill="#ffc83d" />
        </g>
      </g>
    </g>
  );
}

function Aves({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="escena__aves" fill="none" stroke="#1e1a4d" strokeWidth="2.5" strokeLinecap="round">
        <path className="escena__ala" d="M0 0q6-6 12 0q6-6 12 0" />
        <path className="escena__ala" d="M30-12q5-5 10 0q5-5 10 0" />
        <path className="escena__ala" d="M-26-8q4-4 8 0q4-4 8 0" />
      </g>
    </g>
  );
}

function Pez({ x, y, color, retraso }: { x: number; y: number; color: string; retraso: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="escena__pez" style={{ animationDelay: retraso }}>
        <ellipse cx="0" cy="0" rx="10" ry="6" fill={color} />
        <path d="M8 0l9-6v12z" fill={color} />
        <circle cx="-5" cy="-1.5" r="1.6" fill="#1e1a4d" />
      </g>
    </g>
  );
}

function Mariposa({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="escena__mariposa">
        <ellipse className="escena__ala-mariposa" cx="-6" cy="-3" rx="7" ry="9" fill="#ff8fb1" />
        <ellipse className="escena__ala-mariposa" cx="6" cy="-3" rx="7" ry="9" fill="#c9b8ff" />
        <rect x="-1" y="-9" width="2" height="15" rx="1" fill="#1e1a4d" />
      </g>
    </g>
  );
}

/*
 * Los animales que caminan: dibujados mirando a la derecha con las patas en (0, 0). La cola se mueve
 * desde donde nace (su transform-origin).
 */

function Zorro() {
  return (
    <>
      <g className="escena__cola" style={{ transformOrigin: '100% 100%' }}>
        <ellipse cx="-27" cy="-22" rx="14" ry="6" fill="#e8743b" transform="rotate(30 -27 -22)" />
        <ellipse cx="-37" cy="-27" rx="5" ry="4" fill="#fff6dc" transform="rotate(30 -37 -27)" />
      </g>
      {[-11, -4, 7, 13].map((px) => (
        <rect key={px} x={px - 2} y="-11" width="4" height="11" rx="2" fill="#8a3e1c" />
      ))}
      <ellipse cx="0" cy="-15" rx="17" ry="8.5" fill="#e8743b" />
      <ellipse cx="8" cy="-11" rx="8" ry="4.5" fill="#fff6dc" />
      <path d="M12 -32 14 -45 20 -34z M19 -34 25 -45 27 -32z" fill="#e8743b" />
      <path d="M14.5 -35 15.5 -41 18.5 -35z M21 -34 24.5 -41 25.5 -34z" fill="#8a3e1c" />
      <circle cx="20" cy="-27" r="9" fill="#e8743b" />
      <path d="M25 -30 37 -24 25 -20z" fill="#fff6dc" />
      <circle cx="37" cy="-24" r="2" fill="#1e1a4d" />
      <circle cx="22" cy="-29" r="1.7" fill="#1e1a4d" />
    </>
  );
}

function Perro() {
  return (
    <>
      <path className="escena__cola" style={{ transformOrigin: '100% 100%' }} d="M-15 -17 Q-24 -22 -21 -32" fill="none" stroke="#c98b55" strokeWidth="4" strokeLinecap="round" />
      {[-11, -4, 7, 13].map((px) => (
        <rect key={px} x={px - 2.5} y="-12" width="5" height="12" rx="2.5" fill="#a86b3c" />
      ))}
      <ellipse cx="0" cy="-16" rx="16" ry="9" fill="#c98b55" />
      <ellipse cx="-4" cy="-19" rx="6" ry="4" fill="#8a5a3b" />
      <circle cx="18" cy="-27" r="9.5" fill="#c98b55" />
      <ellipse cx="27" cy="-24" rx="6.5" ry="4.5" fill="#e2b98c" />
      <circle cx="32" cy="-25" r="2.2" fill="#1e1a4d" />
      <circle cx="20" cy="-30" r="1.7" fill="#1e1a4d" />
      <ellipse cx="12" cy="-26" rx="3.5" ry="7.5" fill="#8a5a3b" transform="rotate(12 12 -26)" />
    </>
  );
}

function Gato() {
  return (
    <>
      <path className="escena__cola" style={{ transformOrigin: '0% 100%' }} d="M9 -3 Q22 -4 20 -18" fill="none" stroke="#8e8aa8" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="0" cy="-12" rx="11" ry="12" fill="#a29fbd" />
      <ellipse cx="0" cy="-9" rx="6" ry="7" fill="#e6e4f2" />
      <path d="M-8 -33 -7 -45 -1 -38z M8 -33 7 -45 1 -38z" fill="#a29fbd" />
      <circle cx="0" cy="-31" r="9" fill="#a29fbd" />
      <circle cx="-3.5" cy="-32" r="1.7" fill="#1e1a4d" />
      <circle cx="3.5" cy="-32" r="1.7" fill="#1e1a4d" />
      <path d="M-1.5 -29 h3 l-1.5 1.8z" fill="#ff8fb1" />
      <path d="M-4 -28 h-7 M-4 -27 l-7 2 M4 -28 h7 M4 -27 l7 2" stroke="#1e1a4d" strokeWidth=".8" strokeLinecap="round" />
    </>
  );
}

function Cuy() {
  return (
    <>
      <rect x="-9" y="-3" width="5" height="3" rx="1.5" fill="#b5783f" />
      <rect x="6" y="-3" width="5" height="3" rx="1.5" fill="#b5783f" />
      <ellipse cx="0" cy="-9" rx="14" ry="9" fill="#d9a066" />
      <ellipse cx="-5" cy="-10" rx="6" ry="5.5" fill="#fff6dc" />
      <ellipse cx="10" cy="-10" rx="7.5" ry="7" fill="#d9a066" />
      <circle cx="8" cy="-16" r="3" fill="#b5783f" />
      <circle cx="13" cy="-12" r="1.6" fill="#1e1a4d" />
      <circle cx="17.5" cy="-9" r="1.6" fill="#ff8fb1" />
    </>
  );
}

function Conejo() {
  return (
    <>
      <circle cx="-12" cy="-10" r="4" fill="#fff" />
      <ellipse cx="0" cy="-10" rx="12" ry="10" fill="#efeaf7" />
      <ellipse cx="5" cy="-34" rx="3" ry="10" fill="#efeaf7" transform="rotate(-10 5 -34)" />
      <ellipse cx="11" cy="-34" rx="3" ry="10" fill="#efeaf7" transform="rotate(12 11 -34)" />
      <ellipse cx="11" cy="-34" rx="1.4" ry="7" fill="#ffb3c8" transform="rotate(12 11 -34)" />
      <circle cx="9" cy="-22" r="8" fill="#efeaf7" />
      <circle cx="12" cy="-23" r="1.6" fill="#1e1a4d" />
      <circle cx="16.5" cy="-20" r="1.5" fill="#ff8fb1" />
      <ellipse cx="6" cy="-1" rx="5" ry="2.5" fill="#e0d9ef" />
    </>
  );
}

function Oveja() {
  return (
    <>
      {[-10, -3, 7, 13].map((px) => (
        <rect key={px} x={px - 2} y="-10" width="4" height="10" rx="2" fill="#4a4566" />
      ))}
      <g fill="#fff" stroke="#e6e1f5" strokeWidth="1">
        {[
          [-12, -16], [-4, -21], [5, -21], [12, -16], [-6, -12], [6, -12], [0, -16],
        ].map(([cx, cy]) => (
          <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="8" />
        ))}
      </g>
      <ellipse cx="20" cy="-21" rx="6" ry="7.5" fill="#4a4566" />
      <ellipse cx="15" cy="-25" rx="4" ry="2" fill="#4a4566" transform="rotate(-25 15 -25)" />
      <circle cx="17" cy="-28" r="4" fill="#fff" />
      <circle cx="22" cy="-23" r="1.5" fill="#fff" />
    </>
  );
}

function Rana() {
  return (
    <>
      <ellipse cx="-9" cy="-3" rx="6" ry="3" fill="#3cb878" />
      <ellipse cx="9" cy="-3" rx="6" ry="3" fill="#3cb878" />
      <ellipse cx="0" cy="-10" rx="12" ry="9" fill="#5fd08f" />
      <ellipse cx="0" cy="-8" rx="7" ry="5" fill="#c8f0d6" />
      <circle cx="-6" cy="-19" r="4.5" fill="#5fd08f" />
      <circle cx="6" cy="-19" r="4.5" fill="#5fd08f" />
      <circle cx="-6" cy="-19.5" r="2.6" fill="#fff" />
      <circle cx="6" cy="-19.5" r="2.6" fill="#fff" />
      <circle cx="-5.5" cy="-19.5" r="1.4" fill="#1e1a4d" />
      <circle cx="6.5" cy="-19.5" r="1.4" fill="#1e1a4d" />
      <path d="M-5 -12 q5 4 10 0" fill="none" stroke="#1e1a4d" strokeWidth="1.2" strokeLinecap="round" />
    </>
  );
}

/** Cada animal y su tamaño junto a la llama (el cuy y la rana, un poco más grandes para que se vean). */
const DIBUJOS: Record<Exclude<Terrestre, 'llama'>, [() => ReactElement, number]> = {
  zorro: [Zorro, 1],
  perro: [Perro, 1],
  gato: [Gato, 1],
  cuy: [Cuy, 1.3],
  conejo: [Conejo, 1.1],
  oveja: [Oveja, 1.05],
  rana: [Rana, 1.15],
};

/** Un personaje parado en (x, y): la llama con su manta o uno de los demás animales. */
function Personaje({ animal, x, y, retraso }: { animal: Terrestre; x: number; y: number; retraso: string }) {
  if (animal === 'llama') return <Llama x={x} y={y - 30} />;
  const [Dibujo, escala] = DIBUJOS[animal];
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <g className={`escena__animal escena__animal--${animal}`} style={{ animationDelay: retraso }}>
        <Dibujo />
      </g>
    </g>
  );
}

/** Dónde se paran (sus patas): el primero al centro; junto al lago, en la orilla (sin pisar el agua). */
const POSICIONES = {
  tierra: [
    [150, 146],
    [244, 150],
    [58, 152],
  ],
  orilla: [
    [72, 146],
    [106, 170],
    [26, 162],
  ],
} as const;

function Flores() {
  return (
    <g className="escena__flores">
      {[
        [40, 158, '#ff8fb1'],
        [72, 166, '#ffc83d'],
        [250, 162, '#c9b8ff'],
        [284, 156, '#ff8fb1'],
      ].map(([x, y, c]) => (
        <g key={`${x}`} transform={`translate(${x} ${y})`}>
          <rect x="-1" y="0" width="2" height="12" fill="#2bb673" />
          {[0, 72, 144, 216, 288].map((g) => (
            <circle key={g} cx="0" cy="-5" r="3.5" fill={c as string} transform={`rotate(${g})`} />
          ))}
          <circle r="2.5" fill="#fff6dc" />
        </g>
      ))}
    </g>
  );
}

function Arbol({ x, y, escala = 1 }: { x: number; y: number; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <g className="escena__arbol">
        <rect x="-4" y="-6" width="8" height="30" rx="3" fill="#8a5a3b" />
        <circle cx="0" cy="-18" r="18" fill="#2bb673" />
        <circle cx="-11" cy="-8" r="11" fill="#27a368" />
        <circle cx="11" cy="-10" r="12" fill="#3cc983" />
      </g>
    </g>
  );
}

/** Una escena animada (SVG liviano: sin descargas extra, RNF-006). */
export function EscenaAnimada({ texto, reparto = '', variante }: { texto: string; reparto?: string; variante?: number }) {
  const { cielo, lugar, animales, alegre, espejo, arboles } = escenaDe(texto, reparto, variante);
  const [arriba, abajo] = cielo === 'dia' ? COLORES_DIA[lugar] : COLORES_CIELO[cielo];
  // Ids únicos: en la pantalla hay una escena por párrafo.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `cielo-${uid}`;
  const lago = `lago-${uid}`;
  const noche = cielo === 'noche';
  const suelo = noche ? '#3d2a9e' : cielo === 'lluvia' ? '#7fbf9a' : '#5fd08f';
  const suelo2 = noche ? '#2b2466' : cielo === 'lluvia' ? '#6aae86' : '#2bb673';
  const agua = lugar === 'agua';

  return (
    <svg
      className="escena"
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-escena={lugar === 'campo' ? cielo : lugar}
      data-cielo={cielo}
      data-animales={animales.join(' ') || undefined}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={arriba} />
          <stop offset="1" stopColor={abajo} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${id})`} />
      <g transform={espejo ? 'matrix(-1 0 0 1 320 0)' : undefined}>

        {noche ? (
          <>
            <g className="escena__estrellas" fill="#fff6dc">
              {[
                [30, 24], [70, 50], [110, 18], [150, 40], [205, 22], [240, 52], [290, 30], [180, 62], [52, 82],
              ].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={i % 3 ? 1.8 : 2.6} style={{ animationDelay: `${(i % 4) * 0.4}s` }} />
              ))}
            </g>
            <g transform="translate(262 40)">
              <circle r="17" fill="#fff6dc" />
              <circle cx="7" cy="-4" r="15" fill={arriba} />
            </g>
          </>
        ) : cielo === 'lluvia' ? (
          <>
            <Nube x={80} y={34} escala={1.3} clase="escena__nube--lenta" />
            <Nube x={220} y={28} escala={1.5} />
            <g className="escena__lluvia" stroke="#5b3fd9" strokeWidth="2" strokeLinecap="round" opacity=".55">
              {Array.from({ length: 14 }, (_, i) => (
                <line key={i} x1={20 + i * 21} y1="52" x2={16 + i * 21} y2="62" style={{ animationDelay: `${(i % 5) * 0.18}s` }} />
              ))}
            </g>
          </>
        ) : (
          <>
            <Sol x={cielo === 'amanecer' ? 160 : 268} y={cielo === 'amanecer' ? 118 : 38} sale={cielo === 'amanecer'} />
            <Nube x={70} y={36} />
            <Nube x={190} y={24} escala={0.8} clase="escena__nube--lenta" />
          </>
        )}

        {alegre && !noche ? (
          <g className="escena__arcoiris" fill="none" strokeWidth="7" opacity=".6">
            {['#ff8fb1', '#ffc83d', '#5fd08f', '#6fb7ff', '#c9b8ff'].map((c, i) => (
              <path key={c} d={`M${40 + i * 7} 150 A${120 - i * 7} ${100 - i * 7} 0 0 1 ${280 - i * 7} 150`} stroke={c} pathLength={1} strokeDasharray="1" />
            ))}
          </g>
        ) : null}

        {lugar === 'montana' ? (
          <g opacity={noche ? 0.75 : 1}>
            <path d="M-10 150 70 50 150 150z" fill="#8d7fd8" />
            <path d="M70 50 52 72 62 70 70 78 80 68 88 72z" fill="#fff" />
            <path d="M90 150 190 36 300 150z" fill="#6f5fd0" />
            <path d="M190 36 168 62 180 60 190 70 202 58 212 62z" fill="#fff" />
            <path d="M210 150 270 80 340 150z" fill="#8d7fd8" />
          </g>
        ) : null}

        {/* el suelo */}
        <path d="M0 140 Q80 118 160 136 T320 132 V180 H0z" fill={suelo} />
        <path d="M0 158 Q90 142 180 158 T320 154 V180 H0z" fill={suelo2} />

        {agua ? (
          <g>
            {/* Un lago a la derecha; la orilla queda libre para los personajes. */}
            <clipPath id={lago}>
              <path d="M130 180 Q138 142 200 134 Q260 128 320 132 V180z" />
            </clipPath>
            <path d="M130 180 Q138 142 200 134 Q260 128 320 132 V180z" fill="#6fb7ff" />
            <g className="escena__olas" clipPath={`url(#${lago})`} fill="none" stroke="#e9f6ff" strokeWidth="3" strokeLinecap="round">
              <path d="M-40 146 q10-6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" />
              <path d="M-30 164 q10-6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" opacity=".7" />
            </g>
          </g>
        ) : null}

        {arboles ? (
          <>
            <Arbol x={40} y={124} />
            <Arbol x={286} y={122} escala={1.1} />
            <Arbol x={248} y={132} escala={0.75} />
          </>
        ) : null}

        {!noche && !agua ? <Flores /> : null}
        {agua ? (
          <>
            <Pez x={220} y={152} color="#ffc83d" retraso="0s" />
            <Pez x={282} y={162} color="#ff8fb1" retraso="1.1s" />
          </>
        ) : null}
        {/* Los que caminan: hasta 3, en el campo o en la orilla del lago. */}
        {animales
          .filter(esTerrestre)
          .slice(0, 3)
          .map((a, i) => {
            const [x, y] = POSICIONES[agua ? 'orilla' : 'tierra'][i] as readonly [number, number];
            return <Personaje key={a} animal={a} x={x} y={y} retraso={`${i * 0.35}s`} />;
          })}
        {animales.includes('aves') || (lugar === 'montana' && !noche) ? <Aves x={120} y={56} /> : null}
        {animales.includes('mariposa') ? <Mariposa x={230} y={98} /> : null}
      </g>
    </svg>
  );
}

/** Quiénes acompañan toda la historia: los del título y los del primer párrafo, donde se los presenta. */
export function repartoDe(titulo: string, primerParrafo = ''): string {
  return `${titulo}. ${primerParrafo}`;
}

/** La ilustración de un párrafo (o de la portada): la del editor si la hay; si no, su escena animada. */
export function IlustracionParrafo({
  imagen,
  texto,
  reparto,
  numero,
}: {
  imagen: { url: string; textoAlternativo: string } | null;
  texto: string;
  reparto: string;
  numero?: number;
}) {
  return (
    <figure className="ilustracion-lectura">
      {imagen ? <ArchivoProtegido url={imagen.url} tipo="IMAGEN" alt={imagen.textoAlternativo} className="ilustracion-lectura__imagen" /> : <EscenaAnimada texto={texto} reparto={reparto} variante={numero} />}
    </figure>
  );
}
