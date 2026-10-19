'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alerta, Cargando, Chip, Icono } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { EditorActividades, VistaActividades } from './EditorActividades';
import { EditorHistoria } from './EditorHistoria';
import { PanelRevision } from './PanelRevision';
import { SeccionOraciones, SeccionRecursos, SeccionTexto } from './SeccionesLectura';
import { DetalleLectura, EDADES, ESTADOS } from './tipos';

/** Espacio de trabajo de una lectura en el backoffice: escribir (editora) o revisar (revisor). */
export function EditorLectura({ lecturaId }: { lecturaId: string }) {
  const [detalle, setDetalle] = useState<DetalleLectura | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada cambio de versión o de estado vuelve a montar las secciones con los datos nuevos.
  const [version, setVersion] = useState(0);

  const cargar = useCallback(async () => {
    try {
      setDetalle(await api<DetalleLectura>(`/backoffice/lecturas/${lecturaId}`));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, [lecturaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alCambiar = (d: DetalleLectura) => {
    if (!detalle || d.versionId !== detalle.versionId || d.estado !== detalle.estado) setVersion((v) => v + 1);
    setDetalle(d);
  };

  const volver = (
    <Link href="/backoffice/lecturas" className="volver">
      <Icono nombre="flecha" tamano={20} className="volver__icono" />
      Lecturas
    </Link>
  );
  if (error && !detalle) return <div className="pila">{volver}<Alerta tipo="error">{error}</Alerta></div>;
  if (!detalle) return <Cargando />;

  const estado = ESTADOS[detalle.estado];
  return (
    <div className="pila">
      {volver}
      <header className="cabecera-aula">
        <span className="cabecera-aula__icono">
          <Icono nombre="libro" tamano={36} />
        </span>
        <div className="pila-sm">
          <h1>{detalle.metadatos.titulo}</h1>
          <p className="texto-suave">
            {EDADES[detalle.metadatos.rangoEdad]} · nivel {detalle.metadatos.nivelDificultad} · versión {detalle.numero}
            {detalle.esAutor ? ' · la escribiste tú' : ''}
          </p>
          <span className="fila fila--compacta">
            <Chip tipo={estado.tipo}>{estado.texto}</Chip>
            {detalle.publicada ? <Chip tipo="exito">La versión {detalle.publicada.numero} sigue publicada</Chip> : null}
          </span>
        </div>
      </header>
      {detalle.comentarioRevision && detalle.estado === 'BORRADOR' ? (
        <Alerta tipo="aviso">
          <strong>El revisor la devolvió:</strong> {detalle.comentarioRevision}
        </Alerta>
      ) : null}

      <div key={version} className="pila">
        <PanelRevision detalle={detalle} onCambio={alCambiar} />
        <SeccionTexto detalle={detalle} onCambio={alCambiar} />
        <SeccionOraciones detalle={detalle} onCambio={alCambiar} />
        <SeccionRecursos detalle={detalle} onCambio={alCambiar} />
        {detalle.permisos.editar ? (
          // Si cambian las oraciones (sus ids), el editor parte de los anclajes y evidencias ya ajustados.
          <EditorActividades key={detalle.oraciones.map((o) => o.id).join()} detalle={detalle} onCambio={alCambiar} />
        ) : (
          <VistaActividades detalle={detalle} />
        )}
        <EditorHistoria detalle={detalle} onCambio={alCambiar} />
      </div>
    </div>
  );
}
