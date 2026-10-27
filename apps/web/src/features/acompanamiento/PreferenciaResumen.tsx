'use client';

import { useEffect, useState } from 'react';

import { Alerta, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { PreferenciasFamilia } from './tipos';

/** RF-070: recibir o no el resumen semanal por correo (domingos a las 18:00). */
export function PreferenciaResumen() {
  const [prefs, setPrefs] = useState<PreferenciasFamilia | null>(null);
  const [estado, setEstado] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<PreferenciasFamilia>('/familia/preferencias-notificacion')
      .then(setPrefs)
      .catch((err) => setEstado({ tipo: 'error', texto: mensajeDeError(err) }));
  }, []);

  /** La casilla cambia al instante; si no se pudo guardar, vuelve a como estaba. */
  const cambiar = async (resumenSemanal: boolean) => {
    setGuardando(true);
    setEstado(null);
    setPrefs({ resumenSemanal });
    try {
      setPrefs(await api<PreferenciasFamilia>('/familia/preferencias-notificacion', { metodo: 'PATCH', cuerpo: { resumenSemanal } }));
      setEstado({ tipo: 'exito', texto: resumenSemanal ? 'Listo: recibirás el resumen cada domingo.' : 'Listo: ya no recibirás el resumen semanal.' });
    } catch (err) {
      setPrefs({ resumenSemanal: !resumenSemanal });
      setEstado({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="reloj" tamano={28} />
          Resumen semanal por correo
        </span>
      }
    >
      <div className="pila-sm">
        <p className="texto-suave" style={{ margin: 0 }}>
          Cada domingo a las 6:00 p. m. te enviamos cuánto leyeron tus hijos en la semana y una idea para acompañarlos en casa.
        </p>
        {prefs ? (
          <label className="casilla">
            <input type="checkbox" checked={prefs.resumenSemanal} disabled={guardando} onChange={(e) => void cambiar(e.target.checked)} />
            <span>Recibir el resumen semanal</span>
          </label>
        ) : null}
        {estado ? <Alerta tipo={estado.tipo}>{estado.texto}</Alerta> : null}
      </div>
    </Tarjeta>
  );
}
