'use client';

import { useEffect, useId, useState } from 'react';

import { AVATARES } from '@lectoaventura/ui';

import { api } from '@/shared/api/client';

import { Apariencia, EMOJI_RECOMPENSA, LUGAR_ACCESORIO } from './tipos';

/** Nombres de las recompensas, para decir en voz alta qué lleva puesto el avatar. */
export const NOMBRE_RECOMPENSA: Record<string, string> = {
  LUPA: 'la lupa de detective',
  GORRA: 'la gorra de aventurero',
  CHULLO: 'el chullo andino',
  CAPA: 'la capa de lector',
  CORONA: 'la corona de la lectura',
  LLAMA: 'la llama',
  CONDOR: 'el cóndor',
  OSO_ANTEOJOS: 'el oso de anteojos',
  COLIBRI: 'el colibrí',
  DRAGON: 'el dragón lector',
};

/** El chullo andino: tejido a rayas, con orejeras, trencitas y pompón. */
function Chullo() {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-copa`}>
          <path d="M11 42 C11 22 20 13 32 13 C44 13 53 22 53 42 Z" />
        </clipPath>
      </defs>
      <circle cx="32" cy="9" r="6" fill="#ffc83d" stroke="#dda200" strokeWidth="1.5" />
      <g clipPath={`url(#${id}-copa)`}>
        <rect x="0" y="0" width="64" height="64" fill="#e5484d" />
        <rect x="0" y="20" width="64" height="5" fill="#ffc83d" />
        <rect x="0" y="27" width="64" height="5" fill="#2bb673" />
        <rect x="0" y="34" width="64" height="8" fill="#5b3fd9" />
        <path d="M6 38 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3" fill="none" stroke="#fff" strokeWidth="1.6" />
      </g>
      <path d="M11 41 L22 41 L15 53 Z" fill="#e5484d" stroke="#c42b3a" strokeWidth="1.2" />
      <path d="M42 41 L53 41 L49 53 Z" fill="#e5484d" stroke="#c42b3a" strokeWidth="1.2" />
      <path d="M15 53 L14 60 M49 53 L50 60" stroke="#ffc83d" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="14" cy="61" r="2.4" fill="#2bb673" />
      <circle cx="50" cy="61" r="2.4" fill="#2bb673" />
    </svg>
  );
}

/** La capa de lector: roja, con broche dorado y una estrella. */
function Capa() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M17 9 Q32 15 47 9 L58 55 Q32 63 6 55 Z" fill="#e5484d" />
      <path d="M32 14 L32 60" stroke="#c42b3a" strokeWidth="1.5" opacity="0.5" />
      <path d="M17 9 Q32 15 47 9 L45 17 Q32 22 19 17 Z" fill="#c42b3a" />
      <circle cx="32" cy="17" r="4.5" fill="#ffc83d" stroke="#dda200" strokeWidth="1.5" />
      <path d="M32 33 l3 6 l6.5 0.8 l-4.8 4.4 l1.3 6.4 l-6 -3.3 l-6 3.3 l1.3 -6.4 l-4.8 -4.4 l6.5 -0.8 Z" fill="#ffc83d" />
    </svg>
  );
}

/** El dibujo de una recompensa: el chullo y la capa dibujados; el resto, su emoji. */
export function ArteRecompensa({ codigo }: { codigo: string }) {
  if (codigo === 'CHULLO') return <Chullo />;
  if (codigo === 'CAPA') return <Capa />;
  return <span className="arte-recompensa__emoji">{EMOJI_RECOMPENSA[codigo] ?? '🎁'}</span>;
}

/**
 * El avatar del niño con lo que tiene puesto: el accesorio en la cabeza, en la mano o en la espalda, y
 * el personaje que lo acompaña asomándose a su lado. Decorativo cuando un texto cercano ya lo nombra.
 */
export function AvatarLector({
  avatar,
  accesorio = null,
  personaje = null,
  tamano,
  className,
  etiqueta,
  decorativo = false,
}: {
  avatar: string;
  accesorio?: string | null;
  personaje?: string | null;
  /** En píxeles; sin él, lo da la clase (--tam) o 104. */
  tamano?: number;
  className?: string;
  /** Lo que dice el lector de pantalla; por defecto, «Tu avatar: Zorro con la lupa de detective». */
  etiqueta?: string;
  decorativo?: boolean;
}) {
  const base = AVATARES[avatar] ?? { emoji: '🙂', nombre: 'Avatar', fondo: '#ede8ff' };
  const lugar = accesorio ? (LUGAR_ACCESORIO[accesorio] ?? 'cabeza') : null;
  const conQue = [accesorio, personaje].filter((c): c is string => !!c && !!NOMBRE_RECOMPENSA[c]).map((c) => NOMBRE_RECOMPENSA[c]);
  const nombre = etiqueta ?? `Tu avatar: ${base.nombre}${conQue.length ? ` con ${conQue.join(' y ')}` : ''}`;
  return (
    <span
      className={['avatar-lector', lugar ? `avatar-lector--${lugar}` : '', className].filter(Boolean).join(' ')}
      style={{ ...(tamano ? { '--tam': `${tamano}px` } : {}), '--fondo': base.fondo } as React.CSSProperties}
      {...(decorativo ? { 'aria-hidden': true } : { role: 'img', 'aria-label': nombre })}
    >
      {accesorio && lugar === 'espalda' ? (
        <span className="avatar-lector__accesorio avatar-lector__accesorio--espalda">
          <ArteRecompensa codigo={accesorio} />
        </span>
      ) : null}
      <span className="avatar-lector__circulo">
        <span className="avatar-lector__cara">{base.emoji}</span>
      </span>
      {accesorio && lugar !== 'espalda' ? (
        <span className={`avatar-lector__accesorio avatar-lector__accesorio--${lugar}`}>
          <ArteRecompensa codigo={accesorio} />
        </span>
      ) : null}
      {personaje ? (
        <span className="avatar-lector__companero">
          <ArteRecompensa codigo={personaje} />
        </span>
      ) : null}
    </span>
  );
}

/** Lo que el niño tiene puesto ahora (null mientras carga o si no se pudo consultar). */
export function useApariencia(): Apariencia | null {
  const [apariencia, setApariencia] = useState<Apariencia | null>(null);
  useEffect(() => {
    let vigente = true;
    api<Apariencia>('/yo/apariencia')
      .then((a) => vigente && setApariencia(a))
      .catch(() => vigente && setApariencia(null));
    return () => {
      vigente = false;
    };
  }, []);
  return apariencia;
}
