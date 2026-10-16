'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { Alerta, Boton, Campo, Tarjeta } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError, RespuestaSesion } from '@/shared/api/client';
import { useSesion } from '@/shared/auth/sesion';

import { ReenviarVerificacion } from './ReenviarVerificacion';

/** RF-003 / RF-011: ingreso de adultos con correo y contraseña (+ código MFA si lo tienen activo). */
export function FormularioIngreso() {
  const router = useRouter();
  const parametros = useSearchParams();
  const { iniciar } = useSesion();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [codigoMfa, setCodigoMfa] = useState('');
  const [pideMfa, setPideMfa] = useState(false);
  const [noVerificada, setNoVerificada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNoVerificada(false);
    setEnviando(true);
    try {
      const sesion = await api<RespuestaSesion>('/auth/login', {
        metodo: 'POST',
        cuerpo: { email, contrasena, ...(pideMfa ? { codigoMfa } : {}) },
      });
      const ruta = await iniciar(sesion);
      const volver = parametros.get('volver');
      router.replace(volver && !sesion.requiereConfigurarMfa && volver.startsWith(ruta) ? volver : ruta);
    } catch (err) {
      if (err instanceof ErrorApi && err.detalle?.['requiereCodigoMfa'] && !pideMfa) {
        setPideMfa(true);
      } else if (err instanceof ErrorApi && err.detalle?.['motivo'] === 'CUENTA_NO_VERIFICADA') {
        // RF-002: la contraseña es correcta pero falta confirmar el correo: se ofrece un enlace nuevo.
        setNoVerificada(true);
      } else {
        setError(mensajeDeError(err));
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo="Ingresar" nivel={1}>
      <form onSubmit={enviar} noValidate>
        {parametros.get('motivo') === 'inactividad' ? (
          <Alerta tipo="info">Cerramos tu sesión por inactividad para proteger tus datos. Vuelve a ingresar.</Alerta>
        ) : null}
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {noVerificada ? (
          <div className="pila-sm" style={{ marginBottom: 'var(--la-espacio-3)' }}>
            <Alerta tipo="aviso">
              Tu cuenta aún no está verificada. Abre el enlace que te enviamos a <strong>{email.trim()}</strong> o pide uno nuevo.
            </Alerta>
            <ReenviarVerificacion email={email} />
          </div>
        ) : null}
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNoVerificada(false);
          }}
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
