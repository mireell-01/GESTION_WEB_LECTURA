'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Chip, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { InstitucionAdmin } from './tipos';

/**
 * RF-076: la administración registra las instituciones educativas y puede suspenderlas. Suspender solo
 * la marca: ya no se elige para aulas nuevas; sus docentes, aulas y estudiantes siguen igual.
 */
export function Instituciones() {
  const [lista, setLista] = useState<InstitucionAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [datos, setDatos] = useState({ nombre: '', codigoModular: '', region: '' });
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    api<InstitucionAdmin[]>('/admin/instituciones')
      .then(setLista)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const nueva = await api<InstitucionAdmin>('/admin/instituciones', {
        metodo: 'POST',
        cuerpo: { nombre: datos.nombre, ...(datos.codigoModular.trim() ? { codigoModular: datos.codigoModular.trim() } : {}), ...(datos.region.trim() ? { region: datos.region.trim() } : {}) },
      });
      setLista((l) => [...(l ?? []), nueva].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setDatos({ nombre: '', codigoModular: '', region: '' });
      setAviso(nueva.aulas > 0 ? `Registrada. Se vincularon ${nueva.aulas} ${nueva.aulas === 1 ? 'aula que ya la nombraba' : 'aulas que ya la nombraban'}.` : 'Registrada.');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (i: InstitucionAdmin, estado: InstitucionAdmin['estado']) => {
    setCambiando(i.id);
    setError(null);
    setAviso(null);
    try {
      const nueva = await api<InstitucionAdmin>(`/admin/instituciones/${i.id}`, { metodo: 'PATCH', cuerpo: { estado } });
      setLista((l) => (l ?? []).map((x) => (x.id === i.id ? nueva : x)));
      setAviso(estado === 'SUSPENDIDA' ? `${i.nombre} quedó suspendida.` : `${i.nombre} está activa otra vez.`);
      setConfirmando(null);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCambiando(null);
    }
  };

  return (
    <div className="pila">
      <Tarjeta
        nivel={1}
        titulo={
          <span className="titulo-con-icono">
            <Icono nombre="aula" tamano={30} />
            Instituciones
          </span>
        }
      >
        <p className="texto-suave" style={{ margin: 0 }}>
          Los colegios que usan LectoAventura. Al registrar uno, las aulas que ya lo nombraban igual quedan vinculadas. Una institución
          suspendida ya no se puede elegir para aulas nuevas; sus docentes y estudiantes siguen igual.
        </p>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {aviso ? <Alerta tipo="exito">{aviso}</Alerta> : null}
        {!lista ? (
          error ? null : <Cargando />
        ) : lista.length === 0 ? (
          <Alerta tipo="info">Aún no hay instituciones registradas.</Alerta>
        ) : (
          <ul className="admin-lista" aria-label="Instituciones registradas">
            {lista.map((i) => (
              <li key={i.id} className="admin-fila" aria-label={i.nombre}>
                <span className="admin-fila__datos">
                  <strong>{i.nombre}</strong>
                  <span className="texto-suave">
                    {[i.codigoModular ? `Código modular ${i.codigoModular}` : null, i.region].filter(Boolean).join(' · ') || 'Sin código modular'}
                  </span>
                  <span className="fila fila--compacta">
                    <Chip tipo={i.estado === 'ACTIVA' ? 'exito' : 'error'}>{i.estado === 'ACTIVA' ? 'Activa' : 'Suspendida'}</Chip>
                    <Chip>
                      {i.aulas} {i.aulas === 1 ? 'aula' : 'aulas'} · {i.docentes} {i.docentes === 1 ? 'docente' : 'docentes'} · {i.estudiantes}{' '}
                      {i.estudiantes === 1 ? 'estudiante' : 'estudiantes'}
                    </Chip>
                  </span>
                </span>
                <span className="admin-fila__acciones">
                  {i.estado === 'ACTIVA' ? (
                    confirmando === i.id ? (
                      <>
                        <Boton variante="peligro" tamano="pequeno" cargando={cambiando === i.id} onClick={() => void cambiarEstado(i, 'SUSPENDIDA')}>
                          Sí, suspender
                        </Boton>
                        <Boton variante="fantasma" tamano="pequeno" onClick={() => setConfirmando(null)}>
                          Cancelar
                        </Boton>
                      </>
                    ) : (
                      <Boton variante="fantasma" tamano="pequeno" onClick={() => setConfirmando(i.id)}>
                        Suspender
                      </Boton>
                    )
                  ) : (
                    <Boton variante="secundario" tamano="pequeno" cargando={cambiando === i.id} onClick={() => void cambiarEstado(i, 'ACTIVA')}>
                      Reactivar
                    </Boton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Registrar una institución">
        <form className="admin-formulario" onSubmit={registrar}>
          <Campo etiqueta="Nombre" ayuda="Como lo escriben sus docentes. Por ejemplo: IE 70001 Santa Rosa" value={datos.nombre} maxLength={120} required onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          <Campo etiqueta="Código modular (opcional)" inputMode="numeric" pattern="\d{7}" title="7 dígitos" value={datos.codigoModular} maxLength={7} onChange={(e) => setDatos({ ...datos, codigoModular: e.target.value })} />
          <Campo etiqueta="Región (opcional)" value={datos.region} maxLength={60} onChange={(e) => setDatos({ ...datos, region: e.target.value })} />
          <div>
            <Boton type="submit" cargando={guardando}>
              Registrar institución
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
