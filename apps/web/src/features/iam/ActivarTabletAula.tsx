'use client';

import { useEffect, useState } from 'react';

import { Alerta, Boton, Cargando, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';
import { guardarTokenDispositivo, leerNombreDispositivo, leerTokenDispositivo } from '@/shared/auth/dispositivo';
import { useSesion } from '@/shared/auth/sesion';

interface AulaResumen {
  id: string;
  nombre: string;
  grado: string;
  institucion: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
  totalEstudiantes: number;
}

/**
 * RN-04 / CR-01: la docente activa una vez la tablet para una de sus aulas. Desde entonces,
 * al abrir la app los niños ven directo los avatares de su aula y entran con su PIN, sin
 * escribir ningún código. Dura 30 días.
 */
export function ActivarTabletAula() {
  const { salir } = useSesion();
  const [aulas, setAulas] = useState<AulaResumen[] | null>(null);
  const [activadaPara, setActivadaPara] = useState<string | null>(null);
  const [recienActivada, setRecienActivada] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leerTokenDispositivo()) setActivadaPara(leerNombreDispositivo());
    api<AulaResumen[]>('/aulas')
      .then((lista) => setAulas(lista.filter((a) => a.estado === 'ACTIVA')))
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  const activar = async (aula: AulaResumen) => {
    setOcupada(aula.id);
    setError(null);
    try {
      const r = await api<{ tokenDispositivo: string; contexto: { nombre: string } }>(`/aulas/${aula.id}/dispositivos`, {
        metodo: 'POST',
        cuerpo: { nombre: navigator.userAgent.includes('Mobile') ? 'Tablet del aula' : 'Computadora del aula' },
      });
      guardarTokenDispositivo(r.tokenDispositivo, `Aula ${r.contexto.nombre}`);
      setActivadaPara(`Aula ${r.contexto.nombre}`);
      setRecienActivada(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupada(null);
    }
  };

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="tablet" tamano={28} />
          Tablet del aula
        </span>
      }
    >
      <p className="texto-suave">
        Actívala una vez y tus estudiantes entrarán solo con su avatar y su PIN, sin escribir códigos. Dura 30 días.
      </p>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {activadaPara ? (
        <Alerta tipo="exito">
          <div className="pila-sm">
            <span>
              {recienActivada ? '¡Listo! ' : ''}Esta tablet está activada para <strong>{activadaPara}</strong>.
            </span>
            <Boton variante="exito" onClick={() => salir('/ingresar/estudiante')}>
              Dejar la tablet lista para los niños
            </Boton>
          </div>
        </Alerta>
      ) : null}
      {!aulas ? (
        error ? null : <Cargando />
      ) : aulas.length === 0 ? (
        <Alerta tipo="info">Aún no tienes aulas activas. Crea una en “Mis aulas”.</Alerta>
      ) : (
        <ul className="lista-aulas">
          {aulas.map((a) => (
            <li key={a.id} className="lista-aulas__fila">
              <span className="lista-aulas__icono">
                <Icono nombre="aula" tamano={28} />
              </span>
              <span className="lista-aulas__datos">
                <strong>{a.nombre}</strong>
                <span className="texto-suave">
                  {a.institucion} · {a.totalEstudiantes} {a.totalEstudiantes === 1 ? 'estudiante' : 'estudiantes'}
                </span>
              </span>
              <Boton
                variante={activadaPara === `Aula ${a.nombre}` ? 'fantasma' : 'primario'}
                cargando={ocupada === a.id}
                aria-label={`Activar esta tablet para ${a.nombre}`}
                onClick={() => activar(a)}
              >
                {activadaPara === `Aula ${a.nombre}` ? 'Renovar' : 'Activar esta tablet'}
              </Boton>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
