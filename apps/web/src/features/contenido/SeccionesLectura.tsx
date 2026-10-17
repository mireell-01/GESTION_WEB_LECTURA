'use client';

import { ChangeEvent, FormEvent, useState } from 'react';

import { AreaTexto, Alerta, Boton, Campo, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { ArchivoProtegido } from './ArchivoProtegido';
import { AUDIOS, convertirAWebp, duracionDeAudio, MAX_BYTES_AUDIO } from './archivos';
import { FormularioMetadatos } from './FormularioMetadatos';
import { DetalleLectura, kb, Oracion } from './tipos';

type AlCambiar = (d: DetalleLectura) => void;

/** RF-021, RF-022: datos y texto del borrador. */
export function SeccionTexto({ detalle, onCambio }: { detalle: DetalleLectura; onCambio: AlCambiar }) {
  const [metadatos, setMetadatos] = useState(detalle.metadatos);
  const [texto, setTexto] = useState(detalle.texto);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'aviso'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const editable = detalle.permisos.editar;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await api<{ detalle: DetalleLectura; ajustes: string[] }>(`/backoffice/lecturas/${detalle.lecturaId}/borrador`, {
        metodo: 'PUT',
        cuerpo: { metadatos: { ...metadatos, licencia: metadatos.licencia || null }, texto },
      });
      onCambio(r.detalle);
      setMensaje(r.ajustes.length ? { tipo: 'aviso', texto: `Guardado. Revisa: ${r.ajustes.join(' · ')}` } : { tipo: 'exito', texto: 'Guardado.' });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta titulo="Datos y texto">
      <form onSubmit={guardar} className="pila-sm" aria-label="Datos y texto de la lectura">
        {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}
        <FormularioMetadatos valor={metadatos} onChange={setMetadatos} soloLectura={!editable} />
        <AreaTexto
          etiqueta="Texto de la lectura"
          ayuda={editable ? 'Las oraciones que no cambies conservan sus actividades y evidencias.' : undefined}
          value={texto}
          rows={10}
          readOnly={!editable}
          onChange={(e) => setTexto(e.target.value)}
        />
        {editable ? (
          <div>
            <Boton type="submit" cargando={guardando}>
              Guardar datos y texto
            </Boton>
          </div>
        ) : null}
      </form>
    </Tarjeta>
  );
}

