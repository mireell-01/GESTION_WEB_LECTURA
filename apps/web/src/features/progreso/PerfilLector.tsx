'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alerta, BarraProgreso, Cargando, Chip, clasesBoton, Icono, Mascota } from '@lectoaventura/ui';

import { HABILIDAD_INFANTIL, ORDEN } from '@/features/diagnostico/tipos';
import { api, mensajeDeError } from '@/shared/api/client';

import { CHIP_NIVEL, PerfilLector as Perfil, Recomendacion } from './tipos';

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

/** RF-055, RN-20: entre 1 y 3 lecturas para seguir, la de su profe primero. */
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
                <span className="recomendacion__icono" aria-hidden="true">
                  <Icono nombre={r.tipo === 'LECTURA_HABILIDAD_DEBIL' || r.tipo === 'REFUERZO' ? 'estrella' : r.lectura ? 'libro' : 'brujula'} tamano={30} />
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

/**
 * RF-052, RF-054: el perfil lector del niño, en su lenguaje y con una escala visual: las 5 habilidades
 * con su barra y su etiqueta (En inicio, En proceso, Logrado, Destacado o "Aún descubriendo" con
 * menos de 5 preguntas, RN-08) y las que conviene practicar.
 */
export function PerfilLector() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Perfil>('/yo/perfil-lector')
      .then(setPerfil)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!perfil) return <Cargando texto="Abriendo tu perfil lector…" />;

  const porCodigo = new Map(perfil.habilidades.map((h) => [h.codigo, h]));
  return (
    <div className="pila perfil-lector">
      <section className="est-preparando perfil-lector__cabecera">
        <Mascota tamano={96} flota />
        <div className="pila-sm">
          <h1>Tu perfil lector</h1>
          <p>{perfil.conDatos ? 'Así vas en cada habilidad. ¡Cada lectura te ayuda a crecer!' : 'Cuando hagas tu reto inicial y tus lecturas, aquí verás cuánto vas creciendo.'}</p>
          {perfil.nivelLectura ? (
            <p className="perfil-lector__nivel">
              <Icono nombre="libro" tamano={24} />
              Lees en el nivel {perfil.nivelLectura}
            </p>
          ) : null}
        </div>
      </section>

      <ul className="perfil-lector__habilidades" aria-label="Tus habilidades">
        {ORDEN.map((codigo) => {
          const h = porCodigo.get(codigo);
          if (!h) return null;
          const nombre = HABILIDAD_INFANTIL[codigo];
          return (
            <li key={codigo} className={h.aReforzar ? 'perfil-habilidad perfil-habilidad--reforzar' : 'perfil-habilidad'}>
              <span className="perfil-habilidad__cabecera">
                <span className="perfil-habilidad__nombre">{nombre}</span>
                <span className="fila fila--compacta">
                  <Chip tipo={h.nivel ? CHIP_NIVEL[h.nivel] : undefined}>{h.etiqueta}</Chip>
                  {h.aReforzar ? <Chip tipo="aviso">¡A practicar!</Chip> : null}
                </span>
              </span>
              <BarraProgreso valor={h.valor} etiqueta={nombre} />
            </li>
          );
        })}
      </ul>
      {perfil.habilidades.some((h) => h.aReforzar) ? (
        <p className="texto-suave">Las que dicen «¡A practicar!» crecen leyendo un poco más: abajo tienes una lectura para eso.</p>
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
