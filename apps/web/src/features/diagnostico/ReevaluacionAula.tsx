'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Cargando, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { HABILIDAD_CORTA, ORDEN, ReevaluacionEstudiante } from './tipos';

const ESTADO: Record<string, { texto: string; chip?: 'info' | 'aviso' | 'exito' }> = {
  SIN_EMPEZAR: { texto: 'Sin empezar' },
  NO_INICIADO: { texto: 'Por empezar', chip: 'info' },
  EN_CURSO: { texto: 'En curso', chip: 'aviso' },
  PAUSADO: { texto: 'Pausado', chip: 'aviso' },
  FINALIZADO: { texto: 'Terminado', chip: 'exito' },
};

/**
 * RF-037: la docente asigna un reto de repaso (reevaluación) con ítems equivalentes y compara, por
 * habilidad, el resultado con el reto inicial de cada estudiante.
 */
export function ReevaluacionAula({ aulaId, editable }: { aulaId: string; editable: boolean }) {
  const [lista, setLista] = useState<ReevaluacionEstudiante[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [asignando, setAsignando] = useState(false);

  const cargar = useCallback(async () => setLista(await api<ReevaluacionEstudiante[]>(`/aulas/${aulaId}/reevaluaciones`)), [aulaId]);

  useEffect(() => {
    cargar().catch((err) => setError(mensajeDeError(err)));
  }, [cargar]);

  const asignar = async () => {
    setError(null);
    setAviso(null);
    setAsignando(true);
    try {
      const r = await api<{ asignados: number; omitidos: { alias: string; motivo: string }[] }>(`/aulas/${aulaId}/reevaluaciones`, { metodo: 'POST', cuerpo: {} });
      const omitidos = r.omitidos.map((o) => `${o.alias} (${o.motivo.toLowerCase()})`).join(', ');
      setAviso(`Reto de repaso asignado a ${r.asignados} ${r.asignados === 1 ? 'estudiante' : 'estudiantes'}.${omitidos ? ` No se asignó a: ${omitidos}.` : ''}`);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setAsignando(false);
    }
  };

  return (
    <Tarjeta
      aria-labelledby="reto-repaso-titulo"
      titulo={
        <span className="titulo-con-icono" id="reto-repaso-titulo">
          <Icono nombre="progreso" tamano={28} />
          Reto de repaso
        </span>
      }
    >
      <p className="texto-suave">
        Cada estudiante hizo un reto inicial al entrar. El reto de repaso tiene preguntas equivalentes, así puedes comparar cuánto avanzó en cada habilidad.
      </p>
      {editable ? (
        <div>
          <Boton variante="secundario" cargando={asignando} onClick={asignar}>
            Asignar reto de repaso a toda el aula
          </Boton>
        </div>
      ) : null}
      {aviso ? <Alerta tipo="exito">{aviso}</Alerta> : null}
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!lista ? (
        error ? null : <Cargando />
      ) : lista.length === 0 ? (
        <Alerta tipo="info">Aún no hay estudiantes en esta aula.</Alerta>
      ) : (
        <ul className="reevaluacion" aria-label="Retos de los estudiantes">
          {lista.map((e) => {
            const inicial = ESTADO[e.inicial.estado] ?? ESTADO.SIN_EMPEZAR!;
            const repaso = e.reevaluacion ? ESTADO[e.reevaluacion.estado] : null;
            return (
              <li key={e.estudianteId} className="reevaluacion__fila">
                <span className="reevaluacion__nombre">{e.alias}</span>
                <span className="fila fila--compacta">
                  <Chip tipo={inicial.chip}>Inicial: {inicial.texto}</Chip>
                  {e.reevaluacion && repaso ? (
                    <Chip tipo={repaso.chip}>
                      Repaso: {repaso.texto}
                      {e.reevaluacion.estado === 'EN_CURSO' || e.reevaluacion.estado === 'PAUSADO' ? ` (${e.reevaluacion.respondidos} de ${e.reevaluacion.total})` : ''}
                    </Chip>
                  ) : null}
                </span>
                {e.cambios ? (
                  <span className="reevaluacion__cambios" aria-label={`Cambios de ${e.alias} desde el reto inicial`}>
                    {ORDEN.map((h) => {
                      const d = e.cambios![h];
                      return (
                        <Chip key={h} tipo={d > 0 ? 'exito' : d < 0 ? 'aviso' : undefined}>
                          {HABILIDAD_CORTA[h]} {d > 0 ? `+${d}` : d}
                        </Chip>
                      );
                    })}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
