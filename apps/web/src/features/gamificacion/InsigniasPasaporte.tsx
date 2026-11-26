'use client';

import { useState } from 'react';

import { Icono } from '@lectoaventura/ui';

import { EMOJI_INSIGNIA, Insignia, PISTA_INSIGNIA } from './tipos';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });

/** Los rangos se ganan al completar cada mundo, en orden: el número del mundo de cada uno. */
export const MUNDO_DEL_RANGO: Record<string, number> = {
  RANGO_EXPLORADOR: 1,
  RANGO_DETECTIVE: 2,
  RANGO_INVESTIGADOR: 3,
  RANGO_CRITICO: 4,
  MAESTRO_LECTURA: 5,
};

/** Separa las insignias en logros de lector y rangos de los mundos (estos, en el orden de los mundos). */
export function gruposDeInsignias(insignias: Insignia[]): { logros: Insignia[]; rangos: Insignia[]; siguiente: string | null } {
  const logros = insignias.filter((i) => MUNDO_DEL_RANGO[i.codigo] === undefined);
  const rangos = insignias.filter((i) => MUNDO_DEL_RANGO[i.codigo] !== undefined).sort((a, b) => (MUNDO_DEL_RANGO[a.codigo] ?? 0) - (MUNDO_DEL_RANGO[b.codigo] ?? 0));
  return { logros, rangos, siguiente: rangos.find((r) => !r.ganada)?.codigo ?? null };
}

/**
 * RF-058: cada insignia como una medalla (con cinta si ya la ganó; gris y con candado si no). Muestra solo
 * su nombre y cómo va; al tocarla dice cómo se gana. Todas miden lo mismo en su fila.
 */
export function TarjetaInsignia({ i, mundo, siguiente = false }: { i: Insignia; mundo?: number; siguiente?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const idPista = `pista-${i.codigo}`;
  const pista = PISTA_INSIGNIA[i.codigo] ?? i.descripcion;
  const enAvance = !i.ganada && i.meta !== null && i.avance !== null && i.avance > 0;
  const clase = i.ganada ? ' insignia--ganada' : siguiente ? ' insignia--siguiente' : enAvance ? ' insignia--avance' : '';
  return (
    <li className={`insignia${clase}${abierta ? ' insignia--abierta' : ''}`}>
      {siguiente ? (
        <span className="insignia__siguiente" aria-hidden="true">
          ¡La siguiente!
        </span>
      ) : null}
      <button type="button" className="insignia__boton" aria-expanded={abierta} aria-controls={idPista} onClick={() => setAbierta((a) => !a)}>
        <span className="insignia__sello" aria-hidden="true">
          <span className="insignia__emoji">{EMOJI_INSIGNIA[i.codigo] ?? '🏅'}</span>
          {!i.ganada ? (
            <span className="insignia__candado">
              <Icono nombre="candado" tamano={14} />
            </span>
          ) : null}
        </span>
        {mundo ? <span className="insignia__mundo">Mundo {mundo}</span> : null}
        <span className="insignia__nombre">{i.nombre}</span>
        {i.ganada ? (
          <span className="insignia__logro">
            <span className="insignia__estado">✓ ¡Ganada!</span>
            {i.otorgadaEn ? <span className="insignia__fecha">{fecha(i.otorgadaEn)}</span> : null}
          </span>
        ) : i.meta !== null && i.avance !== null ? (
          <span className="insignia__avance">
            <span className="insignia__barra" aria-hidden="true">
              <span style={{ width: `${Math.round((i.avance / Math.max(1, i.meta)) * 100)}%` }} />
            </span>
            {i.avance} de {i.meta}
            {i.meta - i.avance === 1 ? ' · ¡Te falta 1!' : ''}
          </span>
        ) : (
          <span className="insignia__estado">Por ganar</span>
        )}
        <span className="insignia__como">{abierta ? 'Cerrar' : i.ganada ? '¿Cómo la gané?' : '¿Cómo se gana?'}</span>
      </button>
      <p id={idPista} className="insignia__pista" hidden={!abierta}>
        <span aria-hidden="true">💡</span> {pista}
      </p>
    </li>
  );
}

/**
 * RF-058: «Tus insignias» en una tarjeta, en dos grupos ordenados: los logros de lector y los rangos de los
 * mundos (en el orden de los mundos, con «¡La siguiente!» sobre el próximo). Arriba, cuántas lleva.
 */
export function InsigniasDelLector({ insignias }: { insignias: Insignia[] }) {
  const ganadas = insignias.filter((i) => i.ganada).length;
  const { logros, rangos, siguiente } = gruposDeInsignias(insignias);
  return (
    <section className="recuerdo insignias-tarjeta" aria-labelledby="insignias-titulo">
      <header className="recuerdo__cabeza">
        <span className="recuerdo__icono recuerdo__icono--sol" aria-hidden="true">
          🏅
        </span>
        <h2 id="insignias-titulo">Tus insignias</h2>
        <span className="recuerdo__dato insignias-tarjeta__dato">
          <span className="insignias-tarjeta__puntitos" aria-hidden="true">
            {insignias.map((i) => (
              <i key={i.codigo} className={i.ganada ? 'si' : undefined} />
            ))}
          </span>
          {ganadas} de {insignias.length}
        </span>
      </header>
      <p className="recuerdo__bajada">Toca una insignia para saber cómo se gana.</p>

      <h3 className="insignias-tarjeta__grupo" id="logros-titulo">
        Logros de lector
      </h3>
      <ul className="insignias" aria-labelledby="logros-titulo">
        {logros.map((i) => (
          <TarjetaInsignia key={i.codigo} i={i} />
        ))}
      </ul>

      {rangos.length > 0 ? (
        <>
          <h3 className="insignias-tarjeta__grupo" id="rangos-titulo">
            Rangos de los mundos
          </h3>
          <ul className="insignias insignias--rangos" aria-labelledby="rangos-titulo">
            {rangos.map((i) => (
              <TarjetaInsignia key={i.codigo} i={i} mundo={MUNDO_DEL_RANGO[i.codigo]} siguiente={i.codigo === siguiente} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
