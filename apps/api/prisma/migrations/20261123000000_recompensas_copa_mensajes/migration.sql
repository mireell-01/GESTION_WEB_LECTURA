-- Recompensas que se usan, Copa Lectora del aula y mensajitos de la docente.

-- RF-062 (ampliado): lo que el niño tiene puesto. Un accesorio en su avatar y un personaje que lo
-- acompaña al leer; solo recompensas que ya canjeó (lo valida Gamificación). Si una recompensa se
-- retira del catálogo, deja de estar puesta.
CREATE TABLE "gamificacion"."apariencia" (
    "estudiante_id" UUID NOT NULL,
    "accesorio_id" UUID,
    "personaje_id" UUID,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apariencia_pkey" PRIMARY KEY ("estudiante_id")
);

ALTER TABLE "gamificacion"."apariencia" ADD CONSTRAINT "apariencia_accesorio_id_fkey" FOREIGN KEY ("accesorio_id") REFERENCES "gamificacion"."recompensa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gamificacion"."apariencia" ADD CONSTRAINT "apariencia_personaje_id_fkey" FOREIGN KEY ("personaje_id") REFERENCES "gamificacion"."recompensa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mensajitos de ánimo de la docente para sus estudiantes: una fila por niño. Un envío (envio_id)
-- puede ir a un solo niño o a toda el aula. El niño lo cierra con «Gracias» (leido_en).
CREATE TABLE "escuela"."mensaje_docente" (
    "id" UUID NOT NULL,
    "envio_id" UUID NOT NULL,
    "aula_id" UUID NOT NULL,
    "docente_id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL,
    "para_toda_el_aula" BOOLEAN NOT NULL DEFAULT false,
    "sticker" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leido_en" TIMESTAMPTZ(3),

    CONSTRAINT "mensaje_docente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mensaje_docente_estudiante_id_leido_en_idx" ON "escuela"."mensaje_docente"("estudiante_id", "leido_en");
CREATE INDEX "mensaje_docente_aula_id_creado_en_idx" ON "escuela"."mensaje_docente"("aula_id", "creado_en");

ALTER TABLE "escuela"."mensaje_docente" ADD CONSTRAINT "mensaje_docente_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "escuela"."aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un mensaje no se reescribe: solo se marca como leído (o se borra con el perfil del niño, RF-013).
ALTER TABLE "escuela"."mensaje_docente" ADD CONSTRAINT "mensaje_docente_texto_check" CHECK (char_length("texto") BETWEEN 1 AND 140);
