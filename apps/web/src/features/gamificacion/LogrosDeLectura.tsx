'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { clasesBoton, Icono } from '@lectoaventura/ui';

import { api } from '@/shared/api/client';

import { EMOJI_INSIGNIA, Pasaporte } from './tipos';

/**
 * RF-058, RF-059: al terminar la lectura, lo que ganó en ella (puntos, nivel e insignias nuevas). Compara
 * el pasaporte de cuando abrió la lectura con el de ahora: la API los registra antes de responder.
 */
export function LogrosDeLectura({ terminada }: { terminada: boolean }) {
  const [antes, setAntes] = useState<Pasaporte | null>(null);
  const [ahora, setAhora] = useState<Pasaporte | null>(null);

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

  if (!terminada || !antes || !ahora) return null;
  const puntos = ahora.puntos.total - antes.puntos.total;
  const yaGanadas = new Set(antes.insignias.filter((i) => i.ganada).map((i) => i.codigo));
  const nuevas = ahora.insignias.filter((i) => i.ganada && !yaGanadas.has(i.codigo));
  const subio = ahora.nivel.actual > antes.nivel.actual;

  return (
    <section className="logros-lectura" aria-labelledby="logros-titulo">
      <h2 id="logros-titulo">{puntos > 0 ? `¡Ganaste ${puntos} puntos!` : 'Tus logros'}</h2>
      {subio ? <p className="logros-lectura__nivel">¡Subiste al nivel {ahora.nivel.actual} de lector!</p> : null}
      {nuevas.length > 0 ? (
        <ul className="logros-lectura__insignias" aria-label="Insignias nuevas">
          {nuevas.map((i) => (
            <li key={i.codigo}>
              <span aria-hidden="true">{EMOJI_INSIGNIA[i.codigo] ?? '🏅'}</span> Nueva insignia: {i.nombre}
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
    </section>
  );
}
