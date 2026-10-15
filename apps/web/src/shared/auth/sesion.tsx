'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { alTerminarSesion, api, fijarAccessToken, renovarSesion, RespuestaSesion } from '../api/client';

export type Rol = 'ESTUDIANTE' | 'DOCENTE' | 'FAMILIAR' | 'EDITOR' | 'REVISOR' | 'ADMIN_PLATAFORMA';

export interface Usuario {
  id: string;
  rol: Rol;
  mfa: boolean;
  nombre?: string;
  email?: string;
  mfaHabilitado?: boolean;
  alias?: string;
  avatar?: string;
  rangoEdad?: 'R1' | 'R2' | 'R3';
}

interface ContextoSesion {
  usuario: Usuario | null;
  cargando: boolean;
  /** Guarda la sesión emitida por la API y carga el usuario. Devuelve la ruta inicial del rol. */
  iniciar: (respuesta: RespuestaSesion) => Promise<string>;
  /** Cierra la sesión en la API y recarga la app en `destino` (no deja datos del usuario en memoria). */
  salir: (destino: string) => Promise<void>;
  recargarUsuario: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

export const RUTA_POR_ROL: Record<Rol, string> = {
  ESTUDIANTE: '/estudiante',
  DOCENTE: '/docente',
  FAMILIAR: '/familia',
  EDITOR: '/backoffice',
  REVISOR: '/backoffice',
  ADMIN_PLATAFORMA: '/backoffice',
};

/**
 * Proveedor de sesión: al abrir la app intenta recuperar la sesión con la cookie de refresh.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargarUsuario = useCallback(async () => {
    setUsuario(await api<Usuario>('/iam/yo'));
  }, []);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const sesion = await renovarSesion();
      if (sesion && vigente) {
        try {
          setUsuario(await api<Usuario>('/iam/yo'));
        } catch {
          setUsuario(null);
        }
      }
      if (vigente) setCargando(false);
    })();
    const quitar = alTerminarSesion(() => setUsuario(null));
    return () => {
      vigente = false;
      quitar();
    };
  }, []);

  const iniciar = useCallback(async (respuesta: RespuestaSesion) => {
    fijarAccessToken(respuesta.accessToken);
    setUsuario(await api<Usuario>('/iam/yo'));
    return respuesta.rutaInicial;
  }, []);

  const salir = useCallback(async (destino: string) => {
    try {
      await api('/iam/sesiones/cerrar', { metodo: 'POST' });
    } catch {
      // Si la sesión ya había caducado, igual se limpia localmente.
    }
    fijarAccessToken(null);
    // Recarga completa: evita que el guard de rutas redirija al ingreso antes de llegar al destino
    // y borra de la memoria los datos del usuario anterior (tablets compartidas, riesgo R-02).
    window.location.replace(destino);
  }, []);

  const valor = useMemo(
    () => ({ usuario, cargando, iniciar, salir, recargarUsuario }),
    [usuario, cargando, iniciar, salir, recargarUsuario],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return ctx;
}
