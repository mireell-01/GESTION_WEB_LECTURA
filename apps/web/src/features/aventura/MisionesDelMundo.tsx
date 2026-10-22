'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alerta, Cargando, Chip, clasesBoton, EscenaMundo, Icono } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { ESTADO_MISION, MisionesDeMundo, TONO_MUNDO } from './tipos';

const AVANCE = { PENDIENTE: 'Por leer', EN_CURSO: 'Leyendo', FINALIZADA: '¡Leída!' } as const;
/** Módulo 6: qué dice el enlace a la lectura según su avance. */
const LEER = { PENDIENTE: 'Leer', EN_CURSO: 'Seguir leyendo', FINALIZADA: 'Leer otra vez' } as const;

/** RF-032: las misiones de un mundo, cada una con sus lecturas y el avance del niño. */
export function MisionesDelMundo({ mundoId }: { mundoId: string }) {
  const [datos, setDatos] = useState<MisionesDeMundo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MisionesDeMundo>(`/aventura/mundos/${mundoId}/misiones`)
      .then(setDatos)
      .catch((err) => setError(mensajeDeError(err)));
  }, [mundoId]);

  const volver = (
    <Link href="/estudiante/mundos" className="volver">
      <Icono nombre="flecha" tamano={20} className="volver__icono" />
      Tu mapa
    </Link>
  );
  if (error) return <div className="pila">{volver}<Alerta tipo="aviso">{error}</Alerta></div>;
  if (!datos) return <Cargando texto="Abriendo el mundo…" />;
  const { mundo, misiones } = datos;

  return (
    <div className="pila mundo-detalle">
      {volver}
      <header className="mundo-detalle__cabecera">
        <span className="mundo-detalle__escena">
          <EscenaMundo tono={TONO_MUNDO[mundo.numero] ?? 'bosque'} />
        </span>
        <div>
          <p className="est-mundo__numero">Mundo {mundo.numero}</p>
          <h1>{mundo.nombre}</h1>
          <p>{mundo.descripcion}</p>
        </div>
      </header>

      {misiones.length === 0 ? (
        <Alerta tipo="info">Las misiones de este mundo se están preparando. ¡Vuelve pronto!</Alerta>
      ) : (
        <ol className="misiones" aria-label="Misiones">
          {misiones.map((m) => {
            const estado = ESTADO_MISION[m.estado];
            return (
              <li key={m.id} className={`mision mision--${m.estado.toLowerCase()}`}>
                <div className="mision__cabecera">
                  <span className="mision__numero" aria-hidden="true">
                    {m.estado === 'COMPLETADA' ? <Icono nombre="estrella" tamano={26} /> : m.orden}
                  </span>
                  <h2>
                    <span className="sr-only">Misión {m.orden}: </span>
                    {m.titulo}
                  </h2>
                  <Chip tipo={estado.chip}>{estado.texto}</Chip>
                </div>
                {m.descripcion ? <p className="mision__descripcion">{m.descripcion}</p> : null}
                {m.lecturas.length === 0 ? (
                  <p className="texto-suave">Sus lecturas llegan muy pronto.</p>
                ) : (
                  <ul className="mision__lecturas">
                    {m.lecturas.map((l) => (
                      <li key={l.id}>
                        <Icono nombre="libro" tamano={22} />
                        <span>{l.titulo}</span>
                        <Chip tipo={l.avance === 'FINALIZADA' ? 'exito' : l.avance === 'EN_CURSO' ? 'aviso' : undefined}>{AVANCE[l.avance]}</Chip>
                        <Link href={`/estudiante/lecturas/${l.id}`} className={clasesBoton(l.avance === 'FINALIZADA' ? 'fantasma' : 'primario', { tamano: 'pequeno' })} aria-label={`${LEER[l.avance]}: ${l.titulo}`}>
                          {LEER[l.avance]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
