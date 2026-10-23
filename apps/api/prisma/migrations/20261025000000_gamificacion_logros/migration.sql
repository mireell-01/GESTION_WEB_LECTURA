-- Módulo 8 · Gamificación: puntos, nivel lector, insignias, racha, reto del día y recompensas
-- (RF-056 a RF-062, RN-10 a RN-13, RN-18, RN-19).

-- CreateTable
CREATE TABLE "gamificacion"."evento_aplicado" (
    "tipo" TEXT NOT NULL,
    "origen_id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL,
    "aplicado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_aplicado_pkey" PRIMARY KEY ("tipo","origen_id")
);

-- CreateTable
CREATE TABLE "gamificacion"."avance_insignia" (
    "estudiante_id" UUID NOT NULL,
    "insignia_id" UUID NOT NULL,
    "avance" INTEGER NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avance_insignia_pkey" PRIMARY KEY ("estudiante_id","insignia_id")
);

-- CreateTable
CREATE TABLE "gamificacion"."recompensa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "costo" INTEGER NOT NULL,
    "orden" SMALLINT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "recompensa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamificacion"."canje_recompensa" (
    "id" UUID NOT NULL,
    "estudiante_id" UUID NOT NULL,
    "recompensa_id" UUID NOT NULL,
    "monedas" INTEGER NOT NULL,
    "canjeado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canje_recompensa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recompensa_codigo_key" ON "gamificacion"."recompensa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "canje_recompensa_estudiante_id_recompensa_id_key" ON "gamificacion"."canje_recompensa"("estudiante_id", "recompensa_id");

-- AddForeignKey
ALTER TABLE "gamificacion"."avance_insignia" ADD CONSTRAINT "avance_insignia_insignia_id_fkey" FOREIGN KEY ("insignia_id") REFERENCES "gamificacion"."insignia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamificacion"."canje_recompensa" ADD CONSTRAINT "canje_recompensa_recompensa_id_fkey" FOREIGN KEY ("recompensa_id") REFERENCES "gamificacion"."recompensa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Reglas que Prisma no expresa ─────────────────────────────────────────────

-- RF-056: cada asiento dice por qué se otorgó. La racha admite los hitos que fije el administrador (RF-078).
ALTER TABLE "gamificacion"."asiento_puntos"
  ADD CONSTRAINT "ck_asiento_motivo" CHECK (
    "motivo" IN ('ITEM_CORRECTO', 'CORRECTO_TRAS_PISTA', 'RESPUESTA_ABIERTA', 'LECTURA_COMPLETADA', 'SUBIDA_NIVEL_CNEB', 'RETO_DEL_DIA')
    OR "motivo" ~ '^RACHA_[0-9]+$'
  );

-- Idempotencia: un mismo ítem, lectura, subida de nivel o mundo se aplica una sola vez.
ALTER TABLE "gamificacion"."evento_aplicado"
  ADD CONSTRAINT "ck_evento_aplicado_tipo" CHECK ("tipo" IN ('ITEM', 'LECTURA', 'NIVEL', 'MAESTRIA', 'MUNDO'));

ALTER TABLE "gamificacion"."avance_insignia"
  ADD CONSTRAINT "ck_avance_insignia" CHECK ("avance" >= 0);

ALTER TABLE "gamificacion"."recompensa"
  ADD CONSTRAINT "ck_recompensa_tipo" CHECK ("tipo" IN ('PERSONAJE', 'ACCESORIO')),
  ADD CONSTRAINT "ck_recompensa_costo" CHECK ("costo" > 0);

ALTER TABLE "gamificacion"."canje_recompensa"
  ADD CONSTRAINT "ck_canje_monedas" CHECK ("monedas" > 0);

-- RF-062: un canje no se modifica ni se borra (el saldo de monedas se calcula con ellos).
CREATE TRIGGER "tr_canje_recompensa_append_only" BEFORE UPDATE OR DELETE ON "gamificacion"."canje_recompensa"
  FOR EACH ROW EXECUTE FUNCTION "admin"."impedir_cambios"();

-- ── Catálogos ────────────────────────────────────────────────────────────────

-- RF-058: insignias del Pasaporte del Lector con su regla (SRS §1: Detective de Evidencias, Maestro de
-- las Inferencias, Lector Perseverante) y una de rango por cada mundo del mapa (SAD §6).
INSERT INTO "gamificacion"."insignia" ("codigo", "nombre", "descripcion", "regla") VALUES
  ('PRIMERA_LECTURA', 'Primera lectura', 'Terminaste tu primera lectura.', '{"tipo": "LECTURAS", "meta": 1}'),
  ('DETECTIVE_EVIDENCIAS', 'Detective de Evidencias', 'Encontraste 5 veces la oración que prueba tu respuesta.', '{"tipo": "EVIDENCIAS", "meta": 5}'),
  ('MAESTRO_INFERENCIAS', 'Maestro de las Inferencias', 'Llegaste a «Destacado» descubriendo lo que el texto no dice.', '{"tipo": "NIVEL_HABILIDAD", "habilidad": "INF", "nivel": "AD"}'),
  ('LECTOR_PERSEVERANTE', 'Lector Perseverante', 'Leíste 7 días seguidos.', '{"tipo": "RACHA", "dias": 7}'),
  ('RANGO_EXPLORADOR', 'Rango Explorador', 'Completaste el mundo Explorador.', '{"tipo": "MUNDO", "numero": 1}'),
  ('RANGO_DETECTIVE', 'Rango Detective', 'Completaste el mundo Detective.', '{"tipo": "MUNDO", "numero": 2}'),
  ('RANGO_INVESTIGADOR', 'Rango Investigador', 'Completaste el mundo Investigador.', '{"tipo": "MUNDO", "numero": 3}'),
  ('RANGO_CRITICO', 'Rango Crítico', 'Completaste el mundo Crítico.', '{"tipo": "MUNDO", "numero": 4}'),
  ('MAESTRO_LECTURA', 'Maestro de la Lectura', 'Completaste el mundo Maestro de la Lectura.', '{"tipo": "MUNDO", "numero": 5}');

-- RF-062: personajes y accesorios del avatar. Cuestan monedas de recompensa (1 moneda por cada 10 puntos).
INSERT INTO "gamificacion"."recompensa" ("codigo", "nombre", "tipo", "costo", "orden") VALUES
  ('LUPA', 'Lupa de detective', 'ACCESORIO', 5, 1),
  ('GORRA', 'Gorra de aventurero', 'ACCESORIO', 8, 2),
  ('CHULLO', 'Chullo andino', 'ACCESORIO', 10, 3),
  ('CAPA', 'Capa de lector', 'ACCESORIO', 15, 4),
  ('CORONA', 'Corona de la lectura', 'ACCESORIO', 25, 5),
  ('LLAMA', 'Llama', 'PERSONAJE', 20, 6),
  ('CONDOR', 'Cóndor', 'PERSONAJE', 30, 7),
  ('OSO_ANTEOJOS', 'Oso de anteojos', 'PERSONAJE', 30, 8),
  ('COLIBRI', 'Colibrí', 'PERSONAJE', 40, 9),
  ('DRAGON', 'Dragón lector', 'PERSONAJE', 60, 10);
