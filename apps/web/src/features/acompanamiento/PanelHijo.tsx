'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alerta, AVATARES, BarraProgreso, Cargando, Chip, Icono } from '@lectoaventura/ui';

import { ActivacionFamilia } from '@/features/asistente/ActivacionFamilia';
import { NOMBRE_RANGO } from '@/features/iam/tipos';
import {
  fechaCorta,
  horaLima,
  mensajeDeSeguimiento,
  textoCelda,
} from '@/features/seguimiento/tipos';
import { api } from '@/shared/api/client';

import { comparacionSemana, HABILIDAD_FAMILIA, PanelHijo as Panel } from './tipos';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * RF-068, RF-069: el panel de un hijo para su familia — cuánto leyó esta semana, su avance, sus
 * habilidades y cómo acompañar en casa las que necesitan refuerzo, en palabras para no especialistas.
 */
export function PanelHijo({ estudianteId }: { estudianteId: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Panel>(`/familia/estudiantes/${estudianteId}/panel`)
      .then(setPanel)
      .catch((err) =>
        setError(mensajeDeSeguimiento(err, 'No encontramos a este niño o niña entre tus hijos.')),
      );
  }, [estudianteId]);

  const volver = (
    <Link href="/familia" className="volver">
      <Icono nombre="flecha" tamano={20} className="volver__icono" />
      Mis hijos
    </Link>
  );
  if (error) {
    return (
      <div className="pila">
        {volver}
        <Alerta tipo="error">{error}</Alerta>
      </div>
    );
  }
  if (!panel) return <Cargando texto="Preparando su avance…" />;

  const { estudiante: e, semana, avance } = panel;
  const avatar = AVATARES[e.avatar];
  const sinDatos = panel.habilidades.every((h) => h.valor === null);

  return (
    <div className="pila fam-hijo">
      {volver}
      <header className="seg-cabecera seg-cabecera--estudiante">
        <span
          className="seg-avatar seg-avatar--grande"
          style={{ background: avatar?.fondo }}
          aria-hidden="true"
        >
          {avatar?.emoji ?? '🙂'}
        </span>
        <div className="pila-sm">
          <h1>{e.alias}</h1>
          <div className="fila" style={{ gap: 'var(--la-espacio-1)' }}>
            <Chip tipo="info">{NOMBRE_RANGO[e.rangoEdad]}</Chip>
            {e.relacion === 'VINCULADO' ? <Chip tipo="exito">Desde su aula</Chip> : null}
            {!e.activo ? <Chip>Desactivado</Chip> : null}
          </div>
          {panel.actualizadoEn ? (
            <p className="texto-suave">Datos actualizados a las {horaLima(panel.actualizadoEn)}</p>
          ) : null}
        </div>
      </header>

      <div className="fam-rejilla">
        <div className="pila">
          <section className="la-tarjeta pila-sm" aria-labelledby="fam-semana">
            <h2 id="fam-semana" className="titulo-con-icono">
              <Icono nombre="reloj" tamano={26} />
              Esta semana
            </h2>
            <ul className="seg-cifras" aria-label="Esta semana">
              <li>
                <span className="seg-cifra">{semana.actual.minutos} min</span>
                <span>de lectura</span>
                <small>{comparacionSemana(semana.actual.minutos, semana.anterior.minutos)}</small>
              </li>
              <li>
                <span className="seg-cifra">{semana.actual.lecturas}</span>
                <span>
                  {plural(semana.actual.lecturas, 'lectura terminada', 'lecturas terminadas')}
                </span>
                <small>La semana anterior: {semana.anterior.lecturas}</small>
              </li>
              <li>
                <span className="seg-cifra">{semana.actual.respuestas}</span>
                <span>
                  {plural(semana.actual.respuestas, 'pregunta respondida', 'preguntas respondidas')}
                </span>
              </li>
            </ul>
          </section>

          <section className="la-tarjeta pila-sm" aria-labelledby="fam-avance">
            <h2 id="fam-avance" className="titulo-con-icono">
              <Icono nombre="globo" tamano={26} />
              Su avance
            </h2>
            <ul className="seg-cifras" aria-label="Su avance">
              <li>
                <span className="seg-cifra">
                  {avance.mundoActual ? `Mundo ${avance.mundoActual.numero}` : '—'}
                </span>
                <span>
                  {avance.mundoActual
                    ? avance.mundoActual.nombre
                    : 'Abre el mapa al terminar su reto inicial'}
                </span>
                {avance.mundosCompletados > 0 ? (
                  <small>
                    {avance.mundosCompletados}{' '}
                    {plural(avance.mundosCompletados, 'mundo completado', 'mundos completados')}
                  </small>
                ) : null}
              </li>
              <li>
                <span className="seg-cifra">{avance.lecturasTerminadas}</span>
                <span>
                  {plural(
                    avance.lecturasTerminadas,
                    'lectura terminada en total',
                    'lecturas terminadas en total',
                  )}
                </span>
              </li>
              <li>
                <span className="seg-cifra">{avance.puntos}</span>
                <span>puntos</span>
                <small>
                  {avance.insignias} {plural(avance.insignias, 'insignia', 'insignias')}
                </small>
              </li>
            </ul>
            <p className="texto-suave" style={{ margin: 0 }}>
              {avance.ultimaActividad
                ? `Última vez que leyó: ${fechaCorta(avance.ultimaActividad)}`
                : 'Aún no empieza a leer en LectoAventura.'}
            </p>
          </section>
        </div>

        <section className="la-tarjeta pila-sm fam-habilidades" aria-labelledby="fam-habilidades">
          <h2 id="fam-habilidades" className="titulo-con-icono">
            <Icono nombre="progreso" tamano={26} />
            Sus habilidades
          </h2>
          <ul className="seg-habilidades" aria-label="Habilidades">
            {panel.habilidades.map((h) => (
              <li key={h.habilidad} className="seg-habilidad">
                <div className="seg-habilidad__cabecera">
                  <span>
                    <b>{HABILIDAD_FAMILIA[h.habilidad].nombre}</b>
                    <small className="fam-que-es">{HABILIDAD_FAMILIA[h.habilidad].queEs}</small>
                  </span>
                  <span className="fam-nivel">{h.valor === null ? 'Sin datos aún' : textoCelda(h)}</span>
                </div>
                <BarraProgreso
                  valor={h.valor ?? 0}
                  etiqueta={`${HABILIDAD_FAMILIA[h.habilidad].nombre}: ${textoCelda(h)}`}
                />
              </li>
            ))}
          </ul>
          <p className="texto-suave fam-leyenda">
            Cada habilidad va de 0 a 100. «Aún descubriendo» quiere decir que todavía respondió pocas
            preguntas de esa habilidad para darle un nivel; el número ya orienta qué reforzar.
          </p>
        </section>
      </div>

      <section className="pila-sm" aria-labelledby="fam-reforzar">
        <h2 id="fam-reforzar" className="titulo-con-icono">
          <Icono nombre="familia" tamano={28} />
          Para acompañar en casa
        </h2>
        {sinDatos ? (
          <Alerta tipo="info">
            Aún no hay datos de sus habilidades: cuando haga su reto inicial verás aquí qué reforzar
            y cómo ayudarle.
          </Alerta>
        ) : panel.aReforzar.length === 0 ? (
          <Alerta tipo="exito">
            ¡Va muy bien! Ahora no hay habilidades por reforzar: lo mejor es mantener el hábito.
          </Alerta>
        ) : (
          <ul className="fam-consejos" aria-label="Habilidades para reforzar">
            {panel.aReforzar.map((a) => (
              <li key={a.habilidad} className="la-tarjeta pila-sm fam-consejo">
                <h3>{HABILIDAD_FAMILIA[a.habilidad].nombre}</h3>
                <p className="texto-suave" style={{ margin: 0 }}>
                  {HABILIDAD_FAMILIA[a.habilidad].queEs}. Hoy:{' '}
                  {textoCelda(panel.habilidades.find((h) => h.habilidad === a.habilidad)!)}.
                </p>
                <ul
                  className="fam-ideas"
                  aria-label={`Ideas para ${HABILIDAD_FAMILIA[a.habilidad].nombre.toLowerCase()}`}
                >
                  {a.consejos.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {a.lectura ? (
                  <p className="fam-lectura">
                    <Icono nombre="libro" tamano={22} />
                    <span>
                      Lectura sugerida: <b>«{a.lectura.titulo}»</b>. Pídele que la lea en
                      LectoAventura y conversen sobre ella.
                    </span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="la-tarjeta pila-sm" aria-labelledby="fam-habito">
        <h2 id="fam-habito" className="titulo-con-icono">
          <Icono nombre="estrella" tamano={26} />
          Para mantener el hábito
        </h2>
        <ul className="fam-ideas" aria-label="Ideas para el hábito">
          {panel.habito.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>

      <ActivacionFamilia estudianteId={e.id} alias={e.alias} responsable={e.relacion === 'RESPONSABLE'} />
    </div>
  );
}
