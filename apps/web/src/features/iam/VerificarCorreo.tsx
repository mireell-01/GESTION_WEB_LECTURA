'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Alerta, Cargando, clasesBoton, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

/** RF-002: canjea el enlace de verificación de un solo uso. */
export function VerificarCorreo() {
  const codigo = useSearchParams().get('codigo');
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [error, setError] = useState('');
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    if (!codigo) {
      setEstado('error');
      setError('El enlace está incompleto.');
      return;
    }
    api('/auth/verificar-correo', { metodo: 'POST', cuerpo: { codigo } })
      .then(() => setEstado('ok'))
      .catch((e) => {
        setEstado('error');
        setError(mensajeDeError(e));
      });
  }, [codigo]);

  if (estado === 'cargando') return <Cargando texto="Verificando tu correo…" />;

  return (
    <Tarjeta titulo={estado === 'ok' ? '¡Correo verificado! 🎉' : 'No pudimos verificar'} nivel={1}>
      {estado === 'ok' ? (
        <p>Tu cuenta ya está activa. Ahora puedes ingresar.</p>
      ) : (
        <Alerta tipo="error">{error}</Alerta>
      )}
      <Link href="/ingresar" className={clasesBoton('primario', { bloque: true })}>
        Ir a ingresar
      </Link>
    </Tarjeta>
  );
}
