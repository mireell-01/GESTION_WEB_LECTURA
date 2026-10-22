'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { clasesBoton, Icono, Mascota } from '@lectoaventura/ui';

import { api } from '@/shared/api/client';

import { RetoActual } from './tipos';

/**
 * Aviso del inicio del estudiante: su reto inicial (RN-05: obligatorio antes del mapa) o el reto de
 * repaso que le dejó su docente (RF-037). Si no tiene ninguno, no muestra nada.
 */
export function TarjetaReto() {
  const [actual, setActual] = useState<RetoActual | null>(null);

  useEffect(() => {
    api<RetoActual>('/diagnosticos/actual')
      .then(setActual)
      .catch(() => setActual(null)); // sin el aviso, el niño igual llega al reto desde su mapa
  }, []);

  const reto = actual?.pendiente;
  if (!reto) return null;
  const empezado = reto.respondidos > 0 || reto.estado === 'PAUSADO';
  const inicial = reto.tipo === 'INICIAL';

  return (
    <section className="est-reto" aria-labelledby="reto-titulo">
      <Mascota tamano={84} flota />
      <div className="pila-sm">
        <h2 id="reto-titulo">{inicial ? '¡Tu reto inicial te espera!' : 'Tu docente te dejó un reto de repaso'}</h2>
        <p>
          {empezado
            ? `Vas en la pregunta ${reto.respondidos + 1} de ${reto.total}. ¡Sigue donde te quedaste!`
            : inicial
              ? `Son ${reto.total} preguntas cortas sobre lecturas. Así sabremos en qué mundo empiezas tu aventura.`
              : `Son ${reto.total} preguntas cortas para ver todo lo que aprendiste.`}
        </p>
        <div>
          <Link href="/estudiante/reto" className={clasesBoton('primario', { tamano: 'grande' })}>
            <Icono nombre="estrella" tamano={24} />
            {empezado ? 'Continuar mi reto' : '¡Empezar mi reto!'}
          </Link>
        </div>
      </div>
    </section>
  );
}
