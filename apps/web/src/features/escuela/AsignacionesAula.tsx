'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Chip, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import {
  Asignacion,
  ContenidoAsignable,
  diaEnPalabras,
  ESTADO_ASIGNACION,
  EstudianteAula,
  hoyEnLima,
  TipoAsignacion,
} from './tipos';

/** RF-018: nueva asignación con fecha límite, para toda el aula o para estudiantes elegidos. */
function FormularioAsignacion({
  aulaId,
  estudiantes,
  onCreada,
  onCancelar,
}: {
  aulaId: string;
  estudiantes: EstudianteAula[];
  onCreada: () => void;
  onCancelar: () => void;
}) {
  const [catalogo, setCatalogo] = useState<{ lecturas: ContenidoAsignable[]; misiones: ContenidoAsignable[] } | null>(null);
  const [tipo, setTipo] = useState<TipoAsignacion>('LECTURA');
  const [contenidoId, setContenidoId] = useState('');
  const [paraTodos, setParaTodos] = useState(true);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [inicio, setInicio] = useState(hoyEnLima());
  const [limite, setLimite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ lecturas: ContenidoAsignable[]; misiones: ContenidoAsignable[] }>(`/aulas/${aulaId}/asignaciones/catalogo`)
      .then(setCatalogo)
      .catch((err) => setError(mensajeDeError(err)));
  }, [aulaId]);

  const opciones = catalogo ? (tipo === 'LECTURA' ? catalogo.lecturas : catalogo.misiones) : [];

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api(`/aulas/${aulaId}/asignaciones`, {
        metodo: 'POST',
        cuerpo: { tipo, contenidoId, fechaInicio: inicio, fechaLimite: limite, estudianteIds: paraTodos ? [] : [...elegidos] },
      });
      onCreada();
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  if (!catalogo) return error ? <Alerta tipo="error">{error}</Alerta> : <Cargando />;
  if (catalogo.lecturas.length + catalogo.misiones.length === 0) {
    return (
      <div className="pila-sm">
        <Alerta tipo="info">
          Aún no hay lecturas ni misiones publicadas para asignar. Aparecerán aquí cuando el equipo de contenidos las publique en la
          biblioteca.
        </Alerta>
        <div>
          <Boton variante="fantasma" tamano="pequeno" onClick={onCancelar}>
            Volver
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="pila-sm formulario-asignacion" aria-label="Nueva asignación">
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <div className="selector-modo" role="group" aria-label="Qué vas a asignar">
        {(['LECTURA', 'MISION'] as const).map((t) => (
          <Boton
            key={t}
            tamano="pequeno"
            variante={tipo === t ? 'primario' : 'fantasma'}
            aria-pressed={tipo === t}
            onClick={() => {
              setTipo(t);
              setContenidoId('');
            }}
          >
            {t === 'LECTURA' ? 'Una lectura' : 'Una misión'}
          </Boton>
        ))}
      </div>
      {opciones.length === 0 ? (
        <Alerta tipo="info">{tipo === 'LECTURA' ? 'Aún no hay lecturas publicadas.' : 'Aún no hay misiones publicadas.'}</Alerta>
      ) : (
        <Selector
          etiqueta={tipo === 'LECTURA' ? 'Lectura' : 'Misión'}
          value={contenidoId}
          required
          onChange={(e) => setContenidoId(e.target.value)}
          opciones={[{ valor: '', texto: 'Elige una…' }, ...opciones.map((c) => ({ valor: c.id, texto: `${c.titulo} — ${c.detalle}` }))]}
        />
      )}

      <fieldset className="grupo-opciones">
        <legend className="la-campo__etiqueta">¿Para quiénes?</legend>
        <label className="casilla">
          <input type="radio" name="destino" checked={paraTodos} onChange={() => setParaTodos(true)} />
          <span>Toda el aula</span>
        </label>
        <label className="casilla">
          <input type="radio" name="destino" checked={!paraTodos} onChange={() => setParaTodos(false)} />
          <span>Solo algunos estudiantes</span>
        </label>
        {!paraTodos ? (
          <div className="destinatarios">
            {estudiantes.map((s) => (
              <label key={s.id} className="casilla">
                <input
                  type="checkbox"
                  checked={elegidos.has(s.id)}
                  onChange={() => {
                    const nuevo = new Set(elegidos);
                    if (nuevo.has(s.id)) nuevo.delete(s.id);
                    else nuevo.add(s.id);
                    setElegidos(nuevo);
                  }}
                />
                <span>{s.alias}</span>
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <div className="form-columnas">
        <Campo etiqueta="Empieza" type="date" value={inicio} min={hoyEnLima()} required onChange={(e) => setInicio(e.target.value)} />
        <Campo etiqueta="Fecha límite" type="date" value={limite} min={inicio} required onChange={(e) => setLimite(e.target.value)} />
      </div>
      <div className="fila">
        <Boton type="submit" cargando={enviando} disabled={!contenidoId || !limite || (!paraTodos && elegidos.size === 0)}>
          Asignar
        </Boton>
        <Boton variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** RF-018: asignaciones del aula, en curso primero. Cerrarlas las quita de la aventura de los niños. */
export function AsignacionesAula({ aulaId, estudiantes, editable }: { aulaId: string; estudiantes: EstudianteAula[]; editable: boolean }) {
  const [asignaciones, setAsignaciones] = useState<Asignacion[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setAsignaciones(await api<Asignacion[]>(`/aulas/${aulaId}/asignaciones`));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, [aulaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cerrar = async (a: Asignacion) => {
    setCerrando(a.id);
    setError(null);
    try {
      await api(`/aulas/${aulaId}/asignaciones/${a.id}/cerrar`, { metodo: 'POST' });
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCerrando(null);
    }
  };

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="libro" tamano={28} />
          Asignaciones
        </span>
      }
      acciones={
        editable && !creando ? (
          <Boton tamano="pequeno" onClick={() => setCreando(true)} disabled={estudiantes.length === 0}>
            + Nueva asignación
          </Boton>
        ) : null
      }
    >
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {creando ? (
        <FormularioAsignacion
          aulaId={aulaId}
          estudiantes={estudiantes}
          onCancelar={() => setCreando(false)}
          onCreada={() => {
            setCreando(false);
            void cargar();
          }}
        />
      ) : null}
      {!asignaciones ? (
        error ? null : <Cargando />
      ) : asignaciones.length === 0 ? (
        creando ? null : (
          <p className="texto-suave">
            Asigna una lectura o una misión con fecha límite: tus estudiantes la verán en su aventura como “Misión del docente”.
          </p>
        )
      ) : (
        <ul className="asignaciones">
          {asignaciones.map((a) => {
            const estado = ESTADO_ASIGNACION[a.estado];
            const abierta = a.estado === 'ACTIVA' || a.estado === 'PROGRAMADA';
            return (
              <li key={a.id} className="asignacion">
                <span className={`asignacion__icono asignacion__icono--${a.tipo.toLowerCase()}`}>
                  <Icono nombre={a.tipo === 'LECTURA' ? 'libro' : 'brujula'} tamano={26} />
                </span>
                <span className="asignacion__datos">
                  <strong>{a.titulo}</strong>
                  <span className="texto-suave">
                    {a.tipo === 'LECTURA' ? 'Lectura' : 'Misión'} ·{' '}
                    {a.paraTodaElAula ? 'Toda el aula' : `Para ${a.estudiantes.map((s) => s.alias).join(', ')}`}
                  </span>
                  <span className="fila fila--compacta">
                    <Chip tipo={estado.tipo}>{estado.texto}</Chip>
                    <span className="texto-suave asignacion__fecha">
                      <Icono nombre="reloj" tamano={18} />
                      {a.estado === 'PROGRAMADA' ? `Desde el ${diaEnPalabras(a.fechaInicio)} · ` : ''}
                      Hasta el {diaEnPalabras(a.fechaLimite)}
                    </span>
                  </span>
                </span>
                {editable && abierta ? (
                  <Boton
                    variante="fantasma"
                    tamano="pequeno"
                    cargando={cerrando === a.id}
                    aria-label={`Cerrar la asignación ${a.titulo}`}
                    onClick={() => cerrar(a)}
                  >
                    Cerrar
                  </Boton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
