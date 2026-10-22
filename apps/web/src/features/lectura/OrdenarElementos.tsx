'use client';

import { useRef, useState } from 'react';
import type { PointerEvent as EventoPuntero } from 'react';

import { Boton } from '@lectoaventura/ui';

/**
 * RF-042: ordenar arrastrando (con el dedo o el ratón, por Pointer Events) o con los botones Subir y
 * Bajar, que son la alternativa accesible por teclado y lector de pantalla. Se responde con las
 * posiciones de la lista tal como se mostró (mezclada por el servidor).
 */
export function OrdenarElementos({ elementos, deshabilitado, onResponder }: { elementos: string[]; deshabilitado: boolean; onResponder: (orden: number[]) => void }) {
  const [orden, setOrden] = useState<number[]>(() => elementos.map((_, i) => i));
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const lista = useRef<HTMLOListElement>(null);

  const mover = (desde: number, hasta: number) => {
    if (hasta < 0 || hasta >= orden.length || desde === hasta) return;
    const nuevo = [...orden];
    const [x] = nuevo.splice(desde, 1);
    nuevo.splice(hasta, 0, x as number);
    setOrden(nuevo);
    setAnuncio(`«${elementos[x as number]}» quedó en el lugar ${hasta + 1} de ${orden.length}`);
  };

  const alMover = (e: EventoPuntero<HTMLElement>) => {
    if (arrastrando === null || !lista.current) return;
    const filas = [...lista.current.children] as HTMLElement[];
    const destino = filas.findIndex((f) => {
      const r = f.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const hasta = destino === -1 ? filas.length - 1 : destino > arrastrando ? destino - 1 : destino;
    if (hasta !== arrastrando) {
      mover(arrastrando, hasta);
      setArrastrando(hasta);
    }
  };

  return (
    <div className="pila-sm">
      <p className="texto-suave">Arrastra cada tarjeta o usa los botones para ponerlas en orden.</p>
      <ol ref={lista} className="ordenar" aria-label="Elementos para ordenar">
        {orden.map((posicion, i) => {
          const texto = elementos[posicion] as string;
          return (
            <li key={posicion} className={arrastrando === i ? 'ordenar__fila ordenar__fila--arrastrando' : 'ordenar__fila'}>
              <span
                className="ordenar__asa"
                aria-hidden="true"
                onPointerDown={(e) => {
                  if (deshabilitado) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setArrastrando(i);
                }}
                onPointerMove={alMover}
                onPointerUp={() => setArrastrando(null)}
                onPointerCancel={() => setArrastrando(null)}
              >
                <span className="ordenar__numero">{i + 1}</span>
                <span className="ordenar__texto">{texto}</span>
              </span>
              <span className="ordenar__botones">
                <Boton variante="fantasma" tamano="pequeno" aria-label={`Subir «${texto}»`} disabled={deshabilitado || i === 0} onClick={() => mover(i, i - 1)}>
                  Subir
                </Boton>
                <Boton variante="fantasma" tamano="pequeno" aria-label={`Bajar «${texto}»`} disabled={deshabilitado || i === orden.length - 1} onClick={() => mover(i, i + 1)}>
                  Bajar
                </Boton>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
      <div>
        <Boton onClick={() => onResponder(orden)} cargando={deshabilitado}>
          Listo, este es el orden
        </Boton>
      </div>
    </div>
  );
}
