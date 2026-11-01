'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Chip, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { DocenteAdmin, ESTADO_CUENTA, EstadoCuenta } from './tipos';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * RF-076: la administración da de alta, suspende y reactiva cuentas docentes. Suspender (decisión del
 * Product Owner): pierde el acceso al instante; sus aulas quedan en solo lectura y sus estudiantes siguen leyendo.
 */
export function Docentes() {
  const [lista, setLista] = useState<DocenteAdmin[] | null>(null);
  const [filtro, setFiltro] = useState<{ texto: string; estado: '' | EstadoCuenta }>({ texto: '', estado: '' });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [alta, setAlta] = useState({ nombre: '', email: '' });
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const cargar = useCallback(async (f: typeof filtro) => {
    const q = new URLSearchParams({ ...(f.texto.trim() ? { texto: f.texto.trim() } : {}), ...(f.estado ? { estado: f.estado } : {}) });
    try {
      setLista(await api<DocenteAdmin[]>(`/admin/docentes${q.size ? `?${q}` : ''}`));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, []);

  useEffect(() => {
    void cargar({ texto: '', estado: '' });
  }, [cargar]);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    void cargar(filtro);
  };

  const darDeAlta = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const d = await api<DocenteAdmin>('/admin/docentes', { metodo: 'POST', cuerpo: alta });
      setLista((l) => [d, ...(l ?? [])]);
      setAlta({ nombre: '', email: '' });
      setAviso(`Listo: le enviamos a ${d.email} un enlace para crear su contraseña (vence en 72 horas).`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = async (d: DocenteAdmin, suspender: boolean) => {
    setCambiando(d.id);
    setError(null);
    setAviso(null);
    try {
      const nuevo = await api<DocenteAdmin>(`/admin/docentes/${d.id}/suspension`, { metodo: suspender ? 'POST' : 'DELETE' });
      setLista((l) => (l ?? []).map((x) => (x.id === d.id ? nuevo : x)));
      setAviso(
        suspender
          ? `${d.nombre}: cuenta suspendida, ya no puede ingresar.${nuevo.aulas === 1 ? ' Su aula queda en solo lectura y sus estudiantes siguen leyendo.' : nuevo.aulas > 1 ? ' Sus aulas quedan en solo lectura y sus estudiantes siguen leyendo.' : ''}`
          : `${d.nombre} puede ingresar otra vez.`,
      );
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
            <Icono nombre="perfil" tamano={30} />
            Docentes
          </span>
        }
      >
        <form className="admin-filtros" onSubmit={buscar} role="search" aria-label="Buscar docentes">
          <Campo etiqueta="Nombre o correo" value={filtro.texto} maxLength={80} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
          <Selector
            etiqueta="Estado"
            value={filtro.estado}
            onChange={(e) => setFiltro({ ...filtro, estado: e.target.value as typeof filtro.estado })}
            opciones={[
              { valor: '', texto: 'Todos' },
              { valor: 'ACTIVA', texto: 'Activas' },
              { valor: 'PENDIENTE_VERIFICACION', texto: 'Sin contraseña aún' },
              { valor: 'SUSPENDIDA', texto: 'Suspendidas' },
            ]}
          />
          <Boton type="submit" variante="secundario">
            Buscar
          </Boton>
        </form>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {aviso ? (
          <Alerta tipo="exito">
            <span className="texto-partible">{aviso}</span>
          </Alerta>
        ) : null}
        {!lista ? (
          error ? null : <Cargando />
        ) : lista.length === 0 ? (
          <Alerta tipo="info">No hay docentes con esos datos.</Alerta>
        ) : (
          <ul className="admin-lista" aria-label="Cuentas docentes">
            {lista.map((d) => {
              const estado = ESTADO_CUENTA[d.estado];
              return (
                <li key={d.id} className="admin-fila" aria-label={d.nombre}>
                  <span className="admin-fila__datos">
                    <strong>{d.nombre}</strong>
                    <span className="texto-suave admin-fila__correo">{d.email}</span>
                    <span className="fila fila--compacta">
                      <Chip tipo={estado.tipo}>{estado.texto}</Chip>
                      <Chip>
                        {plural(d.aulas, 'aula', 'aulas')} · {plural(d.estudiantes, 'estudiante', 'estudiantes')}
                      </Chip>
                      {d.aulasEnSoloLectura ? <Chip tipo="aviso">Aulas en solo lectura</Chip> : null}
                    </span>
                    {confirmando === d.id ? (
                      <span className="admin-fila__aviso" role="note">
                        Perderá el acceso al instante.
                        {d.aulas === 1 ? ' Su aula queda en solo lectura; sus estudiantes siguen leyendo.' : d.aulas > 1 ? ` Sus ${d.aulas} aulas quedan en solo lectura; sus estudiantes siguen leyendo.` : ''}
                      </span>
                    ) : null}
                  </span>
                  <span className="admin-fila__acciones">
                    {d.estado === 'SUSPENDIDA' ? (
                      <Boton variante="secundario" tamano="pequeno" cargando={cambiando === d.id} onClick={() => void cambiar(d, false)}>
                        Reactivar
                      </Boton>
                    ) : confirmando === d.id ? (
                      <>
                        <Boton variante="peligro" tamano="pequeno" cargando={cambiando === d.id} onClick={() => void cambiar(d, true)}>
                          Sí, suspender
                        </Boton>
                        <Boton variante="fantasma" tamano="pequeno" onClick={() => setConfirmando(null)}>
                          Cancelar
                        </Boton>
                      </>
                    ) : (
                      <Boton variante="fantasma" tamano="pequeno" onClick={() => setConfirmando(d.id)}>
                        Suspender
                      </Boton>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Dar de alta a un docente">
        <p className="texto-suave" style={{ margin: 0 }}>
          Le llegará un correo para crear su contraseña (el enlace vence en 72 horas). Los docentes también pueden registrarse por su cuenta.
        </p>
        <form className="admin-formulario" onSubmit={darDeAlta}>
          <Campo etiqueta="Nombre y apellido" value={alta.nombre} maxLength={120} required onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
          <Campo etiqueta="Correo" type="email" value={alta.email} maxLength={254} required onChange={(e) => setAlta({ ...alta, email: e.target.value })} />
          <div>
            <Boton type="submit" cargando={guardando}>
              Dar de alta
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
