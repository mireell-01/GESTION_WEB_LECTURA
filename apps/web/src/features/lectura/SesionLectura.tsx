'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alerta, BarraProgreso, Boton, Cargando, clasesBoton, Icono, Mascota } from '@lectoaventura/ui';

import { ArchivoProtegido } from '@/features/contenido/ArchivoProtegido';
import { LogrosDeLectura } from '@/features/gamificacion/LogrosDeLectura';
import { api, mensajeDeError } from '@/shared/api/client';

import { PreguntaLectura } from './PreguntaLectura';
import { RespuestaEscrita } from './RespuestaEscrita';
import { LectorEnVozAlta, TextoLectura } from './TextoLectura';
import { EntradaRespuesta, ResultadoRespuesta, Sesion } from './tipos';

type Aviso = { tipo: 'exito' | 'info' | 'error'; texto: string } | null;

/** RF-046: cada envío lleva su clave; si se repite (p. ej. al renovar la sesión), no se corrige dos veces. */
function nuevaClave(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * La lectura interactiva del estudiante (RF-038 a RF-050): predice con el título y la imagen, lee con
 * preguntas que aparecen en sus oraciones de anclaje, elige su camino si la historia es ramificada,
 * hace lo de "después" y cierra contrastando su predicción con lo que pasó. Todo se guarda al momento:
 * si sale, al volver sigue donde quedó.
 */
export function SesionLectura({ lecturaId, asignacionId = null }: { lecturaId: string; asignacionId?: string | null }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [explicacion, setExplicacion] = useState<{ texto: string; siguiente: Sesion } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [evidencia, setEvidencia] = useState<string[]>([]);
  const [oracionLeida, setOracionLeida] = useState<string | null>(null);

  const abrir = useCallback(() => {
    setError(null);
    api<Sesion>('/sesiones-lectura', { metodo: 'POST', cuerpo: { lecturaId, ...(asignacionId ? { asignacionId } : {}) } })
      .then(setSesion)
      .catch((err) => setError(mensajeDeError(err)));
  }, [lecturaId, asignacionId]);

  useEffect(() => {
    abrir();
  }, [abrir]);

  const itemId = sesion?.pregunta?.itemId ?? null;
  useEffect(() => setEvidencia([]), [itemId]);

  const accion = async (fn: () => Promise<void>) => {
    setEnviando(true);
    try {
      await fn();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  };

  if (error) {
    return (
      <div className="pila sesion-lectura">
        <Alerta tipo="error">{error}</Alerta>
        <div>
          <Link href="/estudiante/biblioteca" className={clasesBoton('secundario')}>
            Ir a mi biblioteca
          </Link>
        </div>
      </div>
    );
  }
  if (!sesion) return <Cargando texto="Abriendo tu lectura…" />;

  const ruta = `/sesiones-lectura/${sesion.id}`;
  const predecir = (cuerpo: { texto?: string; indice?: number }) =>
    accion(async () => {
      const v = await api<Sesion>(`${ruta}/prediccion`, { metodo: 'PUT', cuerpo });
      setSesion(v);
      setAviso({ tipo: 'exito', texto: v.filtrado ? '¡Anotado! Cambiamos algunas palabras por ***. Ahora lee y descubre qué pasa.' : '¡Anotado! Ahora lee y descubre qué pasa.' });
    });
  const responder = (entrada: EntradaRespuesta) =>
    accion(async () => {
      const r = await api<ResultadoRespuesta>(`${ruta}/respuestas`, { metodo: 'POST', cuerpo: { itemId, idempotencyKey: nuevaClave(), ...entrada } });
      if (r.explicacion) {
        setAviso(null);
        setExplicacion({ texto: r.explicacion, siguiente: r.sesion });
        return;
      }
      setSesion(r.sesion);
      if (r.resultado === 'CORRECTA') setAviso({ tipo: 'exito', texto: '¡Muy bien! Sigue así.' });
      else if (r.resultado === 'ENVIADA') setAviso({ tipo: 'exito', texto: r.filtrado ? 'Guardamos tu respuesta. Cambiamos algunas palabras por ***.' : '¡Gracias! Guardamos tu respuesta.' });
      else setAviso({ tipo: 'info', texto: 'Casi. Lee la pista y vuelve a intentarlo.' });
    });
  const pedirPista = () =>
    accion(async () => {
      const r = await api<{ sesion: Sesion }>(`${ruta}/items/${itemId}/pistas`, { metodo: 'POST' });
      setSesion(r.sesion);
      setAviso({ tipo: 'info', texto: 'Aquí tienes una pista.' });
    });
  const decidir = (opcion: number) =>
    accion(async () => {
      setSesion(await api<Sesion>(`${ruta}/decisiones`, { metodo: 'POST', cuerpo: { nodoId: sesion.historia?.nodo.id, opcion } }));
      setAviso(null);
    });
  const finalizar = (reflexion: string) =>
    accion(async () => {
      setSesion(await api<Sesion>(`${ruta}/finalizar`, { metodo: 'POST', cuerpo: { reflexion } }));
      setAviso(null);
    });

  const { fase, pregunta, texto, historia } = sesion;
  const pistaConParrafo = [...(pregunta?.pistas ?? [])].reverse().find((p) => p.parrafo !== null);
  const visibles = texto.parrafos.flatMap((p) => p.oraciones);

  return (
    <div className="pila sesion-lectura">
      <div className="fila fila--entre">
        <Link href="/estudiante" className="volver">
          <Icono nombre="flecha" tamano={20} className="volver__icono" />
          Salir (tu avance queda guardado)
        </Link>
      </div>

      <header className="sesion-lectura__cabecera">
        <h1>{sesion.lectura.titulo}</h1>
        {fase !== 'PREDICCION' && fase !== 'FINALIZADA' ? <BarraProgreso valor={(sesion.progreso.hechas / Math.max(1, sesion.progreso.total)) * 100} etiqueta="Avance de la lectura" /> : null}
      </header>

      {aviso ? <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta> : null}

      {fase === 'PREDICCION' ? (
        <section className="portada-lectura" aria-labelledby="prediccion-titulo">
          {sesion.lectura.imagen ? <ArchivoProtegido url={sesion.lectura.imagen.url} tipo="IMAGEN" alt={sesion.lectura.imagen.textoAlternativo} className="portada-lectura__imagen" /> : <Mascota tamano={110} flota />}
          <div className="pila-sm">
            <p className="pregunta-lectura__momento">Antes de leer</p>
            <h2 id="prediccion-titulo">{sesion.prediccion.enunciado}</h2>
            {sesion.prediccion.opciones.length > 0 ? (
              <ul className="reto__opciones">
                {sesion.prediccion.opciones.map((o, i) => (
                  <li key={o}>
                    <button type="button" className="reto__opcion" disabled={enviando} onClick={() => predecir({ indice: i })}>
                      {o}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <RespuestaEscrita etiqueta="Lo que creo que pasará" boton="Empezar a leer" enviando={enviando} onEnviar={(t) => predecir({ texto: t })} />
            )}
          </div>
        </section>
      ) : null}

      {fase === 'ABANDONADA' ? (
        <section className="pila-sm">
          <p>Esta lectura se cerró porque pasaron varios días sin leerla. ¡Puedes empezarla otra vez!</p>
          <div>
            <Boton onClick={abrir}>Empezar de nuevo</Boton>
          </div>
        </section>
      ) : null}

      {fase !== 'PREDICCION' && fase !== 'ABANDONADA' && fase !== 'FINALIZADA' ? (
        <>
          {sesion.prediccion.respuesta ? (
            <p className="lectura-prediccion">
              <strong>Pensaste:</strong> «{sesion.prediccion.respuesta}»
            </p>
          ) : null}
          {visibles.length > 0 ? (
            <article className="lectura-texto" aria-label="El texto">
              {sesion.lectura.leerEnVozAlta ? <LectorEnVozAlta key={visibles.length} textos={visibles} alLeer={setOracionLeida} /> : null}
              <TextoLectura
                parrafos={texto.parrafos}
                resaltarParrafo={explicacion ? null : (pistaConParrafo?.parrafo ?? null)}
                oracionLeida={oracionLeida}
                anclajeId={pregunta?.anclajeOracionId ?? null}
                evidencia={
                  pregunta?.modalidad === 'EVIDENCIA' && !explicacion
                    ? { seleccionadas: evidencia, deshabilitada: enviando, alternar: (id) => setEvidencia(evidencia.includes(id) ? evidencia.filter((x) => x !== id) : [...evidencia, id]) }
                    : null
                }
              />
              {!texto.completo ? <p className="texto-suave lectura-texto__sigue">La historia sigue después de esta pregunta…</p> : null}
            </article>
          ) : null}

          {historia ? (
            <section className="historia" aria-labelledby="historia-titulo">
              <h2 id="historia-titulo">{fase === 'HISTORIA' ? '¿Qué camino eliges?' : 'Tu camino en la historia'}</h2>
              {historia.recorrido.map((r, i) => (
                <div key={i} className="historia__paso">
                  <p>{r.contenido}</p>
                  <p className="historia__eleccion">Elegiste: {r.eleccion}</p>
                </div>
              ))}
              <p className="historia__nodo">{historia.nodo.contenido}</p>
              {fase === 'HISTORIA' ? (
                <ul className="reto__opciones">
                  {historia.nodo.opciones.map((o, i) => (
                    <li key={o}>
                      <button type="button" className="reto__opcion" disabled={enviando} onClick={() => decidir(i)}>
                        <Icono nombre="brujula" tamano={24} />
                        <span>{o}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {explicacion ? (
            <section className="explicacion" aria-labelledby="explicacion-titulo">
              <h2 id="explicacion-titulo">Mira por qué</h2>
              <p>{explicacion.texto}</p>
              <div>
                <Boton
                  onClick={() => {
                    setSesion(explicacion.siguiente);
                    setExplicacion(null);
                  }}
                >
                  Seguir
                </Boton>
              </div>
            </section>
          ) : pregunta ? (
            <PreguntaLectura key={pregunta.itemId} pregunta={pregunta} enviando={enviando} conVoz={sesion.lectura.leerEnVozAlta} evidencia={evidencia} onResponder={responder} onPedirPista={pedirPista} />
          ) : null}

          {fase === 'CIERRE' && sesion.cierre && !explicacion ? (
            <section className="cierre-lectura" aria-labelledby="cierre-titulo">
              <h2 id="cierre-titulo">¿Acertaste?</h2>
              <div className="cierre-lectura__comparar">
                <div>
                  <p className="pregunta-lectura__etiqueta">Lo que pensaste</p>
                  <p>{sesion.cierre.prediccion}</p>
                </div>
                <div>
                  <p className="pregunta-lectura__etiqueta">Lo que pasó</p>
                  <p>{sesion.cierre.desenlace}</p>
                </div>
              </div>
              <RespuestaEscrita etiqueta={sesion.cierre.pregunta} boton="Terminar mi lectura" enviando={enviando} onEnviar={(t) => finalizar(t)} />
            </section>
          ) : null}
        </>
      ) : null}

      {fase === 'FINALIZADA' && sesion.resumen ? (
        <section className="est-preparando lectura-fin" aria-labelledby="fin-titulo">
          <Mascota tamano={110} flota />
          <div className="pila-sm">
            <h2 id="fin-titulo">¡Lectura terminada!</h2>
            <ul className="lectura-fin__resumen">
              <li>Hiciste {sesion.resumen.preguntas} actividades.</li>
              {sesion.resumen.sinAyuda > 0 ? <li>{sesion.resumen.sinAyuda} a la primera.</li> : null}
              {sesion.resumen.conPista > 0 ? <li>{sesion.resumen.conPista} con ayuda de una pista.</li> : null}
              {sesion.resumen.abiertas > 0 ? <li>Tu profe leerá lo que escribiste.</li> : null}
            </ul>
            <div className="fila">
              <Link href="/estudiante/mundos" className={clasesBoton('primario', { tamano: 'grande' })}>
                <Icono nombre="globo" tamano={24} />
                Ver mis mundos
              </Link>
              <Link href="/estudiante/biblioteca" className={clasesBoton('secundario', { tamano: 'grande' })}>
                <Icono nombre="libro" tamano={24} />
                Mi biblioteca
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <LogrosDeLectura terminada={fase === 'FINALIZADA'} />
    </div>
  );
}
