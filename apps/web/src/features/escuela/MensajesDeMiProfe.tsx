'use client';

import { useEffect, useState } from 'react';

import { api } from '@/shared/api/client';

import { EMOJI_STICKER, MensajeParaNino } from './tipos';

/**
 * Los mensajitos de ánimo de su docente, arriba en el inicio. El niño los cierra con «¡Gracias!» y
 * desaparecen (quedan como leídos para la docente). Si no hay mensajes o no cargan, no muestra nada.
 */
export function MensajesDeMiProfe() {
  const [mensajes, setMensajes] = useState<MensajeParaNino[]>([]);
  const [cerrando, setCerrando] = useState<string | null>(null);

  useEffect(() => {
    api<MensajeParaNino[]>('/yo/mensajes')
      .then(setMensajes)
      .catch(() => setMensajes([]));
  }, []);

  const agradecer = async (m: MensajeParaNino) => {
    setCerrando(m.id);
    try {
      await api(`/yo/mensajes/${m.id}/leido`, { metodo: 'POST' });
    } catch {
      // Si falla, se vuelve a mostrar la próxima vez que entre: no se pierde.
    }
    // La animación de despedida dura menos de medio segundo.
    window.setTimeout(() => {
      setMensajes((lista) => lista.filter((x) => x.id !== m.id));
      setCerrando(null);
    }, 420);
  };

  if (mensajes.length === 0) return null;
  return (
    <section className="mensajes-profe" aria-label="Mensajes de tu profe">
      {mensajes.map((m) => (
        <article key={m.id} className={`mensaje-profe${cerrando === m.id ? ' mensaje-profe--cerrando' : ''}`}>
          <span className="mensaje-profe__sticker" aria-hidden="true">
            {EMOJI_STICKER[m.sticker] ?? '💌'}
          </span>
          <div className="mensaje-profe__texto">
            <p className="mensaje-profe__de">
              <span aria-hidden="true">💌</span> Mensaje de tu profe
            </p>
            <p className="mensaje-profe__mensaje">{m.texto}</p>
          </div>
          <button type="button" className="mensaje-profe__gracias" disabled={cerrando !== null} onClick={() => agradecer(m)}>
            <span aria-hidden="true">❤️</span> ¡Gracias!
          </button>
        </article>
      ))}
    </section>
  );
}
