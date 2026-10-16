'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Alerta, Cargando, clasesBoton, Tarjeta } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError } from '@/shared/api/client';

import { ReenviarVerificacion } from './ReenviarVerificacion';

type Resultado =
  | { tipo: 'cargando' }
  | { tipo: 'VERIFICADA' | 'YA_VERIFICADA' }
  | { tipo: 'VENCIDO' | 'REEMPLAZADO' | 'INVALIDO' | 'ERROR'; mensaje: string };

const TITULOS: Record<Exclude<Resultado['tipo'], 'cargando'>, string> = {
  VERIFICADA: '¡Correo verificado! 🎉',
  YA_VERIFICADA: 'Tu correo ya estaba verificado',
  VENCIDO: 'Este enlace venció',
  REEMPLAZADO: 'Este enlace ya no sirve',
  INVALIDO: 'No pudimos verificar',
  ERROR: 'No pudimos verificar',
};

/**
 * RF-002: canjea el enlace de verificación de un solo uso y explica cada caso con claridad:
 * verificado, ya estaba verificado, vencido, reemplazado por uno más nuevo o inválido. Si el
 * enlace no sirve, permite pedir otro allí mismo.
 */
export function VerificarCorreo() {
  const codigo = useSearchParams().get('codigo');
  const [resultado, setResultado] = useState<Resultado>({ tipo: 'cargando' });
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    if (!codigo) {
      setResultado({ tipo: 'INVALIDO', mensaje: 'El enlace está incompleto. Copia el enlace completo del correo o pide uno nuevo.' });
      return;
    }
    api<{ ok: true; estado: 'VERIFICADA' | 'YA_VERIFICADA' }>('/auth/verificar-correo', { metodo: 'POST', cuerpo: { codigo } })
      .then((r) => setResultado({ tipo: r.estado }))
      .catch((err) => {
        const motivo = err instanceof ErrorApi ? err.detalle?.['motivo'] : undefined;
        const tipo = motivo === 'VENCIDO' || motivo === 'REEMPLAZADO' || motivo === 'INVALIDO' ? motivo : 'ERROR';
        setResultado({ tipo, mensaje: mensajeDeError(err) });
      });
  }, [codigo]);

  if (resultado.tipo === 'cargando') return <Cargando texto="Verificando tu correo…" />;

  const verificada = !('mensaje' in resultado);
  return (
    <Tarjeta titulo={TITULOS[resultado.tipo]} nivel={1}>
      {!('mensaje' in resultado) ? (
        <p>
          {resultado.tipo === 'VERIFICADA'
            ? 'Tu cuenta ya está activa. Ahora puedes ingresar.'
            : 'No hace falta hacer nada más: ingresa con tu correo y tu contraseña.'}
        </p>
      ) : (
        <div className="pila-sm">
          <Alerta tipo={resultado.tipo === 'ERROR' ? 'error' : 'aviso'}>{resultado.mensaje}</Alerta>
          <p className="texto-suave" style={{ margin: 0 }}>
            Escribe tu correo y te enviaremos un enlace nuevo:
          </p>
          <ReenviarVerificacion />
        </div>
      )}
      <Link href="/ingresar" className={clasesBoton(verificada ? 'primario' : 'fantasma', { bloque: true })} style={{ marginTop: 'var(--la-espacio-3)' }}>
        Ir a ingresar
      </Link>
    </Tarjeta>
  );
}
