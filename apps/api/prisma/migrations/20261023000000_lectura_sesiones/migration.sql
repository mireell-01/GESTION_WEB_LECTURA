-- Módulo 6 · Lectura interactiva (RF-038 a RF-051).

-- La sesión recuerda su lectura (además de la versión): así se reanuda la misma lectura aunque se
-- publique una versión nueva (RF-027, RF-046) y Aventura consulta el avance por lectura (RF-032).
-- La tabla aún no tiene filas: el módulo empieza a escribir en ella con esta versión.
ALTER TABLE "lectura"."sesion_lectura" ADD COLUMN "lectura_id" UUID NOT NULL;

CREATE INDEX "sesion_lectura_estudiante_id_lectura_id_estado_idx"
  ON "lectura"."sesion_lectura" ("estudiante_id", "lectura_id", "estado");

-- Una sola sesión sin terminar por estudiante y lectura: al volver se reanuda la misma (RF-046).
CREATE UNIQUE INDEX "sesion_lectura_una_activa_por_lectura"
  ON "lectura"."sesion_lectura" ("estudiante_id", "lectura_id") WHERE "estado" IN ('INICIADA', 'EN_CURSO');

-- Segunda barrera del guion: la reflexión y la predicción caben en lo que se valida (RF-038, RF-047).
ALTER TABLE "lectura"."sesion_lectura"
  ADD CONSTRAINT "ck_sesion_textos" CHECK (
    ("prediccion" IS NULL OR char_length("prediccion") <= 500) AND ("reflexion" IS NULL OR char_length("reflexion") <= 500)
  ),
  ADD CONSTRAINT "ck_sesion_finalizada" CHECK (("estado" = 'FINALIZADA') = ("finalizada_en" IS NOT NULL));

-- RF-051: la docente busca las respuestas abiertas que esperan revisión (o ya valoradas).
CREATE INDEX "respuesta_en_revision_idx" ON "lectura"."respuesta" ("estado", "sesion_id") WHERE "estado" <> 'ENVIADA';

-- RF-051: el comentario de la docente es breve.
ALTER TABLE "lectura"."valoracion_rubrica"
  ADD CONSTRAINT "ck_valoracion_comentario" CHECK ("comentario" IS NULL OR char_length("comentario") <= 300);
