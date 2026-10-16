-- RF-002: reenvío seguro del enlace de verificación. Se registra cuándo se creó cada enlace
-- (tiempo de espera entre reenvíos) y si fue reemplazado por uno más nuevo (deja de servir).
ALTER TABLE "Verificacion" ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Verificacion" ADD COLUMN "reemplazadoEn" TIMESTAMP(3);
