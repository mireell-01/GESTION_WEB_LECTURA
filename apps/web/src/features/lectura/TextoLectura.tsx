'use client';

import { useEffect, useRef, useState } from 'react';

import { Boton, Icono } from '@lectoaventura/ui';

import { IconoLectura } from './iconos';
import { Parrafo } from './tipos';
import { leerEnVozAlta, puedeLeerEnVozAlta, VELOCIDADES } from './voz';

/** RF-050: leer en voz alta oración por oración, resaltando la que suena; velocidad 0,75× a 1,25×. */
export function LectorEnVozAlta({ textos, alLeer }: { textos: { id: string; texto: string }[]; alLeer: (id: string | null) => void }) {
  const [disponible, setDisponible] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [velocidad, setVelocidad] = useState<number>(1);
  const detener = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDisponible(puedeLeerEnVozAlta());
    return () => detener.current?.();
  }, []);

  if (!disponible) return null;

  const parar = () => {
    detener.current?.();
    detener.current = null;
    setLeyendo(false);
    alLeer(null);
  };

  const escuchar = () => {
    if (leyendo) return parar();
    setLeyendo(true);
    detener.current = leerEnVozAlta(
      textos.map((t) => t.texto),
      { velocidad, alEmpezar: (i) => alLeer(textos[i]?.id ?? null), alTerminar: parar },
    );
  };

  return (
    <div className="lector-voz" role="group" aria-label="Escuchar la lectura">
      <Boton variante="secundario" onClick={escuchar} aria-pressed={leyendo}>
        <IconoLectura nombre="parlante" />
        {leyendo ? 'Parar' : 'Escuchar la lectura'}
      </Boton>
      <div className="lector-voz__velocidad" role="radiogroup" aria-label="Velocidad">
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={velocidad === v}
            className="lector-voz__opcion"
            disabled={leyendo}
            onClick={() => setVelocidad(v)}
          >
            {v === 1 ? 'Normal' : v < 1 ? 'Despacio' : 'Rápido'}
            <span className="sr-only"> ({String(v).replace('.', ',')}×)</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * El texto que el niño ya puede leer (RF-038, RF-039). La oración que suena se resalta (RF-050), el
 * párrafo de la pista también (RN-06) y, en "Encuentra la evidencia", cada oración se puede tocar (RF-043).
 */
export function TextoLectura({
  parrafos,
  resaltarParrafo,
  oracionLeida,
  anclajeId,
  evidencia,
}: {
  parrafos: Parrafo[];
  resaltarParrafo: number | null;
  oracionLeida: string | null;
  anclajeId: string | null;
  evidencia: { seleccionadas: string[]; alternar: (id: string) => void; deshabilitada: boolean } | null;
}) {
  return (
    <div className="texto-lectura">
      {parrafos.map((p) => (
        <p key={p.numero} className={resaltarParrafo === p.numero ? 'texto-lectura__parrafo texto-lectura__parrafo--pista' : 'texto-lectura__parrafo'}>
          {p.oraciones.map((o) => {
            const clases = ['lectura-oracion', oracionLeida === o.id ? 'lectura-oracion--leyendo' : '', anclajeId === o.id ? 'lectura-oracion--anclaje' : ''].filter(Boolean).join(' ');
            if (!evidencia) {
              return (
                <span key={o.id} className={clases} data-oracion={o.id}>
                  {o.texto}{' '}
                </span>
              );
            }
            const elegida = evidencia.seleccionadas.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={`${clases} lectura-oracion--elegible${elegida ? ' lectura-oracion--elegida' : ''}`}
                aria-pressed={elegida}
                disabled={evidencia.deshabilitada}
                onClick={() => evidencia.alternar(o.id)}
                data-oracion={o.id}
              >
                {elegida ? <Icono nombre="estrella" tamano={18} /> : null}
                {o.texto}
              </button>
            );
          })}
        </p>
      ))}
    </div>
  );
}
