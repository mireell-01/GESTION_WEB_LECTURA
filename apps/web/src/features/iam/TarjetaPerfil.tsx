'use client';

import { FormEvent, ReactNode, useState } from 'react';

import { Alerta, AVATARES, Avatar, Boton, BotonAvatar, Campo, Chip } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { NOMBRE_RANGO, PerfilEstudiante } from './tipos';

type Modo = 'ver' | 'editar' | 'pin' | 'eliminar';

/**
 * Gestión de un perfil por su adulto responsable (RF-008, RF-012, RF-013, RF-071):
 * editar avatar/alias, restablecer PIN, activar/desactivar, descargar datos y eliminar.
 */
export function TarjetaPerfil({
  perfil,
  onCambio,
  extra,
}: {
  perfil: PerfilEstudiante;
  onCambio: () => void;
  extra?: ReactNode;
}) {
  const [modo, setModo] = useState<Modo>('ver');
  const [alias, setAlias] = useState(perfil.alias);
  const [avatar, setAvatar] = useState(perfil.avatar);
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setOcupado(true);
    setMensaje(null);
    try {
      await accion();
      setMensaje({ tipo: 'exito', texto: exito });
      setModo('ver');
      onCambio();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setOcupado(false);
    }
  };

  const guardarEdicion = (e: FormEvent) => {
    e.preventDefault();
    void ejecutar(
      () => api(`/iam/perfiles-estudiante/${perfil.id}`, { metodo: 'PATCH', cuerpo: { alias, avatar } }),
      'Perfil actualizado.',
    );
  };

  const guardarPin = (e: FormEvent) => {
    e.preventDefault();
    void ejecutar(
      () => api(`/iam/perfiles-estudiante/${perfil.id}/pin`, { metodo: 'POST', cuerpo: { pinNuevo: pin } }),
      'PIN restablecido. Si el perfil estaba bloqueado, ya puede entrar.',
    ).then(() => setPin(''));
  };

  const descargar = async () => {
    setOcupado(true);
    try {
      const datos = await api<unknown>(`/iam/perfiles-estudiante/${perfil.id}/exportacion`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `lectoaventura-${perfil.alias}.json`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <article className="la-tarjeta pila-sm" style={{ opacity: perfil.activo ? 1 : 0.75 }}>
      <div className="fila">
        <Avatar clave={perfil.avatar} tamano={56} decorativo />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>{perfil.alias}</h3>
          <div className="fila" style={{ gap: 'var(--la-espacio-1)' }}>
            <Chip tipo="info">{NOMBRE_RANGO[perfil.rangoEdad]}</Chip>
            {!perfil.activo ? <Chip>Desactivado</Chip> : null}
            {perfil.bloqueadoHasta ? <Chip tipo="error">Bloqueado por PIN</Chip> : null}
          </div>
        </div>
      </div>

      {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}
      {extra}

      {modo === 'ver' ? (
        <div className="fila" style={{ gap: 'var(--la-espacio-2)' }}>
          <Boton variante="fantasma" tamano="pequeno" onClick={() => setModo('editar')}>
            Editar
          </Boton>
          <Boton variante="fantasma" tamano="pequeno" onClick={() => setModo('pin')}>
            Cambiar PIN
          </Boton>
          <Boton
            variante="fantasma"
            tamano="pequeno"
            disabled={ocupado}
            onClick={() =>
              ejecutar(
                () => api(`/iam/perfiles-estudiante/${perfil.id}`, { metodo: 'PATCH', cuerpo: { activo: !perfil.activo } }),
                perfil.activo ? 'Perfil desactivado.' : 'Perfil activado.',
              )
            }
          >
            {perfil.activo ? 'Desactivar' : 'Activar'}
          </Boton>
          <Boton variante="fantasma" tamano="pequeno" disabled={ocupado} onClick={descargar}>
            Descargar datos
          </Boton>
          <Boton variante="fantasma" tamano="pequeno" onClick={() => setModo('eliminar')}>
            Eliminar
          </Boton>
        </div>
      ) : null}

      {modo === 'editar' ? (
        <form onSubmit={guardarEdicion}>
          <Campo etiqueta="Alias" value={alias} maxLength={20} onChange={(e) => setAlias(e.target.value)} />
          <div className="fila" style={{ marginBottom: 'var(--la-espacio-3)' }}>
            {Object.entries(AVATARES).map(([clave, a]) => (
              <BotonAvatar key={clave} clave={clave} texto={a.nombre} seleccionado={avatar === clave} onClick={() => setAvatar(clave)} />
            ))}
          </div>
          <div className="fila">
            <Boton type="submit" tamano="pequeno" cargando={ocupado}>
              Guardar
            </Boton>
            <Boton variante="fantasma" tamano="pequeno" onClick={() => setModo('ver')}>
              Cancelar
            </Boton>
          </div>
        </form>
      ) : null}

      {modo === 'pin' ? (
        <form onSubmit={guardarPin}>
          <Campo
            etiqueta="Nuevo PIN de 4 números"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <div className="fila">
            <Boton type="submit" tamano="pequeno" cargando={ocupado} disabled={pin.length !== 4}>
              Guardar PIN
            </Boton>
            <Boton variante="fantasma" tamano="pequeno" onClick={() => setModo('ver')}>
              Cancelar
            </Boton>
          </div>
        </form>
      ) : null}

      {modo === 'eliminar' ? (
        <div>
          <Alerta tipo="error">
            Se borrarán los datos personales de <strong>{perfil.alias}</strong> y sus respuestas escritas. Esta acción no se
            puede deshacer. Escribe el alias para confirmar.
          </Alerta>
          <Campo etiqueta="Alias del perfil" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
          <div className="fila">
            <Boton
              variante="peligro"
              tamano="pequeno"
              cargando={ocupado}
              disabled={confirmacion.trim() !== perfil.alias}
              onClick={() =>
                ejecutar(() => api(`/iam/perfiles-estudiante/${perfil.id}`, { metodo: 'DELETE' }), 'Perfil eliminado.')
              }
            >
              Eliminar definitivamente
            </Boton>
            <Boton variante="fantasma" tamano="pequeno" onClick={() => setModo('ver')}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : null}
    </article>
  );
}
