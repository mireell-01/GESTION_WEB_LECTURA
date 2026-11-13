import { ReactElement } from 'react';

/**
 * Los temas de la biblioteca del niño, con dibujo: en vez de escribir la temática, toca "Animales" o
 * "Cuentos clásicos". Cada tema busca su palabra dentro de la temática de la lectura (la API compara
 * sin mayúsculas), así "Animales" reúne "Animales de los Andes", "Animales del Perú"…
 */
export interface TemaBiblioteca {
  /** Lo que se busca en la temática de la lectura. */
  busca: string;
  nombre: string;
  color: string;
  dibujo: ReactElement;
}

const B = '#fff';

export const TEMAS_BIBLIOTECA: TemaBiblioteca[] = [
  {
    busca: 'animales',
    nombre: 'Animales',
    color: '#ff8a3d',
    dibujo: (
      <>
        <ellipse cx="24" cy="30" rx="8" ry="7" fill={B} />
        <circle cx="14" cy="20" r="3.6" fill={B} />
        <circle cx="20" cy="14" r="3.6" fill={B} />
        <circle cx="28" cy="14" r="3.6" fill={B} />
        <circle cx="34" cy="20" r="3.6" fill={B} />
      </>
    ),
  },
  {
    busca: 'naturaleza',
    nombre: 'Naturaleza',
    color: '#2bb673',
    dibujo: (
      <>
        <rect x="22" y="28" width="4" height="10" rx="1.5" fill="#8a5a3c" />
        <circle cx="24" cy="20" r="10" fill={B} />
        <circle cx="17" cy="25" r="6" fill={B} />
        <circle cx="31" cy="25" r="6" fill={B} />
      </>
    ),
  },
  {
    busca: 'fábulas',
    nombre: 'Fábulas',
    color: '#14a3a3',
    dibujo: (
      <>
        <path d="M11 30a13 10 0 0 1 26 0z" fill={B} />
        <path d="M17 28l4-6 6 0 4 6" stroke="#14a3a3" strokeWidth="2" fill="none" />
        <circle cx="38" cy="26" r="4" fill={B} />
        <rect x="13" y="29" width="5" height="6" rx="2" fill={B} />
        <rect x="30" y="29" width="5" height="6" rx="2" fill={B} />
      </>
    ),
  },
  {
    busca: 'clásicos',
    nombre: 'Cuentos clásicos',
    color: '#7c64ef',
    dibujo: (
      <>
        <rect x="14" y="20" width="20" height="16" fill={B} />
        <rect x="11" y="16" width="7" height="20" fill={B} />
        <rect x="30" y="16" width="7" height="20" fill={B} />
        <path d="M10 16l4.5-6 4.5 6zM29 16l4.5-6 4.5 6z" fill="#ffd23f" />
        <path d="M21 36v-6a3 3 0 0 1 6 0v6z" fill="#7c64ef" />
      </>
    ),
  },
  {
    busca: 'misterio',
    nombre: 'Misterios',
    color: '#3d2a9e',
    dibujo: (
      <>
        <circle cx="21" cy="21" r="9" fill="none" stroke={B} strokeWidth="4" />
        <path d="M28 28l8 8" stroke="#ffd23f" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
  },
  {
    busca: 'ciencia',
    nombre: 'Ciencia',
    color: '#3f7fd9',
    dibujo: (
      <>
        <path d="M20 11h8v9l8 13a3 3 0 0 1-3 4H15a3 3 0 0 1-3-4l8-13z" fill={B} />
        <path d="M15 30h18l2 3a3 3 0 0 1-3 4H16a3 3 0 0 1-3-4z" fill="#2bb673" />
        <circle cx="22" cy="25" r="1.8" fill="#2bb673" />
      </>
    ),
  },
  {
    busca: 'amistad',
    nombre: 'Amistad',
    color: '#e5487f',
    dibujo: <path d="M24 37s-12-7-12-16a6.5 6.5 0 0 1 12-3.5A6.5 6.5 0 0 1 36 21c0 9-12 16-12 16z" fill={B} />,
  },
  {
    busca: 'aventura',
    nombre: 'Aventuras',
    color: '#e0a800',
    dibujo: (
      <>
        <path d="M8 36l12-18 7 10 4-5 9 13z" fill={B} />
        <line x1="20" y1="18" x2="20" y2="9" stroke="#8a5a3c" strokeWidth="2" />
        <path d="M20 9h8l-2 3 2 3h-8z" fill="#e5484d" />
      </>
    ),
  },
  {
    busca: 'viajes',
    nombre: 'Viajes',
    color: '#1b8fd1',
    dibujo: (
      <>
        <path d="M10 28h28l-5 8H15z" fill={B} />
        <line x1="24" y1="28" x2="24" y2="10" stroke={B} strokeWidth="2" />
        <path d="M25 11l9 14h-9z" fill="#ffd23f" />
        <path d="M23 13l-8 12h8z" fill={B} />
      </>
    ),
  },
  {
    busca: 'tradiciones',
    nombre: 'Tradiciones',
    color: '#c42b67',
    dibujo: (
      <>
        <path d="M8 14c10 8 22 8 32 0" stroke={B} strokeWidth="2" fill="none" />
        <path d="M12 17l3 8 3-6zM21 20l3 8 3-8zM30 19l3 6 3-8z" fill="#ffd23f" />
        <rect x="14" y="30" width="20" height="8" rx="2" fill={B} />
        <path d="M14 34h20" stroke="#c42b67" strokeWidth="2" strokeDasharray="3 2" />
      </>
    ),
  },
];

export function DibujoTema({ tema }: { tema: TemaBiblioteca }) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false" className="tema-biblioteca__dibujo">
      <circle cx="24" cy="24" r="23" fill={tema.color} />
      {tema.dibujo}
    </svg>
  );
}

/** Los temas para tocar; "Todos" quita el filtro. El tema elegido queda marcado (aria-pressed). */
export function TemasBiblioteca({ elegido, alElegir }: { elegido: string; alElegir: (busca: string) => void }) {
  return (
    <section className="temas-biblioteca" aria-labelledby="temas-titulo">
      <h2 id="temas-titulo">¿De qué quieres leer hoy?</h2>
      <ul className="temas-biblioteca__lista">
        <li>
          <button type="button" className="tema-biblioteca" aria-pressed={elegido === ''} onClick={() => alElegir('')}>
            <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false" className="tema-biblioteca__dibujo">
              <circle cx="24" cy="24" r="23" fill="#ffc83d" />
              <path d="M24 9l4.4 9 9.9 1.4-7.2 7 1.7 9.8L24 31.6l-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z" fill={B} />
            </svg>
            Todos
          </button>
        </li>
        {TEMAS_BIBLIOTECA.map((t) => (
          <li key={t.busca}>
            <button type="button" className="tema-biblioteca" aria-pressed={elegido === t.busca} onClick={() => alElegir(elegido === t.busca ? '' : t.busca)}>
              <DibujoTema tema={t} />
              {t.nombre}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** El tema (con dibujo) al que pertenece una temática, para mostrarlo en la tarjeta del cuento. */
export function temaDe(tematica: string): TemaBiblioteca | null {
  const t = tematica.toLocaleLowerCase('es');
  return TEMAS_BIBLIOTECA.find((tema) => t.includes(tema.busca)) ?? null;
}
