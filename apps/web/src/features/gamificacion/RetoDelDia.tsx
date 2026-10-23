'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BarraProgreso, clasesBoton, Icono } from '@lectoaventura/ui';

import { HABILIDAD_INFANTIL } from '@/features/diagnostico/tipos';
import { api } from '@/shared/api/client';

import { RetoDelDia as Reto } from './tipos';

/**
 * RF-060: el reto del día — unas pocas preguntas de su habilidad más débil, unos 5 minutos. Se cumple
 * leyendo cualquier lectura; si hay una pensada para eso, se la sugiere. Si no carga, no muestra nada.
 */
export function RetoDelDia() {
  const [reto, setReto] = useState<Reto | null>(null);

  useEffect(() => {
    api<Reto>('/yo/reto-del-dia')
      .then(setReto)
      .catch(() => setReto(null));
  }, []);

  if (!reto) return null;
  const cumplido = reto.estado === 'COMPLETADO';
  const habilidad = HABILIDAD_INFANTIL[reto.habilidad].toLowerCase();

  return (
    <section className={`reto-dia${cumplido ? ' reto-dia--cumplido' : ''}`} aria-labelledby="reto-dia-titulo">
      <span className="reto-dia__icono" aria-hidden="true">
        {cumplido ? '🏅' : '🎯'}
      </span>
      <div className="pila-sm">
        <h2 id="reto-dia-titulo">Reto del día</h2>
        <p>
          {cumplido
            ? `¡Reto cumplido! Ganaste ${reto.puntos} puntos. Mañana tendrás otro.`
            : `Responde bien ${reto.meta} preguntas para ${habilidad}. Son unos ${reto.minutos} minutos y ganas ${reto.puntos} puntos.`}
        </p>
        <BarraProgreso valor={(reto.avance / reto.meta) * 100} etiqueta="Avance del reto del día" />
        <p className="reto-dia__avance">
          {reto.avance} de {reto.meta}
        </p>
        {!cumplido && reto.lectura ? (
          <div>
            <Link href={`/estudiante/lecturas/${reto.lectura.id}`} className={clasesBoton('primario')} aria-label={`Leer para el reto: ${reto.lectura.titulo}`}>
              <Icono nombre="libro" tamano={22} />
              Leer «{reto.lectura.titulo}»
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
