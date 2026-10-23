'use client';

import { useEffect, useState } from 'react';

import { api } from '@/shared/api/client';

import { Pasaporte } from './tipos';

/** RF-057, RF-061, RF-062: nivel, racha y monedas en el saludo del inicio. Si no carga, no muestra nada. */
export function MarcadorLector() {
  const [p, setP] = useState<Pasaporte | null>(null);

  useEffect(() => {
    api<Pasaporte>('/yo/pasaporte')
      .then(setP)
      .catch(() => setP(null));
  }, []);

  if (!p) return null;
  return (
    <ul className="marcador" aria-label="Tu marcador">
      <li className="marcador__item">
        <span aria-hidden="true">⭐</span> Nivel {p.nivel.actual}
      </li>
      <li className="marcador__item">
        <span aria-hidden="true">🔥</span> {p.racha.dias} {p.racha.dias === 1 ? 'día seguido' : 'días seguidos'}
      </li>
      <li className="marcador__item">
        <span aria-hidden="true">🪙</span> {p.monedas} {p.monedas === 1 ? 'moneda' : 'monedas'}
      </li>
    </ul>
  );
}
