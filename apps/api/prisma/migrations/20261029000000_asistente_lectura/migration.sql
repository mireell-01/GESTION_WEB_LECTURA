-- Módulo 11 · Asistente de lectura (RF-072 a RF-075, RN-16, ADR-008).

-- CreateTable
CREATE TABLE "asistente"."activacion" (
    "estudiante_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "cambiado_por" UUID NOT NULL,
    "rol" TEXT NOT NULL,
    "cambiado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activacion_pkey" PRIMARY KEY ("estudiante_id")
);

-- RF-072: lo activa la familia (su consentimiento) o la docente (consentimiento institucional).
ALTER TABLE "asistente"."activacion"
  ADD CONSTRAINT "ck_activacion_rol" CHECK ("rol" IN ('FAMILIAR', 'DOCENTE'));

-- RF-074: una conversación por sesión de lectura (sus 10 intercambios no se reparten en varias).
CREATE UNIQUE INDEX "conversacion_sesion_lectura_id_key" ON "asistente"."conversacion"("sesion_lectura_id");

-- Cada turno es breve: lo del niño llega moderado (hasta 300 caracteres) y la respuesta, filtrada.
ALTER TABLE "asistente"."turno"
  ADD CONSTRAINT "ck_turno_texto" CHECK (char_length("texto") BETWEEN 1 AND 1000),
  ADD CONSTRAINT "ck_turno_orden" CHECK ("orden" BETWEEN 1 AND 20);
