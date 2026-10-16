'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

import { Alerta, Boton, Campo } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError } from '@/shared/api/client';

/**
 * RF-002: pedir otro enlace de verificación cuando el anterior se perdió o venció. El enlace nuevo
 * vence en 24 h, sirve una sola vez y anula los anteriores. Entre pedidos hay que esperar (60 s),
 * y el botón muestra cuánto falta. Si ya se conoce el correo (ingreso, registro), no se vuelve a pedir.
 */
export function ReenviarVerificacion({ email: emailConocido, esperaInicialSeg = 0 }: { email?: string; esperaInicialSeg?: number }) {
  const [email, setEmail] = useState(emailConocido ?? '');
  const [espera, setEspera] = useState(esperaInicialSeg);
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const temporizador = window.setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => window.clearTimeout(temporizador);
  }, [espera]);

  const reenviar = async (e?: FormEvent) => {
    e?.preventDefault();
    setAviso(null);
    setEnviando(true);
    try {
      const r = await api<{ ok: true; reintentarEnSeg: number }>('/auth/verificar-correo/reenviar', {
        metodo: 'POST',
        cuerpo: { email: email.trim() },
      });
      setEnviado(true);
      setEspera(r.reintentarEnSeg);
    } catch (err) {
      if (err instanceof ErrorApi && err.estado === 429) {
        const segundos = Number(err.detalle?.['reintentarEnSeg']) || 60;
        setEspera(segundos);
        setAviso(`Ya pediste un enlace hace poco. Espera ${segundos} segundos antes de pedir otro.`);
      } else {
        setAviso(mensajeDeError(err));
      }
    } finally {
      setEnviando(false);
    }
  };

  const contenido = (
    <>
      {enviado ? (
        <Alerta tipo="exito">
          Listo. Si tu cuenta está pendiente de verificación, te enviamos un enlace nuevo a <strong>{email.trim()}</strong>. Vence en 24
          horas y solo funciona una vez; los enlaces anteriores dejan de servir.
          {process.env.NODE_ENV !== 'production' ? (
            <>
              {' '}
              ¿Pruebas sin servidor de correo? Ábrelo en la <Link href="/dev/correos">bandeja de desarrollo</Link>.
            </>
          ) : null}
        </Alerta>
      ) : null}
      {aviso ? <Alerta tipo="aviso">{aviso}</Alerta> : null}
      {emailConocido ? null : (
        <Campo etiqueta="Tu correo electrónico" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      )}
      <Boton
        type={emailConocido ? 'button' : 'submit'}
        variante="fantasma"
        bloque
        cargando={enviando}
        disabled={espera > 0 || !email.trim()}
        onClick={emailConocido ? () => void reenviar() : undefined}
      >
        {espera > 0 ? `Podrás pedir otro enlace en ${espera} s` : 'Reenviar enlace de verificación'}
      </Boton>
    </>
  );

  // Dentro de otro formulario (ingreso) no se puede anidar un <form>: se usa un botón suelto.
  return emailConocido ? (
    <div className="pila-sm reenviar-verificacion">{contenido}</div>
  ) : (
    <form className="pila-sm reenviar-verificacion" onSubmit={reenviar} noValidate>
      {contenido}
    </form>
  );
}
