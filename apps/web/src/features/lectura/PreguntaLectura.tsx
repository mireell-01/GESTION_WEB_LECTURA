'use client';

import { useEffect, useRef, useState } from 'react';

import { Boton, Icono } from '@lectoaventura/ui';

import { IconoLectura } from './iconos';
import { OrdenarElementos } from './OrdenarElementos';
import { RespuestaEscrita } from './RespuestaEscrita';
import { EntradaRespuesta, LETRAS, Pregunta } from './tipos';
import { leerEnVozAlta, puedeLeerEnVozAlta } from './voz';

const MOMENTO: Record<Pregunta['momento'], string> = { ANTES: 'Antes de leer', DURANTE: 'Mientras lees', DESPUES: 'Después de leer' };

/** RF-050: en R1 las instrucciones también se escuchan. */
function EscucharPregunta({ textos }: { textos: string[] }) {
  const [disponible, setDisponible] = useState(false);
  const detener = useRef<(() => void) | null>(null);
  useEffect(() => {
    setDisponible(puedeLeerEnVozAlta());
    return () => detener.current?.();
  }, []);
  if (!disponible) return null;
  return (
    <Boton variante="fantasma" tamano="pequeno" onClick={() => (detener.current = leerEnVozAlta(textos, { velocidad: 0.9 }))}>
      <IconoLectura nombre="parlante" tamano={20} />
      Escuchar la pregunta
    </Boton>
  );
}

/**
 * La pregunta en pantalla (RF-039 a RF-045). La corrección es del servidor; aquí solo se elige, se
 * escribe u ordena, se ven las pistas recibidas y se pide una si hace falta.
 */
export function PreguntaLectura({
  pregunta,
  enviando,
  conVoz,
  evidencia,
  onResponder,
  onPedirPista,
}: {
  pregunta: Pregunta;
  enviando: boolean;
  conVoz: boolean;
  /** RF-043: las oraciones que el niño tocó en el texto. */
  evidencia: string[];
  onResponder: (entrada: EntradaRespuesta) => void;
  onPedirPista: () => void;
}) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const titulo = useRef<HTMLHeadingElement>(null);

  // Cada pregunta nueva recibe el foco, para quien navega con teclado o lector de pantalla.
  useEffect(() => {
    titulo.current?.focus();
  }, [pregunta.itemId]);

  const cerrada = pregunta.modalidad === 'SELECCION' || pregunta.modalidad === 'ORDENAMIENTO' || pregunta.modalidad === 'EVIDENCIA';
  return (
    <section className="pregunta-lectura" aria-labelledby="pregunta-enunciado">
      <p className="pregunta-lectura__momento">
        {MOMENTO[pregunta.momento]} · Actividad {pregunta.numero} de {pregunta.total}
      </p>
      {pregunta.defiende ? (
        <div className="pregunta-lectura__defiende">
          <p className="pregunta-lectura__etiqueta">Defiende tu respuesta</p>
          <p>{pregunta.defiende.enunciado}</p>
          <p>
            <strong>Tu respuesta:</strong> {pregunta.defiende.respuesta}
          </p>
        </div>
      ) : null}
      <h2 id="pregunta-enunciado" ref={titulo} tabIndex={-1}>
        {pregunta.enunciado}
      </h2>
      {conVoz ? <EscucharPregunta textos={[pregunta.enunciado, ...pregunta.opciones.map((o, i) => `${LETRAS[i]}: ${o}`)]} /> : null}

      {pregunta.pistas.length > 0 ? (
        <ul className="pistas" aria-label="Tus pistas">
          {pregunta.pistas.map((p) => (
            <li key={p.nivel} className="pista">
              <Icono nombre="brujula" tamano={22} />
              <span>
                <strong>Pista {p.nivel.slice(1)}:</strong> {p.texto}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {pregunta.modalidad === 'SELECCION' && !pregunta.multiple ? (
        <ul className="reto__opciones">
          {pregunta.opciones.map((opcion, i) => (
            <li key={opcion}>
              <button type="button" className="reto__opcion" disabled={enviando} onClick={() => onResponder({ indice: i })} aria-label={`Opción ${LETRAS[i]}: ${opcion}`}>
                <span className="reto__letra" aria-hidden="true">
                  {LETRAS[i]}
                </span>
                <span>{opcion}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {pregunta.modalidad === 'SELECCION' && pregunta.multiple ? (
        <div className="pila-sm">
          <p className="texto-suave">Puedes marcar más de una.</p>
          <ul className="reto__opciones">
            {pregunta.opciones.map((opcion, i) => {
              const marcada = marcadas.includes(i);
              return (
                <li key={opcion}>
                  <button
                    type="button"
                    className={marcada ? 'reto__opcion reto__opcion--marcada' : 'reto__opcion'}
                    aria-pressed={marcada}
                    disabled={enviando}
                    onClick={() => setMarcadas(marcada ? marcadas.filter((x) => x !== i) : [...marcadas, i])}
                    aria-label={`Opción ${LETRAS[i]}: ${opcion}`}
                  >
                    <span className="reto__letra" aria-hidden="true">
                      {marcada ? '✓' : LETRAS[i]}
                    </span>
                    <span>{opcion}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div>
            <Boton disabled={marcadas.length === 0} cargando={enviando} onClick={() => onResponder({ indices: marcadas })}>
              Responder
            </Boton>
          </div>
        </div>
      ) : null}

      {pregunta.modalidad === 'ORDENAMIENTO' ? <OrdenarElementos key={pregunta.itemId} elementos={pregunta.elementos} deshabilitado={enviando} onResponder={(orden) => onResponder({ orden })} /> : null}

      {pregunta.modalidad === 'EVIDENCIA' ? (
        <div className="pila-sm">
          <p className="texto-suave">Toca en el texto las oraciones que lo demuestran. Elegiste {evidencia.length === 1 ? '1 oración' : `${evidencia.length} oraciones`}.</p>
          <div>
            <Boton disabled={evidencia.length === 0} cargando={enviando} onClick={() => onResponder({ oraciones: evidencia })}>
              Esta es mi evidencia
            </Boton>
          </div>
        </div>
      ) : null}

      {pregunta.modalidad === 'ESCRITURA' || pregunta.modalidad === 'VOZ' ? (
        <RespuestaEscrita
          key={pregunta.itemId}
          etiqueta="Tu respuesta"
          boton="Enviar mi respuesta"
          maximo={pregunta.maxCaracteres}
          minPalabras={pregunta.minPalabras}
          porVozPrimero={pregunta.modalidad === 'VOZ'}
          enviando={enviando}
          onEnviar={(texto, porVoz) => onResponder({ texto, porVoz })}
        />
      ) : null}

      {cerrada && pregunta.pistasRestantes > 0 ? (
        <div>
          <Boton variante="fantasma" disabled={enviando} onClick={onPedirPista}>
            <Icono nombre="brujula" tamano={20} />
            Pedir una pista
          </Boton>
        </div>
      ) : null}
    </section>
  );
}
