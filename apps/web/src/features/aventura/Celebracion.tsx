'use client';

import { CSSProperties, useEffect, useRef } from 'react';

import { clasesBoton, EscenaMundo } from '@lectoaventura/ui';

import { MundoMapa, TONO_MUNDO } from './tipos';

/**
 * RF-031: celebración visual al desbloquear un mundo. Se muestra una sola vez (la API la marca como
 * vista al cerrarla). Accesible: diálogo modal con foco en el botón y Escape para cerrar; sin
 * animación si el sistema pide reducir el movimiento.
 */
export function Celebracion({ mundo, alCerrar }: { mundo: MundoMapa; alCerrar: () => void }) {
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    boton.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  return (
    <div className="celebracion" role="dialog" aria-modal="true" aria-labelledby="celebracion-titulo" aria-describedby="celebracion-texto">
      <div className="celebracion__confeti" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="celebracion__tarjeta">
        <span className="celebracion__escena">
          <EscenaMundo tono={TONO_MUNDO[mundo.numero] ?? 'bosque'} />
        </span>
        <p className="celebracion__numero">Mundo {mundo.numero}</p>
        <h2 id="celebracion-titulo">¡Desbloqueaste el mundo {mundo.nombre}!</h2>
        <p id="celebracion-texto">{mundo.descripcion} Ya puedes explorar sus misiones.</p>
        <button ref={boton} type="button" className={clasesBoton('primario', { tamano: 'grande' })} onClick={alCerrar}>
          ¡Vamos!
        </button>
      </div>
    </div>
  );
}
