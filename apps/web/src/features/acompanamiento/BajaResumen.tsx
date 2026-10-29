'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Alerta, Boton, Cargando, clasesBoton, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

type Estado = { tipo: 'cargando' } | { tipo: 'baja' | 'alta' } | { tipo: 'error'; mensaje: string };

/**
 * RF-070: baja con un clic. El enlace del correo abre esta página y la baja se hace al instante (con un
 * POST: un enlace que solo se visita no cambia nada). Desde aquí mismo se puede deshacer.
 */
export function BajaResumen() {
  const token = useSearchParams().get('token') ?? '';
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [ocupado, setOcupado] = useState(false);
  const enviado = useRef(false);

  const cambiar = async (accion: 'baja' | 'alta') => {
    setOcupado(true);
    try {
      await api(`/familia/preferencias-notificacion/${accion}`, { metodo: 'POST', cuerpo: { token } });
      setEstado({ tipo: accion });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: mensajeDeError(err) });
    } finally {
      setOcupado(false);
    }
  };

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    if (!token) {
      setEstado({ tipo: 'error', mensaje: 'El enlace está incompleto. Copia el enlace completo del correo o cambia esta opción desde tu panel de familia.' });
      return;
    }
    // Solo al abrir la página.
    void cambiar('baja');
  }, []);

  if (estado.tipo === 'cargando') return <Cargando texto="Dándote de baja…" />;
  if (estado.tipo === 'error') {
    return (
      <Tarjeta titulo="No pudimos cambiar tu suscripción" nivel={1}>
        <div className="pila-sm">
          <Alerta tipo="error">{estado.mensaje}</Alerta>
          <Link href="/ingresar" className={clasesBoton('primario')}>
            Ir a mi panel
          </Link>
        </div>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo={estado.tipo === 'baja' ? 'Ya no recibirás el resumen semanal' : 'Volverás a recibir el resumen semanal'} nivel={1}>
      <div className="pila-sm">
        <p style={{ margin: 0 }}>
          {estado.tipo === 'baja'
            ? 'Listo. Puedes seguir viendo cómo leen tus hijos cuando quieras desde tu panel de familia.'
            : 'Listo. Te llegará cada domingo a las 6:00 p. m.'}
        </p>
        <div className="fila">
          {estado.tipo === 'baja' ? (
            <Boton variante="secundario" cargando={ocupado} onClick={() => void cambiar('alta')}>
              Me equivoqué: quiero seguir recibiéndolo
            </Boton>
          ) : null}
          <Link href="/ingresar" className={clasesBoton(estado.tipo === 'baja' ? 'fantasma' : 'primario')}>
            Ir a mi panel
          </Link>
        </div>
      </div>
    </Tarjeta>
  );
}
