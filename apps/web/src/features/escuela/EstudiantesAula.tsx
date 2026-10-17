'use client';

import { useEffect, useRef, useState } from 'react';

import { Alerta, Avatar, Boton, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import { NOMBRE_RANGO } from '@/features/iam/tipos';
import { api, apiArchivo, mensajeDeError } from '@/shared/api/client';

import { EstudianteAula, guardarArchivo, Invitacion } from './tipos';

/** RF-019: el código se muestra una sola vez, con lo que la familia debe hacer. */
function CodigoInvitacion({ invitacion, onCerrar }: { invitacion: Invitacion; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  // Aparece arriba de la lista: se lleva a la vista aunque la docente estuviera más abajo.
  useEffect(() => {
    caja.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  const vence = new Date(invitacion.expiraEn).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(invitacion.codigo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div ref={caja} className="invitacion" role="region" aria-label={`Código de invitación para la familia de ${invitacion.estudiante.alias}`}>
      <p className="invitacion__titulo">
        Código para la familia de <strong>{invitacion.estudiante.alias}</strong>
      </p>
      <p className="invitacion__codigo" aria-label={`Código ${invitacion.codigo.split('').join(' ')}`}>
        {invitacion.codigo}
      </p>
      <p className="texto-suave">
        Sirve <strong>una sola vez</strong> y vence el {vence}. Anótalo para la familia: en LectoAventura, desde{' '}
        <strong>Mis hijos</strong>, elige <strong>“Tengo un código del aula”</strong> y lo escribe.
      </p>
      <p className="texto-suave">Por seguridad no se vuelve a mostrar; si se pierde, genera otro.</p>
      <div className="fila">
        <Boton tamano="pequeno" variante="secundario" onClick={copiar}>
          {copiado ? '¡Copiado!' : 'Copiar código'}
        </Boton>
        <Boton tamano="pequeno" variante="fantasma" onClick={onCerrar}>
          Listo
        </Boton>
      </div>
    </div>
  );
}

/**
 * Estudiantes del aula (RF-015, RF-017, RF-019): elegir a quiénes imprimir tarjetas, invitar a su
 * familia y retirarlos. En un aula archivada todo es de solo lectura (RF-020).
 */
export function EstudiantesAula({
  aulaId,
  estudiantes,
  editable,
  onCambio,
  seleccionInicial,
}: {
  aulaId: string;
  estudiantes: EstudianteAula[];
  editable: boolean;
  onCambio: () => void;
  /** Recién matriculados: quedan elegidos para descargar sus tarjetas. */
  seleccionInicial: string[];
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(seleccionInicial));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);

  const alternar = (id: string) => {
    const nuevo = new Set(elegidos);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    setElegidos(nuevo);
  };
  const todos = estudiantes.length > 0 && estudiantes.every((e) => elegidos.has(e.id));

  const ejecutar = async (clave: string, accion: () => Promise<void>) => {
    setOcupado(clave);
    setMensaje(null);
    try {
      await accion();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setOcupado(null);
    }
  };

  /** RF-017: el PDF trae un PIN nuevo para cada elegido; las tarjetas anteriores dejan de servir. */
  const descargarTarjetas = () =>
    ejecutar('tarjetas', async () => {
      const ids = estudiantes.filter((e) => elegidos.has(e.id)).map((e) => e.id);
      const { archivo, nombre } = await apiArchivo(`/aulas/${aulaId}/tarjetas-acceso.pdf`, { metodo: 'POST', cuerpo: { estudianteIds: ids } });
      guardarArchivo(archivo, nombre);
      setMensaje({
        tipo: 'exito',
        texto: `Tarjetas listas (${ids.length}). Imprímelas en A4 y recórtalas: cada niña o niño entra con el PIN de su tarjeta.`,
      });
      onCambio();
    });

  const invitar = (e: EstudianteAula) =>
    ejecutar(`invitar-${e.id}`, async () => {
      setInvitacion(await api<Invitacion>(`/estudiantes/${e.id}/invitaciones-familiar`, { metodo: 'POST' }));
    });

  const retirar = (e: EstudianteAula) =>
    ejecutar(`retirar-${e.id}`, async () => {
      await api(`/aulas/${aulaId}/matriculas/${e.id}`, { metodo: 'DELETE' });
      setRetirando(null);
      setMensaje({ tipo: 'exito', texto: `${e.alias} ya no está en el aula. Su perfil lector se conserva.` });
      onCambio();
    });

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="perfil" tamano={28} />
          Estudiantes ({estudiantes.length}/45)
        </span>
      }
    >
      {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}
      {invitacion ? <CodigoInvitacion invitacion={invitacion} onCerrar={() => setInvitacion(null)} /> : null}

      {estudiantes.length === 0 ? (
        <Alerta tipo="info">Aún no hay estudiantes. Matricúlalos uno por uno o con un archivo CSV.</Alerta>
      ) : (
        <>
          {editable ? (
            <div className="barra-tarjetas">
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={todos}
                  onChange={() => setElegidos(todos ? new Set() : new Set(estudiantes.map((e) => e.id)))}
                />
                <span>Elegir a todos</span>
              </label>
              <Boton
                variante="secundario"
                tamano="pequeno"
                disabled={elegidos.size === 0}
                cargando={ocupado === 'tarjetas'}
                onClick={descargarTarjetas}
              >
                Descargar tarjetas ({estudiantes.filter((e) => elegidos.has(e.id)).length})
              </Boton>
              <p className="texto-suave barra-tarjetas__nota">
                Cada tarjeta trae un PIN nuevo; las tarjetas impresas antes dejan de servir.
              </p>
            </div>
          ) : null}

          <ul className="alumnos">
            {estudiantes.map((e) => (
              <li key={e.id} className="alumno">
                {editable ? (
                  <label className="casilla casilla--sola">
                    <input type="checkbox" checked={elegidos.has(e.id)} onChange={() => alternar(e.id)} />
                    <span className="sr-only">Elegir a {e.alias} para imprimir su tarjeta</span>
                  </label>
                ) : null}
                <Avatar clave={e.avatar} tamano={48} decorativo />
                <span className="alumno__datos">
                  <strong>{e.alias}</strong>
                  <span className="fila fila--compacta">
                    <Chip tipo="info">{NOMBRE_RANGO[e.rangoEdad]}</Chip>
                    {e.bloqueado ? <Chip tipo="error">Bloqueado por PIN</Chip> : null}
                    {e.familiaresVinculados > 0 ? (
                      <Chip tipo="exito">
                        {e.familiaresVinculados === 1 ? 'Familia vinculada' : `${e.familiaresVinculados} familiares vinculados`}
                      </Chip>
                    ) : null}
                  </span>
                </span>
                {editable ? (
                  <span className="alumno__acciones">
                    {retirando === e.id ? (
                      <>
                        <Boton variante="peligro" tamano="pequeno" cargando={ocupado === `retirar-${e.id}`} onClick={() => retirar(e)}>
                          Sí, retirar
                        </Boton>
                        <Boton variante="fantasma" tamano="pequeno" onClick={() => setRetirando(null)}>
                          No
                        </Boton>
                      </>
                    ) : (
                      <>
                        <Boton
                          variante="fantasma"
                          tamano="pequeno"
                          disabled={e.familiaresVinculados >= 2}
                          cargando={ocupado === `invitar-${e.id}`}
                          aria-label={`Invitar a la familia de ${e.alias}`}
                          onClick={() => invitar(e)}
                        >
                          Invitar familia
                        </Boton>
                        <Boton variante="fantasma" tamano="pequeno" aria-label={`Retirar a ${e.alias} del aula`} onClick={() => setRetirando(e.id)}>
                          Retirar
                        </Boton>
                      </>
                    )}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  );
}
