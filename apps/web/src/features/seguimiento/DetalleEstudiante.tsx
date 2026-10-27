'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Alerta, AVATARES, BarraProgreso, Cargando, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import { HABILIDAD_CORTA } from '@/features/diagnostico/tipos';
import { api } from '@/shared/api/client';

import { DetalleEstudiante as Detalle, ESTADO_SESION, fechaCorta, mensajeDeSeguimiento, motivosRiesgo, NOMBRE_HABILIDAD, NOMBRE_NIVEL, RespuestaDetalle, Tasa } from './tipos';

const CHIP_NIVEL = { C: 'aviso', B: 'info', A: 'exito', AD: 'exito' } as const;

function textoTasa(t: Tasa): string {
  return t.tasa === null ? 'Aún sin preguntas cerradas' : `${t.tasa} % a la primera (${t.sinPista} de ${t.cerradas})`;
}

/** El resultado de una respuesta, para la docente (el error no se muestra en rojo: es parte de aprender). */
function resultado(r: RespuestaDetalle): { texto: string; tipo?: 'exito' | 'info' | 'aviso' } {
  if (r.esCorrecta === null) return { texto: r.estado === 'VALORADA' ? 'Abierta · valorada' : 'Abierta · por valorar', tipo: 'info' };
  if (r.esCorrecta && r.pistasUsadas === 0) return { texto: 'Correcta a la primera', tipo: 'exito' };
  if (r.esCorrecta) return { texto: `Correcta con ${r.pistasUsadas === 1 ? '1 pista' : `${r.pistasUsadas} pistas`}`, tipo: 'info' };
  return { texto: 'Con la explicación', tipo: 'aviso' };
}

/**
 * RF-064: el detalle de un estudiante por habilidad, con sus últimas 20 sesiones: lo que respondió en
 * cada pregunta, las evidencias que eligió en el texto, las pistas que usó y su tasa de acierto sin pista.
 */
export function DetalleEstudiante({ aulaId, estudianteId }: { aulaId: string; estudianteId: string }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Detalle>(`/aulas/${aulaId}/estudiantes/${estudianteId}/detalle`)
      .then(setD)
      .catch((err) => setError(mensajeDeSeguimiento(err, 'No encontramos a este estudiante en tus aulas.')));
  }, [aulaId, estudianteId]);

  const volver = (
    <Link href={`/docente/aulas/${aulaId}/seguimiento`} className="volver">
      <Icono nombre="flecha" tamano={20} className="volver__icono" />
      Seguimiento del aula
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
  if (!d) return <Cargando texto="Abriendo el detalle…" />;

  const avatar = AVATARES[d.estudiante.avatar] ?? { emoji: '🙂', nombre: 'Avatar', fondo: '#ede8ff' };
  return (
    <div className="pila seguimiento">
      {volver}
      <header className="seg-cabecera seg-cabecera--estudiante">
        <span className="seg-avatar seg-avatar--grande" style={{ background: avatar.fondo }} aria-hidden="true">
          {avatar.emoji}
        </span>
        <div className="pila-sm">
          <h1>{d.estudiante.alias}</h1>
          <p className="texto-suave">
            {d.aula.nombre} · Última actividad: {d.ultimaActividad ? fechaCorta(d.ultimaActividad) : 'aún no empieza'} · {textoTasa(d.tasaSinPista)} en sus últimas sesiones
          </p>
          {d.riesgo.enRiesgo ? (
            <span className="fila fila--compacta">
              {motivosRiesgo(d.riesgo).map((m) => (
                <Chip key={m} tipo="aviso">
                  {m}
                </Chip>
              ))}
            </span>
          ) : null}
        </div>
      </header>

      <Tarjeta titulo="Por habilidad" aria-label="Por habilidad">
        <ul className="seg-habilidades" aria-label="Habilidades">
          {d.habilidades.map((h) => (
            <li key={h.habilidad} className="seg-habilidad">
              <span className="seg-habilidad__cabecera">
                <strong>{NOMBRE_HABILIDAD[h.habilidad]}</strong>
                {h.valor === null ? (
                  <Chip>Sin datos</Chip>
                ) : h.nivel ? (
                  <Chip tipo={CHIP_NIVEL[h.nivel]}>
                    {h.nivel} · {NOMBRE_NIVEL[h.nivel]}
                  </Chip>
                ) : (
                  <Chip>Aún descubriendo</Chip>
                )}
              </span>
              <BarraProgreso valor={h.valor ?? 0} etiqueta={`Maestría en ${NOMBRE_HABILIDAD[h.habilidad].toLowerCase()}`} />
              <span className="texto-suave">
                Maestría {h.valor === null ? '—' : Math.round(h.valor)} · {h.items} preguntas · {textoTasa(h.tasa)}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo={`Últimas sesiones (${d.sesiones.length} de 20 como máximo)`} aria-label="Últimas sesiones">
        {d.sesiones.length === 0 ? (
          <p className="texto-suave">Aún no ha abierto ninguna lectura.</p>
        ) : (
          <ul className="seg-sesiones" aria-label="Sesiones">
            {d.sesiones.map((s, i) => (
              <li key={s.id}>
                <details className="seg-sesion" open={i === 0}>
                  <summary>
                    <strong>{s.titulo}</strong>
                    <span className="fila fila--compacta">
                      <Chip tipo={s.estado === 'FINALIZADA' ? 'exito' : undefined}>{ESTADO_SESION[s.estado] ?? s.estado}</Chip>
                      {s.esRepeticion ? <Chip>Repetida</Chip> : null}
                      <span className="texto-suave">
                        {fechaCorta(s.iniciadaEn)} · {textoTasa(s.tasa)}
                      </span>
                    </span>
                  </summary>
                  <ol className="seg-respuestas" aria-label={`Respuestas de ${s.titulo}`}>
                    {s.respuestas.map((r) => {
                      const res = resultado(r);
                      return (
                        <li key={r.itemId} className="seg-respuesta">
                          <span className="seg-respuesta__cabecera">
                            <span>
                              <b>{HABILIDAD_CORTA[r.habilidad]}</b> · {r.enunciado}
                            </span>
                            <Chip tipo={res.tipo}>{res.texto}</Chip>
                          </span>
                          {r.respuesta && r.modalidad !== 'EVIDENCIA' ? <span>Respondió: «{r.respuesta}»</span> : null}
                          {r.evidencias.length > 0 ? (
                            <span>
                              Evidencia elegida: {r.evidencias.map((e) => `«${e}»`).join(' ')}
                            </span>
                          ) : null}
                          {r.pistas.length > 0 ? (
                            <ul className="seg-pistas" aria-label="Pistas usadas">
                              {r.pistas.map((p, n) => (
                                <li key={`${p.nivel}-${n}`}>
                                  <b>{p.nivel === 'EXPLICACION' ? 'Explicación' : p.nivel}:</b> {p.texto ?? '—'}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
