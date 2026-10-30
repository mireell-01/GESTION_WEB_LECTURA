'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alerta, AreaTexto, Boton, Cargando, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import type { BorradorRetroalimentacion } from '@/features/asistente/tipos';
import { api, mensajeDeError } from '@/shared/api/client';

import { HABILIDAD, RespuestaAbierta, RUBRICA } from './tipos';

type Vista = 'PENDIENTE_REVISION' | 'VALORADA';

/** Una respuesta con su rúbrica: nivel 1–3 y un comentario opcional. */
function FilaRespuesta({ r, onValorada }: { r: RespuestaAbierta; onValorada: (r: RespuestaAbierta) => void }) {
  const [nivel, setNivel] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerido, setSugerido] = useState(false);
  const idComentario = `comentario-${r.respuestaId}`;

  // El comentario crece con su texto: un borrador se lee completo, también en el celular.
  useEffect(() => {
    const area = document.getElementById(idComentario);
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
  }, [comentario, idComentario]);

  /** RF-075 (Módulo 11): un borrador del asistente para editar; nunca se guarda solo. */
  const sugerir = async () => {
    setSugiriendo(true);
    setError(null);
    try {
      setComentario((await api<BorradorRetroalimentacion>(`/respuestas/${r.respuestaId}/borrador-retroalimentacion`)).borrador);
      setSugerido(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setSugiriendo(false);
    }
  };

  const guardar = async () => {
    if (!nivel) return;
    setGuardando(true);
    setError(null);
    try {
      onValorada(await api<RespuestaAbierta>(`/respuestas/${r.respuestaId}/valoracion`, { metodo: 'POST', cuerpo: { nivel, ...(comentario.trim() ? { comentario: comentario.trim() } : {}) } }));
    } catch (err) {
      setError(mensajeDeError(err));
      setGuardando(false);
    }
  };

  const valorada = r.valoracion ? RUBRICA.find((x) => x.nivel === r.valoracion?.nivel) : null;
  return (
    <li className="revision__fila" aria-label={`Respuesta de ${r.estudiante.alias}`}>
      <div className="fila fila--entre">
        <span className="reevaluacion__nombre">{r.estudiante.alias}</span>
        <span className="fila fila--compacta">
          <Chip>{HABILIDAD[r.pregunta.habilidad] ?? r.pregunta.habilidad}</Chip>
          {r.porVoz ? <Chip tipo="info">Dictada</Chip> : null}
        </span>
      </div>
      <p className="texto-suave">{r.lectura.titulo}</p>
      {r.defiende ? (
        <p className="texto-suave">
          Defiende su respuesta a «{r.defiende.enunciado}»: {r.defiende.respuesta}
        </p>
      ) : null}
      <p className="revision__pregunta">{r.pregunta.enunciado}</p>
      <blockquote className="revision__respuesta">{r.respuesta}</blockquote>
      {r.justificacion ? <p className="texto-suave">Su defensa: {r.justificacion}</p> : null}

      {valorada ? (
        <p className="fila fila--compacta">
          <Chip tipo="exito">
            Nivel {valorada.nivel}: {valorada.nombre}
          </Chip>
          {r.valoracion?.comentario ? <span>{r.valoracion.comentario}</span> : null}
        </p>
      ) : (
        <div className="pila-sm">
          <fieldset className="rubrica">
            <legend className="la-campo__etiqueta">Rúbrica</legend>
            {RUBRICA.map((x) => (
              <label key={x.nivel} className="rubrica__nivel">
                <input type="radio" name={`rubrica-${r.respuestaId}`} checked={nivel === x.nivel} onChange={() => setNivel(x.nivel)} />
                <span>
                  <strong>
                    {x.nivel} · {x.nombre}
                  </strong>
                  <span className="texto-suave"> — {x.descripcion}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <AreaTexto
            id={idComentario}
            etiqueta="Comentario para el estudiante (opcional)"
            value={comentario}
            rows={2}
            maxLength={300}
            onChange={(e) => setComentario(e.target.value)}
          />
          <div className="fila">
            <Boton variante="fantasma" tamano="pequeno" cargando={sugiriendo} onClick={sugerir}>
              <Icono nombre="brujula" tamano={18} />
              Sugerir un comentario
            </Boton>
            {sugerido ? <span className="texto-suave">Es un borrador: revísalo y cámbialo. El estudiante solo verá lo que guardes.</span> : null}
          </div>
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          <div>
            <Boton variante="secundario" disabled={!nivel} cargando={guardando} onClick={guardar}>
              Guardar valoración
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * RF-051: las respuestas abiertas (escritas o dictadas) del aula, para valorarlas con una rúbrica de
 * 3 niveles. La valoración actualiza la maestría de argumentación y pensamiento crítico (RN-19).
 */
export function RespuestasAbiertasAula({ aulaId }: { aulaId: string }) {
  const [vista, setVista] = useState<Vista>('PENDIENTE_REVISION');
  const [lista, setLista] = useState<RespuestaAbierta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLista(null);
    setError(null);
    try {
      setLista(await api<RespuestaAbierta[]>(`/aulas/${aulaId}/respuestas-abiertas?estado=${vista}`));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, [aulaId, vista]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <Tarjeta
      aria-labelledby="respuestas-abiertas-titulo"
      titulo={
        <span className="titulo-con-icono" id="respuestas-abiertas-titulo">
          <Icono nombre="libro" tamano={28} />
          Respuestas por revisar
        </span>
      }
    >
      <p className="texto-suave">Lo que tus estudiantes escribieron o dictaron en sus lecturas. Valóralo con la rúbrica: así se actualiza su avance en argumentación y pensamiento crítico.</p>
      <div className="fila fila--compacta" role="group" aria-label="Qué respuestas ver">
        {(
          [
            ['PENDIENTE_REVISION', 'Por revisar'],
            ['VALORADA', 'Valoradas'],
          ] as const
        ).map(([valor, texto]) => (
          <Boton
            key={valor}
            variante={vista === valor ? 'primario' : 'fantasma'}
            tamano="pequeno"
            aria-pressed={vista === valor}
            onClick={() => {
              setAviso(null);
              setVista(valor);
            }}
          >
            {texto}
          </Boton>
        ))}
      </div>
      {aviso ? <Alerta tipo="exito">{aviso}</Alerta> : null}
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!lista ? (
        error ? null : <Cargando />
      ) : lista.length === 0 ? (
        <Alerta tipo="info">{vista === 'PENDIENTE_REVISION' ? 'No hay respuestas por revisar.' : 'Aún no valoraste respuestas.'}</Alerta>
      ) : (
        <ul className="revision" aria-label={vista === 'PENDIENTE_REVISION' ? 'Respuestas por revisar' : 'Respuestas valoradas'}>
          {lista.map((r) => (
            <FilaRespuesta
              key={r.respuestaId}
              r={r}
              onValorada={(v) => {
                setAviso(`Valoración guardada para ${v.estudiante.alias}.`);
                setLista((actual) => (actual ?? []).filter((x) => x.respuestaId !== v.respuestaId));
              }}
            />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
