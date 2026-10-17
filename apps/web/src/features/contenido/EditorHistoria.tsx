'use client';

import { useState } from 'react';

import { AreaTexto, Alerta, Boton, Campo, Chip, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { DetalleLectura, Nodo } from './tipos';

type NodoForm = Omit<Nodo, 'id'> & { id?: string };

/**
 * RF-029: historia ramificada. Cada nodo es un trozo de la historia; las decisiones llevan a otros
 * nodos. Antes de publicar se verifica: un inicio, sin ciclos y todo camino termina en un final.
 */
export function EditorHistoria({ detalle, onCambio }: { detalle: DetalleLectura; onCambio: (d: DetalleLectura) => void }) {
  const [nodos, setNodos] = useState<NodoForm[]>(detalle.nodos);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const editable = detalle.permisos.editar;
  const problemasGrafo = detalle.problemas.filter((p) => /historia|nodo|final|inicio|ciclo|llega/i.test(p));

  const cambiar = (i: number, n: NodoForm) => setNodos(nodos.map((x, j) => (j === i ? n : x)));
  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const d = await api<DetalleLectura>(`/backoffice/lecturas/${detalle.lecturaId}/grafo`, { metodo: 'PUT', cuerpo: { nodos } });
      onCambio(d);
      setNodos(d.nodos);
      setMensaje({ tipo: 'exito', texto: d.nodos.length ? 'Historia guardada.' : 'La lectura vuelve a ser lineal.' });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  if (!editable && nodos.length === 0) return null;
  return (
    <Tarjeta titulo={`Historia ramificada${nodos.length ? ` (${nodos.length} nodos)` : ''}`}>
      <p className="texto-suave">Opcional: el niño elige qué pasa. Si la dejas vacía, la lectura es lineal.</p>
      {problemasGrafo.length ? (
        <Alerta tipo="aviso">
          <ul className="lista-simple">
            {problemasGrafo.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alerta>
      ) : null}
      <fieldset className="grupo-opciones pila-sm" disabled={!editable}>
        <legend className="sr-only">Nodos de la historia</legend>
        {nodos.map((n, i) => (
          <article key={i} className="actividad">
            <div className="fila fila--entre">
              <h4>
                {n.clave || `Nodo ${i + 1}`} {n.esInicio ? <Chip tipo="info">Inicio</Chip> : null} {n.esFinal ? <Chip tipo="exito">Final</Chip> : null}
              </h4>
              {editable ? (
                <Boton variante="fantasma" tamano="pequeno" aria-label={`Quitar el nodo ${n.clave || i + 1}`} onClick={() => setNodos(nodos.filter((_, j) => j !== i))}>
                  Quitar
                </Boton>
              ) : null}
            </div>
            <Campo etiqueta="Nombre del nodo" ayuda="Corto y único, por ejemplo: cueva" value={n.clave} maxLength={40} onChange={(e) => cambiar(i, { ...n, clave: e.target.value })} />
            <AreaTexto etiqueta="Texto de este momento" value={n.contenido} rows={3} maxLength={2000} onChange={(e) => cambiar(i, { ...n, contenido: e.target.value })} />
            <div className="casillas-en-fila">
              <label className="casilla">
                <input type="radio" name="inicio-historia" checked={n.esInicio} onChange={() => setNodos(nodos.map((x, j) => ({ ...x, esInicio: j === i })))} />
                <span>Es el inicio</span>
              </label>
              <label className="casilla">
                <input type="checkbox" checked={n.esFinal} onChange={(e) => cambiar(i, { ...n, esFinal: e.target.checked, opciones: e.target.checked ? [] : n.opciones })} />
                <span>Es un final</span>
              </label>
            </div>
            {!n.esFinal ? (
              <div className="pila-sm">
                {n.opciones.map((o, k) => (
                  <div key={k} className="form-columnas">
                    <Campo etiqueta={`Decisión ${k + 1}`} value={o.texto} maxLength={120} onChange={(e) => cambiar(i, { ...n, opciones: n.opciones.map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)) })} />
                    <Selector
                      etiqueta="Lleva a"
                      value={o.destino}
                      onChange={(e) => cambiar(i, { ...n, opciones: n.opciones.map((x, j) => (j === k ? { ...x, destino: e.target.value } : x)) })}
                      opciones={[{ valor: '', texto: 'Elige un nodo…' }, ...nodos.filter((x) => x.clave && x.clave !== n.clave).map((x) => ({ valor: x.clave, texto: x.clave }))]}
                    />
                  </div>
                ))}
                {editable && n.opciones.length < 3 ? (
                  <div>
                    <Boton variante="fantasma" tamano="pequeno" onClick={() => cambiar(i, { ...n, opciones: [...n.opciones, { texto: '', destino: '' }] })}>
                      + Decisión
                    </Boton>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </fieldset>
      {editable ? (
        <div className="barra-guardar">
          {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}
          <div className="fila">
            <Boton variante="fantasma" tamano="pequeno" onClick={() => setNodos([...nodos, { clave: '', contenido: '', esInicio: nodos.length === 0, esFinal: false, opciones: [] }])}>
              + Nodo
            </Boton>
            <Boton cargando={guardando} onClick={guardar}>
              Guardar historia
            </Boton>
          </div>
        </div>
      ) : null}
    </Tarjeta>
  );
}
