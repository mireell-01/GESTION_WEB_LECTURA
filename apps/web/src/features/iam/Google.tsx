'use client';

import { useEffect, useState } from 'react';

import { Alerta, Boton } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

/**
 * Ingreso con Google para docentes y familias (la API usa OpenID Connect con PKCE). El botón solo aparece si la
 * plataforma lo tiene disponible; en la computadora del equipo, sin credenciales de Google, abre el "Google de prueba".
 */
interface Disponibilidad {
  disponible: boolean;
  simulado: boolean;
}

/** La "G" de Google, como piden sus pautas para los botones de ingreso. */
export function LogoGoogle({ tamano = 20 }: { tamano?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={tamano} height={tamano} aria-hidden="true" focusable="false" className="logo-google">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function useDisponibilidad(): Disponibilidad | null {
  const [d, setD] = useState<Disponibilidad | null>(null);
  useEffect(() => {
    api<Disponibilidad>('/auth/google/disponible')
      .then(setD)
      .catch(() => setD(null));
  }, []);
  return d;
}

/** Ingresar o registrarse con Google: un enlace (navegación completa) a la API, que lleva a Google y vuelve. */
export function BotonGoogle({ intencion, rol, texto }: { intencion: 'ingresar' | 'registrar'; rol?: 'DOCENTE' | 'FAMILIAR'; texto: string }) {
  const d = useDisponibilidad();
  if (!d?.disponible) return null;
  const q = new URLSearchParams({ intencion, ...(rol ? { rol } : {}) });
  return (
    <div className="pila-sm">
      <a className="boton-google" href={`/api/v1/auth/google/inicio?${q}`}>
        <LogoGoogle />
        <span>{texto}</span>
      </a>
      {d.simulado ? <span className="boton-google__nota">En esta computadora se abre un «Google de prueba».</span> : null}
    </div>
  );
}

/** Lo que pasó con Google (`?google=<codigo>` en la URL), con palabras simples. */
const MENSAJES: Record<string, { tipo: 'exito' | 'info' | 'aviso' | 'error'; texto: string }> = {
  vinculada: { tipo: 'exito', texto: '¡Listo! Tu cuenta quedó vinculada con Google: la próxima vez ingresa con un clic.' },
  'sin-cuenta': { tipo: 'info', texto: 'No encontramos una cuenta con ese correo de Google. Créala con «Registrarme con Google» y elige si eres familiar o docente.' },
  'no-permitido': { tipo: 'error', texto: 'Esta cuenta ingresa con su contraseña (y su código, si activó la verificación en dos pasos). Con Google ingresan docentes y familias.' },
  suspendida: { tipo: 'error', texto: 'Esta cuenta está suspendida. Escribe a la administración de la plataforma.' },
  'correo-no-verificado': { tipo: 'aviso', texto: 'Tu cuenta de Google aún no confirmó su correo. Confírmalo en Google y vuelve a intentarlo.' },
  cancelado: { tipo: 'info', texto: 'Cancelaste el ingreso con Google. Puedes intentarlo otra vez cuando quieras.' },
  vencido: { tipo: 'aviso', texto: 'El ingreso con Google tardó demasiado o se abrió en otra pestaña. Vuelve a intentarlo.' },
  'ya-vinculada': { tipo: 'error', texto: 'Esa cuenta de Google ya está vinculada a otra cuenta de LectoAventura.' },
  'no-disponible': { tipo: 'aviso', texto: 'El ingreso con Google no está disponible por ahora. Ingresa con tu correo y tu contraseña.' },
  error: { tipo: 'error', texto: 'No pudimos completar el ingreso con Google. Inténtalo de nuevo.' },
};

export function AvisoGoogle({ codigo }: { codigo: string | null | undefined }) {
  const m = codigo ? MENSAJES[codigo] : undefined;
  return m ? <Alerta tipo={m.tipo}>{m.texto}</Alerta> : null;
}

/** El `?google=` de la URL, leído en el navegador (las páginas del panel no esperan parámetros). */
export function useCodigoGoogle(): string | null {
  const [codigo, setCodigo] = useState<string | null>(null);
  useEffect(() => setCodigo(new URLSearchParams(window.location.search).get('google')), []);
  return codigo;
}

interface EstadoGoogle extends Disponibilidad {
  vinculada: boolean;
  puedeUsar: boolean;
}

/** En "Seguridad de tu cuenta": vincular o desvincular su cuenta de Google (docentes y familias). */
export function CuentaGoogle() {
  const [estado, setEstado] = useState<EstadoGoogle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const codigo = useCodigoGoogle();

  useEffect(() => {
    api<EstadoGoogle>('/auth/google/estado')
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  if (!estado?.disponible) return null;

  const vincular = async () => {
    setError(null);
    setOcupado(true);
    try {
      const { url } = await api<{ url: string }>('/auth/google/vincular', { metodo: 'POST' });
      window.location.assign(url);
    } catch (err) {
      setError(mensajeDeError(err));
      setOcupado(false);
    }
  };

  const desvincular = async () => {
    setError(null);
    setOcupado(true);
    try {
      await api('/auth/google/desvincular', { metodo: 'POST' });
      setEstado({ ...estado, vinculada: false });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cuenta-google pila-sm" aria-labelledby="cuenta-google-titulo">
      <h3 id="cuenta-google-titulo" className="cuenta-google__titulo">
        <LogoGoogle tamano={22} />
        Ingreso con Google
      </h3>
      <AvisoGoogle codigo={codigo} />
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {estado.vinculada ? (
        <>
          <p className="texto-suave">Tu cuenta está vinculada con Google: puedes ingresar con un clic. Tu contraseña sigue sirviendo.</p>
          <div>
            <Boton variante="fantasma" cargando={ocupado} onClick={desvincular}>
              Desvincular Google
            </Boton>
          </div>
        </>
      ) : estado.puedeUsar ? (
        <>
          <p className="texto-suave">Vincula tu cuenta de Google para ingresar con un clic, sin escribir tu contraseña.</p>
          <div>
            <button type="button" className="boton-google" onClick={vincular} disabled={ocupado}>
              <LogoGoogle />
              <span>Vincular con Google</span>
            </button>
          </div>
        </>
      ) : (
        <p className="texto-suave">Como activaste la verificación en dos pasos, sigues ingresando con tu contraseña y tu código.</p>
      )}
    </section>
  );
}
