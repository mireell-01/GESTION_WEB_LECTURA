'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Alerta, BarraProgreso, Boton, Cargando, Chip, clasesBoton, Icono, Mascota } from '@lectoaventura/ui';

import { AsistenteLectura } from '@/features/asistente/AsistenteLectura';
import { ArchivoProtegido } from '@/features/contenido/ArchivoProtegido';
import { EDADES } from '@/features/contenido/tipos';
import { LogrosDeLectura } from '@/features/gamificacion/LogrosDeLectura';
import { api, ErrorApi, mensajeDeError } from '@/shared/api/client';

import { PreguntaLectura } from './PreguntaLectura';
import { RespuestaEscrita } from './RespuestaEscrita';
import { LectorEnVozAlta, TextoLectura } from './TextoLectura';
import { IconoLectura } from './iconos';
import { IlustracionParrafo, repartoDe } from './IlustracionLectura';
import { Corazon, mensajeDe, textoDelMensaje } from './MensajeCuento';
import { guardarSonido, sonar, sonidoActivo } from './sonidos';
import { EntradaRespuesta, ResultadoRespuesta, Sesion } from './tipos';

/** Lo que dice la mascota en su globo (decorativo: el aviso ya lo dice para los lectores de pantalla). */
const FRASES = {
  exito: ['¡Eres una estrella de la lectura!', '¡Leíste con mucha atención!', '¡Lo lograste!', '¡Qué buen ojo para leer!', '¡Tu mascota está feliz!'],
  info: ['¡Tú puedes!', '¡Inténtalo otra vez!', '¡Ya casi lo tienes!', '¡Lee con calma, lo vas a encontrar!'],
};

