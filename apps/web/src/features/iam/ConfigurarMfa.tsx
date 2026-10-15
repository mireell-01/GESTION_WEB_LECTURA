'use client';

import { FormEvent, useState } from 'react';

import { Alerta, Boton, Campo } from '@lectoaventura/ui';

import { api, mensajeDeError, RespuestaSesion } from '@/shared/api/client';
import { useSesion } from '@/shared/auth/sesion';

/**
 * RF-011: configuración de verificación en dos pasos (TOTP) con una app autenticadora
 * (Google Authenticator, Microsoft Authenticator…). Obligatoria en backoffice, opcional para el resto.
 */
export function ConfigurarMfa({ onListo }: { onListo?: () => void }) {
  const { iniciar } = useSesion();
  const [datos, setDatos] = useState<{ secreto: string; urlOtpauth: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(false);

  const empezar = async () => {
    setOcupado(true);
    setError(null);
    try {
      setDatos(await api('/iam/mfa/iniciar', { metodo: 'POST' }));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      const sesion = await api<RespuestaSesion>('/iam/mfa/confirmar', { metodo: 'POST', cuerpo: { codigo } });
      await iniciar(sesion);
      setListo(true);
      onListo?.();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  if (listo) return <Alerta tipo="exito">Verificación en dos pasos activada. Desde ahora te pediremos el código al ingresar.</Alerta>;

  return (
    <div className="pila-sm">
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!datos ? (
        <Boton onClick={empezar} cargando={ocupado}>
          Configurar verificación en dos pasos
        </Boton>
      ) : (
        <form onSubmit={confirmar} className="pila-sm">
          <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>Abre tu app autenticadora y elige “Agregar cuenta” → “Ingresar clave de configuración”.</li>
            <li>
              Escribe esta clave (tipo “basada en el tiempo”):
              <div
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '1.15rem',
                  letterSpacing: '0.08em',
                  background: 'var(--la-color-fondo-alterno)',
                  padding: 'var(--la-espacio-2)',
                  borderRadius: 8,
                  margin: 'var(--la-espacio-1) 0',
                  wordBreak: 'break-all',
                }}
              >
                {datos.secreto.match(/.{1,4}/g)?.join(' ')}
              </div>
              <span className="texto-suave">
                En el celular también puedes <a href={datos.urlOtpauth}>abrir directamente la app</a>.
              </span>
            </li>
            <li>Escribe el código de 6 números que muestra la app.</li>
          </ol>
          <Campo
            etiqueta="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
          <Boton type="submit" cargando={ocupado} disabled={codigo.length !== 6}>
            Confirmar
          </Boton>
        </form>
      )}
    </div>
  );
}
