'use client';

import Link from 'next/link';

import { Icono } from '@lectoaventura/ui';

import { AvatarLector } from '@/features/gamificacion/AvatarLector';

import { ArteMundo } from './ArteMundo';
import { MundoMapa } from './tipos';

/** El avatar que el niño lleva puesto, para mostrarlo sobre su mundo. */
export interface LectorEnCamino {
  avatar: string;
  accesorio?: string | null;
  personaje?: string | null;
}

// Medidas del camino (en píxeles), las mismas que usa globals.css (.mapa-camino__*).
const ANCHO_H = 1000;
const ALTO_H = 260;
const CENTRO_ARRIBA = 144; // pantallas anchas: centro de los mundos de arriba del zigzag
const CENTRO_ABAJO = 190; // y de los de abajo
const ARRIBA_V = 76; // celular: espacio sobre el primer mundo
const FILA_V = 124; // alto de cada fila del zigzag
const PIE_V = 40;

/** El tramo de un mundo al siguiente: el suelo (dorado si ya lo recorrió) y sus rayitas blancas. */
function Tramo({ d, hecho }: { d: string; hecho: boolean }) {
  return (
    <>
      <path d={d} className={hecho ? 'sendero__suelo sendero__suelo--hecho' : 'sendero__suelo'} vectorEffect="non-scaling-stroke" />
      <path d={d} className="sendero__rayas" vectorEffect="non-scaling-stroke" />
    </>
  );
}

/** Lo que dice la pastilla de arriba: en qué mundo va, o cuántos completó. */
export function datoDelCamino(mundos: MundoMapa[]): string {
  const completados = mundos.filter((m) => m.estado === 'COMPLETADO').length;
  if (mundos.length > 0 && completados === mundos.length) return '¡Todos completados!';
  const actual = mundos.find((m) => m.estado === 'DISPONIBLE');
  return actual ? `Mundo ${actual.numero} de ${mundos.length}` : `${completados} de ${mundos.length} completados`;
}

/**
 * RF-030: en el Inicio, los mundos como un mapa — un sendero que los une en zigzag (de izquierda a derecha
 * en pantallas anchas; de arriba abajo en el celular). Dorado lo recorrido, lila lo que falta; sobre el
 * mundo donde está, su avatar dice «¡Estás aquí!». Los completados y el actual se abren; los bloqueados no.
 */
export function CaminoMundos({ mundos, lector }: { mundos: MundoMapa[]; lector?: LectorEnCamino }) {
  const n = mundos.length;
  const todos = n > 0 && mundos.every((m) => m.estado === 'COMPLETADO');
  const altoV = ARRIBA_V + n * FILA_V + PIE_V;

  const horizontal = mundos.slice(0, -1).map((m, i) => {
    const paso = ANCHO_H / n;
    const x1 = paso * (i + 0.5);
    const x2 = paso * (i + 1.5);
    const y1 = i % 2 === 0 ? CENTRO_ARRIBA : CENTRO_ABAJO;
    const y2 = i % 2 === 0 ? CENTRO_ABAJO : CENTRO_ARRIBA;
    const medio = (x1 + x2) / 2;
    return <Tramo key={m.id} d={`M ${x1} ${y1} C ${medio} ${y1}, ${medio} ${y2}, ${x2} ${y2}`} hecho={m.estado === 'COMPLETADO'} />;
  });

  const vertical = mundos.slice(0, -1).map((m, i) => {
    const x1 = i % 2 === 0 ? 25 : 75;
    const x2 = i % 2 === 0 ? 75 : 25;
    const y1 = ARRIBA_V + FILA_V * i + 56;
    const y2 = y1 + FILA_V;
    const medio = (y1 + y2) / 2;
    return <Tramo key={m.id} d={`M ${x1} ${y1} C ${x1} ${medio}, ${x2} ${medio}, ${x2} ${y2}`} hecho={m.estado === 'COMPLETADO'} />;
  });

  return (
    <>
      <p className="mapa-camino__bajada">Sigue el camino: cada mundo que completas abre el siguiente.</p>
      <div className="mapa-camino__paisaje" style={{ '--mundos': n } as React.CSSProperties}>
        <span className="mapa-camino__nube mapa-camino__nube--1" aria-hidden="true" />
        <span className="mapa-camino__nube mapa-camino__nube--2" aria-hidden="true" />
        <span className="mapa-camino__destello mapa-camino__destello--1" aria-hidden="true">
          ✦
        </span>
        <span className="mapa-camino__destello mapa-camino__destello--2" aria-hidden="true">
          ✦
        </span>
        {n > 1 ? (
          <>
            <svg
              className="mapa-camino__sendero mapa-camino__sendero--horizontal"
              viewBox={`0 0 ${ANCHO_H} ${ALTO_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {horizontal}
            </svg>
            <svg
              className="mapa-camino__sendero mapa-camino__sendero--vertical"
              viewBox={`0 0 100 ${altoV}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {vertical}
            </svg>
          </>
        ) : null}
        <ol className="mapa-camino__mundos" aria-label="Camino de mundos">
          {mundos.map((m, i) => (
            <li
              key={m.id}
              className={`paso paso--${m.estado === 'COMPLETADO' ? 'hecho' : m.estado === 'DISPONIBLE' ? 'actual' : 'bloqueado'}`}
              style={{ '--fila': i + 1 } as React.CSSProperties}
            >
              {m.estado === 'BLOQUEADO' ? (
                <div className="paso__cerrado">
                  <Paso mundo={m} lector={lector} />
                </div>
              ) : (
                <Link href={`/estudiante/mundos/${m.id}`} className="paso__enlace" aria-label={`Entrar al mundo ${m.numero}: ${m.nombre}`}>
                  <Paso mundo={m} lector={lector} />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>
      <p className="mapa-camino__pie">
        <span aria-hidden="true">🏆</span>{' '}
        {todos
          ? `¡Completaste los ${n} mundos! Ya eres Maestro de la Lectura.`
          : `Completa los ${n} mundos y gana el trofeo de Maestro de la Lectura.`}
      </p>
    </>
  );
}

function Paso({ mundo: m, lector }: { mundo: MundoMapa; lector?: LectorEnCamino }) {
  const { completadas, necesarias } = m.misiones;
  return (
    <>
      <span className="paso__medalla">
        {m.estado === 'DISPONIBLE' ? (
          <span className="paso__tu">
            {lector ? (
              <AvatarLector avatar={lector.avatar} accesorio={lector.accesorio} personaje={lector.personaje} tamano={50} decorativo />
            ) : null}
            <span className="paso__tu-texto">¡Estás aquí!</span>
          </span>
        ) : null}
        <span className="paso__disco">
          <span className="paso__arte">
            <ArteMundo numero={m.numero} />
          </span>
          {m.estado === 'COMPLETADO' ? (
            <span className="paso__insignia" aria-hidden="true">
              <Icono nombre="estrella" tamano={18} />
            </span>
          ) : m.estado === 'BLOQUEADO' ? (
            <span className="paso__candado" aria-hidden="true">
              <Icono nombre="candado" tamano={16} />
            </span>
          ) : null}
        </span>
      </span>
      <span className="paso__numero">Mundo {m.numero}</span>
      <span className="paso__nombre">{m.nombre}</span>
      <span className="paso__estado">
        {m.estado === 'COMPLETADO' ? (
          '¡Completado!'
        ) : m.estado === 'DISPONIBLE' ? (
          <>
            <span aria-hidden="true">▶ </span>Entrar · {Math.min(completadas, necesarias)} de {necesarias}
          </>
        ) : (
          'Por descubrir'
        )}
      </span>
    </>
  );
}
