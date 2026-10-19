'use client';

import { useState } from 'react';

import { AreaTexto, Alerta, Boton, Campo, Chip, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import {
  Actividad,
  DetalleLectura,
  HABILIDADES,
  Modalidad,
  MODALIDADES,
  MODALIDADES_POR_TIPO,
  Momento,
  MOMENTOS,
  Oracion,
  TipoActividad,
  TIPOS_ACTIVIDAD,
} from './tipos';

interface ItemForm {
  id?: string;
  habilidad: string;
  nivelDificultad: number;
  modalidad: Modalidad;
  enunciado: string;
  opciones: string[];
  indiceCorrecto: number;
  elementos: string[];
  minPalabras: string;
  clavesEvidencia: string[];
  explicacionModelada: string;
  pistas: [string, string, string];
}

interface ActividadForm {
  id?: string;
  momento: Momento;
  tipo: TipoActividad;
  oracionAnclajeId: string;
  items: ItemForm[];
}

const ORDEN_MOMENTOS: Momento[] = ['ANTES', 'DURANTE', 'DESPUES'];
const recorte = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const itemNuevo = (tipo: TipoActividad): ItemForm => ({
  habilidad: 'LIT',
  nivelDificultad: 2,
  modalidad: MODALIDADES_POR_TIPO[tipo][0] as Modalidad,
  enunciado: '',
  opciones: ['', ''],
  indiceCorrecto: 0,
  elementos: ['', ''],
  minPalabras: '',
  clavesEvidencia: [],
  explicacionModelada: '',
  pistas: ['', '', ''],
});

function aFormulario(a: Actividad): ActividadForm {
  return {
    id: a.id,
    momento: a.momento,
    tipo: a.tipo,
    oracionAnclajeId: a.oracionAnclajeId ?? '',
    items: a.items.map((it) => ({
      id: it.id,
      habilidad: it.habilidad,
      nivelDificultad: it.nivelDificultad,
      modalidad: it.modalidad,
      enunciado: it.enunciado,
      opciones: it.contenido.opciones ?? ['', ''],
      indiceCorrecto: it.respuestaCorrecta && 'indice' in it.respuestaCorrecta ? it.respuestaCorrecta.indice : 0,
      elementos: it.contenido.elementos ?? ['', ''],
      minPalabras: it.contenido.minPalabras ? String(it.contenido.minPalabras) : '',
      clavesEvidencia: it.clavesEvidencia,
      explicacionModelada: it.explicacionModelada,
      pistas: [0, 1, 2].map((i) => it.pistas[i]?.texto ?? '') as [string, string, string],
    })),
  };
}

function aPeticion(a: ActividadForm) {
  return {
    id: a.id,
    momento: a.momento,
    tipo: a.tipo,
    oracionAnclajeId: a.momento === 'DURANTE' ? a.oracionAnclajeId || null : null,
    items: a.items.map((it) => ({
      id: it.id,
      habilidad: it.habilidad,
      nivelDificultad: it.nivelDificultad,
      modalidad: it.modalidad,
      enunciado: it.enunciado,
      explicacionModelada: it.explicacionModelada,
      pistas: it.pistas.map((texto, i) => ({ nivel: `P${i + 1}`, texto })).filter((p) => p.texto.trim()),
      ...(it.modalidad === 'SELECCION' ? { opciones: it.opciones, indiceCorrecto: it.indiceCorrecto } : {}),
      ...(it.modalidad === 'ORDENAMIENTO' ? { elementos: it.elementos } : {}),
      ...(it.modalidad === 'EVIDENCIA' ? { clavesEvidencia: it.clavesEvidencia } : {}),
      ...((it.modalidad === 'ESCRITURA' || it.modalidad === 'VOZ') && it.minPalabras ? { minPalabras: Number(it.minPalabras) } : {}),
    })),
  };
}

/** Lista editable de textos (opciones u elementos): agregar, quitar y escribir. */
function ListaTextos({
  titulo,
  valores,
  min,
  max,
  onChange,
  marcado,
  onMarcar,
}: {
  titulo: string;
  valores: string[];
  min: number;
  max: number;
  onChange: (v: string[]) => void;
  marcado?: number;
  onMarcar?: (i: number) => void;
}) {
  return (
    <fieldset className="grupo-opciones">
      <legend className="la-campo__etiqueta">{titulo}</legend>
      <div className="pila-sm">
        {valores.map((v, i) => (
          <div key={i} className="lista-textos__fila">
            {onMarcar ? (
              <label className="casilla casilla--sola">
                <input type="radio" checked={marcado === i} onChange={() => onMarcar(i)} />
                <span className="sr-only">Opción {i + 1} es la correcta</span>
              </label>
            ) : (
              <span className="lista-textos__numero">{i + 1}</span>
            )}
            <Campo etiqueta={`${onMarcar ? 'Opción' : 'Elemento'} ${i + 1}`} value={v} maxLength={200} onChange={(e) => onChange(valores.map((x, j) => (j === i ? e.target.value : x)))} />
            {valores.length > min ? (
              <Boton variante="fantasma" tamano="pequeno" aria-label={`Quitar ${onMarcar ? 'opción' : 'elemento'} ${i + 1}`} onClick={() => onChange(valores.filter((_, j) => j !== i))}>
                Quitar
              </Boton>
            ) : null}
          </div>
        ))}
        {valores.length < max ? (
          <div>
            <Boton variante="fantasma" tamano="pequeno" onClick={() => onChange([...valores, ''])}>
              + {onMarcar ? 'Opción' : 'Elemento'}
            </Boton>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

function EditorItem({
  item,
  numero,
  tipo,
  oraciones,
  onChange,
  onQuitar,
}: {
  item: ItemForm;
  numero: number;
  tipo: TipoActividad;
  oraciones: Oracion[];
  onChange: (it: ItemForm) => void;
  onQuitar?: () => void;
}) {
  const cambiar = <K extends keyof ItemForm>(campo: K, v: ItemForm[K]) => onChange({ ...item, [campo]: v });
  return (
    <div className="item-editor">
      <div className="fila fila--entre">
        <strong>Pregunta {numero}</strong>
        {onQuitar ? (
          <Boton variante="fantasma" tamano="pequeno" aria-label={`Quitar la pregunta ${numero}`} onClick={onQuitar}>
            Quitar pregunta
          </Boton>
        ) : null}
      </div>
      <AreaTexto etiqueta="Enunciado" value={item.enunciado} rows={2} maxLength={500} onChange={(e) => cambiar('enunciado', e.target.value)} />
      <div className="form-columnas">
        <Selector etiqueta="Habilidad" value={item.habilidad} onChange={(e) => cambiar('habilidad', e.target.value)} opciones={Object.entries(HABILIDADES).map(([v, t]) => ({ valor: v, texto: t }))} />
        <Selector
          etiqueta="Dificultad"
          value={String(item.nivelDificultad)}
          onChange={(e) => cambiar('nivelDificultad', Number(e.target.value))}
          opciones={[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: `Nivel ${n}` }))}
        />
        <Selector
          etiqueta="Forma de responder"
          value={item.modalidad}
          onChange={(e) => cambiar('modalidad', e.target.value as Modalidad)}
          opciones={MODALIDADES_POR_TIPO[tipo].map((m) => ({ valor: m, texto: MODALIDADES[m] }))}
        />
      </div>

      {item.modalidad === 'SELECCION' ? (
        <ListaTextos
          titulo="Opciones (marca la correcta)"
          valores={item.opciones}
          min={2}
          max={5}
          onChange={(v) => onChange({ ...item, opciones: v, indiceCorrecto: Math.min(item.indiceCorrecto, v.length - 1) })}
          marcado={item.indiceCorrecto}
          onMarcar={(i) => cambiar('indiceCorrecto', i)}
        />
      ) : null}
      {item.modalidad === 'ORDENAMIENTO' ? (
        <ListaTextos titulo="Elementos en el orden correcto (al niño se le muestran mezclados)" valores={item.elementos} min={2} max={8} onChange={(v) => cambiar('elementos', v)} />
      ) : null}
      {item.modalidad === 'EVIDENCIA' ? (
        <fieldset className="grupo-opciones">
          <legend className="la-campo__etiqueta">Oraciones que son evidencia</legend>
          <div className="pila-sm evidencias">
            {oraciones.map((o) => (
              <label key={o.id} className="casilla">
                <input
                  type="checkbox"
                  checked={item.clavesEvidencia.includes(o.id)}
                  onChange={() => cambiar('clavesEvidencia', item.clavesEvidencia.includes(o.id) ? item.clavesEvidencia.filter((c) => c !== o.id) : [...item.clavesEvidencia, o.id])}
                />
                <span>
                  {o.orden}. {o.texto}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {item.modalidad === 'ESCRITURA' || item.modalidad === 'VOZ' ? (
        <Campo etiqueta="Mínimo de palabras (opcional)" type="number" min={1} max={200} value={item.minPalabras} onChange={(e) => cambiar('minPalabras', e.target.value)} />
      ) : null}

      <fieldset className="grupo-opciones">
        <legend className="la-campo__etiqueta">Pistas progresivas{item.modalidad === 'SELECCION' || item.modalidad === 'ORDENAMIENTO' || item.modalidad === 'EVIDENCIA' ? ' (P1 obligatoria)' : ''}</legend>
        {(['P1 — dónde buscar en el texto', 'P2 — qué párrafo mirar', 'P3 — la pregunta dicha de otra forma'] as const).map((etiqueta, i) => (
          <Campo
            key={etiqueta}
            etiqueta={etiqueta}
            value={item.pistas[i]}
            maxLength={300}
            onChange={(e) => cambiar('pistas', item.pistas.map((p, j) => (j === i ? e.target.value : p)) as [string, string, string])}
          />
        ))}
      </fieldset>
      <AreaTexto
        etiqueta="Explicación modelada"
        ayuda="Se muestra si después de las pistas la respuesta sigue siendo incorrecta."
        value={item.explicacionModelada}
        rows={2}
        maxLength={1000}
        onChange={(e) => cambiar('explicacionModelada', e.target.value)}
      />
    </div>
  );
}

/** RF-024, RF-025: actividades antes, durante y después, con sus preguntas, pistas y explicación. */
export function EditorActividades({ detalle, onCambio }: { detalle: DetalleLectura; onCambio: (d: DetalleLectura) => void }) {
  const [actividades, setActividades] = useState<ActividadForm[]>(() => detalle.actividades.map(aFormulario));
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (i: number, a: ActividadForm) => setActividades(actividades.map((x, j) => (j === i ? a : x)));
  const agregar = (momento: Momento) => {
    const tipo: TipoActividad = momento === 'ANTES' ? 'PREDICCION' : 'SELECCION';
    setActividades([...actividades, { momento, tipo, oracionAnclajeId: '', items: [itemNuevo(tipo)] }]);
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const d = await api<DetalleLectura>(`/backoffice/lecturas/${detalle.lecturaId}/actividades`, { metodo: 'PUT', cuerpo: { actividades: actividades.map(aPeticion) } });
      onCambio(d);
      setActividades(d.actividades.map(aFormulario));
      setMensaje({ tipo: 'exito', texto: 'Actividades guardadas.' });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  let numero = 0;
  return (
    <Tarjeta titulo="Actividades">
      <p className="texto-suave">Toda lectura necesita al menos una actividad para después de leer. Las de "durante" aparecen en una oración del texto.</p>
      {ORDEN_MOMENTOS.map((momento) => (
        <section key={momento} className="momento" aria-label={MOMENTOS[momento]}>
          <h3>{MOMENTOS[momento]}</h3>
          {actividades.map((a, i) => {
            if (a.momento !== momento) return null;
            numero += 1;
            return (
              <article key={i} className="actividad">
                <div className="fila fila--entre">
                  <h4>Actividad {numero}</h4>
                  <Boton variante="fantasma" tamano="pequeno" aria-label={`Quitar la actividad ${numero}`} onClick={() => setActividades(actividades.filter((_, j) => j !== i))}>
                    Quitar actividad
                  </Boton>
                </div>
                <div className="form-columnas">
                  <Selector
                    etiqueta="Tipo de actividad"
                    value={a.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as TipoActividad;
                      cambiar(i, { ...a, tipo, items: a.items.map((it) => ({ ...it, modalidad: MODALIDADES_POR_TIPO[tipo].includes(it.modalidad) ? it.modalidad : (MODALIDADES_POR_TIPO[tipo][0] as Modalidad) })) });
                    }}
                    opciones={Object.entries(TIPOS_ACTIVIDAD).map(([v, t]) => ({ valor: v, texto: t }))}
                  />
                  {momento === 'DURANTE' ? (
                    <Selector
                      etiqueta="Aparece en la oración"
                      value={a.oracionAnclajeId}
                      onChange={(e) => cambiar(i, { ...a, oracionAnclajeId: e.target.value })}
                      opciones={[{ valor: '', texto: 'Elige una oración…' }, ...detalle.oraciones.map((o) => ({ valor: o.id, texto: `${o.orden}. ${recorte(o.texto)}` }))]}
                    />
                  ) : null}
                </div>
                {a.items.map((it, k) => (
                  <EditorItem
                    key={k}
                    item={it}
                    numero={k + 1}
                    tipo={a.tipo}
                    oraciones={detalle.oraciones}
                    onChange={(nuevo) => cambiar(i, { ...a, items: a.items.map((x, j) => (j === k ? nuevo : x)) })}
                    onQuitar={a.items.length > 1 ? () => cambiar(i, { ...a, items: a.items.filter((_, j) => j !== k) }) : undefined}
                  />
                ))}
                {a.items.length < 10 ? (
                  <div>
                    <Boton variante="fantasma" tamano="pequeno" onClick={() => cambiar(i, { ...a, items: [...a.items, itemNuevo(a.tipo)] })}>
                      + Pregunta
                    </Boton>
                  </div>
                ) : null}
              </article>
            );
          })}
          <Boton variante="fantasma" tamano="pequeno" onClick={() => agregar(momento)}>
            + Actividad {momento === 'ANTES' ? 'antes de leer' : momento === 'DURANTE' ? 'durante la lectura' : 'después de leer'}
          </Boton>
        </section>
      ))}
      <div className="barra-guardar">
        {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}
        <Boton cargando={guardando} onClick={guardar}>
          Guardar actividades
        </Boton>
      </div>
    </Tarjeta>
  );
}

/** Revisión: las actividades tal como quedarán, con la respuesta correcta, las pistas y la explicación. */
export function VistaActividades({ detalle }: { detalle: DetalleLectura }) {
  const oracion = (id: string | null) => detalle.oraciones.find((o) => o.id === id);
  return (
    <Tarjeta titulo={`Actividades (${detalle.actividades.length})`}>
      {detalle.actividades.length === 0 ? <p className="texto-suave">Sin actividades.</p> : null}
      {detalle.actividades.map((a) => (
        <article key={a.id} className="actividad">
          <h4>
            Actividad {a.orden} · {TIPOS_ACTIVIDAD[a.tipo]} <Chip tipo="info">{MOMENTOS[a.momento]}</Chip>
          </h4>
          {a.oracionAnclajeId ? <p className="texto-suave">En la oración {oracion(a.oracionAnclajeId)?.orden}: “{oracion(a.oracionAnclajeId)?.texto}”</p> : null}
          {a.items.map((it) => (
            <div key={it.id} className="item-editor">
              <p>
                <strong>{it.orden}. {it.enunciado}</strong>
              </p>
              <p className="texto-suave">
                {HABILIDADES[it.habilidad]} · nivel {it.nivelDificultad} · {MODALIDADES[it.modalidad]}
              </p>
              {it.contenido.opciones ? (
                <ul>
                  {it.contenido.opciones.map((o, i) => (
                    <li key={i}>
                      {o} {it.respuestaCorrecta && 'indice' in it.respuestaCorrecta && it.respuestaCorrecta.indice === i ? <Chip tipo="exito">Correcta</Chip> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {it.contenido.elementos ? (
                <ol>
                  {it.contenido.elementos.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
              ) : null}
              {it.clavesEvidencia.length ? <p>Evidencia: {it.clavesEvidencia.map((c) => `“${oracion(c)?.texto}”`).join(' ')}</p> : null}
              {it.pistas.map((p) => (
                <p key={p.nivel} className="texto-suave">
                  {p.nivel}: {p.texto}
                </p>
              ))}
              <p className="texto-suave">Explicación: {it.explicacionModelada}</p>
            </div>
          ))}
        </article>
      ))}
    </Tarjeta>
  );
}
