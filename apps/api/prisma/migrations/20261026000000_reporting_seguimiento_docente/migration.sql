-- Módulo 9 · Seguimiento docente (RF-063 a RF-067, RNF-003).
-- La lectura agregada entre módulos se hace solo con las vistas del schema `reporting` (SAD §5).

-- CreateTable
CREATE TABLE "reporting"."refresco_vistas" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "refrescado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresco_vistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting"."resumen_semanal_enviado" (
    "docente_id" UUID NOT NULL,
    "semana" DATE NOT NULL,
    "aulas" SMALLINT NOT NULL,
    "enviado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumen_semanal_enviado_pkey" PRIMARY KEY ("docente_id","semana")
);

-- Una sola fila: el último refresco de las vistas.
ALTER TABLE "reporting"."refresco_vistas"
  ADD CONSTRAINT "ck_refresco_vistas_unica" CHECK ("id" = 1);
-- La semana de Lima empieza en lunes.
ALTER TABLE "reporting"."resumen_semanal_enviado"
  ADD CONSTRAINT "ck_resumen_semana_lunes" CHECK (extract(isodow FROM "semana") = 1),
  ADD CONSTRAINT "ck_resumen_aulas" CHECK ("aulas" > 0);

-- RF-063: la maestría de cada estudiante del aula por habilidad (mapa de calor estudiantes × habilidades).
CREATE MATERIALIZED VIEW "reporting"."mv_maestria_estudiante" AS
SELECT
  m."aula_id",
  m."estudiante_id",
  mh."habilidad",
  mh."valor",
  mh."items_contados"
FROM "escuela"."matricula" m
JOIN "progreso"."maestria_habilidad" mh ON mh."estudiante_id" = m."estudiante_id"
WHERE m."estado" = 'ACTIVA';
CREATE UNIQUE INDEX "ux_mv_maestria_estudiante" ON "reporting"."mv_maestria_estudiante" ("aula_id", "estudiante_id", "habilidad");

-- RF-065: la última actividad de cada estudiante (lectura o reto inicial), para "7 días sin actividad".
CREATE MATERIALIZED VIEW "reporting"."mv_actividad_estudiante" AS
WITH "actividad" AS (
  SELECT s."estudiante_id", s."ultima_actividad_en" AS "en" FROM "lectura"."sesion_lectura" s
  UNION ALL
  SELECT d."estudiante_id", r."respondida_en" FROM "diagnostico"."respuesta_diagnostico" r
  JOIN "diagnostico"."diagnostico" d ON d."id" = r."diagnostico_id"
)
SELECT "estudiante_id", max("en") AS "ultima_actividad_en"
FROM "actividad"
GROUP BY "estudiante_id";
CREATE UNIQUE INDEX "ux_mv_actividad_estudiante" ON "reporting"."mv_actividad_estudiante" ("estudiante_id");

-- Los estudiantes con matrícula activa de cada aula y desde cuándo (vista simple: siempre al día).
CREATE VIEW "reporting"."v_estudiantes_aula" AS
SELECT m."aula_id", m."estudiante_id", m."creada_en" AS "matriculado_en"
FROM "escuela"."matricula" m
WHERE m."estado" = 'ACTIVA';

-- RF-065: aulas activas con estudiantes, para el resumen semanal de cada docente.
CREATE VIEW "reporting"."v_aulas_activas" AS
SELECT a."id" AS "aula_id", a."docente_id", a."nombre", count(m."estudiante_id")::int AS "estudiantes"
FROM "escuela"."aula" a
JOIN "escuela"."matricula" m ON m."aula_id" = a."id" AND m."estado" = 'ACTIVA'
WHERE a."estado" = 'ACTIVA'
GROUP BY a."id", a."docente_id", a."nombre";

-- El worker de reportes refresca las 4 vistas cada 5 minutos sin bloquear lecturas y anota cuándo.
CREATE OR REPLACE FUNCTION "reporting"."refrescar_vistas"() RETURNS void
LANGUAGE sql AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_desempeno_aula";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_actividad_semanal";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_maestria_estudiante";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_actividad_estudiante";
  INSERT INTO "reporting"."refresco_vistas" ("id", "refrescado_en") VALUES (1, clock_timestamp())
  ON CONFLICT ("id") DO UPDATE SET "refrescado_en" = EXCLUDED."refrescado_en";
$$;

SELECT "reporting"."refrescar_vistas"();
