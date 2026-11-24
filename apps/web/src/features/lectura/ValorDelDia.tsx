'use client';

import { useEffect, useRef, useState } from 'react';

import { IconoLectura } from './iconos';
import { valorDelDia, ValorDelDia as Valor } from './valores-del-dia';
import { leerEnVozAlta, puedeLeerEnVozAlta } from './voz';

/** Lo que se escucha al tocar el parlante: el valor, su frase y la acción de hoy. */
export function textosDelValor(valor: Valor): string[] {
  return [`Valor del día: ${valor.nombre}.`, valor.frase, `Hoy intenta: ${valor.practica}`];
}

/** La tarjeta, sin estado: el valor, su frase, la acción de hoy y (si el equipo puede) el parlante. */
export function TarjetaValor({
  valor,
  conVoz = false,
  hablando = false,
  alEscuchar,
}: {
  valor: Valor;
  conVoz?: boolean;
  hablando?: boolean;
  alEscuchar?: () => void;
}) {
  return (
    <section className="valor-dia" aria-labelledby="valor-dia-titulo">
      <span className="valor-dia__medalla" aria-hidden="true">
        <span className="valor-dia__emoji">{valor.emoji}</span>
      </span>
      <div className="valor-dia__texto">
        <h2 id="valor-dia-titulo" className="valor-dia__etiqueta">
          <span aria-hidden="true">💛 </span>Valor del día
        </h2>
        <p className="valor-dia__nombre">{valor.nombre}</p>
        <p className="valor-dia__frase">{valor.frase}</p>
      </div>
      <p className="valor-dia__practica">
        <span className="valor-dia__practica-icono" aria-hidden="true">
          ⭐
        </span>
        <span>
          <strong>Hoy intenta:</strong> {valor.practica}
        </span>
      </p>
      {conVoz ? (
        <button
          type="button"
          className={`valor-dia__voz${hablando ? ' valor-dia__voz--hablando' : ''}`}
          onClick={alEscuchar}
          aria-label={hablando ? 'Detener la voz' : 'Escuchar el valor del día'}
        >
          <IconoLectura nombre={hablando ? 'silencio' : 'parlante'} tamano={24} />
        </button>
      ) : null}
    </section>
  );
}

/**
 * Inicio: el valor del día — uno de los 20 valores de los cuentos, distinto cada día y el mismo para todo
 * el aula, con una frase y una acción para practicarlo hoy. Los más pequeños pueden escucharlo (RF-050,
 * con la voz del navegador: no se envía nada).
 */
export function ValorDelDia() {
  const [valor, setValor] = useState<Valor | null>(null);
  const [conVoz, setConVoz] = useState(false);
  const [hablando, setHablando] = useState(false);
  const detener = useRef<(() => void) | null>(null);

  useEffect(() => {
    // La fecha se toma ya en el navegador, para que el servidor y la pantalla no muestren valores distintos.
    setValor(valorDelDia(new Date()));
    setConVoz(puedeLeerEnVozAlta());
    return () => detener.current?.();
  }, []);

  if (!valor) return null;

  const escuchar = () => {
    detener.current?.();
    detener.current = null;
    if (hablando) {
      setHablando(false);
      return;
    }
    setHablando(true);
    detener.current = leerEnVozAlta(textosDelValor(valor), {
      velocidad: 0.9,
      alTerminar: () => {
        detener.current = null;
        setHablando(false);
      },
    });
  };

  return <TarjetaValor valor={valor} conVoz={conVoz} hablando={hablando} alEscuchar={escuchar} />;
}
