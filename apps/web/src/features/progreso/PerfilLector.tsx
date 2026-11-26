'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alerta, BarraProgreso, Cargando, Chip, clasesBoton, Icono } from '@lectoaventura/ui';

import { estrellas, HABILIDAD_INFANTIL, ORDEN } from '@/features/diagnostico/tipos';
import { AvatarLector, useApariencia } from '@/features/gamificacion/AvatarLector';
import { EscenaAnimada } from '@/features/lectura/IlustracionLectura';
import { api, mensajeDeError } from '@/shared/api/client';
import { useSesion } from '@/shared/auth/sesion';

import { CHIP_NIVEL, HabilidadPerfil, PerfilLector as Perfil, Recomendacion } from './tipos';

/** RF-055: por qué se le recomienda, en palabras de niño. */
function motivo(r: Recomendacion): string {
  switch (r.tipo) {
    case 'ASIGNACION_DOCENTE':
      return r.mision ? `Tu profe te dejó la misión «${r.mision.titulo}»` : 'Misión de tu profe';
    case 'LECTURA_MISION':
      return `Para tu misión «${r.mision?.titulo ?? ''}»`;
    case 'LECTURA_HABILIDAD_DEBIL':
      return `Para practicar: ${r.habilidad ? HABILIDAD_INFANTIL[r.habilidad].toLowerCase() : ''}`;
    default:
      return 'Para seguir practicando';
  }
}

