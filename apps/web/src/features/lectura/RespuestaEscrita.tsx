'use client';

import { useEffect, useRef, useState } from 'react';

import { AreaTexto, Boton } from '@lectoaventura/ui';

import { IconoLectura } from './iconos';
import { dictar, puedeDictar } from './voz';

/**
 * Escribir (RF-041) o dictar (RF-049) una respuesta. Lo dictado aparece en el cuadro para que el niño
 * lo lea y lo corrija antes de enviarlo; el audio nunca sale del dispositivo.
 */
export function RespuestaEscrita({
  etiqueta,
  boton,
  maximo = 500,
  minPalabras = null,
  porVozPrimero = false,
  enviando,
  onEnviar,
}: {
  etiqueta: string;
  boton: string;
  maximo?: number;
  minPalabras?: number | null;
  /** Modalidad VOZ: se invita primero a hablar. */
  porVozPrimero?: boolean;
  enviando: boolean;
  onEnviar: (texto: string, porVoz: boolean) => void;
}) {
  const [texto, setTexto] = useState('');
  const [porVoz, setPorVoz] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dictadoDisponible, setDictadoDisponible] = useState(false);
  const detener = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDictadoDisponible(puedeDictar());
    return () => detener.current?.();
  }, []);

  const escuchar = () => {
    if (escuchando) {
      detener.current?.();
      return;
    }
    setAviso(null);
    setEscuchando(true);
    detener.current = dictar({
      alTexto: (dicho) => {
        setTexto((previo) => `${previo ? `${previo} ` : ''}${dicho}`.slice(0, maximo));
        setPorVoz(true);
      },
      alError: setAviso,
      alTerminar: () => setEscuchando(false),
    });
  };

  const palabras = texto.trim() ? texto.trim().split(/\s+/).length : 0;
  return (
    <form
      className="pila-sm respuesta-escrita"
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) onEnviar(texto.trim(), porVoz);
      }}
    >
      <AreaTexto
        etiqueta={etiqueta}
        value={texto}
        rows={3}
        maxLength={maximo}
        ayuda={`${texto.length} de ${maximo} letras${minPalabras ? ` · al menos ${minPalabras} ${minPalabras === 1 ? 'palabra' : 'palabras'} (llevas ${palabras})` : ''}`}
        onChange={(e) => setTexto(e.target.value)}
      />
      {porVozPrimero && !dictadoDisponible ? <p className="texto-suave">Tu dispositivo no permite dictar: escribe tu respuesta.</p> : null}
      {aviso ? (
        <p className="texto-suave" role="status">
          {aviso}
        </p>
      ) : null}
      {porVoz && texto ? <p className="respuesta-escrita__confirmar">Revisa lo que dijiste y corrígelo si hace falta antes de enviarlo.</p> : null}
      <div className="fila">
        {dictadoDisponible ? (
          <Boton variante={porVozPrimero ? 'secundario' : 'fantasma'} onClick={escuchar} aria-pressed={escuchando}>
            <IconoLectura nombre="microfono" />
            {escuchando ? 'Te escucho… (toca para parar)' : 'Decirlo con mi voz'}
          </Boton>
        ) : null}
        <Boton type="submit" disabled={!texto.trim() || escuchando} cargando={enviando}>
          {boton}
        </Boton>
      </div>
    </form>
  );
}
