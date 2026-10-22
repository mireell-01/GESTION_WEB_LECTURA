'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Alerta, BarraProgreso, Boton, Cargando, clasesBoton, Icono, Mascota } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError } from '@/shared/api/client';

import { estrellas, HABILIDAD_INFANTIL, Pregunta, Reto as RetoDatos, ResultadoReto } from './tipos';

const LETRAS = ['A', 'B', 'C', 'D', 'E'];

type Paso =
  | { tipo: 'cargando' }
  | { tipo: 'pregunta'; reto: RetoDatos; pregunta: Pregunta }
  | { tipo: 'resultado'; resultado: ResultadoReto }
  | { tipo: 'sin-reto' }
  | { tipo: 'error'; mensaje: string };

/**
 * El reto del estudiante (RF-034 a RF-036): una pregunta a la vez, con su lectura a la vista. No se
 * dice si cada respuesta está bien o mal: es un reto para conocerlo, no un examen. Puede pausarse y
 * continuar después (RF-036); al terminar, ve lo que ya domina (RF-035) y su mapa queda listo (RF-033).
 */
export function Reto() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>({ tipo: 'cargando' });
  const [enviando, setEnviando] = useState(false);
  const enunciado = useRef<HTMLHeadingElement>(null);

  /** Pide la pregunta siguiente; si no quedan, finaliza el reto. */
  const avanzar = useCallback(async (reto: RetoDatos) => {
    const { item } = await api<{ item: Pregunta | null }>(`/diagnosticos/${reto.id}/siguiente-item`);
    if (item) {
      setPaso({ tipo: 'pregunta', reto, pregunta: item });
      return;
    }
    setPaso({ tipo: 'resultado', resultado: await api<ResultadoReto>(`/diagnosticos/${reto.id}/finalizar`, { metodo: 'POST' }) });
  }, []);

  useEffect(() => {
    api<RetoDatos>('/diagnosticos', { metodo: 'POST' })
      .then(avanzar)
      .catch((err) => setPaso(err instanceof ErrorApi && err.estado === 409 ? { tipo: 'sin-reto' } : { tipo: 'error', mensaje: mensajeDeError(err) }));
  }, [avanzar]);

  // Cada pregunta nueva recibe el foco, para quien navega con teclado o lector de pantalla.
  const itemId = paso.tipo === 'pregunta' ? paso.pregunta.itemId : null;
  useEffect(() => {
    if (itemId) enunciado.current?.focus();
  }, [itemId]);

  const responder = async (indice: number) => {
    if (paso.tipo !== 'pregunta' || enviando) return;
    setEnviando(true);
    try {
      await api(`/diagnosticos/${paso.reto.id}/respuestas`, { metodo: 'POST', cuerpo: { itemId: paso.pregunta.itemId, indice } });
      await avanzar(paso.reto);
    } catch (err) {
      setPaso({ tipo: 'error', mensaje: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  };

  const pausar = async () => {
    if (paso.tipo !== 'pregunta') return;
    setEnviando(true);
    try {
      await api(`/diagnosticos/${paso.reto.id}/pausar`, { metodo: 'POST' });
      router.push('/estudiante');
    } catch (err) {
      setPaso({ tipo: 'error', mensaje: mensajeDeError(err) });
      setEnviando(false);
    }
  };

  if (paso.tipo === 'cargando') return <Cargando texto="Preparando tu reto…" />;
  if (paso.tipo === 'error') {
    return (
      <div className="pila reto">
        <Alerta tipo="error">{paso.mensaje}</Alerta>
        <div>
          <Boton onClick={() => window.location.reload()}>Intentar de nuevo</Boton>
        </div>
      </div>
    );
  }
  if (paso.tipo === 'sin-reto') {
    return (
      <div className="est-preparando">
        <Mascota tamano={96} flota />
        <div className="pila-sm">
          <h1>¡Ya completaste tu reto!</h1>
          <p>Sigue tu aventura en el mapa.</p>
          <div>
            <Link href="/estudiante/mundos" className={clasesBoton('primario', { tamano: 'grande' })}>
              Ver mi mapa
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (paso.tipo === 'resultado') return <Resultado resultado={paso.resultado} />;

  const { pregunta, reto } = paso;
  return (
    <div className="pila reto">
      <header className="reto__cabecera">
        <p className="reto__titulo">{reto.tipo === 'INICIAL' ? 'Reto inicial' : 'Reto de repaso'}</p>
        <p className="reto__avance" aria-live="polite">
          Pregunta {pregunta.numero} de {pregunta.total}
        </p>
        <BarraProgreso valor={((pregunta.numero - 1) / pregunta.total) * 100} etiqueta="Avance del reto" />
      </header>

      <article className="reto__lectura" aria-labelledby="reto-lectura">
        <h2 id="reto-lectura">
          <Icono nombre="libro" tamano={26} />
          {pregunta.lectura.titulo}
        </h2>
        <p>{pregunta.lectura.texto}</p>
      </article>

      <fieldset className="reto__pregunta" disabled={enviando} aria-labelledby="reto-enunciado">
        <h3 id="reto-enunciado" ref={enunciado} tabIndex={-1}>
          {pregunta.enunciado}
        </h3>
        <ul className="reto__opciones">
          {pregunta.opciones.map((opcion, i) => (
            <li key={opcion}>
              <button type="button" className="reto__opcion" onClick={() => responder(i)} aria-label={`Opción ${LETRAS[i]}: ${opcion}`}>
                <span className="reto__letra" aria-hidden="true">
                  {LETRAS[i]}
                </span>
                <span>{opcion}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="reto__pie">
        <Boton variante="fantasma" onClick={pausar} disabled={enviando}>
          Pausar y seguir después
        </Boton>
      </div>
    </div>
  );
}

function Resultado({ resultado }: { resultado: ResultadoReto }) {
  return (
    <div className="pila reto">
      <section className="est-preparando reto__fin">
        <Mascota tamano={110} flota />
        <div className="pila-sm">
          <h1>{resultado.tipo === 'INICIAL' ? '¡Reto completado!' : '¡Reto de repaso completado!'}</h1>
          <p>{resultado.tipo === 'INICIAL' ? 'Ya sabemos dónde empieza tu aventura. Esto es lo que ya sabes hacer:' : 'Mira todo lo que sabes hacer:'}</p>
        </div>
      </section>
      <ul className="reto__habilidades" aria-label="Lo que ya sabes hacer">
        {resultado.habilidades.map((h) => {
          const n = estrellas(h.valor);
          return (
            <li key={h.codigo} className="reto__habilidad">
              <span className="reto__habilidad-nombre">{HABILIDAD_INFANTIL[h.codigo]}</span>
              <span className="reto__estrellas" role="img" aria-label={`${n} de 3 estrellas`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < n ? 'reto__estrella reto__estrella--llena' : 'reto__estrella'}>
                    <Icono nombre="estrella" tamano={26} />
                  </span>
                ))}
              </span>
              <BarraProgreso valor={h.valor} etiqueta={HABILIDAD_INFANTIL[h.codigo]} />
            </li>
          );
        })}
      </ul>
      <div>
        <Link href="/estudiante/mundos" className={clasesBoton('primario', { tamano: 'grande' })}>
          <Icono nombre="globo" tamano={24} />
          Ver mi mapa
        </Link>
      </div>
    </div>
  );
}
