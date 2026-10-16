import * as React from 'react';

/**
 * Teclado numérico grande para que niñas y niños de 6 años escriban su PIN de 4 dígitos
 * sin teclado del sistema. Los dígitos no se muestran en pantalla.
 */
export function TecladoPin({
  onCompletar,
  deshabilitado = false,
  longitud = 4,
}: {
  onCompletar: (pin: string) => void;
  deshabilitado?: boolean;
  longitud?: number;
}) {
  const [pin, setPin] = React.useState('');

  React.useEffect(() => {
    if (pin.length === longitud) {
      onCompletar(pin);
      setPin('');
    }
  }, [pin, longitud, onCompletar]);

  const pulsar = (d: string) => setPin((p) => (p.length < longitud ? p + d : p));
  const borrar = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="la-pin">
      <div className="la-pin__puntos" aria-label={`${pin.length} de ${longitud} números escritos`} role="status">
        {Array.from({ length: longitud }, (_, i) => (
          <span key={i} className={`la-pin__punto ${i < pin.length ? 'la-pin__punto--lleno' : ''}`} />
        ))}
      </div>
      <div className="la-pin__teclas">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="la-pin__tecla" disabled={deshabilitado} onClick={() => pulsar(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="la-pin__tecla" disabled={deshabilitado} onClick={borrar} aria-label="Borrar">
          ⌫
        </button>
        <button type="button" className="la-pin__tecla" disabled={deshabilitado} onClick={() => pulsar('0')}>
          0
        </button>
        <span />
      </div>
    </div>
  );
}
