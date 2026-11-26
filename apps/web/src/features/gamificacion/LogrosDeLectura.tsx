'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { clasesBoton, Icono } from '@lectoaventura/ui';

import { api } from '@/shared/api/client';

import { FRASES, GloboFestejo, unaDe, useFestejo } from './Festejo';
import { EMOJI_INSIGNIA, Pasaporte } from './tipos';

/** La fanfarria del final suena primero; la estrellita llega cuando termina, para no encimar sonidos. */
export const ESPERA_FESTEJO = 1500;

/**
 * RF-058, RF-059: al terminar la lectura, lo que ganó en ella (puntos, nivel e insignias nuevas). Compara
 * el pasaporte de cuando abrió la lectura con el de ahora: la API los registra antes de responder. Si ganó
 * una insignia o subió de nivel, la estrellita aparece con brillitos y el sonido de medalla.
 */
export function LogrosDeLectura({ terminada }: { terminada: boolean }) {
  const [antes, setAntes] = useState<Pasaporte | null>(null);
  const [ahora, setAhora] = useState<Pasaporte | null>(null);
  const { festejo, saliendo, festejar } = useFestejo();

  useEffect(() => {
    api<Pasaporte>('/yo/pasaporte')
      .then(setAntes)
      .catch(() => setAntes(null));
  }, []);

  useEffect(() => {
    if (!terminada || !antes) return;
    api<Pasaporte>('/yo/pasaporte')
      .then(setAhora)
      .catch(() => setAhora(null));
  }, [terminada, antes]);

  const logros = antes && ahora ? lograsteEn(antes, ahora) : null;
  const primeraNueva = logros?.nuevas[0] ?? null;
  // Qué se celebra, como texto estable: así la estrellita sale una sola vez por logro.
  const motivo = primeraNueva
    ? `${primeraNueva.codigo}|${primeraNueva.nombre}`
    : logros?.subio && ahora
      ? `nivel|${ahora.nivel.actual}`
      : null;
  const celebrado = useRef<string | null>(null);
  useEffect(() => {
    if (!motivo || celebrado.current === motivo) return;
    const reloj = window.setTimeout(() => {
      celebrado.current = motivo;
      const [codigo, dato] = motivo.split('|') as [string, string];
      if (codigo === 'nivel') festejar({ titulo: `¡Subiste al nivel ${dato} de lector!`, texto: '¡Cada lectura te hace crecer!', emoji: '⭐' }, 'insignia');
      else festejar({ titulo: unaDe(FRASES.insignia(dato)), texto: '¡Lo lograste leyendo! Mírala en tu Pasaporte.', emoji: EMOJI_INSIGNIA[codigo] ?? '🏅' }, 'insignia');
    }, ESPERA_FESTEJO);
    return () => window.clearTimeout(reloj);
  }, [motivo, festejar]);

  if (!terminada || !antes || !ahora || !logros) return null;
  const { puntos, nuevas, subio } = logros;
  const celebra = subio || nuevas.length > 0;

  return (
    <section className={`logros-lectura${celebra ? ' logros-lectura--celebra' : ''}`} aria-labelledby="logros-titulo">
      {celebra ? (
        // Una lluvia de papelitos de colores cuando sube de nivel o gana una insignia (decorativa).
        <span className="logros-lectura__confeti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </span>
      ) : null}
      <h2 id="logros-titulo">{puntos > 0 ? `¡Ganaste ${puntos} puntos!` : 'Tus logros'}</h2>
      {subio ? <p className="logros-lectura__nivel">¡Subiste al nivel {ahora.nivel.actual} de lector!</p> : null}
      {nuevas.length > 0 ? (
        <ul className="logros-lectura__insignias" aria-label="Insignias nuevas">
          {nuevas.map((i) => (
            <li key={i.codigo}>
              <span className="logros-lectura__sello" aria-hidden="true">
                {EMOJI_INSIGNIA[i.codigo] ?? '🏅'}
              </span>{' '}
              Nueva insignia: {i.nombre}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Link href="/estudiante/pasaporte" className={clasesBoton('secundario')}>
          <Icono nombre="perfil" tamano={22} />
          Ver mi pasaporte
        </Link>
      </div>
      <GloboFestejo festejo={festejo} saliendo={saliendo} />
    </section>
  );
}

/** Lo que ganó entre dos pasaportes: los puntos, las insignias nuevas y si subió de nivel. */
export function lograsteEn(antes: Pasaporte, ahora: Pasaporte) {
  const yaGanadas = new Set(antes.insignias.filter((i) => i.ganada).map((i) => i.codigo));
  return {
    puntos: ahora.puntos.total - antes.puntos.total,
    nuevas: ahora.insignias.filter((i) => i.ganada && !yaGanadas.has(i.codigo)),
    subio: ahora.nivel.actual > antes.nivel.actual,
  };
}
