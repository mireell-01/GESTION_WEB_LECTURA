/** Tipos de la administración de la plataforma (RF-076 a RF-078), como los entrega la API. */

export type EstadoInstitucion = 'ACTIVA' | 'SUSPENDIDA';
export type EstadoCuenta = 'PENDIENTE_VERIFICACION' | 'ACTIVA' | 'SUSPENDIDA';

export interface InstitucionAdmin {
  id: string;
  nombre: string;
  codigoModular: string | null;
  region: string | null;
  estado: EstadoInstitucion;
  creadaEn: string;
  aulas: number;
  docentes: number;
  estudiantes: number;
}

export interface DocenteAdmin {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoCuenta;
  creadoEn: string;
  aulas: number;
  estudiantes: number;
  aulasEnSoloLectura: boolean;
}

export const ESTADO_CUENTA: Record<EstadoCuenta, { texto: string; tipo: 'exito' | 'aviso' | 'error' }> = {
  ACTIVA: { texto: 'Activa', tipo: 'exito' },
  PENDIENTE_VERIFICACION: { texto: 'Aún no crea su contraseña', tipo: 'aviso' },
  SUSPENDIDA: { texto: 'Suspendida', tipo: 'error' },
};

export interface RegistroAuditoria {
  id: string;
  ocurridoEn: string;
  accion: string;
  etiqueta: string;
  actor: { id: string | null; nombre: string | null; rol: string | null };
  recurso: { tipo: string; id: string | null };
  ip: string | null;
  datos: Record<string, unknown>;
}

export interface PaginaAuditoria {
  registros: RegistroAuditoria[];
  siguiente: string | null;
}

export const NOMBRE_ROL: Record<string, string> = {
  ESTUDIANTE: 'Estudiante',
  DOCENTE: 'Docente',
  FAMILIAR: 'Familia',
  EDITOR: 'Editor',
  REVISOR: 'Revisor',
  ADMIN_PLATAFORMA: 'Administración',
};

export const NOMBRE_RECURSO: Record<string, string> = {
  perfil_estudiante: 'Estudiante',
  cuenta_adulta: 'Cuenta',
  aula: 'Aula',
  institucion: 'Institución',
  lectura: 'Lectura',
  mision: 'Misión',
  mundo: 'Mundo',
  consentimiento: 'Consentimiento',
  dispositivo: 'Dispositivo',
  sesion: 'Sesión',
  parametro_gamificacion: 'Parámetros (versión)',
  auditoria: 'Auditoría',
};

export interface Rango {
  min: number;
  max: number;
}

export interface ParametrosEditables {
  puntos: {
    lecturaCompletada: number;
    itemCorrecto: number;
    correctoTrasPista: number;
    subidaNivelCneb: number;
    retoDelDia: number;
    racha: Record<string, number>;
  };
  antiFarming: { porcentajeRepeticion: number; topeDiario: number };
  nivelLector: { base: number };
  respuestasAbiertas: { palabrasMinimasR2: number; palabrasMinimasR3: number };
  insignias: Record<string, number>;
}

export interface UmbralInsignia {
  codigo: string;
  nombre: string;
  tipo: 'LECTURAS' | 'EVIDENCIAS' | 'RACHA';
  umbralCatalogo: number;
  umbral: number;
}

export interface ParametrosVigentes {
  version: number;
  vigenteDesde: string | null;
  creadoPor: string | null;
  parametros: ParametrosEditables;
  insignias: UmbralInsignia[];
  limites: {
    puntos: Rango;
    rachaDias: Rango;
    rachaBono: Rango;
    porcentajeRepeticion: Rango;
    topeDiario: Rango;
    baseNivel: Rango;
    palabras: Rango;
    umbralInsignia: Rango;
  };
}

export interface VersionParametros {
  version: number;
  vigenteDesde: string;
  creadoPor: string | null;
}

/** Fecha y hora de Lima, como se ve en todo el producto. */
export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });
}
