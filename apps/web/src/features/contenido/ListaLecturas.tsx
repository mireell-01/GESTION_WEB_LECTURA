'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alerta, Cargando, Chip, clasesBoton, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';
import { useSesion } from '@/shared/auth/sesion';

import { EDADES, ESTADOS, ResumenLectura } from './tipos';

/** Backoffice: lecturas en todas sus etapas; arriba, lo que espera a cada uno (RF-026). */
export function ListaLecturas() {
  const { usuario } = useSesion();
  const [lecturas, setLecturas] = useState<ResumenLectura[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esEditor = usuario?.rol === 'EDITOR';

  useEffect(() => {
    api<ResumenLectura[]>('/backoffice/lecturas')
      .then(setLecturas)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  return (
    <Tarjeta
      nivel={1}
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="libro" tamano={30} />
          Lecturas
        </span>
      }
      acciones={
        esEditor ? (
          <Link href="/backoffice/lecturas/nueva" className={clasesBoton('primario', { tamano: 'pequeno' })}>
            + Nueva lectura
          </Link>
        ) : null
      }
    >
      <p className="texto-suave">
        {esEditor
          ? 'Escribe lecturas con sus actividades y envíalas a revisión. Otra persona las aprueba antes de publicarlas.'
          : 'Revisa las lecturas que enviaron los editores: apruébalas para publicarlas o devuélvelas con lo que hay que corregir.'}
      </p>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!lecturas ? (
        error ? null : <Cargando />
      ) : lecturas.length === 0 ? (
        <Alerta tipo="info">{esEditor ? 'Aún no hay lecturas. Crea la primera.' : 'Aún no hay lecturas para revisar.'}</Alerta>
      ) : (
        <ul className="aulas">
          {lecturas.map((l) => {
            const estado = ESTADOS[l.estado];
            return (
              <li key={l.lecturaId}>
                <Link href={`/backoffice/lecturas/${l.lecturaId}`} className="aula-enlace" aria-label={`Abrir ${l.titulo}`}>
                  <span className="lista-aulas__icono">
                    <Icono nombre="libro" tamano={28} />
                  </span>
                  <span className="aula-enlace__datos">
                    <strong>{l.titulo}</strong>
                    <span className="texto-suave">
                      {EDADES[l.rangoEdad]} · nivel {l.nivelDificultad} · versión {l.numero}
                      {l.esAutor ? ' · tuya' : ''}
                    </span>
                    <span className="fila fila--compacta">
                      <Chip tipo={estado.tipo}>{estado.texto}</Chip>
                      {l.tienePublicada && l.estado !== 'PUBLICADO' ? <Chip tipo="exito">Hay una versión publicada</Chip> : null}
                      {l.archivada ? <Chip>Fuera de la biblioteca</Chip> : null}
                    </span>
                  </span>
                  <Icono nombre="chevron" tamano={22} className="aula-enlace__flecha" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
