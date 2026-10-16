-- =============================================================================
-- Estructura completa del SRS §7: un schema por bounded context, nombres en snake_case,
-- identificadores UUID y fechas TIMESTAMPTZ. Las 11 tablas existentes se MUEVEN y RENOMBRAN
-- conservando todos sus datos; luego se crean las tablas de los demás módulos, las reglas de
-- negocio como restricciones, los datos de catálogo del SRS y las vistas de reportes.
-- =============================================================================

-- ── 1. Schemas por bounded context ───────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS "iam";
CREATE SCHEMA IF NOT EXISTS "escuela";
CREATE SCHEMA IF NOT EXISTS "contenido";
CREATE SCHEMA IF NOT EXISTS "aventura";
CREATE SCHEMA IF NOT EXISTS "diagnostico";
CREATE SCHEMA IF NOT EXISTS "lectura";
CREATE SCHEMA IF NOT EXISTS "progreso";
CREATE SCHEMA IF NOT EXISTS "gamificacion";
CREATE SCHEMA IF NOT EXISTS "asistente";
CREATE SCHEMA IF NOT EXISTS "admin";
CREATE SCHEMA IF NOT EXISTS "reporting";

-- ── 2. Quitar llaves foráneas e índices secundarios con nombres antiguos ────
ALTER TABLE "PerfilEstudiante" DROP CONSTRAINT "PerfilEstudiante_cuentaResponsableId_fkey";
ALTER TABLE "Consentimiento" DROP CONSTRAINT "Consentimiento_cuentaResponsableId_fkey";
ALTER TABLE "Verificacion" DROP CONSTRAINT "Verificacion_cuentaId_fkey";
ALTER TABLE "DispositivoIngreso" DROP CONSTRAINT "DispositivoIngreso_cuentaId_fkey";
ALTER TABLE "Matricula" DROP CONSTRAINT "Matricula_aulaId_fkey";

DROP INDEX "Cuenta_email_key";
DROP INDEX "Cuenta_rol_idx";
DROP INDEX "PerfilEstudiante_cuentaResponsableId_idx";
DROP INDEX "Consentimiento_cuentaResponsableId_tipo_vigente_idx";
DROP INDEX "Verificacion_codigo_key";
DROP INDEX "Verificacion_cuentaId_tipo_idx";
DROP INDEX "Sesion_hashRefreshToken_key";
DROP INDEX "Sesion_sujetoId_idx";
DROP INDEX "RefreshTokenUsado_sesionId_idx";
DROP INDEX "Exportacion_perfilId_idx";
DROP INDEX "Exportacion_expiraEn_idx";
DROP INDEX "DispositivoIngreso_hashToken_key";
DROP INDEX "DispositivoIngreso_cuentaId_idx";
DROP INDEX "DispositivoIngreso_aulaId_idx";
DROP INDEX "Aula_codigo_key";
DROP INDEX "Aula_docenteId_idx";
DROP INDEX "Matricula_aulaId_estudianteId_key";
DROP INDEX "Matricula_estudianteId_idx";
DROP INDEX "OutboxEvento_publicadoEn_idx";
DROP INDEX "OutboxEvento_tipo_agregadoId_idx";

-- ── 3. Mover cada tabla a su schema y darle el nombre del SRS ───────────────
ALTER TABLE "Cuenta" SET SCHEMA "iam";
ALTER TABLE "iam"."Cuenta" RENAME TO "cuenta_adulta";
ALTER TABLE "iam"."cuenta_adulta" RENAME CONSTRAINT "Cuenta_pkey" TO "cuenta_adulta_pkey";

ALTER TABLE "PerfilEstudiante" SET SCHEMA "iam";
ALTER TABLE "iam"."PerfilEstudiante" RENAME TO "perfil_estudiante";
ALTER TABLE "iam"."perfil_estudiante" RENAME CONSTRAINT "PerfilEstudiante_pkey" TO "perfil_estudiante_pkey";

ALTER TABLE "Consentimiento" SET SCHEMA "iam";
ALTER TABLE "iam"."Consentimiento" RENAME TO "consentimiento";
ALTER TABLE "iam"."consentimiento" RENAME CONSTRAINT "Consentimiento_pkey" TO "consentimiento_pkey";

ALTER TABLE "Verificacion" SET SCHEMA "iam";
ALTER TABLE "iam"."Verificacion" RENAME TO "verificacion_correo";
ALTER TABLE "iam"."verificacion_correo" RENAME CONSTRAINT "Verificacion_pkey" TO "verificacion_correo_pkey";

ALTER TABLE "Sesion" SET SCHEMA "iam";
ALTER TABLE "iam"."Sesion" RENAME TO "refresh_token";
ALTER TABLE "iam"."refresh_token" RENAME CONSTRAINT "Sesion_pkey" TO "refresh_token_pkey";

ALTER TABLE "RefreshTokenUsado" SET SCHEMA "iam";
ALTER TABLE "iam"."RefreshTokenUsado" RENAME TO "refresh_token_usado";
ALTER TABLE "iam"."refresh_token_usado" RENAME CONSTRAINT "RefreshTokenUsado_pkey" TO "refresh_token_usado_pkey";

ALTER TABLE "Exportacion" SET SCHEMA "iam";
ALTER TABLE "iam"."Exportacion" RENAME TO "exportacion";
ALTER TABLE "iam"."exportacion" RENAME CONSTRAINT "Exportacion_pkey" TO "exportacion_pkey";

ALTER TABLE "DispositivoIngreso" SET SCHEMA "iam";
ALTER TABLE "iam"."DispositivoIngreso" RENAME TO "dispositivo_ingreso";
ALTER TABLE "iam"."dispositivo_ingreso" RENAME CONSTRAINT "DispositivoIngreso_pkey" TO "dispositivo_ingreso_pkey";

ALTER TABLE "Aula" SET SCHEMA "escuela";
ALTER TABLE "escuela"."Aula" RENAME TO "aula";
ALTER TABLE "escuela"."aula" RENAME CONSTRAINT "Aula_pkey" TO "aula_pkey";

ALTER TABLE "Matricula" SET SCHEMA "escuela";
ALTER TABLE "escuela"."Matricula" RENAME TO "matricula";
ALTER TABLE "escuela"."matricula" RENAME CONSTRAINT "Matricula_pkey" TO "matricula_pkey";

ALTER TABLE "OutboxEvento" SET SCHEMA "admin";
ALTER TABLE "admin"."OutboxEvento" RENAME TO "outbox_evento";
ALTER TABLE "admin"."outbox_evento" RENAME CONSTRAINT "OutboxEvento_pkey" TO "outbox_evento_pkey";

-- ── 4. Columnas en snake_case ────────────────────────────────────────────────
ALTER TABLE "iam"."cuenta_adulta" RENAME COLUMN "hashContrasena" TO "hash_contrasena";
ALTER TABLE "iam"."cuenta_adulta" RENAME COLUMN "creadoEn" TO "creado_en";

ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "cuentaResponsableId" TO "cuenta_responsable_id";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "consentimientoId" TO "consentimiento_id";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "anioNacimiento" TO "anio_nacimiento";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "mesNacimiento" TO "mes_nacimiento";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "hashPin" TO "hash_pin";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "intentosFallidos" TO "intentos_fallidos";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "bloqueadoHasta" TO "bloqueado_hasta";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "eliminadoEn" TO "eliminado_en";
ALTER TABLE "iam"."perfil_estudiante" RENAME COLUMN "creadoEn" TO "creado_en";

ALTER TABLE "iam"."consentimiento" RENAME COLUMN "cuentaResponsableId" TO "cuenta_responsable_id";
ALTER TABLE "iam"."consentimiento" RENAME COLUMN "aulaId" TO "aula_id";
ALTER TABLE "iam"."consentimiento" RENAME COLUMN "versionPolitica" TO "version_politica";
ALTER TABLE "iam"."consentimiento" RENAME COLUMN "otorgadoEn" TO "otorgado_en";
ALTER TABLE "iam"."consentimiento" RENAME COLUMN "otorganteNombre" TO "otorgante_nombre";

