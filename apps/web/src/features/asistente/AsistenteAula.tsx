'use client';

import { useEffect, useState } from 'react';

import { Alerta, AVATARES, Boton, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { ActivacionAula, QUE_HACE_EL_ASISTENTE } from './tipos';

/**
 * RF-072: la docente activa el asistente de lectura para todo el aula o para algunos estudiantes
 * (consentimiento institucional, RF-015). En un aula archivada solo se consulta.
 */
export function AsistenteAula({ aulaId, editable }: { aulaId: string; editable: boolean }) {
  const [aula, setAula] = useState<ActivacionAula | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<ActivacionAula>(`/aulas/${aulaId}/asistente`)
      .then(setAula)
      .catch((err) => setError(mensajeDeError(err)));
  }, [aulaId]);

  /** La lista cambia al instante; si no se pudo guardar, vuelve a como estaba. */
  const cambiar = async (activo: boolean, estudianteIds?: string[]) => {
    const antes = aula;
    setGuardando(true);
    setError(null);
    setAula((a) => (a ? { ...a, estudiantes: a.estudiantes.map((e) => (!estudianteIds || estudianteIds.includes(e.estudianteId) ? { ...e, activo } : e)) } : a));
    try {
      setAula(await api<ActivacionAula>(`/aulas/${aulaId}/asistente`, { metodo: 'PUT', cuerpo: { activo, ...(estudianteIds ? { estudianteIds } : {}) } }));
    } catch (err) {
      setAula(antes);
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const activos = aula?.estudiantes.filter((e) => e.activo).length ?? 0;
  const total = aula?.estudiantes.length ?? 0;
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
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {aula ? (
          total === 0 ? (
            <p className="texto-suave">Matricula estudiantes para activar el asistente.</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                <b>
                  Activado para {activos} de {total}
                </b>{' '}
                {total === 1 ? 'estudiante' : 'estudiantes'}.
              </p>
              {editable ? (
                <div className="fila">
                  <Boton tamano="pequeno" variante="secundario" disabled={activos === total} cargando={guardando} onClick={() => void cambiar(true)}>
                    Activar para todos
                  </Boton>
                  <Boton tamano="pequeno" variante="fantasma" disabled={activos === 0 || guardando} onClick={() => void cambiar(false)}>
                    Desactivar para todos
                  </Boton>
                </div>
              ) : null}
              <details className="asistente-aula__lista">
                <summary>Elegir estudiantes</summary>
                <ul className="asistente-aula__estudiantes" aria-label="Asistente por estudiante">
                  {aula.estudiantes.map((e) => (
                    <li key={e.estudianteId}>
                      <label className="casilla">
                        <input type="checkbox" checked={e.activo} disabled={!editable || guardando} onChange={(ev) => void cambiar(ev.target.checked, [e.estudianteId])} />
                        <span>
                          <span aria-hidden="true">{AVATARES[e.avatar]?.emoji ?? '🙂'} </span>
                          {e.alias}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )
        ) : null}
      </div>
    </Tarjeta>
  );
}
