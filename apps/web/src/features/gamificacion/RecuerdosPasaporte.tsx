'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

import { Icono } from '@lectoaventura/ui';

import { ArteMundo } from '@/features/aventura/ArteMundo';
import { Mapa } from '@/features/aventura/tipos';
import { EscenaAnimada } from '@/features/lectura/IlustracionLectura';
import { api } from '@/shared/api/client';

import { motivoInfantil, Pasaporte } from './tipos';

const LIMA = 'America/Lima';
const diaLima = (fecha: Date) => fecha.toLocaleDateString('en-CA', { timeZone: LIMA });
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: LIMA }).replace('.', '');
const mesCorto = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { month: 'short', timeZone: LIMA }).replace('.', '').toUpperCase();
const diaDelMes = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', timeZone: LIMA });

/** El sello de tinta que deja un mundo completado, con su fecha (decorativo: el estado ya se dice en texto). */
function SelloCompletado({ fecha }: { fecha: string | null }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className="ruta-mundo__sello" viewBox="0 0 92 92" aria-hidden="true" focusable="false">
      <defs>
        <filter id={`tinta-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="ruido" />
          <feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.35" result="huecos" />
          <feComposite in="SourceGraphic" in2="huecos" operator="in" />
        </filter>
        <path id={`arco-${id}`} d="M 46 46 m -31 0 a 31 31 0 1 1 62 0 a 31 31 0 1 1 -62 0" />
      </defs>
      <g filter={`url(#tinta-${id})`}>
        <circle cx="46" cy="46" r="43" fill="rgba(255,255,255,.6)" stroke="currentColor" strokeWidth="4" />
        <circle cx="46" cy="46" r="24" fill="none" stroke="currentColor" strokeWidth="2" />
        <text fill="currentColor" fontSize="11.5" fontWeight="700" letterSpacing="2.4">
          <textPath href={`#arco-${id}`}>COMPLETADO ★ COMPLETADO ★</textPath>
        </text>
        {fecha ? (
          <>
            <text x="46" y="47" textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="700">
              {diaDelMes(fecha)}
            </text>
            <text x="46" y="59" textAnchor="middle" fill="currentColor" fontSize="9.5" fontWeight="700" letterSpacing="1">
              {mesCorto(fecha)}
            </text>
          </>
        ) : (
          <text x="46" y="53" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="700">
            ★
          </text>
        )}
      </g>
    </svg>
  );
}

/**
 * RF-059, RF-030: la ruta de los 5 mundos como un pasaporte. Cada mundo completado lleva su sello con la
 * fecha; el mundo donde está el niño dice «Estás aquí»; los demás esperan con candado.
 */
export function RutaDeMundos({ completados }: { completados: Pasaporte['mundos'] }) {
  const [mapa, setMapa] = useState<Mapa | null>(null);

  useEffect(() => {
    api<Mapa>('/aventura/mapa')
      .then(setMapa)
      .catch(() => setMapa(null));
  }, []);

  const fechas = new Map(completados.map((m) => [m.numero, m.completadoEn]));
  // Sin mapa (aún carga, o falta el reto inicial), se muestran los mundos que ya completó.
  const mundos =
    mapa && !mapa.diagnosticoPendiente
      ? mapa.mundos.map((m) => ({ numero: m.numero, nombre: m.nombre, estado: m.estado, misiones: m.misiones }))
      : completados.map((m) => ({ numero: m.numero, nombre: m.nombre, estado: 'COMPLETADO' as const, misiones: null }));
  const sellos = mundos.filter((m) => m.estado === 'COMPLETADO').length;

  return (
    <section className="recuerdo ruta" aria-labelledby="ruta-titulo">
      <header className="recuerdo__cabeza">
        <span className="recuerdo__icono" aria-hidden="true">
          <Icono nombre="brujula" tamano={26} />
        </span>
        <h2 id="ruta-titulo">Mi ruta de mundos</h2>
        <span className="recuerdo__dato">
          {sellos} de {mapa && !mapa.diagnosticoPendiente ? mundos.length : 5} sellos
        </span>
      </header>
      <p className="recuerdo__bajada">Cada mundo que completas sella tu pasaporte.</p>

      {mundos.length === 0 ? (
        <p className="ruta__vacia">Completa las misiones de tu primer mundo y aquí aparecerá su sello. ¡Tú puedes!</p>
      ) : (
        <div className="ruta__paisaje">
          {mundos.length > 1 ? (
            // El camino entre los mundos: lleno hasta donde llegó; punteado lo que falta.
            <svg className="ruta__camino" viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              {mundos.slice(0, -1).map((m, i) => {
                const paso = 1000 / mundos.length;
                const x1 = paso * (i + 0.5);
                const x2 = paso * (i + 1.5);
                const y1 = i % 2 === 0 ? 60 : 88;
                const y2 = i % 2 === 0 ? 88 : 60;
                const medio = (x1 + x2) / 2;
                return (
                  <path
                    key={m.numero}
                    d={`M ${x1} ${y1} C ${medio} ${y1}, ${medio} ${y2}, ${x2} ${y2}`}
                    className={m.estado === 'COMPLETADO' ? 'ruta__tramo ruta__tramo--hecho' : 'ruta__tramo'}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
          ) : null}
          <ol className="ruta__mundos" aria-label="Mi ruta de mundos" style={{ '--mundos': mundos.length } as React.CSSProperties}>
            {mundos.map((m) => {
              const actual = m.estado === 'DISPONIBLE';
              const estado =
                m.estado === 'COMPLETADO'
                  ? '¡Completado!'
                  : actual
                    ? `Estás aquí${m.misiones ? ` · ${Math.min(m.misiones.completadas, m.misiones.necesarias)} de ${m.misiones.necesarias}` : ''}`
                    : 'Por descubrir';
              return (
                <li key={m.numero} className={`ruta-mundo ruta-mundo--${actual ? 'actual' : m.estado === 'COMPLETADO' ? 'hecho' : 'bloqueado'}`}>
                  <span className="ruta-mundo__medalla">
                    <span className="ruta-mundo__arte">
                      <ArteMundo numero={m.numero} />
                    </span>
                    {m.estado === 'COMPLETADO' ? <SelloCompletado fecha={fechas.get(m.numero) ?? null} /> : null}
                    {m.estado === 'BLOQUEADO' ? (
                      <span className="ruta-mundo__candado" aria-hidden="true">
                        <Icono nombre="candado" tamano={16} />
                      </span>
                    ) : null}
                  </span>
                  <span className="ruta-mundo__nombre">{m.nombre}</span>
                  <span className="ruta-mundo__estado">{estado}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

/** Los libros del estante: tonos suaves de la paleta (lila, menta, crema, rosado y celeste) con su lomo más intenso. */
const TONOS_LIBRO = [
  { fondo: '#ede8ff', lomo: '#b7a8f5', tinta: '#3d2a9e' },
  { fondo: '#ddf7ea', lomo: '#8fdcb4', tinta: '#0f6b43' },
  { fondo: '#fff6dc', lomo: '#ffd76a', tinta: '#6b4b00' },
  { fondo: '#ffe3f1', lomo: '#ffb3d4', tinta: '#a1235a' },
  { fondo: '#e6f1fb', lomo: '#a9cdf2', tinta: '#185fa5' },
];
/** Libros por semana que propone la meta (el niño ve su avance; no hay castigo si no llega). */
export const META_SEMANAL = 5;

/** El lunes de esta semana (hora de Lima), como AAAA-MM-DD. */
function lunesLima(ahora: Date): string {
  const hoy = new Date(`${diaLima(ahora)}T00:00:00Z`);
  const desdeLunes = (hoy.getUTCDay() + 6) % 7;
  return diaLima(new Date(hoy.getTime() - desdeLunes * 86_400_000 + 12 * 3_600_000));
}

/**
 * RF-059: las lecturas que terminó, como libros en su estante (con el dibujo de cada cuento). Tocar un
 * libro lo abre para volver a leerlo. Debajo, su meta de la semana.
 */
export function EstanteLecturas({ lecturas }: { lecturas: Pasaporte['lecturas'] }) {
  const lunes = lunesLima(new Date());
  const estaSemana = Math.min(META_SEMANAL, lecturas.recientes.filter((l) => diaLima(new Date(l.finalizadaEn)) >= lunes).length);
  const faltan = META_SEMANAL - estaSemana;

  return (
    <section className="recuerdo estante" aria-labelledby="estante-titulo">
      <header className="recuerdo__cabeza">
        <span className="recuerdo__icono" aria-hidden="true">
          <Icono nombre="libro" tamano={26} />
        </span>
        <h2 id="estante-titulo">Mi estante</h2>
        <span className="recuerdo__dato">
          {lecturas.total} {lecturas.total === 1 ? 'libro leído' : 'libros leídos'}
        </span>
      </header>
      <p className="recuerdo__bajada">{lecturas.recientes.length > 0 ? 'Toca un libro para volver a leerlo.' : 'Cada cuento que termines se guardará aquí.'}</p>

      <ul className="estante__libros" aria-label="Lecturas terminadas">
        {lecturas.recientes.map((l, i) => {
          const tono = TONOS_LIBRO[i % TONOS_LIBRO.length] as (typeof TONOS_LIBRO)[number];
          return (
          <li key={l.id} className={`estante__hueco${i === lecturas.recientes.length - 1 && i > 0 ? ' estante__hueco--inclinado' : ''}`}>
            <Link
              href={`/estudiante/lecturas/${l.id}`}
              className="libro"
              aria-label={`Volver a leer ${l.titulo}`}
              style={{ '--fondo': tono.fondo, '--lomo': tono.lomo, '--tinta': tono.tinta } as React.CSSProperties}
            >
              <span className="libro__arte" aria-hidden="true">
                <EscenaAnimada texto={l.titulo} reparto={l.titulo} />
              </span>
              {i % 2 === 0 ? <span className="libro__cinta" aria-hidden="true" /> : null}
              <span className="libro__titulo">{l.titulo}</span>
              <span className="libro__fecha">{fechaCorta(l.finalizadaEn)}</span>
            </Link>
          </li>
          );
        })}
        <li className="estante__hueco" aria-hidden="true">
          <Link href="/estudiante/biblioteca" className="libro libro--proximo" tabIndex={-1}>
            <span className="libro__mas">+</span>
            ¿Cuál será tu próximo libro?
          </Link>
        </li>
      </ul>

      <div className="estante__meta">
        <p className="estante__meta-texto">
          <b>Meta de la semana:</b> {estaSemana === 1 ? 'leíste 1' : `leíste ${estaSemana}`} de {META_SEMANAL} libros
        </p>
        <span className="estante__meta-barra" role="progressbar" aria-label="Meta de la semana" aria-valuemin={0} aria-valuemax={META_SEMANAL} aria-valuenow={estaSemana}>
          <span style={{ width: `${(estaSemana / META_SEMANAL) * 100}%` }} />
        </span>
        <p className="estante__meta-falta">
          {faltan === 0 ? '¡Cumpliste tu meta de la semana! 🌟' : `¡Te ${faltan === 1 ? 'falta 1 libro' : `faltan ${faltan} libros`} para cumplirla! ⭐`}
        </p>
      </div>
    </section>
  );
}

/** Cada motivo de puntos con su dibujo, su color de la paleta y una frase que anima. */
const ASPECTO: Record<string, { icono: 'check' | 'lapiz' | 'libro' | 'estrella' | 'progreso' | 'fuego'; color: string; frase: string; plural: string }> = {
  ITEM_CORRECTO: { icono: 'check', color: '#0f7a48', frase: '¡Buen ojo para leer!', plural: 'respuestas correctas' },
  CORRECTO_TRAS_PISTA: { icono: 'estrella', color: '#b98500', frase: 'Usaste una pista y lo lograste', plural: 'aciertos con pista' },
  RESPUESTA_ABIERTA: { icono: 'lapiz', color: '#5b3fd9', frase: 'Con tus propias palabras', plural: 'respuestas escritas' },
  LECTURA_COMPLETADA: { icono: 'libro', color: '#c42b67', frase: 'Un libro más en tu estante', plural: 'lecturas terminadas' },
  SUBIDA_NIVEL_CNEB: { icono: 'progreso', color: '#3d2a9e', frase: 'Tu habilidad creció', plural: 'habilidades que crecieron' },
  RETO_DEL_DIA: { icono: 'estrella', color: '#b98500', frase: '¡Reto cumplido!', plural: 'retos cumplidos' },
};
const RACHA = { icono: 'fuego' as const, color: '#c42b3a', frase: '¡Días seguidos leyendo!', plural: 'premios de racha' };

function IconoLogro({ icono }: { icono: (typeof ASPECTO)[string]['icono'] }) {
  if (icono === 'check')
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  if (icono === 'lapiz')
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M4 20h4L19 9l-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </svg>
    );
  if (icono === 'fuego') return <span aria-hidden="true">🔥</span>;
  return <Icono nombre={icono} tamano={22} />;
}

/**
 * RF-056, RF-057: los puntos de hoy en un anillo (hasta el tope del día) y los últimos logros agrupados
 * por motivo, con su dibujo y su moneda.
 */
export function PuntosDeHoy({ p }: { p: Pasaporte }) {
  const radio = 56;
  const vuelta = 2 * Math.PI * radio;
  const parte = Math.min(1, p.puntos.hoy / Math.max(1, p.puntos.topeDiario));
  // Los últimos logros, agrupados por motivo en el orden en que llegaron (el más nuevo primero).
  const grupos: { motivo: string; veces: number; puntos: number }[] = [];
  for (const u of p.ultimosPuntos) {
    const grupo = grupos.find((g) => g.motivo === u.motivo);
    if (grupo) {
      grupo.veces += 1;
      grupo.puntos += u.puntos;
    } else grupos.push({ motivo: u.motivo, veces: 1, puntos: u.puntos });
  }

  return (
    <section className="recuerdo puntos-hoy" aria-labelledby="puntos-titulo">
      <header className="recuerdo__cabeza">
        <span className="recuerdo__icono recuerdo__icono--sol" aria-hidden="true">
          <Icono nombre="estrella" tamano={26} />
        </span>
        <h2 id="puntos-titulo">Mis puntos de hoy</h2>
      </header>

      <div className="puntos-hoy__resumen">
        <span className="puntos-hoy__anillo" role="img" aria-label={`Hoy ganaste ${p.puntos.hoy} de ${p.puntos.topeDiario} puntos posibles`}>
          <svg viewBox="0 0 132 132" aria-hidden="true" focusable="false">
            <circle cx="66" cy="66" r={radio} className="puntos-hoy__pista" />
            <circle cx="66" cy="66" r={radio} className="puntos-hoy__avance" strokeDasharray={`${vuelta * parte} ${vuelta}`} />
          </svg>
          <span className="puntos-hoy__centro" aria-hidden="true">
            <b>{p.puntos.hoy}</b>
            <span>puntos hoy</span>
          </span>
        </span>
        <p className="puntos-hoy__texto">
          {p.puntos.hoy > 0 ? '¡Buen día de lectura!' : '¡Hoy es un gran día para leer!'}
          <small>
            Te faltan {p.nivel.faltan} puntos para el nivel {p.nivel.actual + 1}.
          </small>
        </p>
      </div>

      {grupos.length > 0 ? (
        <ul className="puntos-hoy__logros" aria-label="Últimos puntos">
          {grupos.map((g) => {
            const aspecto = /^RACHA_/.test(g.motivo) ? RACHA : (ASPECTO[g.motivo] ?? { icono: 'estrella' as const, color: '#5b3fd9', frase: '¡Sigue así!', plural: 'logros' });
            return (
              <li key={g.motivo} className="logro">
                <span className="logro__icono" style={{ background: aspecto.color }}>
                  <IconoLogro icono={aspecto.icono} />
                </span>
                <span className="logro__texto">
                  {g.veces === 1 ? motivoInfantil(g.motivo) : `${g.veces} ${aspecto.plural}`}
                  <small>{aspecto.frase}</small>
                </span>
                <span className="logro__moneda">
                  <span aria-hidden="true">★</span>+{g.puntos}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="texto-suave">Cuando respondas preguntas y termines lecturas, tus puntos aparecerán aquí.</p>
      )}
    </section>
  );
}