ALTER TABLE "iam"."verificacion_correo" RENAME COLUMN "cuentaId" TO "cuenta_id";
ALTER TABLE "iam"."verificacion_correo" RENAME COLUMN "expiraEn" TO "expira_en";
ALTER TABLE "iam"."verificacion_correo" RENAME COLUMN "creadoEn" TO "creado_en";
ALTER TABLE "iam"."verificacion_correo" RENAME COLUMN "reemplazadoEn" TO "reemplazado_en";

ALTER TABLE "iam"."refresh_token" RENAME COLUMN "sujetoId" TO "sujeto_id";
ALTER TABLE "iam"."refresh_token" RENAME COLUMN "hashRefreshToken" TO "hash_refresh_token";
ALTER TABLE "iam"."refresh_token" RENAME COLUMN "creadaEn" TO "creada_en";
ALTER TABLE "iam"."refresh_token" RENAME COLUMN "ultimaActividadEn" TO "ultima_actividad_en";
ALTER TABLE "iam"."refresh_token" RENAME COLUMN "revocadaEn" TO "revocada_en";

ALTER TABLE "iam"."refresh_token_usado" RENAME COLUMN "sesionId" TO "sesion_id";
ALTER TABLE "iam"."refresh_token_usado" RENAME COLUMN "usadoEn" TO "usado_en";

ALTER TABLE "iam"."exportacion" RENAME COLUMN "perfilId" TO "perfil_id";
ALTER TABLE "iam"."exportacion" RENAME COLUMN "solicitadaPor" TO "solicitada_por";
ALTER TABLE "iam"."exportacion" RENAME COLUMN "creadaEn" TO "creada_en";
ALTER TABLE "iam"."exportacion" RENAME COLUMN "expiraEn" TO "expira_en";
ALTER TABLE "iam"."exportacion" RENAME COLUMN "archivoJson" TO "archivo_json";
ALTER TABLE "iam"."exportacion" RENAME COLUMN "archivoPdf" TO "archivo_pdf";

ALTER TABLE "iam"."dispositivo_ingreso" RENAME COLUMN "cuentaId" TO "cuenta_id";
ALTER TABLE "iam"."dispositivo_ingreso" RENAME COLUMN "aulaId" TO "aula_id";
ALTER TABLE "iam"."dispositivo_ingreso" RENAME COLUMN "hashToken" TO "hash_token";
ALTER TABLE "iam"."dispositivo_ingreso" RENAME COLUMN "creadoEn" TO "creado_en";
ALTER TABLE "iam"."dispositivo_ingreso" RENAME COLUMN "expiraEn" TO "expira_en";
ALTER TABLE "iam"."dispositivo_ingreso" RENAME COLUMN "revocadoEn" TO "revocado_en";

ALTER TABLE "escuela"."aula" RENAME COLUMN "docenteId" TO "docente_id";
ALTER TABLE "escuela"."aula" RENAME COLUMN "anioLectivo" TO "anio_lectivo";
ALTER TABLE "escuela"."aula" RENAME COLUMN "creadaEn" TO "creada_en";
ALTER TABLE "escuela"."aula" RENAME COLUMN "archivadaEn" TO "archivada_en";

ALTER TABLE "escuela"."matricula" RENAME COLUMN "aulaId" TO "aula_id";
ALTER TABLE "escuela"."matricula" RENAME COLUMN "estudianteId" TO "estudiante_id";
ALTER TABLE "escuela"."matricula" RENAME COLUMN "creadaEn" TO "creada_en";
ALTER TABLE "escuela"."matricula" RENAME COLUMN "retiradaEn" TO "retirada_en";

ALTER TABLE "admin"."outbox_evento" RENAME COLUMN "agregadoId" TO "agregado_id";
ALTER TABLE "admin"."outbox_evento" RENAME COLUMN "ocurrioEn" TO "ocurrio_en";
ALTER TABLE "admin"."outbox_evento" RENAME COLUMN "publicadoEn" TO "publicado_en";

-- ── 5. Tipos: UUID para identificadores y TIMESTAMPTZ para fechas (instantes en UTC) ──
ALTER TABLE "iam"."cuenta_adulta"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."perfil_estudiante"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "cuenta_responsable_id" TYPE UUID USING "cuenta_responsable_id"::uuid,
  ALTER COLUMN "consentimiento_id" TYPE UUID USING "consentimiento_id"::uuid,
  ALTER COLUMN "bloqueado_hasta" TYPE TIMESTAMPTZ(3) USING "bloqueado_hasta" AT TIME ZONE 'UTC',
  ALTER COLUMN "eliminado_en" TYPE TIMESTAMPTZ(3) USING "eliminado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."consentimiento"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "cuenta_responsable_id" TYPE UUID USING "cuenta_responsable_id"::uuid,
  ALTER COLUMN "aula_id" TYPE UUID USING "aula_id"::uuid,
  ALTER COLUMN "otorgado_en" TYPE TIMESTAMPTZ(3) USING "otorgado_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."verificacion_correo"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "cuenta_id" TYPE UUID USING "cuenta_id"::uuid,
  ALTER COLUMN "expira_en" TYPE TIMESTAMPTZ(3) USING "expira_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "reemplazado_en" TYPE TIMESTAMPTZ(3) USING "reemplazado_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."refresh_token"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "sujeto_id" TYPE UUID USING "sujeto_id"::uuid,
  ALTER COLUMN "creada_en" TYPE TIMESTAMPTZ(3) USING "creada_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "ultima_actividad_en" TYPE TIMESTAMPTZ(3) USING "ultima_actividad_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "revocada_en" TYPE TIMESTAMPTZ(3) USING "revocada_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."refresh_token_usado"
  ALTER COLUMN "sesion_id" TYPE UUID USING "sesion_id"::uuid,
  ALTER COLUMN "usado_en" TYPE TIMESTAMPTZ(3) USING "usado_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."exportacion"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "perfil_id" TYPE UUID USING "perfil_id"::uuid,
  ALTER COLUMN "solicitada_por" TYPE UUID USING "solicitada_por"::uuid,
  ALTER COLUMN "creada_en" TYPE TIMESTAMPTZ(3) USING "creada_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "expira_en" TYPE TIMESTAMPTZ(3) USING "expira_en" AT TIME ZONE 'UTC';

ALTER TABLE "iam"."dispositivo_ingreso"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "cuenta_id" TYPE UUID USING "cuenta_id"::uuid,
  ALTER COLUMN "aula_id" TYPE UUID USING "aula_id"::uuid,
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "expira_en" TYPE TIMESTAMPTZ(3) USING "expira_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "revocado_en" TYPE TIMESTAMPTZ(3) USING "revocado_en" AT TIME ZONE 'UTC';

ALTER TABLE "escuela"."aula"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "docente_id" TYPE UUID USING "docente_id"::uuid,
  ALTER COLUMN "creada_en" TYPE TIMESTAMPTZ(3) USING "creada_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "archivada_en" TYPE TIMESTAMPTZ(3) USING "archivada_en" AT TIME ZONE 'UTC',
  ADD COLUMN "institucion_id" UUID;

ALTER TABLE "escuela"."matricula"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "aula_id" TYPE UUID USING "aula_id"::uuid,
  ALTER COLUMN "estudiante_id" TYPE UUID USING "estudiante_id"::uuid,
  ALTER COLUMN "creada_en" TYPE TIMESTAMPTZ(3) USING "creada_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "retirada_en" TYPE TIMESTAMPTZ(3) USING "retirada_en" AT TIME ZONE 'UTC';

