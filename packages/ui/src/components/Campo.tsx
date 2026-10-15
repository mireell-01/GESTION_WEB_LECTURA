import * as React from 'react';

interface CampoBaseProps {
  etiqueta: string;
  ayuda?: string;
  error?: string;
}

export type CampoProps = CampoBaseProps & React.InputHTMLAttributes<HTMLInputElement>;

/** Campo de texto con etiqueta asociada, ayuda y error anunciados al lector de pantalla. */
export function Campo({ etiqueta, ayuda, error, id, className, ...rest }: CampoProps) {
  const generado = React.useId();
  const idCampo = id ?? generado;
  const idAyuda = ayuda ? `${idCampo}-ayuda` : undefined;
  const idError = error ? `${idCampo}-error` : undefined;
  return (
    <div className="la-campo">
      <label className="la-campo__etiqueta" htmlFor={idCampo}>
        {etiqueta}
      </label>
      <input
        id={idCampo}
        className={['la-entrada', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {ayuda ? (
        <span id={idAyuda} className="la-campo__ayuda">
          {ayuda}
        </span>
      ) : null}
      {error ? (
        <span id={idError} className="la-campo__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type AreaTextoProps = CampoBaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function AreaTexto({ etiqueta, ayuda, error, id, className, ...rest }: AreaTextoProps) {
  const generado = React.useId();
  const idCampo = id ?? generado;
  return (
    <div className="la-campo">
      <label className="la-campo__etiqueta" htmlFor={idCampo}>
        {etiqueta}
      </label>
      <textarea
        id={idCampo}
        className={['la-entrada', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {ayuda ? <span className="la-campo__ayuda">{ayuda}</span> : null}
      {error ? (
        <span className="la-campo__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type SelectorProps = CampoBaseProps &
  React.SelectHTMLAttributes<HTMLSelectElement> & { opciones: { valor: string; texto: string }[] };

export function Selector({ etiqueta, ayuda, error, id, opciones, className, ...rest }: SelectorProps) {
  const generado = React.useId();
  const idCampo = id ?? generado;
  return (
    <div className="la-campo">
      <label className="la-campo__etiqueta" htmlFor={idCampo}>
        {etiqueta}
      </label>
      <select id={idCampo} className={['la-entrada', className].filter(Boolean).join(' ')} {...rest}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {ayuda ? <span className="la-campo__ayuda">{ayuda}</span> : null}
      {error ? (
        <span className="la-campo__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
