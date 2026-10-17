'use client';

import { useState } from 'react';

import { AreaTexto, Alerta, Boton, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { DetalleLectura } from './tipos';

/**
 * RF-026, RF-027: lo que falta para enviar, y las acciones del flujo según quién mira y en qué
 * estado está: enviar (autora), aprobar o devolver (revisor), versión nueva y archivar.
 */
export function PanelRevision({
  detalle,
  onCambio,
}: {
  detalle: DetalleLectura;
  onCambio: (d: DetalleLectura) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [devolviendo, setDevolviendo] = useState(false);
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { permisos } = detalle;
  const hayAcciones =
    permisos.editar || permisos.revisar || permisos.nuevaVersion || permisos.archivar;

  const accion = (clave: string, ruta: string, cuerpo?: unknown) => async () => {
    setOcupado(clave);
    setError(null);
    try {
      onCambio(
        await api<DetalleLectura>(`/backoffice/lecturas/${detalle.lecturaId}/${ruta}`, {
          metodo: 'POST',
          cuerpo,
        }),
      );
      setDevolviendo(false);
      setConfirmarArchivo(false);
      setComentario('');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="escudo" tamano={28} />
          Revisión y publicación
        </span>
      }
    >
      {error ? <Alerta tipo="error">{error}</Alerta> : null}

      {detalle.estado === 'BORRADOR' ? (
        detalle.problemas.length ? (
          <Alerta tipo="aviso">
            <strong>Antes de enviar a revisión falta:</strong>
            <ul className="lista-simple">
              {detalle.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alerta>
        ) : (
          <Alerta tipo="exito">Está completa: ya se puede enviar a revisión.</Alerta>
        )
      ) : null}
      {detalle.estado === 'EN_REVISION' ? (
        <Alerta tipo="info">
          {permisos.revisar
            ? 'Revísala: apruébala para publicarla o devuélvela con lo que hay que corregir.'
            : 'Está en revisión: otra persona la aprobará o la devolverá.'}
        </Alerta>
      ) : null}
      {detalle.estado === 'PUBLICADO' ? (
        <Alerta tipo="exito">
          Publicada: está en la biblioteca y se puede asignar a las aulas.
        </Alerta>
      ) : null}
      {detalle.estado === 'ARCHIVADO' ? (
        <Alerta tipo="info">Archivada: ya no está en la biblioteca.</Alerta>
      ) : null}

      {hayAcciones ? (
        <div className="fila">
          {permisos.editar ? (
            <Boton
              disabled={!permisos.enviar}
              cargando={ocupado === 'enviar'}
              onClick={accion('enviar', 'enviar-revision')}
            >
              Enviar a revisión
            </Boton>
          ) : null}
          {permisos.revisar && !devolviendo ? (
            <>
              <Boton
                variante="exito"
                cargando={ocupado === 'aprobar'}
                onClick={accion('aprobar', 'aprobar')}
              >
                Aprobar y publicar
              </Boton>
              <Boton variante="fantasma" onClick={() => setDevolviendo(true)}>
                Devolver con comentarios
              </Boton>
            </>
          ) : null}
          {permisos.nuevaVersion ? (
            <Boton
              variante="secundario"
              cargando={ocupado === 'version'}
              onClick={accion('version', 'nueva-version')}
            >
              Crear una versión nueva
            </Boton>
          ) : null}
          {permisos.archivar && !confirmarArchivo ? (
            <Boton variante="fantasma" onClick={() => setConfirmarArchivo(true)}>
              Archivar
            </Boton>
          ) : null}
        </div>
      ) : null}

      {devolviendo ? (
        <div className="pila-sm">
          <AreaTexto
            etiqueta="¿Qué hay que corregir?"
            value={comentario}
            rows={3}
            maxLength={1000}
            onChange={(e) => setComentario(e.target.value)}
          />
          <div className="fila">
            <Boton
              variante="peligro"
              disabled={comentario.trim().length < 5}
              cargando={ocupado === 'rechazar'}
              onClick={accion('rechazar', 'rechazar', { comentario })}
            >
              Devolver a la autora
            </Boton>
            <Boton variante="fantasma" onClick={() => setDevolviendo(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : null}
      {confirmarArchivo ? (
        <div className="pila-sm">
          <p className="texto-suave">
            Saldrá de la biblioteca y del catálogo de asignaciones. Las lecturas ya hechas por los
            niños se conservan.
          </p>
          <div className="fila">
            <Boton
              variante="peligro"
              cargando={ocupado === 'archivar'}
              onClick={accion('archivar', 'archivar')}
            >
              Sí, archivar
            </Boton>
            <Boton variante="fantasma" onClick={() => setConfirmarArchivo(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : null}
    </Tarjeta>
  );
}