-- Los eventos antiguos usaban otro formato de id: se les asigna un UUID (nadie los referencia).
ALTER TABLE "admin"."outbox_evento"
  ALTER COLUMN "id" TYPE UUID USING (
    CASE WHEN "id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "id"::uuid ELSE gen_random_uuid() END
  ),
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "ocurrio_en" TYPE TIMESTAMPTZ(3) USING "ocurrio_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "publicado_en" TYPE TIMESTAMPTZ(3) USING "publicado_en" AT TIME ZONE 'UTC';

-- ── 6. El segundo factor (MFA) pasa a su tabla iam.factor_mfa (SRS §7) ───────
CREATE TABLE "iam"."factor_mfa" (
    "cuenta_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TOTP',
    "habilitado" BOOLEAN NOT NULL DEFAULT false,
    "secreto" TEXT,
    "secreto_pendiente" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factor_mfa_pkey" PRIMARY KEY ("cuenta_id")
);

INSERT INTO "iam"."factor_mfa" ("cuenta_id", "habilitado", "secreto", "secreto_pendiente")
SELECT "id", "mfaHabilitado", "mfaSecret", "mfaSecretPendiente"
FROM "iam"."cuenta_adulta"
WHERE "mfaHabilitado" OR "mfaSecret" IS NOT NULL OR "mfaSecretPendiente" IS NOT NULL;

ALTER TABLE "iam"."cuenta_adulta"
  DROP COLUMN "mfaHabilitado",
  DROP COLUMN "mfaSecret",
  DROP COLUMN "mfaSecretPendiente";

-- ── 7. Índices de las tablas existentes con sus nombres nuevos ──────────────
CREATE UNIQUE INDEX "cuenta_adulta_email_key" ON "iam"."cuenta_adulta"("email");
CREATE INDEX "cuenta_adulta_rol_idx" ON "iam"."cuenta_adulta"("rol");
CREATE INDEX "perfil_estudiante_cuenta_responsable_id_idx" ON "iam"."perfil_estudiante"("cuenta_responsable_id");
CREATE INDEX "consentimiento_cuenta_responsable_id_tipo_vigente_idx" ON "iam"."consentimiento"("cuenta_responsable_id", "tipo", "vigente");
CREATE UNIQUE INDEX "verificacion_correo_codigo_key" ON "iam"."verificacion_correo"("codigo");
CREATE INDEX "verificacion_correo_cuenta_id_tipo_idx" ON "iam"."verificacion_correo"("cuenta_id", "tipo");
CREATE UNIQUE INDEX "refresh_token_hash_refresh_token_key" ON "iam"."refresh_token"("hash_refresh_token");
CREATE INDEX "refresh_token_sujeto_id_idx" ON "iam"."refresh_token"("sujeto_id");
CREATE INDEX "refresh_token_usado_sesion_id_idx" ON "iam"."refresh_token_usado"("sesion_id");
CREATE INDEX "exportacion_perfil_id_idx" ON "iam"."exportacion"("perfil_id");
CREATE INDEX "exportacion_expira_en_idx" ON "iam"."exportacion"("expira_en");
CREATE UNIQUE INDEX "dispositivo_ingreso_hash_token_key" ON "iam"."dispositivo_ingreso"("hash_token");
CREATE INDEX "dispositivo_ingreso_cuenta_id_idx" ON "iam"."dispositivo_ingreso"("cuenta_id");
CREATE INDEX "dispositivo_ingreso_aula_id_idx" ON "iam"."dispositivo_ingreso"("aula_id");
CREATE UNIQUE INDEX "aula_codigo_key" ON "escuela"."aula"("codigo");
CREATE INDEX "aula_docente_id_idx" ON "escuela"."aula"("docente_id");
CREATE INDEX "aula_institucion_id_idx" ON "escuela"."aula"("institucion_id");
CREATE INDEX "matricula_estudiante_id_idx" ON "escuela"."matricula"("estudiante_id");
CREATE UNIQUE INDEX "matricula_aula_id_estudiante_id_key" ON "escuela"."matricula"("aula_id", "estudiante_id");
CREATE INDEX "outbox_evento_publicado_en_idx" ON "admin"."outbox_evento"("publicado_en");
CREATE INDEX "outbox_evento_tipo_agregado_id_idx" ON "admin"."outbox_evento"("tipo", "agregado_id");

-- =============================================================================

-- Tablas de los demás bounded contexts (SRS §7) y llaves foráneas dentro de cada schema

-- =============================================================================

-- CreateTable
CREATE TABLE "iam"."vinculo_responsable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "perfil_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "origen" TEXT NOT NULL,
    "vinculado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_en" TIMESTAMPTZ(3),

    CONSTRAINT "vinculo_responsable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escuela"."institucion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "codigo_modular" TEXT,
    "region" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escuela"."asignacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aula_id" UUID NOT NULL,
    "docente_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "lectura_id" UUID,
    "mision_id" UUID,
    "titulo" TEXT NOT NULL,
    "para_toda_el_aula" BOOLEAN NOT NULL DEFAULT true,
    "fecha_inicio" TIMESTAMPTZ(3) NOT NULL,
    "fecha_limite" TIMESTAMPTZ(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PROGRAMADA',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escuela"."asignacion_destinatario" (
    "asignacion_id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL,

    CONSTRAINT "asignacion_destinatario_pkey" PRIMARY KEY ("asignacion_id","estudiante_id")
);

-- CreateTable
CREATE TABLE "escuela"."invitacion_familiar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aula_id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL,
    "docente_id" UUID NOT NULL,
    "hash_codigo" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usada_en" TIMESTAMPTZ(3),
    "cuenta_familiar_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitacion_familiar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."lectura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "autor_id" UUID NOT NULL,
    "version_publicada_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivada_en" TIMESTAMPTZ(3),

    CONSTRAINT "lectura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."version_lectura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lectura_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "titulo" TEXT NOT NULL,
    "rango_edad" TEXT NOT NULL,
    "nivel_dificultad" SMALLINT NOT NULL,
    "tematica" TEXT NOT NULL,
    "tipo_texto" TEXT NOT NULL,
    "habilidades_objetivo" TEXT[],
    "licencia" TEXT,
    "texto" TEXT NOT NULL,
    "autor_id" UUID NOT NULL,
    "revisor_id" UUID,
    "es_ramificada" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_revision_en" TIMESTAMPTZ(3),
    "publicada_en" TIMESTAMPTZ(3),
    "archivada_en" TIMESTAMPTZ(3),

    CONSTRAINT "version_lectura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."oracion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_lectura_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "parrafo" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "oracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."recurso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_lectura_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave_almacen" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "texto_alternativo" TEXT,
    "duracion_seg" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."actividad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_lectura_id" UUID NOT NULL,
    "momento" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "oracion_anclaje_id" UUID,

    CONSTRAINT "actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actividad_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "habilidad" TEXT NOT NULL,
    "nivel_dificultad" SMALLINT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "es_cerrado" BOOLEAN NOT NULL DEFAULT true,
    "enunciado" TEXT NOT NULL,
    "contenido" JSONB NOT NULL DEFAULT '{}',
    "respuesta_correcta" JSONB,
    "explicacion_modelada" TEXT NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."pista" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "nivel" TEXT NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "pista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contenido"."clave_evidencia" (
    "item_id" UUID NOT NULL,
    "oracion_id" UUID NOT NULL,

    CONSTRAINT "clave_evidencia_pkey" PRIMARY KEY ("item_id","oracion_id")
);

-- CreateTable
CREATE TABLE "contenido"."nodo_historia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_lectura_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "es_inicio" BOOLEAN NOT NULL DEFAULT false,
    "es_final" BOOLEAN NOT NULL DEFAULT false,
    "opciones" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "nodo_historia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aventura"."mundo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SMALLINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "habilidades_foco" TEXT[],
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "mundo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aventura"."mision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mundo_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "mision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aventura"."mision_lectura" (
    "mision_id" UUID NOT NULL,
    "lectura_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "mision_lectura_pkey" PRIMARY KEY ("mision_id","lectura_id")
);

