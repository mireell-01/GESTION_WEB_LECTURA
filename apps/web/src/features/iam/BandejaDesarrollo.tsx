'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Cargando, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

interface Correo {
  para: string;
  asunto: string;
  texto: string;
  enlace?: string;
  enviadoEn: string;
}

/**
 * Bandeja de correos de desarrollo: mientras no haya SMTP configurado, los correos de
 * verificación y recuperación se muestran aquí en lugar de enviarse.
 */
export function BandejaDesarrollo() {
  const [correos, setCorreos] = useState<Correo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Correo[]>('/iam/dev/correos')
      .then(setCorreos)
      .catch((e) => setError(mensajeDeError(e)));
  }, []);

  useEffect(cargar, [cargar]);

  return (
    <Tarjeta
      titulo="📬 Bandeja de desarrollo"
      acciones={
        <Boton variante="fantasma" tamano="pequeno" onClick={cargar}>
          Actualizar
        </Boton>
      }
    >
      <Alerta tipo="aviso">
        Solo existe mientras el servidor no tenga SMTP configurado. En producción los correos llegan al buzón real.
      </Alerta>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!correos && !error ? <Cargando /> : null}
      {correos?.length === 0 ? <p className="texto-suave">Todavía no hay correos.</p> : null}
      <div className="pila-sm">
        {correos?.map((c) => (
          <article key={c.enviadoEn + c.para} className="la-tarjeta" style={{ boxShadow: 'none', border: '1px solid var(--la-color-borde)' }}>
            <div className="fila fila--entre">
              <strong>{c.asunto}</strong>
              <span className="texto-suave">{new Date(c.enviadoEn).toLocaleString('es-PE')}</span>
            </div>
            <div className="texto-suave">Para: {c.para}</div>
            <p>{c.texto}</p>
            {c.enlace ? (
              <a href={c.enlace.replace(/^https?:\/\/[^/]+/, '')} className="la-boton la-boton--primario la-boton--pequeno">
                Abrir enlace
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </Tarjeta>
  );
}