/** Prender o apagar los sonidos de la lectura; la preferencia queda en este dispositivo. */
function BotonSonido() {
  const [activo, setActivo] = useState(true);
  useEffect(() => setActivo(sonidoActivo()), []);
  const cambiar = () => {
    guardarSonido(!activo);
    setActivo(!activo);
    if (!activo) sonar('enviado');
  };
  return (
    <button type="button" className="boton-sonido" aria-label="Sonidos" aria-pressed={activo} onClick={cambiar}>
      <IconoLectura nombre={activo ? 'parlante' : 'silencio'} />
      <span className="boton-sonido__texto" aria-hidden="true">
        {activo ? 'Sonido' : 'Sin sonido'}
      </span>
    </button>
  );
}

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
  const [aviso, ponerAviso] = useState<(NonNullable<Aviso> & { vez: number }) | null>(null);
  // Cada aviso nuevo vuelve a animar a la mascota, aunque repita el texto («Casi…» dos veces seguidas).
  const setAviso = (a: Aviso) => ponerAviso((antes) => (a ? { ...a, vez: (antes?.vez ?? 0) + 1 } : null));
  const [explicacion, setExplicacion] = useState<{ texto: string; siguiente: Sesion } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [evidencia, setEvidencia] = useState<string[]>([]);
  const [oracionLeida, setOracionLeida] = useState<string | null>(null);

  const abrir = useCallback(() => {
    setError(null);
    api<Sesion>('/sesiones-lectura', { metodo: 'POST', cuerpo: { lecturaId, ...(asignacionId ? { asignacionId } : {}) } })
      .then(setSesion)
      // Un cuento de otra edad (o que ya no está publicado) no se abre: se lo decimos con palabras de niño.
      .catch((err) => setError(err instanceof ErrorApi && err.estado === 404 ? 'Este cuento no está en tu biblioteca. ¡Elige uno que sea para ti!' : mensajeDeError(err)));
  }, [lecturaId, asignacionId]);

  useEffect(() => {
    abrir();
  }, [abrir]);

  const itemId = sesion?.pregunta?.itemId ?? null;
  useEffect(() => setEvidencia([]), [itemId]);

  // Al pasar a la siguiente pregunta, a la historia o al cierre, la pantalla vuelve arriba (al título).
  const paso = sesion ? `${sesion.fase}|${itemId ?? ''}|${sesion.historia?.nodo.id ?? ''}|${explicacion ? 'explicacion' : ''}` : '';
  const pasoAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (!paso) return;
    if (pasoAnterior.current !== null && pasoAnterior.current !== paso) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
    }
    pasoAnterior.current = paso;
  }, [paso]);

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
      sonar('enviado');
      setAviso({ tipo: 'exito', texto: v.filtrado ? '¡Anotado! Cambiamos algunas palabras por ***. Ahora lee y descubre qué pasa.' : '¡Anotado! Ahora lee y descubre qué pasa.' });
    });
  const responder = (entrada: EntradaRespuesta) =>
    accion(async () => {
      const r = await api<ResultadoRespuesta>(`${ruta}/respuestas`, { metodo: 'POST', cuerpo: { itemId, idempotencyKey: nuevaClave(), ...entrada } });
      if (r.explicacion) {
        sonar('casi');
        setAviso(null);
        setExplicacion({ texto: r.explicacion, siguiente: r.sesion });
        return;
      }
      setSesion(r.sesion);
      if (r.resultado === 'CORRECTA') {
        sonar('acierto');
        setAviso({ tipo: 'exito', texto: '¡Muy bien! Sigue así.' });
      } else if (r.resultado === 'ENVIADA') {
        sonar('enviado');
        setAviso({ tipo: 'exito', texto: r.filtrado ? 'Guardamos tu respuesta. Cambiamos algunas palabras por ***.' : '¡Gracias! Guardamos tu respuesta.' });
      } else {
        sonar('casi');
        setAviso({ tipo: 'info', texto: 'Casi. Lee la pista y vuelve a intentarlo.' });
      }
    });
  const pedirPista = () =>
    accion(async () => {
      const r = await api<{ sesion: Sesion }>(`${ruta}/items/${itemId}/pistas`, { metodo: 'POST' });
      setSesion(r.sesion);
      sonar('pista');
      setAviso({ tipo: 'info', texto: 'Aquí tienes una pista.' });
    });
  const decidir = (opcion: number) =>
    accion(async () => {
      setSesion(await api<Sesion>(`${ruta}/decisiones`, { metodo: 'POST', cuerpo: { nodoId: sesion.historia?.nodo.id, opcion } }));
      sonar('enviado');
      setAviso(null);
    });
  const finalizar = (reflexion: string) =>
    accion(async () => {
      setSesion(await api<Sesion>(`${ruta}/finalizar`, { metodo: 'POST', cuerpo: { reflexion } }));
      sonar('final');
      setAviso(null);
    });

  const { fase, pregunta, texto, historia } = sesion;
  const pistaConParrafo = [...(pregunta?.pistas ?? [])].reverse().find((p) => p.parrafo !== null);
  const visibles = texto.parrafos.flatMap((p) => p.oraciones);
  const avance = (sesion.progreso.hechas / Math.max(1, sesion.progreso.total)) * 100;

  return (
    <div className="pila sesion-lectura">
      <div className="fila fila--entre">
        <Link href="/estudiante" className="volver">
          <Icono nombre="flecha" tamano={20} className="volver__icono" />
          Salir (tu avance queda guardado)
        </Link>
        <BotonSonido />
      </div>

      <header className="sesion-lectura__cabecera">
        <h1>{sesion.lectura.titulo}</h1>
        {/* Para quién es el cuento: la API solo abre lecturas de la edad del niño (o las que le asignó su docente). */}
        {EDADES[sesion.lectura.rangoEdad] ? (
          <span className="fila fila--compacta">
            <Chip tipo="info">Cuento para {EDADES[sesion.lectura.rangoEdad]}</Chip>
          </span>
        ) : null}
        {fase !== 'PREDICCION' && fase !== 'FINALIZADA' ? (
          // Una estrella avanza por la barra con cada actividad hecha.
          <div className="avance-lectura" style={{ '--avance': `${avance}%` } as React.CSSProperties}>
            <BarraProgreso valor={avance} etiqueta="Avance de la lectura" />
            <span className="avance-lectura__estrella" aria-hidden="true">
              <Icono nombre="estrella" tamano={26} />
            </span>
          </div>
        ) : null}
      </header>

      {aviso ? (
        // La mascota celebra cuando acierta y lo anima cuando le falta poco.
        <div key={aviso.vez} className={`aviso-lectura aviso-lectura--${aviso.tipo}`}>
          {aviso.tipo !== 'error' ? <Mascota tamano={60} className={aviso.tipo === 'exito' ? 'mascota-festeja' : 'mascota-anima'} /> : null}
          {aviso.tipo !== 'error' ? (
            <span className="aviso-lectura__globo" aria-hidden="true">
              {FRASES[aviso.tipo][aviso.vez % FRASES[aviso.tipo].length]}
            </span>
          ) : null}
          {aviso.tipo === 'exito' ? (
            <span className="aviso-lectura__chispas" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </span>
          ) : null}
          <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta>
        </div>
      ) : null}

      {fase === 'PREDICCION' ? (
        <section className="portada-lectura" aria-labelledby="prediccion-titulo">
          {/* "Mira el título y la imagen": sin la imagen del editor, una escena con los personajes del título. */}
          {sesion.lectura.imagen ? (
            <ArchivoProtegido url={sesion.lectura.imagen.url} tipo="IMAGEN" alt={sesion.lectura.imagen.textoAlternativo} className="portada-lectura__imagen" />
          ) : (
            <IlustracionParrafo imagen={null} texto={sesion.lectura.titulo} reparto={sesion.lectura.titulo} />
          )}
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
                titulo={sesion.lectura.titulo}
                imagenes={sesion.lectura.imagenes ?? []}
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
              <div className="texto-lectura__bloque">
                <IlustracionParrafo
                  imagen={null}
                  texto={historia.nodo.contenido}
                  reparto={repartoDe(sesion.lectura.titulo, texto.parrafos[0]?.oraciones.map((o) => o.texto).join(' '))}
                />
                <p className="historia__nodo">{historia.nodo.contenido}</p>
              </div>
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
            <PreguntaLectura key={pregunta.itemId} pregunta={pregunta} enviando={enviando} conVoz={sesion.lectura.leerEnVozAlta} evidencia={evidencia} onResponder={responder} onPedirPista={pedirPista} ayuda={<AsistenteLectura sesionId={sesion.id} />} />
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
          <span className="lectura-fin__confeti" aria-hidden="true">
            {/* Cada papelito con su propio ritmo (repartido sin azar, igual en cada visita). */}
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} style={{ '--i': i, '--retraso': `${((i * 7) % 11) * 0.13}s`, '--caida': `${1.7 + ((i * 5) % 7) * 0.15}s` } as React.CSSProperties} />
            ))}
          </span>
          <Mascota tamano={110} flota />
          <div className="pila-sm">
            <h2 id="fin-titulo">¡Lectura terminada!</h2>
            <ul className="lectura-fin__resumen">
              <li>Hiciste {sesion.resumen.preguntas} actividades.</li>
              {sesion.resumen.sinAyuda > 0 ? <li>{sesion.resumen.sinAyuda} a la primera.</li> : null}
              {sesion.resumen.conPista > 0 ? <li>{sesion.resumen.conPista} con ayuda de una pista.</li> : null}
              {sesion.resumen.abiertas > 0 ? <li>Tu profe leerá lo que escribiste.</li> : null}
            </ul>
            {/* Lo que se lleva: el mensaje del cuento, para recordarlo. */}
            {mensajeDe(texto.parrafos) ? (
              <div className="lectura-fin__mensaje">
                <Corazon tamano={32} />
                <div>
                  <p className="lectura-fin__mensaje-titulo">Lo que aprendimos hoy</p>
                  <p>{textoDelMensaje(mensajeDe(texto.parrafos) as string)}</p>
                </div>
              </div>
            ) : null}
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
