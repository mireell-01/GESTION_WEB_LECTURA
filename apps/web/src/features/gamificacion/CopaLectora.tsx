'use client';

import { useEffect, useState } from 'react';

import { api } from '@/shared/api/client';

import { AvatarLector } from './AvatarLector';
import { CopaLectora as DatosCopa, PuestoCopa } from './tipos';

const MEDALLAS = ['🥇', '🥈', '🥉'];

/** Lo que anima al niño según su puesto: cuánto le falta para alcanzar al de arriba. */
function animo(copa: DatosCopa): { emoji: string; texto: string } {
  const yo = copa.participantes.find((p) => p.soyYo);
  if (!yo || copa.totalAula === 0) return { emoji: '🚀', texto: '¡La copa de esta semana empieza! Lee un cuento y sé el primero en sumar puntos.' };
  if (yo.posicion === 1) return { emoji: '👑', texto: '¡Vas primero! Sigue leyendo para quedarte con la copa.' };
  const arriba = [...copa.participantes].reverse().find((p) => p.posicion < yo.posicion);
  if (!arriba) return { emoji: '🚀', texto: '¡Lee un cuento y sube en la copa!' };
  const faltan = Math.max(1, arriba.puntos - yo.puntos + 1);
  return { emoji: '🚀', texto: `Vas en el puesto ${yo.posicion}. Te ${faltan === 1 ? 'falta 1 punto' : `faltan ${faltan} puntos`} para pasar a ${arriba.alias}.` };
}

const quien = (p: PuestoCopa) => (p.soyYo ? 'Tú' : p.alias);
const describir = (p: PuestoCopa) => `Puesto ${p.posicion}: ${p.soyYo ? 'tú' : p.alias}, ${p.puntos} ${p.puntos === 1 ? 'punto' : 'puntos'}`;

/**
 * La Copa Lectora del aula: cada semana, los compañeros suman los puntos que ganan leyendo (el lunes
 * todos empiezan de cero). Podio con los tres primeros, el resto en filas y lo que llevan entre todos.
 * Solo alias y avatar. Si no carga, no muestra nada.
 */
export function CopaLectora() {
  const [copa, setCopa] = useState<DatosCopa | null>(null);

  useEffect(() => {
    api<DatosCopa>('/yo/copa-lectora')
      .then(setCopa)
      .catch(() => setCopa(null));
  }, []);

  if (!copa) return null;
  const quedan = copa.semana.diasQuedan;
  const podio = copa.participantes.slice(0, 3);
  const resto = copa.participantes.slice(3);
  const { emoji, texto } = animo(copa);

  return (
    <section className="copa" aria-labelledby="copa-titulo">
      <header className="copa__cabecera">
        <span className="copa__trofeo" aria-hidden="true">
          🏆
        </span>
        <div className="copa__titulos">
          <h2 id="copa-titulo">Copa Lectora</h2>
          <p>
            {copa.enAula ? `${copa.aula} · ` : ''}
            {quedan <= 1 ? '¡Hoy es el último día de la semana!' : `Quedan ${quedan} días de esta semana`}
          </p>
        </div>
      </header>

      {!copa.enAula ? (
        <p className="copa__vacia">
          <span aria-hidden="true">👋</span> Cuando tu docente te matricule en tu aula, aquí competirás con tus compañeros leyendo cuentos.
        </p>
      ) : (
        <div className="copa__cuerpo">
          <p className="copa__animo">
            <span className="copa__animo-emoji" aria-hidden="true">
              {emoji}
            </span>
            {texto}
          </p>

          <ol className="copa__podio" aria-label="Podio de la semana">
            {podio.map((p, i) => (
              <li key={`${p.posicion}-${p.alias}`} className={`copa__escalon copa__escalon--${i + 1}${p.soyYo ? ' copa__escalon--yo' : ''}`} aria-label={describir(p)}>
                <AvatarLector avatar={p.avatar} accesorio={p.accesorio} tamano={i === 0 ? 64 : 52} decorativo />
                <span className="copa__alias">{quien(p)}</span>
                <span className="copa__bloque">
                  <span className="copa__medalla" aria-hidden="true">
                    {MEDALLAS[p.posicion - 1] ?? '⭐'}
                  </span>
                  <span className="copa__puntos">⭐ {p.puntos}</span>
                </span>
              </li>
            ))}
          </ol>

          {resto.length > 0 ? (
            <ol className="copa__tabla" aria-label="Los demás puestos" start={4}>
              {resto.map((p) => (
                <li key={`${p.posicion}-${p.alias}`} className={`copa__fila${p.soyYo ? ' copa__fila--yo' : ''}`} aria-label={describir(p)}>
                  <span className="copa__posicion">{p.posicion}</span>
                  <AvatarLector avatar={p.avatar} accesorio={p.accesorio} tamano={40} decorativo />
                  <span className="copa__alias">{quien(p)}</span>
                  <span className="copa__puntos">⭐ {p.puntos}</span>
                </li>
              ))}
            </ol>
          ) : null}

          <p className="copa__juntos">
            <span aria-hidden="true">🤝</span> Entre todos llevan <b>{copa.totalAula}</b> {copa.totalAula === 1 ? 'punto' : 'puntos'} esta semana. ¡Cada cuento suma!
          </p>
        </div>
      )}
    </section>
  );
}
