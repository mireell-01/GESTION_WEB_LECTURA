'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { fechaHora, NOMBRE_RECURSO, NOMBRE_ROL, PaginaAuditoria, RegistroAuditoria } from './tipos';

interface Filtro {
  desde: string;
  hasta: string;
  accion: string;
  recursoTipo: string;
}

const VACIO: Filtro = { desde: '', hasta: '', accion: '', recursoTipo: '' };

/** Lo que muestra de quién lo hizo: su nombre y rol, o el rol y el comienzo del id (estudiantes). */
function quien(r: RegistroAuditoria): string {
  const rol = r.actor.rol ? (NOMBRE_ROL[r.actor.rol] ?? r.actor.rol) : null;
  if (r.actor.nombre) return rol ? `${r.actor.nombre} (${rol})` : r.actor.nombre;
  if (r.actor.id) return `${rol ?? 'Cuenta'} ${r.actor.id.slice(0, 8)}…`;
  return 'Sistema';
}

/**
 * RF-077: la auditoría de acciones sensibles (inmutable, se conserva 2 años), de lo más reciente a lo
 * más antiguo, con filtros por fecha, acción y tipo de recurso.
 */
export function Auditoria() {
  const [acciones, setAcciones] = useState<{ accion: string; etiqueta: string }[]>([]);
  const [filtro, setFiltro] = useState<Filtro>(VACIO);
  const [aplicado, setAplicado] = useState<Filtro>(VACIO);
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedir = useCallback(async (f: Filtro, antesDe?: string) => {
    const q = new URLSearchParams(Object.entries({ ...f, ...(antesDe ? { antesDe } : {}) }).filter(([, v]) => v) as [string, string][]);
    return api<PaginaAuditoria>(`/admin/auditoria${q.size ? `?${q}` : ''}`);
  }, []);

  const consultar = useCallback(
    async (f: Filtro) => {
      setError(null);
      setRegistros(null);
      try {
        const p = await pedir(f);
        setRegistros(p.registros);
        setSiguiente(p.siguiente);
        setAplicado(f);
      } catch (err) {
        setError(mensajeDeError(err));
        setRegistros([]);
      }
    },
    [pedir],
  );

  useEffect(() => {
    api<{ accion: string; etiqueta: string }[]>('/admin/auditoria/acciones')
      .then((a) => setAcciones([...a].sort((x, y) => x.etiqueta.localeCompare(y.etiqueta, 'es'))))
      .catch(() => setAcciones([]));
    void consultar(VACIO);
  }, [consultar]);

  const filtrar = (e: FormEvent) => {
    e.preventDefault();
    void consultar(filtro);
  };

  const verMas = async () => {
    if (!siguiente) return;
    setCargandoMas(true);
    try {
      const p = await pedir(aplicado, siguiente);
      setRegistros((r) => [...(r ?? []), ...p.registros]);
      setSiguiente(p.siguiente);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargandoMas(false);
    }
  };

  return (
    <Tarjeta
      nivel={1}
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="escudo" tamano={30} />
          Auditoría
        </span>
      }
    >
      <p className="texto-suave" style={{ margin: 0 }}>
        Las acciones sensibles de la plataforma: quién, qué, sobre qué, cuándo y desde qué dirección IP. No se puede modificar y se conserva
        2 años.
      </p>
      <form className="admin-filtros" onSubmit={filtrar} aria-label="Filtrar la auditoría">
        <Campo etiqueta="Desde" type="date" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
        <Campo etiqueta="Hasta" type="date" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
        <Selector
          etiqueta="Acción"
          value={filtro.accion}
          onChange={(e) => setFiltro({ ...filtro, accion: e.target.value })}
          opciones={[{ valor: '', texto: 'Todas' }, ...acciones.map((a) => ({ valor: a.accion, texto: a.etiqueta }))]}
        />
        <Selector
          etiqueta="Sobre"
          value={filtro.recursoTipo}
          onChange={(e) => setFiltro({ ...filtro, recursoTipo: e.target.value })}
          opciones={[{ valor: '', texto: 'Todo' }, ...Object.entries(NOMBRE_RECURSO).map(([valor, texto]) => ({ valor, texto }))]}
        />
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
      </form>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!registros ? (
        <Cargando />
      ) : registros.length === 0 ? (
        error ? null : <Alerta tipo="info">No hay registros con esos filtros.</Alerta>
      ) : (
        <>
          <div className="tabla-desplazable">
            <table className="tabla auditoria-tabla">
              <caption className="texto-suave">{registros.length === 1 ? '1 registro' : `${registros.length} registros`}{siguiente ? ' (hay más)' : ''}</caption>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Sobre</th>
                  <th scope="col">IP</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td className="auditoria-tabla__fecha">{fechaHora(r.ocurridoEn)}</td>
                    <td>{r.etiqueta}</td>
                    <td>{quien(r)}</td>
                    <td>
                      {NOMBRE_RECURSO[r.recurso.tipo] ?? r.recurso.tipo}
                      {r.recurso.id ? <span className="texto-suave auditoria-tabla__id"> {r.recurso.id.length > 12 ? `${r.recurso.id.slice(0, 8)}…` : r.recurso.id}</span> : null}
                    </td>
                    <td className="auditoria-tabla__ip">{r.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {siguiente ? (
            <div>
              <Boton variante="fantasma" cargando={cargandoMas} onClick={() => void verMas()}>
                Ver más
              </Boton>
            </div>
          ) : null}
        </>
      )}
    </Tarjeta>
  );
}
