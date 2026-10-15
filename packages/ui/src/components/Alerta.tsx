import * as React from 'react';

export type TipoAlerta = 'info' | 'exito' | 'error' | 'aviso';

const ICONO: Record<TipoAlerta, string> = { info: 'ℹ️', exito: '✅', error: '⚠️', aviso: '💡' };

/** Mensaje destacado; los errores se anuncian de inmediato al lector de pantalla. */
export function Alerta({ tipo = 'info', children }: { tipo?: TipoAlerta; children: React.ReactNode }) {
  return (
    <div className={`la-alerta la-alerta--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{ICONO[tipo]}</span>
      <div>{children}</div>
    </div>
  );
}

/** Indicador de carga accesible. */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="la-cargando" role="status" aria-live="polite">
      <span className="la-cargando__rueda" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

/** Etiqueta corta (chip) para estados y niveles. */
export function Chip({
  tipo,
  children,
}: {
  tipo?: 'exito' | 'aviso' | 'error' | 'info';
  children: React.ReactNode;
}) {
  return <span className={['la-chip', tipo ? `la-chip--${tipo}` : ''].join(' ')}>{children}</span>;
}

/** Barra de progreso con valor accesible (0–100). */
export function BarraProgreso({ valor, etiqueta, color }: { valor: number; etiqueta: string; color?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div className="la-barra" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={etiqueta}>
      <div className="la-barra__relleno" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}