/** RF-055, RN-20: entre 1 y 3 lecturas para seguir, la de su profe primero, cada una con el dibujo de su cuento. */
export function ProximasLecturas() {
  const [lista, setLista] = useState<Recomendacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Recomendacion[]>('/yo/recomendaciones')
      .then(setLista)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  return (
    <section className="perfil-recomendaciones" aria-labelledby="recomendaciones-titulo">
      <h2 id="recomendaciones-titulo">Tus próximas lecturas</h2>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!lista ? (
        error ? null : <Cargando />
      ) : lista.length === 0 ? (
        <p className="texto-suave">Muy pronto tendrás lecturas recomendadas para ti.</p>
      ) : (
        <ul className="recomendaciones" aria-label="Lecturas recomendadas">
          {lista.map((r) => {
            const accion = r.enCurso ? 'Seguir leyendo' : 'Leer';
            return (
              <li key={`${r.prioridad}-${r.tipo}`} className={`recomendacion recomendacion--${r.tipo.toLowerCase()}`}>
                <span className="recomendacion__escena" aria-hidden="true">
                  {r.lectura ? (
                    <EscenaAnimada texto={r.lectura.titulo} reparto={r.lectura.titulo} />
                  ) : (
                    <span className="recomendacion__icono">
                      <Icono nombre="brujula" tamano={40} />
                    </span>
                  )}
                </span>
                <span className="recomendacion__texto">
                  <span className="recomendacion__motivo">{motivo(r)}</span>
                  <span className="recomendacion__titulo">{r.lectura?.titulo ?? r.mision?.titulo}</span>
                </span>
                {r.lectura ? (
                  <Link
                    href={`/estudiante/lecturas/${r.lectura.id}${r.asignacionId ? `?asignacion=${r.asignacionId}` : ''}`}
                    className={clasesBoton('primario', { tamano: 'pequeno' })}
                    aria-label={`${accion}: ${r.lectura.titulo}`}
                  >
                    <Icono nombre="libro" tamano={20} />
                    {accion}
                  </Link>
                ) : (
                  <Link href="/estudiante/mundos" className={clasesBoton('secundario', { tamano: 'pequeno' })}>
                    Ver mis mundos
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Cada habilidad con su dibujito y su color (los mismos del informe para la familia). */
const ASPECTO: Record<HabilidadPerfil['codigo'], { emoji: string; color: string; suave: string }> = {
  LIT: { emoji: '🔎', color: '#5b3fd9', suave: '#ede8ff' },
  VOC: { emoji: '🔤', color: '#1d8fd1', suave: '#e1f1fc' },
  INF: { emoji: '💡', color: '#e5486b', suave: '#ffe6ec' },
  CRI: { emoji: '🤔', color: '#f08a24', suave: '#fff0e0' },
  ARG: { emoji: '💬', color: '#2bb673', suave: '#ddf7ea' },
};

/** Las estrellas de una habilidad (0 a 3): llenas las ganadas, en blanco las que faltan. */
function Estrellas({ cuantas }: { cuantas: number }) {
  return (
    <span className="perfil-estrellas" role="img" aria-label={`${cuantas} de 3 estrellas`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < cuantas ? 'perfil-estrella perfil-estrella--llena' : 'perfil-estrella'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

const LEYENDA: [number, string][] = [
  [0, 'En inicio'],
  [1, 'En proceso'],
  [2, 'Logrado'],
  [3, 'Destacado'],
];

/**
 * RF-052, RF-054: el perfil lector del niño, en su lenguaje y muy visual: arriba su avatar, su nivel de
 * lectura y cuántas estrellas lleva; luego las 5 habilidades como tarjetas de colores, cada una con su
 * dibujito, sus estrellas (En inicio, En proceso, Logrado, Destacado), su barra y «¡A practicar!» en la
 * que conviene reforzar. Con menos de 5 preguntas dice «Aún descubriendo» y cuántas le faltan (RN-08).
 */
export function PerfilLector() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { usuario } = useSesion();
  const apariencia = useApariencia();

  useEffect(() => {
    api<Perfil>('/yo/perfil-lector')
      .then(setPerfil)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!perfil) return <Cargando texto="Abriendo tu perfil lector…" />;

  const porCodigo = new Map(perfil.habilidades.map((h) => [h.codigo, h]));
  const ganadas = perfil.habilidades.reduce((total, h) => total + (h.nivel ? estrellas(h.valor) : 0), 0);
  return (
    <div className="pila perfil-lector">
      <section className="perfil-heroe" aria-labelledby="perfil-titulo">
        <AvatarLector
          avatar={apariencia?.avatar ?? usuario?.avatar ?? ''}
          accesorio={apariencia?.accesorio}
          personaje={apariencia?.personaje}
          tamano={92}
          className="perfil-heroe__avatar"
          decorativo
        />
        <div className="perfil-heroe__texto">
          <h1 id="perfil-titulo">Tu perfil lector</h1>
          <p>{perfil.conDatos ? 'Así vas en cada habilidad. ¡Cada lectura te ayuda a crecer!' : 'Cuando hagas tu reto inicial y tus lecturas, aquí verás cuánto vas creciendo.'}</p>
          <ul className="perfil-heroe__datos" aria-label="Tus logros de lector">
            {perfil.nivelLectura ? (
              <li>
                <span aria-hidden="true">📖</span> Lees en el nivel <b>{perfil.nivelLectura}</b>
              </li>
            ) : null}
            <li>
              <span aria-hidden="true">⭐</span> {ganadas} de 15 estrellas
            </li>
          </ul>
        </div>
        <span className="perfil-heroe__destello perfil-heroe__destello--1" aria-hidden="true">
          ✦
        </span>
        <span className="perfil-heroe__destello perfil-heroe__destello--2" aria-hidden="true">
          ✦
        </span>
      </section>

      <ul className="perfil-lector__habilidades" aria-label="Tus habilidades">
        {ORDEN.map((codigo) => {
          const h = porCodigo.get(codigo);
          if (!h) return null;
          const nombre = HABILIDAD_INFANTIL[codigo];
          const aspecto = ASPECTO[codigo];
          const faltan = Math.max(1, 5 - h.itemsContados);
          const clases = ['perfil-habilidad', h.aReforzar ? 'perfil-habilidad--reforzar' : '', h.nivel ? '' : 'perfil-habilidad--aun'].filter(Boolean).join(' ');
          return (
            <li key={codigo} className={clases} style={{ '--color': aspecto.color, '--suave': aspecto.suave } as React.CSSProperties}>
              {h.aReforzar ? <span className="perfil-habilidad__cinta">¡A practicar!</span> : null}
              <span className="perfil-habilidad__icono" aria-hidden="true">
                {aspecto.emoji}
              </span>
              <span className="perfil-habilidad__nombre">{nombre}</span>
              {h.nivel ? <Estrellas cuantas={estrellas(h.valor)} /> : null}
              <Chip tipo={h.nivel ? CHIP_NIVEL[h.nivel] : undefined}>{h.etiqueta}</Chip>
              <BarraProgreso valor={h.valor} etiqueta={nombre} color={aspecto.color} />
              {h.nivel ? null : (
                <span className="perfil-habilidad__falta">
                  {faltan === 1 ? '¡Responde 1 pregunta más para descubrirlo!' : `¡Responde ${faltan} preguntas más para descubrirlo!`}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Qué significan las estrellas, para que el niño entienda su avance. */}
      <ul className="perfil-leyenda" aria-label="Qué significan las estrellas">
        {LEYENDA.map(([cuantas, texto]) => (
          <li key={texto}>
            <Estrellas cuantas={cuantas} />
            {texto}
          </li>
        ))}
      </ul>
      {perfil.habilidades.some((h) => h.aReforzar) ? (
        <p className="perfil-lector__pista">
          <span aria-hidden="true">💪</span> Las que dicen «¡A practicar!» crecen leyendo un poco más: abajo tienes una lectura para eso.
        </p>
      ) : null}

      <ProximasLecturas />

      <div>
        <Link href="/estudiante/mundos" className={clasesBoton('secundario')}>
          <Icono nombre="globo" tamano={22} />
          Ver mis mundos
        </Link>
      </div>
    </div>
  );
}
