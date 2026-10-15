'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { Alerta, Boton, Campo, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

/** RF-004 (paso 1): pedir el enlace. La respuesta es la misma exista o no la cuenta. */
export function RecuperarContrasena() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api('/iam/contrasena/recuperar', { metodo: 'POST', cuerpo: { email } });
      setEnviado(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo="Recuperar contraseña">
      {enviado ? (
        <>
          <Alerta tipo="exito">
            Si existe una cuenta con <strong>{email}</strong>, te enviamos un enlace para cambiar la contraseña. Vence en 30
            minutos.
          </Alerta>
          <Link href="/ingresar">Volver a ingresar</Link>
        </>
      ) : (
        <form onSubmit={enviar} noValidate>
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          <Campo etiqueta="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Boton type="submit" bloque cargando={enviando}>
            Enviar enlace
          </Boton>
        </form>
      )}
    </Tarjeta>
  );
}

/** RF-004 (paso 2): elegir la nueva contraseña con el enlace de un solo uso. */
export function RestablecerContrasena() {
  const codigo = useSearchParams().get('codigo') ?? '';
  const router = useRouter();
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const errorConfirmacion = confirmacion && confirmacion !== contrasena ? 'Las contraseñas no coinciden' : undefined;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (errorConfirmacion) return;
    setEnviando(true);
    setError(null);
    try {
      await api('/iam/contrasena/restablecer', { metodo: 'POST', cuerpo: { codigo, contrasenaNueva: contrasena } });
      setListo(true);
      setTimeout(() => router.push('/ingresar'), 2500);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  if (listo) {
    return (
      <Tarjeta titulo="Contraseña actualizada ✅">
        <p>Cerramos las sesiones abiertas por seguridad. Ya puedes ingresar con tu nueva contraseña.</p>
        <Link href="/ingresar">Ir a ingresar</Link>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Nueva contraseña">
      <form onSubmit={enviar} noValidate>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <Campo
          etiqueta="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          ayuda="Mínimo 10 caracteres."
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        <Campo
          etiqueta="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          error={errorConfirmacion}
        />
        <Boton type="submit" bloque cargando={enviando} disabled={!codigo}>
          Guardar contraseña
        </Boton>
      </form>
    </Tarjeta>
  );
}