-- CreateTable
CREATE TABLE "aventura"."progreso_mundo" (
    "estudiante_id" UUID NOT NULL,
    "mundo_id" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BLOQUEADO',
    "desbloqueado_en" TIMESTAMPTZ(3),
    "completado_en" TIMESTAMPTZ(3),

    CONSTRAINT "progreso_mundo_pkey" PRIMARY KEY ("estudiante_id","mundo_id")
);

-- CreateTable
CREATE TABLE "aventura"."progreso_mision" (
    "estudiante_id" UUID NOT NULL,
    "mision_id" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "iniciada_en" TIMESTAMPTZ(3),
    "completada_en" TIMESTAMPTZ(3),

    CONSTRAINT "progreso_mision_pkey" PRIMARY KEY ("estudiante_id","mision_id")
);

-- CreateTable
CREATE TABLE "diagnostico"."banco_item_diagnostico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rango_edad" TEXT NOT NULL,
    "habilidad" TEXT NOT NULL,
    "nivel_dificultad" SMALLINT NOT NULL,
    "forma" TEXT NOT NULL DEFAULT 'A',
    "enunciado" TEXT NOT NULL,
    "contenido" JSONB NOT NULL DEFAULT '{}',
    "respuesta_correcta" JSONB NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "banco_item_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."diagnostico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estudiante_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INICIAL',
    "secuencia" INTEGER NOT NULL DEFAULT 1,
    "estado" TEXT NOT NULL DEFAULT 'NO_INICIADO',
    "rango_edad" TEXT NOT NULL,
    "total_items" SMALLINT NOT NULL,
    "asignado_por" UUID,
    "resultado" JSONB,
    "iniciado_en" TIMESTAMPTZ(3),
    "pausado_en" TIMESTAMPTZ(3),
    "finalizado_en" TIMESTAMPTZ(3),

    CONSTRAINT "diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostico"."respuesta_diagnostico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "contenido" JSONB NOT NULL,
    "es_correcta" BOOLEAN NOT NULL,
    "respondida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuesta_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura"."sesion_lectura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estudiante_id" UUID NOT NULL,
    "version_lectura_id" UUID NOT NULL,
    "asignacion_id" UUID,
    "estado" TEXT NOT NULL DEFAULT 'INICIADA',
    "prediccion" TEXT,
    "reflexion" TEXT,
    "item_actual_id" UUID,
    "es_repeticion" BOOLEAN NOT NULL DEFAULT false,
    "iniciada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_en" TIMESTAMPTZ(3),

    CONSTRAINT "sesion_lectura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura"."respuesta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "habilidad" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "es_correcta" BOOLEAN,
    "pistas_usadas" SMALLINT NOT NULL DEFAULT 0,
    "puntaje_item" DECIMAL(3,2),
    "estado" TEXT NOT NULL DEFAULT 'ENVIADA',
    "idempotency_key" UUID NOT NULL,
    "respondida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura"."uso_pista" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "respuesta_id" UUID NOT NULL,
    "nivel" TEXT NOT NULL,
    "usada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_pista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura"."justificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "respuesta_id" UUID NOT NULL,
    "modalidad" TEXT NOT NULL,
    "texto" TEXT,
    "opcion_elegida" JSONB,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "justificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura"."decision_ruta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sesion_id" UUID NOT NULL,
    "nodo_origen_id" UUID NOT NULL,
    "nodo_destino_id" UUID NOT NULL,
    "decidida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_ruta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectura"."valoracion_rubrica" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "respuesta_id" UUID NOT NULL,
    "docente_id" UUID NOT NULL,
    "nivel" SMALLINT NOT NULL,
    "comentario" TEXT,
    "borrador_ia" TEXT,
    "valorada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valoracion_rubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progreso"."maestria_habilidad" (
    "estudiante_id" UUID NOT NULL,
    "habilidad" TEXT NOT NULL,
    "valor" DECIMAL(5,2) NOT NULL,
    "items_contados" INTEGER NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "maestria_habilidad_pkey" PRIMARY KEY ("estudiante_id","habilidad")
);

