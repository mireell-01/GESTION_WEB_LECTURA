'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { Alerta, Boton, Mascota } from '@lectoaventura/ui';

import { api, apiFlujo, mensajeDeError } from '@/shared/api/client';

import { Atajo, ATAJOS, EstadoAsistente, EventoAsistente, Turno } from './tipos';

/**
 * RF-072 a RF-074: el asistente dentro de la pregunta, si un adulto lo activó. El niño escribe o toca
 * una ayuda rápida y la respuesta aparece mientras llega (SSE). Si el asistente no está o falla, la
 * lectura sigue igual (RNF-011).
 */
export function AsistenteLectura({ sesionId }: { sesionId: string }) {
  const [estado, setEstado] = useState<EstadoAsistente | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [llegando, setLlegando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chat = useRef<HTMLUListElement>(null);

  useEffect(() => {
    api<EstadoAsistente>(`/sesiones-lectura/${sesionId}/asistente`)
      .then(setEstado)
      .catch(() => setEstado(null));
  }, [sesionId]);

  // Solo se desplaza la conversación (no la página: la pregunta no se mueve).
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [estado?.turnos.length, llegando, abierto]);

  if (!estado?.disponible) return null;

  const agregar = (turno: Turno) => setEstado((e) => (e ? { ...e, turnos: [...e.turnos, turno] } : e));
  const ocupado = llegando !== null;
  const cerrada = estado.restantes === 0;

  const enviar = async (cuerpo: { mensaje?: string; atajo?: Atajo }, texto: string) => {
    setError(null);
    agregar({ emisor: 'ESTUDIANTE', texto });
    setLlegando('');
    let respuesta = '';
    try {
      await apiFlujo<EventoAsistente>(`/sesiones-lectura/${sesionId}/asistente/turnos`, { metodo: 'POST', cuerpo }, (e) => {
        if (e.tipo === 'texto') {
          respuesta += e.texto;
          setLlegando(respuesta);
        } else {
          setEstado((x) => (x ? { ...x, restantes: e.restantes } : x));
        }
      });
      agregar({ emisor: 'ASISTENTE', texto: respuesta });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setLlegando(null);
    }
  };

  const escribir = (e: FormEvent) => {
    e.preventDefault();
    const texto = mensaje.trim();
    if (!texto || ocupado) return;
    setMensaje('');
    void enviar({ mensaje: texto }, texto);
  };

  return (
    <section className="asistente" aria-labelledby="asistente-titulo">
      <button type="button" className="asistente__abrir" aria-expanded={abierto} aria-controls="asistente-panel" onClick={() => setAbierto(!abierto)}>
        <Mascota tamano={40} />
        <span id="asistente-titulo">{abierto ? 'Tu guía de lectura' : '¿Necesitas ayuda para pensar?'}</span>
      </button>
      {abierto ? (
        <div id="asistente-panel" className="asistente__panel">
          {estado.turnos.length === 0 && !ocupado ? (
            <p className="asistente__bienvenida">¡Hola! Te ayudo a pensar con preguntas. La respuesta la descubres tú.</p>
          ) : null}
          <ul ref={chat} className="asistente__chat" aria-label="Conversación con tu guía" aria-live="polite">
            {estado.turnos.map((t, i) => (
              <li key={i} className={`asistente__burbuja asistente__burbuja--${t.emisor === 'ESTUDIANTE' ? 'nino' : 'guia'}`}>
                {t.texto}
              </li>
            ))}
            {ocupado ? <li className="asistente__burbuja asistente__burbuja--guia">{llegando || '…'}</li> : null}
          </ul>
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          {cerrada ? (
            <p className="texto-suave">Ya conversamos 10 veces en esta lectura. ¡Sigue tú, lo estás haciendo muy bien!</p>
          ) : (
            <>
              <div className="asistente__atajos" role="group" aria-label="Ayudas rápidas">
                {ATAJOS.map((a) => (
                  <button key={a.atajo} type="button" className="asistente__atajo" disabled={ocupado} onClick={() => void enviar({ atajo: a.atajo }, a.texto)}>
                    {a.texto}
                  </button>
                ))}
              </div>
              <form className="asistente__escribir" onSubmit={escribir}>
                <label htmlFor="asistente-mensaje" className="sr-only">
                  Escribe tu pregunta
                </label>
                <input
                  id="asistente-mensaje"
                  className="la-entrada"
                  value={mensaje}
                  maxLength={300}
                  placeholder="Escribe tu pregunta…"
                  autoComplete="off"
                  onChange={(e) => setMensaje(e.target.value)}
                />
                <Boton type="submit" tamano="pequeno" disabled={!mensaje.trim() || ocupado}>
                  Preguntar
                </Boton>
              </form>
              <p className="texto-suave asistente__quedan">
                {estado.restantes === 1 ? 'Te queda 1 pregunta' : `Te quedan ${estado.restantes} preguntas`} en esta lectura.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
