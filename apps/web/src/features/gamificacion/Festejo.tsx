'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Mascota } from '@lectoaventura/ui';

import { sonar, Sonido } from '@/features/lectura/sonidos';

import { AvatarLector } from './AvatarLector';
import { Apariencia } from './tipos';

/** Lo que se celebra: quién aparece (la estrellita o su avatar con lo nuevo), el mensaje y su emoji. */
export interface Festejo {
  titulo: string;
  texto?: string;
  emoji?: string;
  /** Sin indicar, aparece la estrellita de LectoAventura. */
  avatar?: Apariencia;
}

/** Cuánto se queda en pantalla antes de irse solo (no hay que tocarlo). */
export const DURACION_FESTEJO = 4200;

/** Los brillitos que salen disparados alrededor: su ángulo, su distancia, su forma y su color. */
const BRILLITOS = Array.from({ length: 12 }, (_, i) => ({
  angulo: i * 30,
  distancia: 54 + (i % 3) * 14,
  forma: ['✦', '★', '✨', '•'][i % 4] as string,
  color: ['#ffc83d', '#ff8fb8', '#c9b6ff', '#8fd0ff'][i % 4] as string,
}));

/** Elige una frase distinta cada vez, para que no se sienta repetido. */
export function unaDe(frases: string[]): string {
  return frases[Math.floor(Math.random() * frases.length)] ?? frases[0] ?? '';
}

/** Frases para cada momento, en palabras de niño (felicitan el logro, nunca comparan con otros). */
export const FRASES = {
  canje: (nombre: string) => [`¡Ya tienes ${nombre}!`, `¡${nombre} ya está en tu mochila!`, `¡Bien hecho! Conseguiste ${nombre}.`],
  accesorio: (nombre: string) => [`¡Te ves genial con tu ${nombre}!`, `¡${nombre} te queda increíble!`, `¡Qué estilo! Ya llevas tu ${nombre}.`],
  personaje: (nombre: string) => [`¡${nombre} será tu compañero de lectura!`, `¡${nombre} leerá contigo!`, `¡Ahora ${nombre} te acompaña!`],
  insignia: (nombre: string) => [`¡Ganaste la insignia «${nombre}»!`, `¡Insignia nueva: «${nombre}»!`],
};

/**
 * La celebración: la estrellita (o su avatar luciendo lo nuevo) salta desde abajo con un globito de
 * mensaje y una lluvia de brillitos de colores; luego se va sola. No tapa nada: los toques pasan a lo
 * que hay debajo. Con «reducir movimiento» solo aparece y desaparece, sin saltos ni brillitos volando.
 */
export function GloboFestejo({ festejo, saliendo = false }: { festejo: Festejo | null; saliendo?: boolean }) {
  if (!festejo) return null;
  return (
    <div className={`festejo${saliendo ? ' festejo--sale' : ''}`} role="status" aria-live="polite">
      <span className="festejo__quien" aria-hidden="true">
        <span className="festejo__brillitos">
          {BRILLITOS.map((b, i) => (
            <span key={i} style={{ '--angulo': `${b.angulo}deg`, '--distancia': `${b.distancia}px`, '--i': i, color: b.color } as React.CSSProperties}>
              {b.forma}
            </span>
          ))}
        </span>
        {festejo.avatar ? (
          <AvatarLector avatar={festejo.avatar.avatar} accesorio={festejo.avatar.accesorio} personaje={festejo.avatar.personaje} tamano={84} decorativo />
        ) : (
          <Mascota tamano={88} />
        )}
      </span>
      <span className="festejo__globo">
        {festejo.emoji ? (
          <span className="festejo__emoji" aria-hidden="true">
            {festejo.emoji}
          </span>
        ) : null}
        <span className="festejo__texto">
          <strong>{festejo.titulo}</strong>
          {festejo.texto ? <span>{festejo.texto}</span> : null}
        </span>
      </span>
    </div>
  );
}

/** Para mostrar una celebración con su sonido; se va sola después de unos segundos. */
export function useFestejo(): { festejo: Festejo | null; saliendo: boolean; festejar: (f: Festejo, sonido?: Sonido) => void } {
  const [festejo, setFestejo] = useState<Festejo | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const relojes = useRef<number[]>([]);

  const limpiar = () => {
    relojes.current.forEach((r) => window.clearTimeout(r));
    relojes.current = [];
  };
  useEffect(() => limpiar, []);

  const festejar = useCallback((f: Festejo, sonido?: Sonido) => {
    limpiar();
    setSaliendo(false);
    setFestejo(f);
    if (sonido) sonar(sonido);
    relojes.current.push(
      window.setTimeout(() => setSaliendo(true), DURACION_FESTEJO),
      window.setTimeout(() => {
        setFestejo(null);
        setSaliendo(false);
      }, DURACION_FESTEJO + 450),
    );
  }, []);

  return { festejo, saliendo, festejar };
}
