/**
 * Cliente HTTP único entre la web y la API `/api/v1` (mismo origen: Next.js reenvía /api a NestJS).
 * El access token vive solo en memoria; el refresh token en una cookie httpOnly que la página no ve.
 * Ante un 401 intenta renovar la sesión una vez y repite la petición.
 */
export const BASE_API = '/api/v1';

/** Error de la API en formato RFC 9457 (Problem Details), con sus miembros de extensión. */
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
  renovacionEnCurso ??= fetch(`${BASE_API}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
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
  /** Archivo binario (p. ej. una imagen para su URL de subida firmada, RF-023). */
  binario?: Blob;
  cabeceras?: Record<string, string>;
}

/** Hace la petición, renueva la sesión una vez ante un 401 y convierte los errores en ErrorApi. */
async function solicitar(ruta: string, opciones: Opciones): Promise<Response> {
  const ejecutar = () =>
    fetch(`${BASE_API}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opciones.binario ? { 'Content-Type': 'application/octet-stream' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...opciones.cabeceras,
      },
      body: opciones.binario ?? (opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined),
    });

  let res = await ejecutar();
  if (res.status === 401 && accessToken) {
    const renovada = await renovarSesion();
    if (renovada) {
      res = await ejecutar();
    }
  }

  if (!res.ok) {
    const problema = (await res.json().catch(() => ({}))) as { detail?: string } & Record<string, unknown>;
    if (res.status === 401 && accessToken) {
      accessToken = null;
      oyentesSesionTerminada.forEach((o) => o());
    }
    throw new ErrorApi(res.status, problema.detail ?? 'No pudimos completar la acción. Inténtalo de nuevo.', problema);
  }
  return res;
}

export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const res = await solicitar(ruta, opciones);
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/**
 * Descarga un archivo generado por la API (p. ej. las tarjetas en PDF, RF-017) con la misma sesión.
 * El nombre sale de Content-Disposition.
 */
export async function apiArchivo(ruta: string, opciones: Opciones = {}): Promise<{ archivo: Blob; nombre: string }> {
  const res = await solicitar(ruta, opciones);
  const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'archivo';
  return { archivo: await res.blob(), nombre };
}

/** Mensaje legible de cualquier error capturado. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
}
