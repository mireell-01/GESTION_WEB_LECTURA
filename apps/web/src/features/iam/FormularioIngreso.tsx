'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { Alerta, Boton, Campo, Tarjeta } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError, RespuestaSesion } from '@/shared/api/client';
import { useSesion } from '@/shared/auth/sesion';

/** RF-003 / RF-011: ingreso de adultos con correo y contraseña (+ código MFA si lo tienen activo). */
export function FormularioIngreso() {
  const router = useRouter();
  const parametros = useSearchParams();
  const { iniciar } = useSesion();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [codigoMfa, setCodigoMfa] = useState('');
  const [pideMfa, setPideMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const sesion = await api<RespuestaSesion>('/iam/sesiones', {
        metodo: 'POST',
        cuerpo: { email, contrasena, ...(pideMfa ? { codigoMfa } : {}) },
      });
      const ruta = await iniciar(sesion);
      const volver = parametros.get('volver');
      router.replace(volver && !sesion.requiereConfigurarMfa && volver.startsWith(ruta) ? volver : ruta);
    } catch (err) {
      if (err instanceof ErrorApi && err.detalle?.['requiereCodigoMfa'] && !pideMfa) {
        setPideMfa(true);
      } else {
        setError(mensajeDeError(err));
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo="Ingresar">
      <form onSubmit={enviar} noValidate>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
        />
        {pideMfa ? (
          <>
            <Alerta tipo="info">Tu cuenta tiene verificación en dos pasos. Escribe el código de tu app autenticadora.</Alerta>
            <Campo
              etiqueta="Código de 6 dígitos"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigoMfa}
              onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </>
        ) : null}
        <Boton type="submit" bloque cargando={enviando}>
          Ingresar
        </Boton>
      </form>
      <div className="pila-sm" style={{ marginTop: 'var(--la-espacio-3)' }}>
        <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
        <span className="texto-suave">
          ¿No tienes cuenta? <Link href="/registro">Crea una aquí</Link>
        </span>
      </div>
    </Tarjeta>
  );
}
