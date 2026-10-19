/**
 * Eventos de dominio de Contenido. Administración registra las transiciones del flujo de
 * publicación en la auditoría (RF-026, RF-077); la biblioteca reacciona a las publicaciones.
 */
export const EVENTOS_CONTENIDO = {
  LECTURA_CREADA: 'contenido.LecturaCreada',
  VERSION_CREADA: 'contenido.VersionLecturaCreada',
  ENVIADA_A_REVISION: 'contenido.LecturaEnviadaARevision',
  VERSION_PUBLICADA: 'contenido.VersionLecturaPublicada',
  VERSION_RECHAZADA: 'contenido.VersionLecturaRechazada',
  LECTURA_ARCHIVADA: 'contenido.LecturaArchivada',
  RECURSO_ADJUNTO: 'contenido.RecursoAdjunto',
} as const;
