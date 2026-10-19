'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

import { Alerta, AreaTexto, Boton, Campo, Cargando, Chip, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';
import { useSesion } from '@/shared/auth/sesion';

import { EDADES, FichaLectura, HABILIDADES, MisionBackoffice, MundoBackoffice, RangoEdad } from './tipos';

const MINIMO_POR_MUNDO = 3; // RN-09: hacen falta 3 misiones completadas para pasar de mundo
const cuantas = (n: number) => `${n} ${n === 1 ? 'misión' : 'misiones'}`;

interface Borrador {
  id: string | null;
  titulo: string;
  descripcion: string;
  lecturas: { id: string; titulo: string }[];
}

/**
 * Backoffice de misiones (RF-032): el editor arma el recorrido de cada mundo para cada edad con
 * lecturas publicadas de esa edad y las ordena; el revisor lo consulta.
 */
export function MisionesBackoffice() {
  const { usuario } = useSesion();
  const esEditor = usuario?.rol === 'EDITOR';
  const [mundos, setMundos] = useState<MundoBackoffice[] | null>(null);
  const [mundoId, setMundoId] = useState('');
  const [edad, setEdad] = useState<RangoEdad>('R2');
  const [misiones, setMisiones] = useState<MisionBackoffice[] | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargarMundos = useCallback(async () => {
    const lista = await api<MundoBackoffice[]>('/backoffice/mundos');
    setMundos(lista);
    setMundoId((actual) => actual || lista[0]?.id || '');
  }, []);

  useEffect(() => {
    cargarMundos().catch((err) => setError(mensajeDeError(err)));
  }, [cargarMundos]);

  useEffect(() => {
    if (!mundoId) return;
    setMisiones(null);
    setBorrador(null);
    api<MisionBackoffice[]>(`/backoffice/mundos/${mundoId}/misiones?edad=${edad}`)
      .then(setMisiones)
      .catch((err) => setError(mensajeDeError(err)));
  }, [mundoId, edad]);

  const mundo = mundos?.find((m) => m.id === mundoId);

  const ejecutar = async (accion: () => Promise<void>, exito: string) => {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      await accion();
      setAviso(exito);
      await cargarMundos();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const mover = (indice: number, delta: -1 | 1) => {
    if (!misiones) return;
    const ids = misiones.map((m) => m.id);
    const [movida] = ids.splice(indice, 1);
    ids.splice(indice + delta, 0, movida as string);
    return ejecutar(async () => {
      setMisiones(await api<MisionBackoffice[]>(`/backoffice/mundos/${mundoId}/orden`, { metodo: 'PUT', cuerpo: { rangoEdad: edad, misionIds: ids } }));
    }, 'Orden guardado.');
  };

  const guardar = (b: Borrador) =>
    ejecutar(async () => {
      const cuerpo = { titulo: b.titulo, descripcion: b.descripcion, lecturaIds: b.lecturas.map((l) => l.id) };
      if (b.id) {
        await api(`/backoffice/misiones/${b.id}`, { metodo: 'PUT', cuerpo });
      } else {
        await api(`/backoffice/mundos/${mundoId}/misiones`, { metodo: 'POST', cuerpo: { ...cuerpo, rangoEdad: edad } });
      }
      setBorrador(null);
      setMisiones(await api<MisionBackoffice[]>(`/backoffice/mundos/${mundoId}/misiones?edad=${edad}`));
    }, b.id ? 'Misión guardada.' : 'Misión creada.');

  return (
    <Tarjeta
      nivel={1}
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="globo" tamano={30} />
          Misiones
        </span>
      }
    >
      <p className="texto-suave">
        Cada mundo tiene sus misiones para cada edad. Una misión reúne lecturas publicadas de esa edad, en el orden en que el niño las encontrará.
      </p>
      {!mundos ? (
        error ? <Alerta tipo="error">{error}</Alerta> : <Cargando />
      ) : (
        <div className="pila">
          <div className="form-columnas">
            <Selector
              etiqueta="Mundo"
              value={mundoId}
              onChange={(e) => setMundoId(e.target.value)}
              opciones={mundos.map((m) => ({ valor: m.id, texto: `Mundo ${m.numero} · ${m.nombre}` }))}
            />
            <Selector
              etiqueta="Edad"
              value={edad}
              onChange={(e) => setEdad(e.target.value as RangoEdad)}
              opciones={(Object.keys(EDADES) as RangoEdad[]).map((r) => ({ valor: r, texto: `${EDADES[r]} (${cuantas(mundo?.misionesPorEdad[r] ?? 0)})` }))}
            />
          </div>
          {mundo ? (
            <p className="texto-suave">
              {mundo.descripcion} Habilidades foco: {mundo.habilidadesFoco.map((h) => HABILIDADES[h] ?? h).join(', ')}.
            </p>
          ) : null}
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          {aviso ? <Alerta tipo="exito">{aviso}</Alerta> : null}

          {!misiones ? (
            <Cargando />
          ) : (
            <>
              {misiones.length < MINIMO_POR_MUNDO ? (
                <Alerta tipo="aviso">
                  Este mundo tiene {cuantas(misiones.length)} para {EDADES[edad]}: los niños necesitan completar
                  al menos {MINIMO_POR_MUNDO} para pasar al mundo siguiente.
                </Alerta>
              ) : null}
              {misiones.length > 0 ? (
                <ol className="misiones-bo" aria-label="Misiones del mundo">
                  {misiones.map((m, i) => (
                    <li key={m.id} className="misiones-bo__item">
                      <div className="misiones-bo__cabecera">
                        <span className="mision__numero" aria-hidden="true">{m.orden}</span>
                        <h2>{m.titulo}</h2>
                      </div>
                      {m.descripcion ? <p className="texto-suave">{m.descripcion}</p> : null}
                      <ul className="lista-simple">
                        {m.lecturas.map((l) => (
                          <li key={l.id}>
                            {l.titulo} {l.publicada ? <Chip>Nivel {l.nivelDificultad}</Chip> : <Chip tipo="aviso">Retirada: quítala de la misión</Chip>}
                          </li>
                        ))}
                      </ul>
                      {esEditor ? (
                        <div className="fila fila--compacta">
                          <Boton variante="fantasma" tamano="pequeno" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${m.titulo}`}>
                            ↑ Subir
                          </Boton>
                          <Boton variante="fantasma" tamano="pequeno" disabled={ocupado || i === misiones.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar ${m.titulo}`}>
                            ↓ Bajar
                          </Boton>
                          <Boton
                            variante="secundario"
                            tamano="pequeno"
                            disabled={ocupado}
                            aria-label={`Editar ${m.titulo}`}
                            onClick={() => setBorrador({ id: m.id, titulo: m.titulo, descripcion: m.descripcion, lecturas: m.lecturas.map((l) => ({ id: l.id, titulo: l.titulo })) })}
                          >
                            Editar
                          </Boton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              {esEditor && !borrador ? (
                <div>
                  <Boton onClick={() => setBorrador({ id: null, titulo: '', descripcion: '', lecturas: [] })}>+ Nueva misión</Boton>
                </div>
              ) : null}
              {borrador ? <FormularioMision key={borrador.id ?? 'nueva'} inicial={borrador} edad={edad} ocupado={ocupado} alGuardar={guardar} alCancelar={() => setBorrador(null)} /> : null}
            </>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function FormularioMision({
  inicial,
  edad,
  ocupado,
  alGuardar,
  alCancelar,
}: {
  inicial: Borrador;
  edad: RangoEdad;
  ocupado: boolean;
  alGuardar: (b: Borrador) => void;
  alCancelar: () => void;
}) {
  const [b, setB] = useState(inicial);
  const [disponibles, setDisponibles] = useState<FichaLectura[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<FichaLectura[]>(`/backoffice/misiones/lecturas-disponibles?edad=${edad}`)
      .then(setDisponibles)
      .catch((err) => setError(mensajeDeError(err)));
  }, [edad]);

  const elegidas = new Set(b.lecturas.map((l) => l.id));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    alGuardar(b);
  };

  return (
    <form className="la-tarjeta pila" onSubmit={enviar} aria-label={b.id ? 'Editar misión' : 'Nueva misión'}>
      <h2>{b.id ? 'Editar misión' : `Nueva misión para ${EDADES[edad]}`}</h2>
      <Campo etiqueta="Título de la misión" value={b.titulo} maxLength={80} required onChange={(e) => setB({ ...b, titulo: e.target.value })} />
      <AreaTexto
        etiqueta="Descripción (opcional)"
        ayuda="Lo que el niño verá debajo del título. Hasta 300 caracteres."
        value={b.descripcion}
        maxLength={300}
        rows={2}
        onChange={(e) => setB({ ...b, descripcion: e.target.value })}
      />
      <fieldset className="grupo-opciones">
        <legend className="la-campo__etiqueta">Lecturas de la misión, en orden ({b.lecturas.length} de 10)</legend>
        {b.lecturas.length === 0 ? <p className="texto-suave">Agrega al menos una lectura de la lista de abajo.</p> : null}
        <ol className="lista-simple">
          {b.lecturas.map((l) => (
            <li key={l.id} className="mision-lectura">
              <span>{l.titulo}</span>
              <Boton variante="fantasma" tamano="pequeno" aria-label={`Quitar ${l.titulo}`} onClick={() => setB({ ...b, lecturas: b.lecturas.filter((x) => x.id !== l.id) })}>
                Quitar
              </Boton>
            </li>
          ))}
        </ol>
      </fieldset>
      <fieldset className="grupo-opciones">
        <legend className="la-campo__etiqueta">Lecturas publicadas para {EDADES[edad]}</legend>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {!disponibles ? (
          error ? null : <Cargando />
        ) : disponibles.filter((f) => !elegidas.has(f.id)).length === 0 ? (
          <p className="texto-suave">{disponibles.length === 0 ? 'Aún no hay lecturas publicadas para esta edad.' : 'Ya agregaste todas las lecturas de esta edad.'}</p>
        ) : (
          <ul className="lista-simple">
            {disponibles
              .filter((f) => !elegidas.has(f.id))
              .map((f) => (
                <li key={f.id} className="mision-lectura">
                  <span>
                    {f.titulo} <Chip>Nivel {f.nivelDificultad}</Chip> <Chip>{f.tematica}</Chip>
                  </span>
                  <Boton
                    variante="secundario"
                    tamano="pequeno"
                    disabled={b.lecturas.length >= 10}
                    aria-label={`Agregar ${f.titulo}`}
                    onClick={() => setB({ ...b, lecturas: [...b.lecturas, { id: f.id, titulo: f.titulo }] })}
                  >
                    Agregar
                  </Boton>
                </li>
              ))}
          </ul>
        )}
      </fieldset>
      <div className="fila">
        <Boton type="submit" cargando={ocupado} disabled={b.lecturas.length === 0}>
          {b.id ? 'Guardar misión' : 'Crear misión'}
        </Boton>
        <Boton variante="fantasma" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
