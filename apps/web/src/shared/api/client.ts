/**
 * Cliente HTTP único entre la web y la API (mismo origen, /api se reenvía a NestJS).
 * El access token vive solo en memoria; el refresh token en cookie httpOnly que la página no ve.
 * Ante un 401 intenta renovar la sesión una vez y repite la petición.
 */

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly detalle?: Record<string, unknown>,
  ) {
    super(mensaje);
  }
}

export interface RespuestaSesion {
  accessToken: string;
  expiraEnMin: number;
  rol: string;
  rutaInicial: string;
  requiereConfigurarMfa: boolean;
}

let accessToken: string | null = null;
let renovacionEnCurso: Promise<RespuestaSesion | null> | null = null;
const oyentesSesionTerminada = new Set<() => void>();

export function fijarAccessToken(token: string | null): void {
  accessToken = token;
}

export function alTerminarSesion(oyente: () => void): () => void {
  oyentesSesionTerminada.add(oyente);
  return () => oyentesSesionTerminada.delete(oyente);
}

/** Pide un access token nuevo con la cookie de refresh. Varias llamadas simultáneas comparten una. */
export function renovarSesion(): Promise<RespuestaSesion | null> {
  renovacionEnCurso ??= fetch('/api/iam/sesiones/renovar', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return null;
      const datos = (await res.json()) as RespuestaSesion;
      accessToken = datos.accessToken;
      return datos;
    })
    .catch(() => null)
    .finally(() => {
      renovacionEnCurso = null;
    });
  return renovacionEnCurso;
}

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
}

export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const ejecutar = () =>
    fetch(`/api${ruta}`, {
      method: opciones.metodo ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...opciones.cabeceras,
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    });

  let res = await ejecutar();
  if (res.status === 401 && accessToken) {
    const renovada = await renovarSesion();
    if (renovada) {
      res = await ejecutar();
    }
  }

  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as { mensaje?: string; detalle?: Record<string, unknown> };
    if (res.status === 401 && accessToken) {
      accessToken = null;
      oyentesSesionTerminada.forEach((o) => o());
    }
    throw new ErrorApi(res.status, cuerpo.mensaje ?? 'No pudimos completar la acción. Inténtalo de nuevo.', cuerpo.detalle);
  }

  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Mensaje legible de cualquier error capturado. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
}
