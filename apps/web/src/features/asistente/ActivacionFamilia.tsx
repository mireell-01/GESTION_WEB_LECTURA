'use client';

import { useEffect, useState } from 'react';

import { Alerta, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { ActivacionEstudiante, QUE_HACE_EL_ASISTENTE } from './tipos';

/**
 * RF-072: la familia que creó el perfil activa (o no) el asistente de lectura de su hijo; activarlo es
 * su consentimiento (ADR-008). Si lo acompaña por invitación de su docente, decide la docente.
 */
export function ActivacionFamilia({ estudianteId, alias, responsable }: { estudianteId: string; alias: string; responsable: boolean }) {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!responsable) return;
    api<ActivacionEstudiante>(`/familia/estudiantes/${estudianteId}/asistente`)
      .then((a) => setActivo(a.activo))
      .catch((err) => setEstado({ tipo: 'error', texto: mensajeDeError(err) }));
  }, [estudianteId, responsable]);

  const cambiar = async (nuevo: boolean) => {
    setGuardando(true);
    setEstado(null);
    setActivo(nuevo);
    try {
      await api(`/familia/estudiantes/${estudianteId}/asistente`, { metodo: 'PUT', cuerpo: { activo: nuevo } });
      setEstado({ tipo: 'exito', texto: nuevo ? `Listo: ${alias} ya puede pedir ayuda en sus lecturas.` : 'Listo: el asistente quedó desactivado.' });
    } catch (err) {
      setActivo(!nuevo);
      setEstado({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta
      aria-label="Asistente de lectura"
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="brujula" tamano={26} />
          Asistente de lectura
        </span>
      }
    >
      <div className="pila-sm">
        <p className="texto-suave" style={{ margin: 0 }}>
          {QUE_HACE_EL_ASISTENTE}
        </p>
        {!responsable ? (
          <p style={{ margin: 0 }}>Lo activa su docente para su aula.</p>
        ) : activo !== null ? (
          <label className="casilla">
            <input type="checkbox" checked={activo} disabled={guardando} onChange={(e) => void cambiar(e.target.checked)} />
            <span>Activar el asistente de lectura para {alias}</span>
          </label>
        ) : null}
        {estado ? <Alerta tipo={estado.tipo}>{estado.texto}</Alerta> : null}
      </div>
    </Tarjeta>
  );
}
