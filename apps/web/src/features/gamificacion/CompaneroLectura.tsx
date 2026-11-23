'use client';

import { ArteRecompensa, NOMBRE_RECOMPENSA, useApariencia } from './AvatarLector';

/**
 * RF-062: el personaje que el niño eligió en la tienda lo acompaña mientras lee, y salta de alegría
 * cuando acierta (`festejo` cambia con cada acierto). Sin personaje elegido, no muestra nada.
 */
export function CompaneroLectura({ festejo }: { festejo: number }) {
  const apariencia = useApariencia();
  const personaje = apariencia?.personaje;
  if (!personaje) return null;
  const nombre = NOMBRE_RECOMPENSA[personaje] ?? 'tu personaje';
  return (
    <p className={`companero-lectura${festejo ? ' companero-lectura--festeja' : ''}`}>
      <span key={festejo} className="companero-lectura__arte" aria-hidden="true">
        <ArteRecompensa codigo={personaje} />
      </span>
      {nombre.charAt(0).toUpperCase() + nombre.slice(1)} te acompaña
    </p>
  );
}
