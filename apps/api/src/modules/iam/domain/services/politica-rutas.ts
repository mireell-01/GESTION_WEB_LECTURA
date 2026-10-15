/**
 * Servicio de dominio: PoliticaRutas — RF-009: cada rol aterriza en su experiencia.
 */
const RUTA_POR_ROL: Record<string, string> = {
  ESTUDIANTE: '/estudiante',
  DOCENTE: '/docente',
  FAMILIAR: '/familia',
  EDITOR: '/backoffice',
  REVISOR: '/backoffice',
  ADMIN_PLATAFORMA: '/backoffice',
};

export class PoliticaRutas {
  static rutaInicial(rol: string): string {
    return RUTA_POR_ROL[rol] ?? '/';
  }
}
