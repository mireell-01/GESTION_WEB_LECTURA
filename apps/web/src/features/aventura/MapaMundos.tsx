'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alerta, BarraProgreso, Cargando, EscenaMundo, Icono, Mascota } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { Celebracion } from './Celebracion';
import { Mapa, MundoMapa, TONO_MUNDO } from './tipos';

/**
 * Mapa de aventuras del estudiante (RF-030): los 5 mundos con su estado. El mundo actual y los
 * completados se abren; los bloqueados muestran el candado. Si un mundo se desbloqueó desde la
 * última visita, primero se celebra (RF-031).
 */
export function MapaMundos({ comoPagina = false }: { comoPagina?: boolean }) {
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Mapa>('/aventura/mapa')
      .then(setMapa)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  const porCelebrar = mapa?.mundos.find((m) => m.celebrar) ?? null;
  const cerrarCelebracion = useCallback(() => {
    if (!porCelebrar) return;
    setMapa((actual) => actual && { ...actual, mundos: actual.mundos.map((m) => (m.id === porCelebrar.id ? { ...m, celebrar: false } : m)) });
    // Si falla, se volverá a celebrar en la próxima visita: no hay nada que mostrar al niño.
    api(`/aventura/mundos/${porCelebrar.id}/celebracion`, { metodo: 'POST' }).catch(() => undefined);
  }, [porCelebrar]);

  const Titulo = comoPagina ? 'h1' : 'h2';

  return (
    <section className="est-mundos" aria-labelledby="mundos-titulo">
      <div className="est-mundos__cabecera">
        <Icono nombre="globo" tamano={40} />
        <Titulo id="mundos-titulo">{comoPagina ? 'Tu mapa de aventuras' : 'Tus mundos'}</Titulo>
      </div>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!mapa ? (
        error ? null : <Cargando texto="Abriendo tu mapa…" />
      ) : mapa.diagnosticoPendiente ? (
        <div className="est-preparando">
          <Mascota tamano={96} flota />
          <div>
            <h2>Primero, tu reto inicial</h2>
            <p>Cuando lo completes, se abrirá tu mapa de aventuras en el mundo que te toca.</p>
          </div>
        </div>
      ) : (
        <ul className="est-mundos__lista">
          {mapa.mundos.map((m) => (
            <li key={m.id} className={`est-mundo est-mundo--${m.estado.toLowerCase()}`}>
              {m.estado === 'BLOQUEADO' ? <ContenidoMundo mundo={m} /> : (
                <Link href={`/estudiante/mundos/${m.id}`} className="est-mundo__enlace" aria-label={`Entrar al mundo ${m.numero}: ${m.nombre}`}>
                  <ContenidoMundo mundo={m} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {porCelebrar ? <Celebracion mundo={porCelebrar} alCerrar={cerrarCelebracion} /> : null}
    </section>
  );
}

function ContenidoMundo({ mundo: m }: { mundo: MundoMapa }) {
  const { completadas, necesarias } = m.misiones;
  return (
    <>
      <span className="est-mundo__escena">
        <EscenaMundo tono={TONO_MUNDO[m.numero] ?? 'bosque'} />
        {m.estado === 'BLOQUEADO' ? (
          <span className="est-mundo__candado">
            <Icono nombre="candado" tamano={22} />
          </span>
        ) : m.estado === 'COMPLETADO' ? (
          <span className="est-mundo__candado est-mundo__sello">
            <Icono nombre="estrella" tamano={24} />
          </span>
        ) : null}
      </span>
      <span className="est-mundo__texto">
        <span className="est-mundo__numero">Mundo {m.numero}</span>
        <span className="est-mundo__nombre">{m.nombre}</span>
        {m.estado === 'DISPONIBLE' ? (
          <>
            <span className="est-mundo__estado">
              ¡Estás aquí! · {Math.min(completadas, necesarias)} de {necesarias} misiones
            </span>
            <BarraProgreso valor={(Math.min(completadas, necesarias) / necesarias) * 100} etiqueta={`Misiones del mundo ${m.nombre}`} />
          </>
        ) : (
          <span className="est-mundo__estado">{m.estado === 'COMPLETADO' ? '¡Mundo completado!' : 'Completa el mundo anterior'}</span>
        )}
      </span>
    </>
  );
}