/** RF-022: oraciones con identificador estable; la editora une o corta donde haga falta. */
export function SeccionOraciones({ detalle, onCambio }: { detalle: DetalleLectura; onCambio: AlCambiar }) {
  const [cortando, setCortando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = detalle.permisos.editar;

  const ejecutar = async (accion: () => Promise<DetalleLectura>) => {
    setError(null);
    try {
      onCambio(await accion());
      setCortando(null);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };
  const unir = (o: Oracion) => ejecutar(() => api(`/backoffice/lecturas/${detalle.lecturaId}/oraciones/${o.id}/unir`, { metodo: 'POST' }));
  const dividir = (o: Oracion, posicion: number) =>
    ejecutar(() => api(`/backoffice/lecturas/${detalle.lecturaId}/oraciones/${o.id}/dividir`, { metodo: 'POST', cuerpo: { posicion } }));

  /** Posiciones de corte: después de cada palabra, salvo la última. */
  const cortes = (texto: string) => {
    const resultado: { palabra: string; posicion: number }[] = [];
    let i = 0;
    for (const palabra of texto.split(' ')) {
      i += palabra.length;
      if (i < texto.length) resultado.push({ palabra, posicion: i });
      i += 1;
    }
    return resultado;
  };

  return (
    <Tarjeta titulo={`Oraciones (${detalle.oraciones.length})`}>
      <p className="texto-suave">El texto se divide solo. Si un corte no quedó bien, une la oración con la siguiente o córtala entre dos palabras.</p>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <ol className="oraciones">
        {detalle.oraciones.map((o, i) => {
          const siguiente = detalle.oraciones[i + 1];
          return (
            <li key={o.id} className="oracion" data-parrafo={o.parrafo}>
              <span className="oracion__numero">{o.orden}</span>
              <span className="oracion__texto">{o.texto}</span>
              {editable ? (
                <span className="oracion__acciones">
                  {siguiente && siguiente.parrafo === o.parrafo ? (
                    <Boton variante="fantasma" tamano="pequeno" aria-label={`Unir la oración ${o.orden} con la siguiente`} onClick={() => unir(o)}>
                      Unir
                    </Boton>
                  ) : null}
                  {o.texto.includes(' ') ? (
                    <Boton variante="fantasma" tamano="pequeno" aria-label={`Cortar la oración ${o.orden}`} onClick={() => setCortando(cortando === o.id ? null : o.id)}>
                      Cortar
                    </Boton>
                  ) : null}
                </span>
              ) : null}
              {cortando === o.id ? (
                <div className="cortes" role="group" aria-label={`Elige después de qué palabra cortar la oración ${o.orden}`}>
                  {cortes(o.texto).map((c) => (
                    <button key={c.posicion} type="button" className="corte" onClick={() => dividir(o, c.posicion)}>
                      {c.palabra} <span aria-hidden="true">✂</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Tarjeta>
  );
}

/** RF-023: imágenes (se convierten a WebP ≤ 200 KB aquí mismo) y audio (≤ 2 MB). */
export function SeccionRecursos({ detalle, onCambio }: { detalle: DetalleLectura; onCambio: AlCambiar }) {
  const [alternativo, setAlternativo] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const editable = detalle.permisos.editar;

  const subir = async (tipo: 'IMAGEN' | 'AUDIO', archivo: Blob, extra: { textoAlternativo?: string; duracionSeg?: number | null }) => {
    const pedido = await api<{ url: string }>('/backoffice/recursos', {
      metodo: 'POST',
      cuerpo: { lecturaId: detalle.lecturaId, tipo, tipoMime: archivo.type, bytes: archivo.size, ...extra, duracionSeg: extra.duracionSeg ?? undefined },
    });
    await api(pedido.url.replace(/^\/api\/v1/, ''), { metodo: 'PUT', binario: archivo });
    onCambio(await api<DetalleLectura>(`/backoffice/lecturas/${detalle.lecturaId}`));
  };

  const elegir = (tipo: 'IMAGEN' | 'AUDIO') => async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      if (tipo === 'IMAGEN') {
        const webp = await convertirAWebp(archivo);
        await subir('IMAGEN', webp, { textoAlternativo: alternativo });
        setAlternativo('');
        setMensaje({ tipo: 'exito', texto: `Imagen subida (${kb(webp.size)}).` });
      } else {
        if (!AUDIOS.includes(archivo.type)) throw new Error('El audio debe ser MP3, OGG, WebM o M4A.');
        if (archivo.size > MAX_BYTES_AUDIO) throw new Error('El audio debe pesar como máximo 2 MB.');
        await subir('AUDIO', archivo, { duracionSeg: await duracionDeAudio(archivo) });
        setMensaje({ tipo: 'exito', texto: 'Audio subido.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error && !('estado' in err) ? err.message : mensajeDeError(err) });
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (id: string) => {
    try {
      onCambio(await api<DetalleLectura>(`/backoffice/lecturas/${detalle.lecturaId}/recursos/${id}`, { metodo: 'DELETE' }));
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    }
  };

  return (
    <Tarjeta titulo="Imágenes y audio">
      <p className="texto-suave">
        La lectura completa debe pesar menos de 1,5 MB. Ahora pesa {kb(detalle.pesoBytes)}.
      </p>
      {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}
      {editable ? (
        <div className="pila-sm">
          <Campo
            etiqueta="Descripción de la imagen (texto alternativo)"
            ayuda="Obligatoria: la escucha quien no puede ver la imagen."
            value={alternativo}
            maxLength={250}
            onChange={(e) => setAlternativo(e.target.value)}
          />
          <div className="fila">
            <label className={`la-boton la-boton--secundario la-boton--pequeno subir-archivo${alternativo.trim().length < 3 || subiendo ? ' subir-archivo--inactivo' : ''}`}>
              <Icono nombre="estrella" tamano={18} />
              {subiendo ? 'Subiendo…' : 'Subir imagen'}
              <input type="file" accept="image/*" className="sr-only" disabled={alternativo.trim().length < 3 || subiendo} onChange={elegir('IMAGEN')} />
            </label>
            <label className={`la-boton la-boton--fantasma la-boton--pequeno subir-archivo${subiendo ? ' subir-archivo--inactivo' : ''}`}>
              Subir audio
              <input type="file" accept="audio/mpeg,audio/ogg,audio/webm,audio/mp4" className="sr-only" disabled={subiendo} onChange={elegir('AUDIO')} />
            </label>
          </div>
        </div>
      ) : null}
      {detalle.recursos.length === 0 ? (
        <p className="texto-suave">Sin imágenes ni audio.</p>
      ) : (
        <ul className="recursos">
          {detalle.recursos.map((r) => (
            <li key={r.id} className="recurso">
              <ArchivoProtegido url={r.url} tipo={r.tipo} alt={r.textoAlternativo ?? ''} className={r.tipo === 'IMAGEN' ? 'recurso__imagen' : 'recurso__audio'} />
              <span className="recurso__datos">
                <span>{r.tipo === 'IMAGEN' ? r.textoAlternativo : `Audio${r.duracionSeg ? ` de ${r.duracionSeg} s` : ''}`}</span>
                <Chip>{kb(r.bytes)}</Chip>
              </span>
              {editable ? (
                <Boton variante="fantasma" tamano="pequeno" aria-label={`Quitar ${r.tipo === 'IMAGEN' ? 'la imagen' : 'el audio'}`} onClick={() => quitar(r.id)}>
                  Quitar
                </Boton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
