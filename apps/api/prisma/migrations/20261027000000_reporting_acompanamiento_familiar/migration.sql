-- Módulo 10 · Acompañamiento familiar (RF-068 a RF-070).
-- Como el seguimiento docente, el panel familiar lee solo las vistas del schema `reporting` (SAD §5),
-- refrescadas cada 5 minutos (SRS §7: "Panel familiar 5 min").

-- CreateTable
CREATE TABLE "reporting"."preferencia_familiar" (
    "cuenta_id" UUID NOT NULL,
    "resumen_semanal" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preferencia_familiar_pkey" PRIMARY KEY ("cuenta_id")
);

-- CreateTable
CREATE TABLE "reporting"."resumen_familiar_enviado" (
    "cuenta_id" UUID NOT NULL,
    "semana" DATE NOT NULL,
    "hijos" SMALLINT NOT NULL,
    "enviado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumen_familiar_enviado_pkey" PRIMARY KEY ("cuenta_id","semana")
);

-- La semana de Lima empieza en lunes; un resumen habla de 1 a 6 hijos (RF-071) y de los que acompaña.
ALTER TABLE "reporting"."resumen_familiar_enviado"
  ADD CONSTRAINT "ck_resumen_familiar_semana_lunes" CHECK (extract(isodow FROM "semana") = 1),
  ADD CONSTRAINT "ck_resumen_familiar_hijos" CHECK ("hijos" > 0);

-- RF-068: la maestría de cada estudiante por habilidad, esté o no en un aula (la del aula es
-- mv_maestria_estudiante). Solo perfiles vigentes: un perfil eliminado (RF-013) no aparece.
CREATE MATERIALIZED VIEW "reporting"."mv_maestria_perfil" AS
SELECT mh."estudiante_id", mh."habilidad", mh."valor", mh."items_contados"
FROM "progreso"."maestria_habilidad" mh
JOIN "iam"."perfil_estudiante" p ON p."id" = mh."estudiante_id"
WHERE p."eliminado_en" IS NULL;
CREATE UNIQUE INDEX "ux_mv_maestria_perfil" ON "reporting"."mv_maestria_perfil" ("estudiante_id", "habilidad");

-- RF-068: el avance de cada estudiante: lecturas terminadas, mundo en que va, puntos e insignias.
CREATE MATERIALIZED VIEW "reporting"."mv_avance_estudiante" AS
WITH "lecturas" AS (
  SELECT "estudiante_id", count(DISTINCT "lectura_id")::int AS "terminadas"
  FROM "lectura"."sesion_lectura"
  WHERE "estado" = 'FINALIZADA'
  GROUP BY "estudiante_id"
), "mundos" AS (
  SELECT pm."estudiante_id",
         count(*) FILTER (WHERE pm."estado" = 'COMPLETADO')::int AS "completados",
         max(mu."numero") FILTER (WHERE pm."estado" = 'DISPONIBLE') AS "actual"
  FROM "aventura"."progreso_mundo" pm
  JOIN "aventura"."mundo" mu ON mu."id" = pm."mundo_id"
  GROUP BY pm."estudiante_id"
), "puntos" AS (
  SELECT "estudiante_id", sum("puntos")::int AS "puntos" FROM "gamificacion"."asiento_puntos" GROUP BY "estudiante_id"
), "insignias" AS (
  SELECT "estudiante_id", count(*)::int AS "insignias" FROM "gamificacion"."insignia_otorgada" GROUP BY "estudiante_id"
)
SELECT p."id" AS "estudiante_id",
       coalesce(l."terminadas", 0) AS "lecturas_terminadas",
       coalesce(m."completados", 0) AS "mundos_completados",
       m."actual" AS "mundo_actual",
       ma."nombre" AS "mundo_actual_nombre",
       coalesce(pt."puntos", 0) AS "puntos",
       coalesce(i."insignias", 0) AS "insignias"
FROM "iam"."perfil_estudiante" p
LEFT JOIN "lecturas" l ON l."estudiante_id" = p."id"
LEFT JOIN "mundos" m ON m."estudiante_id" = p."id"
LEFT JOIN "aventura"."mundo" ma ON ma."numero" = m."actual"
LEFT JOIN "puntos" pt ON pt."estudiante_id" = p."id"
LEFT JOIN "insignias" i ON i."estudiante_id" = p."id"
WHERE p."eliminado_en" IS NULL;
CREATE UNIQUE INDEX "ux_mv_avance_estudiante" ON "reporting"."mv_avance_estudiante" ("estudiante_id");

-- RF-070: a quién enviar el resumen semanal: familias activas con sus hijos activos, propios o
-- acompañados por invitación de su docente (RF-019). Vista simple: siempre al día.
CREATE VIEW "reporting"."v_hijos_familia" AS
SELECT p."cuenta_responsable_id" AS "cuenta_id", p."id" AS "estudiante_id"
FROM "iam"."perfil_estudiante" p
JOIN "iam"."cuenta_adulta" c ON c."id" = p."cuenta_responsable_id"
WHERE c."rol" = 'FAMILIAR' AND c."estado" = 'ACTIVA' AND p."activo" AND p."eliminado_en" IS NULL
UNION
SELECT v."cuenta_id", v."perfil_id"
FROM "iam"."vinculo_responsable" v
JOIN "iam"."perfil_estudiante" p ON p."id" = v."perfil_id"
JOIN "iam"."cuenta_adulta" c ON c."id" = v."cuenta_id"
WHERE v."revocado_en" IS NULL AND c."rol" = 'FAMILIAR' AND c."estado" = 'ACTIVA' AND p."activo" AND p."eliminado_en" IS NULL;

-- El worker de reportes refresca ahora las 6 vistas cada 5 minutos sin bloquear lecturas y anota cuándo.
CREATE OR REPLACE FUNCTION "reporting"."refrescar_vistas"() RETURNS void
LANGUAGE sql AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_desempeno_aula";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_actividad_semanal";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_maestria_estudiante";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_actividad_estudiante";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_maestria_perfil";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "reporting"."mv_avance_estudiante";
  INSERT INTO "reporting"."refresco_vistas" ("id", "refrescado_en") VALUES (1, clock_timestamp())
  ON CONFLICT ("id") DO UPDATE SET "refrescado_en" = EXCLUDED."refrescado_en";
$$;

SELECT "reporting"."refrescar_vistas"();
