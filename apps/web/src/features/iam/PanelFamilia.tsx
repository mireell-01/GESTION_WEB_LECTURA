'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';
import { guardarTokenDispositivo, leerTokenDispositivo } from '@/shared/auth/dispositivo';
import { useSesion } from '@/shared/auth/sesion';

import { ConfigurarMfa } from './ConfigurarMfa';
import { DatosPerfilNuevo, FormularioPerfil } from './FormularioPerfil';
import { TarjetaPerfil } from './TarjetaPerfil';
import { PerfilEstudiante } from './tipos';

const MAX_PERFILES = 6;

interface EstadoConsentimiento {
  vigente: boolean;
  versionPolitica: string | null;
  otorgadoEn: string | null;
  otorgante: string | null;
}

/** RF-005: consentimiento parental antes de crear el primer perfil. */
function FormularioConsentimiento({ onListo }: { onListo: () => void }) {
  const { usuario } = useSesion();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api('/consentimientos', { metodo: 'POST', cuerpo: { otorganteNombre: nombre, aceptaPolitica: acepta } });
      onListo();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta titulo="Antes de empezar: tu consentimiento">
      <form onSubmit={enviar} className="pila-sm">
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <p style={{ margin: 0 }}>Para crear el perfil de una niña o niño necesitamos tu autorización como adulto responsable.</p>
        <ul style={{ margin: 0 }}>
          <li>Solo guardamos alias, mes y año de nacimiento, avatar y un PIN cifrado. Nunca apellidos, documento, foto ni correo.</li>
          <li>El progreso de lectura se usa solo para recomendar actividades y para que tú y su docente lo acompañen.</li>
          <li>Puedes descargar o eliminar sus datos cuando quieras (Ley N.º 29733).</li>
        </ul>
        <Campo etiqueta="Tu nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <label className="fila" style={{ gap: 'var(--la-espacio-2)', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} style={{ width: 22, height: 22 }} />
          <span>Soy la persona adulta responsable y acepto la política de privacidad de LectoAventura.</span>
        </label>
        <Boton type="submit" cargando={enviando} disabled={!acepta || nombre.trim().length < 3}>
          Dar consentimiento
        </Boton>
      </form>
    </Tarjeta>
  );
}

/** RF-007 / RN-04: vincula esta tablet o computadora para que los niños entren con avatar + PIN. */
function VincularDispositivo() {
  const [vinculado, setVinculado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => setVinculado(!!leerTokenDispositivo()), []);

  const vincular = async () => {
    setOcupado(true);
    setError(null);
    try {
      const r = await api<{ tokenDispositivo: string }>('/familia/dispositivos', {
        metodo: 'POST',
        cuerpo: { nombre: navigator.userAgent.includes('Mobile') ? 'Celular o tablet' : 'Computadora' },
      });
      guardarTokenDispositivo(r.tokenDispositivo);
      setVinculado(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Tarjeta titulo="📱 Ingreso de los niños en este dispositivo">
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {vinculado ? (
        <Alerta tipo="exito">
          Este dispositivo está vinculado por 30 días. Tus hijos entran en <strong>“Soy estudiante”</strong> con su avatar y PIN.
        </Alerta>
      ) : (
        <p>Vincúlalo una vez y tus hijos podrán entrar solos con su avatar y su PIN, sin tu contraseña.</p>
      )}
      <Boton variante={vinculado ? 'fantasma' : 'primario'} onClick={vincular} cargando={ocupado}>
        {vinculado ? 'Renovar vínculo' : 'Vincular este dispositivo'}
      </Boton>
    </Tarjeta>
  );
}

/** Panel familiar: hijos, consentimiento, dispositivo y seguridad de la cuenta. */
export function PanelFamilia({ renderExtraPerfil }: { renderExtraPerfil?: (perfil: PerfilEstudiante) => ReactNode }) {
  const { usuario } = useSesion();
  const [consentimiento, setConsentimiento] = useState<EstadoConsentimiento | null>(null);
  const [perfiles, setPerfiles] = useState<PerfilEstudiante[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api<EstadoConsentimiento>('/consentimientos/vigente'),
        api<PerfilEstudiante[]>('/familia/estudiantes'),
      ]);
      setConsentimiento(c);
      setPerfiles(p);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async (datos: DatosPerfilNuevo) => {
    await api('/estudiantes', { metodo: 'POST', cuerpo: datos });
    setCreando(false);
    await cargar();
  };

  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!consentimiento || !perfiles) return <Cargando />;

  return (
    <div className="pila">
      <div>
        <h1>Hola, {usuario?.nombre?.split(' ')[0]} 👋</h1>
        <p className="texto-suave" style={{ margin: 0 }}>
          Acompaña la aventura lectora de tus hijos desde casa.
        </p>
      </div>

      {!consentimiento.vigente ? (
        <FormularioConsentimiento onListo={cargar} />
      ) : (
        <>
          <Tarjeta
            titulo={`Mis hijos (${perfiles.length}/${MAX_PERFILES})`}
            acciones={
              !creando && perfiles.length < MAX_PERFILES ? (
                <Boton tamano="pequeno" onClick={() => setCreando(true)}>
                  + Agregar perfil
                </Boton>
              ) : null
            }
          >
            {creando ? (
              <FormularioPerfil onGuardar={crear} onCancelar={() => setCreando(false)} />
            ) : perfiles.length === 0 ? (
              <Alerta tipo="info">Crea el primer perfil para que tu hija o hijo empiece su aventura.</Alerta>
            ) : (
              <div className="rejilla">
                {perfiles.map((p) => (
                  <TarjetaPerfil key={p.id} perfil={p} onCambio={cargar} extra={renderExtraPerfil?.(p)} />
                ))}
              </div>
            )}
          </Tarjeta>
          {perfiles.length > 0 ? <VincularDispositivo /> : null}
        </>
      )}

      <Tarjeta titulo="🔐 Seguridad de tu cuenta">
        {usuario?.mfaHabilitado ? (
          <Alerta tipo="exito">La verificación en dos pasos está activa.</Alerta>
        ) : (
          <>
            <p className="texto-suave">Opcional: pide un código de tu celular además de la contraseña.</p>
            <ConfigurarMfa />
          </>
        )}
      </Tarjeta>
    </div>
  );
}
