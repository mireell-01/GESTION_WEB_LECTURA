-- RF-026: el revisor explica por qué devuelve una lectura a borrador.
ALTER TABLE "contenido"."version_lectura" ADD COLUMN "comentario_revision" TEXT;
