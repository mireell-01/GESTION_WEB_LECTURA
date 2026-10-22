'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Cargando, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import { ReevaluacionAula } from '@/features/diagnostico/ReevaluacionAula';
import { RespuestasAbiertasAula } from '@/features/lectura/RespuestasAbiertasAula';
import { api, mensajeDeError } from '@/shared/api/client';

import { AsignacionesAula } from './AsignacionesAula';
import { EstudiantesAula } from './EstudiantesAula';
import { MatricularEstudiantes } from './MatricularEstudiantes';
import { DetalleAula as Detalle, NOMBRE_GRADO } from './tipos';

/** RF-020: archivar al cierre del año lectivo. Pide confirmación porque no se deshace. */
function ArchivarAula({ aulaId, nombre, onArchivada }: { aulaId: string; nombre: string; onArchivada: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archivar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await api(`/aulas/${aulaId}/archivar`, { metodo: 'POST' });
      onArchivada();
    } catch (err) {
      setError(mensajeDeError(err));
      setOcupado(false);
    }
  };

  return (
    <Tarjeta titulo="Cerrar el año lectivo" className="zona-cuidado">
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <p className="texto-suave">
        Al archivar {nombre} queda solo para consultar: no se matricula ni se asigna nada más, y su tablet deja de mostrar los avatares.
        Tus estudiantes conservan su perfil lector.
      </p>
      {confirmando ? (
        <div className="fila">
          <Boton variante="peligro" cargando={ocupado} onClick={archivar}>
            Sí, archivar {nombre}
          </Boton>
          <Boton variante="fantasma" onClick={() => setConfirmando(false)}>
            Cancelar
          </Boton>
        </div>
      ) : (
        <div>
          <Boton variante="fantasma" onClick={() => setConfirmando(true)}>
            Archivar aula
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

/** Detalle de un aula de la docente (RF-014 a RF-020). */
export function DetalleAula({ aulaId }: { aulaId: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recienMatriculados, setRecienMatriculados] = useState<string[]>([]);
  const [version, setVersion] = useState(0);

  const cargar = useCallback(async () => {
    try {
      setDetalle(await api<Detalle>(`/aulas/${aulaId}`));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, [aulaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error && !detalle) {
    return (
      <div className="pila">
        <Link href="/docente" className="volver">
          <Icono nombre="flecha" tamano={20} className="volver__icono" />
          Mis aulas
        </Link>
        <Alerta tipo="error">{error}</Alerta>
      </div>
    );
  }
  if (!detalle) return <Cargando />;

  const { aula, estudiantes } = detalle;
  const editable = aula.estado === 'ACTIVA';

  return (
    <div className="pila">
      <Link href="/docente" className="volver">
        <Icono nombre="flecha" tamano={20} className="volver__icono" />
        Mis aulas
      </Link>

      <header className="cabecera-aula">
        <span className="cabecera-aula__icono">
          <Icono nombre="aula" tamano={36} />
        </span>
        <div className="pila-sm">
          <h1>{aula.nombre}</h1>
          <p className="texto-suave">
            {NOMBRE_GRADO[aula.grado]} · Año lectivo {aula.anioLectivo} · {aula.institucion}
          </p>
          <span className="fila fila--compacta">
            {editable ? <Chip tipo="exito">Activa</Chip> : <Chip>Archivada</Chip>}
            <Chip tipo="info">
              {aula.totalEstudiantes} de 45 estudiantes
            </Chip>
          </span>
        </div>
      </header>

      {!editable ? <Alerta tipo="info">Esta aula está archivada: puedes consultarla, pero ya no se modifica.</Alerta> : null}

      <EstudiantesAula
        key={version}
        aulaId={aula.id}
        estudiantes={estudiantes}
        editable={editable}
        seleccionInicial={recienMatriculados}
        onCambio={cargar}
      />

      {editable ? (
        <MatricularEstudiantes
          aulaId={aula.id}
          onMatriculados={async (ids) => {
            await cargar();
            setRecienMatriculados(ids);
            setVersion((v) => v + 1);
          }}
        />
      ) : null}

      <AsignacionesAula aulaId={aula.id} estudiantes={estudiantes} editable={editable} />

      <ReevaluacionAula aulaId={aula.id} editable={editable} />

      <RespuestasAbiertasAula aulaId={aula.id} />

      {editable ? <ArchivarAula aulaId={aula.id} nombre={aula.nombre} onArchivada={cargar} /> : null}
    </div>
  );
}
