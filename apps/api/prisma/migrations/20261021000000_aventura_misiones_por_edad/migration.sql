-- Módulo 4 · Aventura (RF-030 a RF-033).
-- 1) Cada misión es para un rango de edad: un niño de 7 años y uno de 11 recorren los mismos
--    5 mundos con lecturas de su edad (el SRS no decía cómo combinar mundos y edades).
-- 2) RF-031: se guarda cuándo vio el niño la celebración de un mundo desbloqueado.

ALTER TABLE "aventura"."mision" ADD COLUMN "rango_edad" TEXT NOT NULL DEFAULT 'R2';
ALTER TABLE "aventura"."mision" ALTER COLUMN "rango_edad" DROP DEFAULT;
ALTER TABLE "aventura"."mision"
  ADD CONSTRAINT "ck_mision_rango_edad" CHECK ("rango_edad" IN ('R1', 'R2', 'R3')),
  ADD CONSTRAINT "ck_mision_titulo" CHECK (char_length("titulo") BETWEEN 3 AND 80);

-- El orden es por mundo y edad. La restricción es diferible: reordenar intercambia posiciones
-- dentro de una transacción y solo se comprueba al confirmarla.
DROP INDEX "aventura"."mision_mundo_id_orden_key";
ALTER TABLE "aventura"."mision"
  ADD CONSTRAINT "mision_mundo_id_rango_edad_orden_key" UNIQUE ("mundo_id", "rango_edad", "orden") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "aventura"."progreso_mundo" ADD COLUMN "celebrado_en" TIMESTAMPTZ(3);

-- Un mundo completado tuvo que estar disponible antes (SRS §6, invariante de ProgresoAventura).
ALTER TABLE "aventura"."progreso_mundo"
  ADD CONSTRAINT "ck_progreso_mundo_fechas" CHECK (
    ("estado" = 'BLOQUEADO' AND "desbloqueado_en" IS NULL AND "completado_en" IS NULL)
    OR ("estado" = 'DISPONIBLE' AND "desbloqueado_en" IS NOT NULL AND "completado_en" IS NULL)
    OR ("estado" = 'COMPLETADO' AND "desbloqueado_en" IS NOT NULL AND "completado_en" IS NOT NULL)
  );