-- CreateTable
CREATE TABLE "progreso"."historial_maestria" (
    "id" BIGSERIAL NOT NULL,
    "estudiante_id" UUID NOT NULL,
    "habilidad" TEXT NOT NULL,
    "valor_anterior" DECIMAL(5,2) NOT NULL,
    "valor_nuevo" DECIMAL(5,2) NOT NULL,
    "origen" TEXT NOT NULL,
    "origen_id" UUID,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_maestria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progreso"."recomendacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estudiante_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "lectura_id" UUID,
    "asignacion_id" UUID,
    "habilidad" TEXT,
    "prioridad" SMALLINT NOT NULL,
    "motivo" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "generada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(3),

    CONSTRAINT "recomendacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamificacion"."asiento_puntos" (
    "id" BIGSERIAL NOT NULL,
    "estudiante_id" UUID NOT NULL,
    "puntos" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "evento_origen" UUID NOT NULL,
    "fecha_lima" DATE NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asiento_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamificacion"."insignia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "regla" JSONB NOT NULL DEFAULT '{}',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "insignia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamificacion"."insignia_otorgada" (
    "estudiante_id" UUID NOT NULL,
    "insignia_id" UUID NOT NULL,
    "evento_origen" UUID NOT NULL,
    "otorgada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insignia_otorgada_pkey" PRIMARY KEY ("estudiante_id","insignia_id")
);

-- CreateTable
CREATE TABLE "gamificacion"."racha" (
    "estudiante_id" UUID NOT NULL,
    "dias_actuales" INTEGER NOT NULL DEFAULT 0,
    "mejor_racha" INTEGER NOT NULL DEFAULT 0,
    "ultima_fecha_lima" DATE,
    "comodin_usado_semana" DATE,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "racha_pkey" PRIMARY KEY ("estudiante_id")
);

-- CreateTable
CREATE TABLE "gamificacion"."reto_diario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estudiante_id" UUID NOT NULL,
    "fecha_lima" DATE NOT NULL,
    "habilidad" TEXT NOT NULL,
    "contenido" JSONB NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'PROPUESTO',
    "completado_en" TIMESTAMPTZ(3),

    CONSTRAINT "reto_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamificacion"."parametro_gamificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL,
    "parametros" JSONB NOT NULL,
    "vigente_desde" TIMESTAMPTZ(3) NOT NULL,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametro_gamificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistente"."conversacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estudiante_id" UUID NOT NULL,
    "sesion_lectura_id" UUID NOT NULL,
    "intercambios" SMALLINT NOT NULL DEFAULT 0,
    "iniciada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMPTZ(3),
    "expira_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistente"."turno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversacion_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "emisor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "filtrado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "actor_rol" TEXT,
    "accion" TEXT NOT NULL,
    "recurso_tipo" TEXT NOT NULL,
    "recurso_id" TEXT,
    "ip" INET,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vinculo_responsable_cuenta_id_idx" ON "iam"."vinculo_responsable"("cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "vinculo_responsable_perfil_id_cuenta_id_key" ON "iam"."vinculo_responsable"("perfil_id", "cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "institucion_codigo_modular_key" ON "escuela"."institucion"("codigo_modular");

-- CreateIndex
CREATE INDEX "asignacion_aula_id_estado_idx" ON "escuela"."asignacion"("aula_id", "estado");

-- CreateIndex
CREATE INDEX "asignacion_destinatario_estudiante_id_idx" ON "escuela"."asignacion_destinatario"("estudiante_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitacion_familiar_hash_codigo_key" ON "escuela"."invitacion_familiar"("hash_codigo");

-- CreateIndex
CREATE INDEX "invitacion_familiar_estudiante_id_idx" ON "escuela"."invitacion_familiar"("estudiante_id");

-- CreateIndex
CREATE UNIQUE INDEX "lectura_version_publicada_id_key" ON "contenido"."lectura"("version_publicada_id");

-- CreateIndex
CREATE INDEX "lectura_autor_id_idx" ON "contenido"."lectura"("autor_id");

-- CreateIndex
CREATE INDEX "version_lectura_estado_rango_edad_nivel_dificultad_idx" ON "contenido"."version_lectura"("estado", "rango_edad", "nivel_dificultad");

-- CreateIndex
CREATE UNIQUE INDEX "version_lectura_lectura_id_numero_key" ON "contenido"."version_lectura"("lectura_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "oracion_version_lectura_id_orden_key" ON "contenido"."oracion"("version_lectura_id", "orden");

-- CreateIndex
CREATE INDEX "recurso_version_lectura_id_idx" ON "contenido"."recurso"("version_lectura_id");

-- CreateIndex
CREATE UNIQUE INDEX "actividad_version_lectura_id_orden_key" ON "contenido"."actividad"("version_lectura_id", "orden");

-- CreateIndex
CREATE INDEX "item_habilidad_idx" ON "contenido"."item"("habilidad");

-- CreateIndex
CREATE UNIQUE INDEX "item_actividad_id_orden_key" ON "contenido"."item"("actividad_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "pista_item_id_nivel_key" ON "contenido"."pista"("item_id", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "nodo_historia_version_lectura_id_clave_key" ON "contenido"."nodo_historia"("version_lectura_id", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "mundo_numero_key" ON "aventura"."mundo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "mision_mundo_id_orden_key" ON "aventura"."mision"("mundo_id", "orden");

-- CreateIndex
CREATE INDEX "mision_lectura_lectura_id_idx" ON "aventura"."mision_lectura"("lectura_id");

-- CreateIndex
CREATE INDEX "banco_item_diagnostico_rango_edad_habilidad_forma_idx" ON "diagnostico"."banco_item_diagnostico"("rango_edad", "habilidad", "forma");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostico_estudiante_id_tipo_secuencia_key" ON "diagnostico"."diagnostico"("estudiante_id", "tipo", "secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_diagnostico_diagnostico_id_item_id_key" ON "diagnostico"."respuesta_diagnostico"("diagnostico_id", "item_id");

-- CreateIndex
CREATE INDEX "ix_sesion_estudiante" ON "lectura"."sesion_lectura"("estudiante_id", "iniciada_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_idempotency_key_key" ON "lectura"."respuesta"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_sesion_id_item_id_key" ON "lectura"."respuesta"("sesion_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uso_pista_respuesta_id_nivel_key" ON "lectura"."uso_pista"("respuesta_id", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "justificacion_respuesta_id_key" ON "lectura"."justificacion"("respuesta_id");

-- CreateIndex
CREATE INDEX "decision_ruta_sesion_id_idx" ON "lectura"."decision_ruta"("sesion_id");

-- CreateIndex
CREATE UNIQUE INDEX "valoracion_rubrica_respuesta_id_key" ON "lectura"."valoracion_rubrica"("respuesta_id");

-- CreateIndex
CREATE INDEX "historial_maestria_estudiante_id_habilidad_registrado_en_idx" ON "progreso"."historial_maestria"("estudiante_id", "habilidad", "registrado_en");

-- CreateIndex
CREATE INDEX "recomendacion_estudiante_id_vigente_idx" ON "progreso"."recomendacion"("estudiante_id", "vigente");

-- CreateIndex
CREATE INDEX "asiento_puntos_estudiante_id_fecha_lima_idx" ON "gamificacion"."asiento_puntos"("estudiante_id", "fecha_lima");

-- CreateIndex
CREATE UNIQUE INDEX "asiento_puntos_evento_origen_motivo_key" ON "gamificacion"."asiento_puntos"("evento_origen", "motivo");

-- CreateIndex
CREATE UNIQUE INDEX "insignia_codigo_key" ON "gamificacion"."insignia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "reto_diario_estudiante_id_fecha_lima_key" ON "gamificacion"."reto_diario"("estudiante_id", "fecha_lima");

-- CreateIndex
CREATE UNIQUE INDEX "parametro_gamificacion_version_key" ON "gamificacion"."parametro_gamificacion"("version");

-- CreateIndex
CREATE INDEX "conversacion_estudiante_id_idx" ON "asistente"."conversacion"("estudiante_id");

-- CreateIndex
CREATE INDEX "conversacion_expira_en_idx" ON "asistente"."conversacion"("expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "turno_conversacion_id_orden_key" ON "asistente"."turno"("conversacion_id", "orden");

-- CreateIndex
CREATE INDEX "auditoria_ocurrido_en_idx" ON "admin"."auditoria"("ocurrido_en");

-- CreateIndex
CREATE INDEX "auditoria_actor_id_ocurrido_en_idx" ON "admin"."auditoria"("actor_id", "ocurrido_en");

-- AddForeignKey
ALTER TABLE "iam"."factor_mfa" ADD CONSTRAINT "factor_mfa_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "iam"."cuenta_adulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."perfil_estudiante" ADD CONSTRAINT "perfil_estudiante_cuenta_responsable_id_fkey" FOREIGN KEY ("cuenta_responsable_id") REFERENCES "iam"."cuenta_adulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."vinculo_responsable" ADD CONSTRAINT "vinculo_responsable_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "iam"."perfil_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."vinculo_responsable" ADD CONSTRAINT "vinculo_responsable_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "iam"."cuenta_adulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."consentimiento" ADD CONSTRAINT "consentimiento_cuenta_responsable_id_fkey" FOREIGN KEY ("cuenta_responsable_id") REFERENCES "iam"."cuenta_adulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."verificacion_correo" ADD CONSTRAINT "verificacion_correo_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "iam"."cuenta_adulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."dispositivo_ingreso" ADD CONSTRAINT "dispositivo_ingreso_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "iam"."cuenta_adulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escuela"."aula" ADD CONSTRAINT "aula_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "escuela"."institucion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escuela"."matricula" ADD CONSTRAINT "matricula_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "escuela"."aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escuela"."asignacion" ADD CONSTRAINT "asignacion_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "escuela"."aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escuela"."asignacion_destinatario" ADD CONSTRAINT "asignacion_destinatario_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "escuela"."asignacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escuela"."invitacion_familiar" ADD CONSTRAINT "invitacion_familiar_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "escuela"."aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."lectura" ADD CONSTRAINT "lectura_version_publicada_id_fkey" FOREIGN KEY ("version_publicada_id") REFERENCES "contenido"."version_lectura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."version_lectura" ADD CONSTRAINT "version_lectura_lectura_id_fkey" FOREIGN KEY ("lectura_id") REFERENCES "contenido"."lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."oracion" ADD CONSTRAINT "oracion_version_lectura_id_fkey" FOREIGN KEY ("version_lectura_id") REFERENCES "contenido"."version_lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."recurso" ADD CONSTRAINT "recurso_version_lectura_id_fkey" FOREIGN KEY ("version_lectura_id") REFERENCES "contenido"."version_lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."actividad" ADD CONSTRAINT "actividad_version_lectura_id_fkey" FOREIGN KEY ("version_lectura_id") REFERENCES "contenido"."version_lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."actividad" ADD CONSTRAINT "actividad_oracion_anclaje_id_fkey" FOREIGN KEY ("oracion_anclaje_id") REFERENCES "contenido"."oracion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."item" ADD CONSTRAINT "item_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "contenido"."actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."pista" ADD CONSTRAINT "pista_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "contenido"."item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."clave_evidencia" ADD CONSTRAINT "clave_evidencia_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "contenido"."item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."clave_evidencia" ADD CONSTRAINT "clave_evidencia_oracion_id_fkey" FOREIGN KEY ("oracion_id") REFERENCES "contenido"."oracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contenido"."nodo_historia" ADD CONSTRAINT "nodo_historia_version_lectura_id_fkey" FOREIGN KEY ("version_lectura_id") REFERENCES "contenido"."version_lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aventura"."mision" ADD CONSTRAINT "mision_mundo_id_fkey" FOREIGN KEY ("mundo_id") REFERENCES "aventura"."mundo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aventura"."mision_lectura" ADD CONSTRAINT "mision_lectura_mision_id_fkey" FOREIGN KEY ("mision_id") REFERENCES "aventura"."mision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aventura"."progreso_mundo" ADD CONSTRAINT "progreso_mundo_mundo_id_fkey" FOREIGN KEY ("mundo_id") REFERENCES "aventura"."mundo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aventura"."progreso_mision" ADD CONSTRAINT "progreso_mision_mision_id_fkey" FOREIGN KEY ("mision_id") REFERENCES "aventura"."mision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostico"."respuesta_diagnostico" ADD CONSTRAINT "respuesta_diagnostico_diagnostico_id_fkey" FOREIGN KEY ("diagnostico_id") REFERENCES "diagnostico"."diagnostico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostico"."respuesta_diagnostico" ADD CONSTRAINT "respuesta_diagnostico_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "diagnostico"."banco_item_diagnostico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura"."respuesta" ADD CONSTRAINT "respuesta_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "lectura"."sesion_lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura"."uso_pista" ADD CONSTRAINT "uso_pista_respuesta_id_fkey" FOREIGN KEY ("respuesta_id") REFERENCES "lectura"."respuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura"."justificacion" ADD CONSTRAINT "justificacion_respuesta_id_fkey" FOREIGN KEY ("respuesta_id") REFERENCES "lectura"."respuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura"."decision_ruta" ADD CONSTRAINT "decision_ruta_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "lectura"."sesion_lectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura"."valoracion_rubrica" ADD CONSTRAINT "valoracion_rubrica_respuesta_id_fkey" FOREIGN KEY ("respuesta_id") REFERENCES "lectura"."respuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamificacion"."insignia_otorgada" ADD CONSTRAINT "insignia_otorgada_insignia_id_fkey" FOREIGN KEY ("insignia_id") REFERENCES "gamificacion"."insignia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistente"."turno" ADD CONSTRAINT "turno_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "asistente"."conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Reglas del SRS como restricciones de la base (defensa en profundidad: el dominio las valida
-- primero; la base impide datos imposibles aunque alguien escriba con otra herramienta).
-- =============================================================================

-- ── IAM ──────────────────────────────────────────────────────────────────────
ALTER TABLE "iam"."cuenta_adulta"
  ADD CONSTRAINT "ck_cuenta_rol" CHECK ("rol" IN ('DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA')),
  ADD CONSTRAINT "ck_cuenta_estado" CHECK ("estado" IN ('PENDIENTE_VERIFICACION', 'ACTIVA', 'SUSPENDIDA'));
ALTER TABLE "iam"."factor_mfa"
  ADD CONSTRAINT "ck_factor_mfa_tipo" CHECK ("tipo" IN ('TOTP'));
ALTER TABLE "iam"."perfil_estudiante"
  ADD CONSTRAINT "ck_perfil_mes" CHECK ("mes_nacimiento" BETWEEN 1 AND 12),
  ADD CONSTRAINT "ck_perfil_intentos" CHECK ("intentos_fallidos" >= 0);
ALTER TABLE "iam"."vinculo_responsable"
  ADD CONSTRAINT "ck_vinculo_origen" CHECK ("origen" IN ('INVITACION_DOCENTE', 'INVITACION_FAMILIAR'));
ALTER TABLE "iam"."consentimiento"
  ADD CONSTRAINT "ck_consentimiento_tipo" CHECK ("tipo" IN ('PARENTAL', 'INSTITUCIONAL')),
  ADD CONSTRAINT "ck_consentimiento_medio" CHECK ("medio" IN ('DIGITAL', 'FISICO')),
  -- RN-01: el consentimiento institucional exige el aula.
  ADD CONSTRAINT "ck_consentimiento_aula" CHECK ("tipo" <> 'INSTITUCIONAL' OR "aula_id" IS NOT NULL);
ALTER TABLE "iam"."verificacion_correo"
  ADD CONSTRAINT "ck_verificacion_tipo" CHECK ("tipo" IN ('CORREO', 'RECUPERACION_CONTRASENA'));
ALTER TABLE "iam"."refresh_token"
  ADD CONSTRAINT "ck_refresh_token_rol" CHECK ("rol" IN ('ESTUDIANTE', 'DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA'));
ALTER TABLE "iam"."dispositivo_ingreso"
  ADD CONSTRAINT "ck_dispositivo_vigencia" CHECK ("expira_en" > "creado_en");

-- ── Escuela ──────────────────────────────────────────────────────────────────
ALTER TABLE "escuela"."institucion"
  ADD CONSTRAINT "ck_institucion_estado" CHECK ("estado" IN ('ACTIVA', 'SUSPENDIDA'));
ALTER TABLE "escuela"."aula"
  ADD CONSTRAINT "ck_aula_estado" CHECK ("estado" IN ('ACTIVA', 'ARCHIVADA')),
  -- RF-014: 6 caracteres sin ambiguos (0/O, 1/I/L).
  ADD CONSTRAINT "ck_aula_codigo" CHECK ("codigo" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
ALTER TABLE "escuela"."matricula"
  ADD CONSTRAINT "ck_matricula_estado" CHECK ("estado" IN ('ACTIVA', 'RETIRADA'));
ALTER TABLE "escuela"."asignacion"
  ADD CONSTRAINT "ck_asignacion_tipo" CHECK ("tipo" IN ('LECTURA', 'MISION')),
  ADD CONSTRAINT "ck_asignacion_estado" CHECK ("estado" IN ('PROGRAMADA', 'ACTIVA', 'VENCIDA', 'CERRADA')),
  ADD CONSTRAINT "ck_asignacion_destino" CHECK (
    ("tipo" = 'LECTURA' AND "lectura_id" IS NOT NULL AND "mision_id" IS NULL)
    OR ("tipo" = 'MISION' AND "mision_id" IS NOT NULL AND "lectura_id" IS NULL)
  ),
  ADD CONSTRAINT "ck_asignacion_fechas" CHECK ("fecha_limite" > "fecha_inicio");
ALTER TABLE "escuela"."invitacion_familiar"
  ADD CONSTRAINT "ck_invitacion_vigencia" CHECK ("expira_en" > "creada_en");

-- ── Contenido ────────────────────────────────────────────────────────────────
ALTER TABLE "contenido"."version_lectura"
  ADD CONSTRAINT "ck_version_estado" CHECK ("estado" IN ('BORRADOR', 'EN_REVISION', 'PUBLICADO', 'ARCHIVADO')),
  ADD CONSTRAINT "ck_version_rango" CHECK ("rango_edad" IN ('R1', 'R2', 'R3')),
  ADD CONSTRAINT "ck_version_dificultad" CHECK ("nivel_dificultad" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ck_version_tipo_texto" CHECK ("tipo_texto" IN (
    'CUENTO', 'HISTORIETA', 'POEMA', 'NOTICIA_INFANTIL', 'CIENTIFICO', 'INFORMATIVO', 'ANUNCIO', 'INSTRUCTIVO', 'COTIDIANO'
  )),
  ADD CONSTRAINT "ck_version_habilidades" CHECK ("habilidades_objetivo" <@ ARRAY['LIT', 'INF', 'VOC', 'CRI', 'ARG']::text[]),
  -- RF-021: sin licencia o sin habilidad objetivo no sale de borrador.
  ADD CONSTRAINT "ck_version_lista_para_revision" CHECK (
    "estado" = 'BORRADOR' OR ("licencia" IS NOT NULL AND cardinality("habilidades_objetivo") >= 1)
  ),
  -- RN-15: el revisor nunca es el autor; lo publicado tiene revisor y fecha.
  ADD CONSTRAINT "ck_version_revisor" CHECK ("revisor_id" IS NULL OR "revisor_id" <> "autor_id"),
  ADD CONSTRAINT "ck_version_publicada" CHECK ("estado" <> 'PUBLICADO' OR ("revisor_id" IS NOT NULL AND "publicada_en" IS NOT NULL));
ALTER TABLE "contenido"."oracion"
  ADD CONSTRAINT "ck_oracion_orden" CHECK ("orden" BETWEEN 1 AND 400);
ALTER TABLE "contenido"."recurso"
  ADD CONSTRAINT "ck_recurso_tipo" CHECK ("tipo" IN ('IMAGEN', 'AUDIO')),
  -- RF-023: imagen AVIF/WebP ≤ 200 KB con texto alternativo; audio ≤ 2 MB.
  ADD CONSTRAINT "ck_recurso_limites" CHECK (
    "bytes" > 0 AND (
      ("tipo" = 'IMAGEN' AND "bytes" <= 204800 AND "tipo_mime" IN ('image/avif', 'image/webp') AND "texto_alternativo" IS NOT NULL)
      OR ("tipo" = 'AUDIO' AND "bytes" <= 2097152)
    )
  );
ALTER TABLE "contenido"."actividad"
  ADD CONSTRAINT "ck_actividad_momento" CHECK ("momento" IN ('ANTES', 'DURANTE', 'DESPUES')),
  ADD CONSTRAINT "ck_actividad_tipo" CHECK ("tipo" IN ('PREDICCION', 'SELECCION', 'ESCRITURA', 'ORDENAMIENTO', 'EVIDENCIA', 'DEFIENDE')),
  -- RF-024: la actividad "durante" requiere oración de anclaje.
  ADD CONSTRAINT "ck_actividad_anclaje" CHECK ("momento" <> 'DURANTE' OR "oracion_anclaje_id" IS NOT NULL);
ALTER TABLE "contenido"."item"
  ADD CONSTRAINT "ck_item_habilidad" CHECK ("habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG')),
  ADD CONSTRAINT "ck_item_dificultad" CHECK ("nivel_dificultad" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ck_item_modalidad" CHECK ("modalidad" IN ('SELECCION', 'ESCRITURA', 'ORDENAMIENTO', 'EVIDENCIA', 'VOZ')),
  ADD CONSTRAINT "ck_item_explicacion" CHECK (char_length("explicacion_modelada") > 0);
ALTER TABLE "contenido"."pista"
  ADD CONSTRAINT "ck_pista_nivel" CHECK ("nivel" IN ('P1', 'P2', 'P3'));

-- ── Aventura ─────────────────────────────────────────────────────────────────
ALTER TABLE "aventura"."mundo"
  ADD CONSTRAINT "ck_mundo_numero" CHECK ("numero" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ck_mundo_habilidades" CHECK ("habilidades_foco" <@ ARRAY['LIT', 'INF', 'VOC', 'CRI', 'ARG']::text[]);
ALTER TABLE "aventura"."mision"
  ADD CONSTRAINT "ck_mision_orden" CHECK ("orden" BETWEEN 1 AND 20);
ALTER TABLE "aventura"."progreso_mundo"
  ADD CONSTRAINT "ck_progreso_mundo_estado" CHECK ("estado" IN ('BLOQUEADO', 'DISPONIBLE', 'COMPLETADO'));
ALTER TABLE "aventura"."progreso_mision"
  ADD CONSTRAINT "ck_progreso_mision_estado" CHECK ("estado" IN ('PENDIENTE', 'EN_CURSO', 'COMPLETADA'));

-- ── Diagnóstico ──────────────────────────────────────────────────────────────
ALTER TABLE "diagnostico"."banco_item_diagnostico"
  ADD CONSTRAINT "ck_banco_rango" CHECK ("rango_edad" IN ('R1', 'R2', 'R3')),
  ADD CONSTRAINT "ck_banco_habilidad" CHECK ("habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG')),
  ADD CONSTRAINT "ck_banco_dificultad" CHECK ("nivel_dificultad" BETWEEN 1 AND 5);
ALTER TABLE "diagnostico"."diagnostico"
  ADD CONSTRAINT "ck_diagnostico_tipo" CHECK ("tipo" IN ('INICIAL', 'REEVALUACION')),
  ADD CONSTRAINT "ck_diagnostico_estado" CHECK ("estado" IN ('NO_INICIADO', 'EN_CURSO', 'PAUSADO', 'FINALIZADO')),
  ADD CONSTRAINT "ck_diagnostico_rango" CHECK ("rango_edad" IN ('R1', 'R2', 'R3')),
  -- RF-034: 15 ítems (R1: 10).
  ADD CONSTRAINT "ck_diagnostico_items" CHECK ("total_items" IN (10, 15)),
  -- Solo un diagnóstico inicial por estudiante (único con secuencia 1).
  ADD CONSTRAINT "ck_diagnostico_inicial_unico" CHECK ("tipo" <> 'INICIAL' OR "secuencia" = 1);

-- ── Lectura (DDL de referencia del SRS) ─────────────────────────────────────
ALTER TABLE "lectura"."sesion_lectura"
  ADD CONSTRAINT "ck_sesion_estado" CHECK ("estado" IN ('INICIADA', 'EN_CURSO', 'FINALIZADA', 'ABANDONADA'));
ALTER TABLE "lectura"."respuesta"
  ADD CONSTRAINT "ck_respuesta_habilidad" CHECK ("habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG')),
  ADD CONSTRAINT "ck_respuesta_modalidad" CHECK ("modalidad" IN ('SELECCION', 'ESCRITURA', 'ORDENAMIENTO', 'EVIDENCIA', 'VOZ')),
  ADD CONSTRAINT "ck_respuesta_pistas" CHECK ("pistas_usadas" BETWEEN 0 AND 3),
  ADD CONSTRAINT "ck_respuesta_puntaje" CHECK ("puntaje_item" IS NULL OR "puntaje_item" BETWEEN 0 AND 1),
  ADD CONSTRAINT "ck_respuesta_estado" CHECK ("estado" IN ('ENVIADA', 'PENDIENTE_REVISION', 'VALORADA'));
ALTER TABLE "lectura"."uso_pista"
  ADD CONSTRAINT "ck_uso_pista_nivel" CHECK ("nivel" IN ('P1', 'P2', 'P3', 'EXPLICACION'));
ALTER TABLE "lectura"."justificacion"
  ADD CONSTRAINT "ck_justificacion_modalidad" CHECK (
    ("modalidad" = 'ESCRITURA' AND "texto" IS NOT NULL AND char_length("texto") <= 500)
    OR ("modalidad" = 'SELECCION' AND "opcion_elegida" IS NOT NULL)
  );
ALTER TABLE "lectura"."valoracion_rubrica"
  ADD CONSTRAINT "ck_valoracion_nivel" CHECK ("nivel" BETWEEN 1 AND 3);

-- ── Progreso (DDL de referencia del SRS) ────────────────────────────────────
ALTER TABLE "progreso"."maestria_habilidad"
  ADD CONSTRAINT "ck_maestria_habilidad" CHECK ("habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG')),
  ADD CONSTRAINT "ck_maestria_valor" CHECK ("valor" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ck_maestria_items" CHECK ("items_contados" >= 0);
ALTER TABLE "progreso"."historial_maestria"
  ADD CONSTRAINT "ck_historial_habilidad" CHECK ("habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG')),
  ADD CONSTRAINT "ck_historial_valores" CHECK ("valor_anterior" BETWEEN 0 AND 100 AND "valor_nuevo" BETWEEN 0 AND 100);
ALTER TABLE "progreso"."recomendacion"
  ADD CONSTRAINT "ck_recomendacion_tipo" CHECK ("tipo" IN ('LECTURA_HABILIDAD_DEBIL', 'LECTURA_MISION', 'ASIGNACION_DOCENTE', 'REFUERZO')),
  ADD CONSTRAINT "ck_recomendacion_prioridad" CHECK ("prioridad" BETWEEN 1 AND 3),
  ADD CONSTRAINT "ck_recomendacion_habilidad" CHECK ("habilidad" IS NULL OR "habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG'));

-- ── Gamificación ─────────────────────────────────────────────────────────────
ALTER TABLE "gamificacion"."asiento_puntos"
  -- RN-10: los puntos nunca son negativos.
  ADD CONSTRAINT "ck_asiento_puntos" CHECK ("puntos" >= 0);
ALTER TABLE "gamificacion"."racha"
  ADD CONSTRAINT "ck_racha_dias" CHECK ("dias_actuales" >= 0 AND "mejor_racha" >= "dias_actuales");
ALTER TABLE "gamificacion"."reto_diario"
  ADD CONSTRAINT "ck_reto_estado" CHECK ("estado" IN ('PROPUESTO', 'COMPLETADO', 'VENCIDO')),
  ADD CONSTRAINT "ck_reto_habilidad" CHECK ("habilidad" IN ('LIT', 'INF', 'VOC', 'CRI', 'ARG'));

-- ── Asistente ────────────────────────────────────────────────────────────────
ALTER TABLE "asistente"."conversacion"
  -- RF-074: máximo 10 intercambios; retención de 30 días.
  ADD CONSTRAINT "ck_conversacion_intercambios" CHECK ("intercambios" BETWEEN 0 AND 10),
  ADD CONSTRAINT "ck_conversacion_retencion" CHECK ("expira_en" <= "iniciada_en" + INTERVAL '30 days');
ALTER TABLE "asistente"."turno"
  ADD CONSTRAINT "ck_turno_emisor" CHECK ("emisor" IN ('ESTUDIANTE', 'ASISTENTE'));

-- =============================================================================
-- Registros que solo se agregan (append-only): auditoría (RF-077), libro de puntos (ledger)
-- e insignias otorgadas (RN-13, irrevocables). Se impide modificarlos o borrarlos fila a fila.
-- =============================================================================
CREATE OR REPLACE FUNCTION "admin"."impedir_cambios"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla %.% solo admite agregar registros (%)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "tr_auditoria_append_only" BEFORE UPDATE OR DELETE ON "admin"."auditoria"
  FOR EACH ROW EXECUTE FUNCTION "admin"."impedir_cambios"();
CREATE TRIGGER "tr_asiento_puntos_append_only" BEFORE UPDATE OR DELETE ON "gamificacion"."asiento_puntos"
  FOR EACH ROW EXECUTE FUNCTION "admin"."impedir_cambios"();
CREATE TRIGGER "tr_insignia_otorgada_append_only" BEFORE UPDATE OR DELETE ON "gamificacion"."insignia_otorgada"
  FOR EACH ROW EXECUTE FUNCTION "admin"."impedir_cambios"();

-- =============================================================================
-- Datos de catálogo definidos por el SRS
-- =============================================================================

-- Los 5 mundos del mapa de aventuras con sus habilidades foco (SRS §1).
INSERT INTO "aventura"."mundo" ("numero", "nombre", "habilidades_foco", "descripcion") VALUES
  (1, 'Explorador', ARRAY['LIT', 'VOC'], 'Comprensión literal y vocabulario: encuentra lo que dice el texto.'),
  (2, 'Detective', ARRAY['INF', 'VOC'], 'Inferencias: descubre lo que el texto no dice directamente.'),
  (3, 'Investigador', ARRAY['LIT', 'INF'], 'Comprensión literal e inferencial con evidencia del texto.'),
  (4, 'Crítico', ARRAY['CRI', 'ARG'], 'Reflexiona, evalúa y justifica con razones.'),
  (5, 'Maestro de la Lectura', ARRAY['LIT', 'INF', 'VOC', 'CRI', 'ARG'], 'Integra las cinco habilidades lectoras.');

-- Parámetros de gamificación por defecto, versión 1 (RN-11, RN-12, RN-19, RF-057).
INSERT INTO "gamificacion"."parametro_gamificacion" ("version", "parametros", "vigente_desde") VALUES (
  1,
  '{
    "puntos": { "lecturaCompletada": 20, "itemCorrecto": 10, "correctoTrasPista": 6, "subidaNivelCneb": 50, "retoDelDia": 15,
                "racha": { "3": 10, "7": 30, "30": 100 } },
    "antiFarming": { "porcentajeRepeticion": 25, "topeDiario": 300 },
    "nivelLector": { "umbral": "100 * n * (n + 1) / 2" },
    "respuestasAbiertas": { "palabrasMinimasR2": 5, "palabrasMinimasR3": 10 }
  }'::jsonb,
  CURRENT_TIMESTAMP
);

-- =============================================================================
-- Reportes (schema reporting): vistas materializadas del SRS §7, refresco cada 5 min.
-- =============================================================================

-- Desempeño de cada aula por habilidad, con la distribución por nivel CNEB (RF-063).
CREATE MATERIALIZED VIEW "reporting"."mv_desempeno_aula" AS
SELECT
  m."aula_id",
  mh."habilidad",
  count(*)::int AS "estudiantes",
  round(avg(mh."valor"), 2) AS "maestria_promedio",
  count(*) FILTER (WHERE mh."items_contados" < 5)::int AS "aun_descubriendo",
  count(*) FILTER (WHERE mh."items_contados" >= 5 AND mh."valor" < 40)::int AS "nivel_c",
  count(*) FILTER (WHERE mh."items_contados" >= 5 AND mh."valor" >= 40 AND mh."valor" < 65)::int AS "nivel_b",
  count(*) FILTER (WHERE mh."items_contados" >= 5 AND mh."valor" >= 65 AND mh."valor" < 85)::int AS "nivel_a",
  count(*) FILTER (WHERE mh."items_contados" >= 5 AND mh."valor" >= 85)::int AS "nivel_ad"
FROM "escuela"."matricula" m
JOIN "progreso"."maestria_habilidad" mh ON mh."estudiante_id" = m."estudiante_id"
WHERE m."estado" = 'ACTIVA'
GROUP BY m."aula_id", mh."habilidad";
CREATE UNIQUE INDEX "ux_mv_desempeno_aula" ON "reporting"."mv_desempeno_aula" ("aula_id", "habilidad");

-- Actividad semanal por estudiante (semanas de America/Lima): lecturas, minutos y respuestas (RF-068).
CREATE MATERIALIZED VIEW "reporting"."mv_actividad_semanal" AS
WITH "sesiones" AS (
  SELECT
    s."id",
    s."estudiante_id",
    date_trunc('week', s."iniciada_en" AT TIME ZONE 'America/Lima')::date AS "semana",
    s."estado",
    CASE WHEN s."finalizada_en" IS NOT NULL THEN extract(epoch FROM (s."finalizada_en" - s."iniciada_en")) / 60 ELSE 0 END AS "minutos"
  FROM "lectura"."sesion_lectura" s
)
SELECT
  se."estudiante_id",
  se."semana",
  count(*) FILTER (WHERE se."estado" = 'FINALIZADA')::int AS "lecturas_finalizadas",
  round(sum(se."minutos")::numeric, 1) AS "minutos_lectura",
  coalesce(sum(r."total"), 0)::int AS "respuestas"
FROM "sesiones" se
LEFT JOIN (SELECT "sesion_id", count(*) AS "total" FROM "lectura"."respuesta" GROUP BY "sesion_id") r ON r."sesion_id" = se."id"
GROUP BY se."estudiante_id", se."semana";
CREATE UNIQUE INDEX "ux_mv_actividad_semanal" ON "reporting"."mv_actividad_semanal" ("estudiante_id", "semana");

-- Refresco sin bloquear lecturas; lo invocará el worker de reportes cada 5 minutos.
CREATE OR REPLACE FUNCTION "reporting"."refrescar_vistas"() RETURNS void
LANGUAGE sql AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_desempeno_aula";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_actividad_semanal";
$$;
