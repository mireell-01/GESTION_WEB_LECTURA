-- Módulo 7 · Perfil lector y recomendaciones (RF-052 a RF-055).

-- De dónde viene cada cambio de maestría: el reto inicial, un ítem de lectura o una valoración docente.
ALTER TABLE "progreso"."historial_maestria"
  ADD CONSTRAINT "ck_historial_origen" CHECK ("origen" IN ('DIAGNOSTICO', 'ITEM', 'VALORACION'));

-- Idempotencia (RF-053): un mismo reto, respuesta o valoración mueve cada habilidad una sola vez,
-- aunque su evento se reintente desde el outbox.
CREATE UNIQUE INDEX "historial_maestria_origen_unico"
  ON "progreso"."historial_maestria" ("origen", "origen_id", "habilidad") WHERE "origen_id" IS NOT NULL;

-- RF-055: cada recomendación lleva a una lectura o a una asignación, y hay a lo sumo 3 vigentes
-- (una por prioridad 1, 2 y 3).
ALTER TABLE "progreso"."recomendacion"
  ADD CONSTRAINT "ck_recomendacion_destino" CHECK ("lectura_id" IS NOT NULL OR "asignacion_id" IS NOT NULL);
CREATE UNIQUE INDEX "recomendacion_vigente_por_prioridad"
  ON "progreso"."recomendacion" ("estudiante_id", "prioridad") WHERE "vigente";
