'use client';

import { FormEvent, useCallback, useEffect, useId, useState } from 'react';

import { Alerta, Boton, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { EMOJI_STICKER, EnvioMensaje, EstudianteAula, NOMBRE_STICKER } from './tipos';

const MAXIMO = 140;
const TODOS = '';

/** Frases para empezar rápido; la docente puede cambiarlas. */
const FRASES = [
  '¡Excelente lectura! Me alegra mucho tu avance.',
  '¡Sigue así, vas muy bien!',
  'Te extrañamos, ¡vuelve a leer un cuento!',
  '¡Felicitaciones por tu esfuerzo de esta semana!',
  '¡Qué bien leyeron hoy! Son unos campeones.',
];

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' });

/**
 * Mensajitos de ánimo de la docente para sus estudiantes: a toda el aula o a uno. Llevan un sticker y un
 * texto corto; los niños los ven en su inicio y los cierran con «¡Gracias!», y aquí se ve quién ya los leyó.
 */
export function MensajesAula({ aulaId, estudiantes, editable }: { aulaId: string; estudiantes: EstudianteAula[]; editable: boolean }) {
  const [envios, setEnvios] = useState<EnvioMensaje[] | null>(null);
  const [para, setPara] = useState(TODOS);
  const [sticker, setSticker] = useState('ESTRELLA');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const id = useId();

  const cargar = useCallback(async () => {
    try {
      setEnvios(await api<EnvioMensaje[]>(`/aulas/${aulaId}/mensajes`));
    } catch {
      setEnvios([]);
    }
  }, [aulaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setAviso(null);
    setEnviando(true);
    try {
      const envio = await api<EnvioMensaje>(`/aulas/${aulaId}/mensajes`, {
        metodo: 'POST',
        cuerpo: { sticker, texto, ...(para ? { estudianteId: para } : {}) },
      });
      setAviso({ tipo: 'exito', texto: envio.paraTodaElAula ? `Enviaste tu mensajito a toda el aula (${envio.total}).` : `Enviaste tu mensajito a ${envio.para}.` });
      setTexto('');
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  };

  const caracteres = [...texto.trim()].length;
  const activos = estudiantes.filter((e) => e.activo);

  return (
    <Tarjeta titulo="Mensajitos para tus estudiantes" className="mensajes-aula">
      <p className="texto-suave">
        Envía un mensaje corto de ánimo. Tus estudiantes lo verán en su inicio y lo cerrarán con «¡Gracias!». Solo tú les escribes: ellos no
        responden por escrito.
      </p>

      {editable && activos.length > 0 ? (
        <form className="pila-sm mensajes-aula__formulario" onSubmit={enviar}>
          <div className="la-campo">
            <label className="la-campo__etiqueta" htmlFor={`${id}-para`}>
              ¿Para quién?
            </label>
            <select id={`${id}-para`} className="la-entrada" value={para} onChange={(e) => setPara(e.target.value)}>
              <option value={TODOS}>Toda el aula ({activos.length})</option>
              {activos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.alias}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="mensajes-aula__stickers">
            <legend className="la-campo__etiqueta">Elige un sticker</legend>
            {Object.keys(EMOJI_STICKER).map((codigo) => (
              <button
                key={codigo}
                type="button"
                className="mensajes-aula__sticker"
                aria-pressed={sticker === codigo}
                aria-label={NOMBRE_STICKER[codigo]}
                onClick={() => setSticker(codigo)}
              >
                <span aria-hidden="true">{EMOJI_STICKER[codigo]}</span>
              </button>
            ))}
          </fieldset>

          <div className="mensajes-aula__frases" role="group" aria-label="Frases rápidas">
            {FRASES.map((f) => (
              <button key={f} type="button" className="filtro-chip" onClick={() => setTexto(f)}>
                {f}
              </button>
            ))}
          </div>

          <div className="la-campo">
            <label className="la-campo__etiqueta" htmlFor={`${id}-texto`}>
              Tu mensajito
            </label>
            <textarea
              id={`${id}-texto`}
              className="la-entrada mensajes-aula__texto"
              rows={2}
              maxLength={MAXIMO}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-describedby={`${id}-cuenta`}
              placeholder="Escribe algo bonito para tus estudiantes…"
            />
            <span id={`${id}-cuenta`} className="la-campo__ayuda">
              {caracteres} de {MAXIMO} caracteres
            </span>
          </div>

          {/* Así lo verá el niño en su inicio. */}
          {texto.trim() ? (
            <div className="mensaje-profe mensaje-profe--muestra" aria-label="Así lo verán tus estudiantes">
              <span className="mensaje-profe__sticker" aria-hidden="true">
                {EMOJI_STICKER[sticker]}
              </span>
              <div className="mensaje-profe__texto">
                <p className="mensaje-profe__de">💌 Mensaje de tu profe</p>
                <p className="mensaje-profe__mensaje">{texto.trim()}</p>
              </div>
            </div>
          ) : null}

          {aviso ? <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta> : null}
          <div>
            <Boton type="submit" cargando={enviando} disabled={caracteres === 0}>
              Enviar mensajito
            </Boton>
          </div>
        </form>
      ) : editable ? (
        <p className="texto-suave">Cuando matricules estudiantes, podrás enviarles mensajitos.</p>
      ) : null}

      {envios && envios.length > 0 ? (
        <div className="pila-sm mensajes-aula__enviados">
          <h3 className="mensajes-aula__subtitulo">Lo que enviaste</h3>
          <ul className="mensajes-aula__lista" aria-label="Mensajitos enviados">
            {envios.map((e) => (
              <li key={e.id} className="mensajes-aula__envio">
                <span className="mensajes-aula__envio-sticker" aria-hidden="true">
                  {EMOJI_STICKER[e.sticker] ?? '💌'}
                </span>
                <span className="mensajes-aula__envio-texto">
                  <span>{e.texto}</span>
                  <small className="texto-suave">
                    Para {e.para} · {cuando(e.creadoEn)}
                  </small>
                </span>
                <span className={`mensajes-aula__leido${e.leidos === e.total ? ' mensajes-aula__leido--todos' : ''}`}>
                  {e.total === 1 ? (e.leidos ? '✓ Leído' : 'Sin leer') : `Leído por ${e.leidos} de ${e.total}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Tarjeta>
  );
}
