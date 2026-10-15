-- CreateTable
CREATE TABLE "Cuenta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE_VERIFICACION',
    "mfaHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilEstudiante" (
    "id" TEXT NOT NULL,
    "cuentaResponsableId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "anioNacimiento" INTEGER NOT NULL,
    "mesNacimiento" INTEGER NOT NULL,
    "avatar" TEXT NOT NULL,
    "hashPin" TEXT NOT NULL,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfilEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consentimiento" (
    "id" TEXT NOT NULL,
    "cuentaResponsableId" TEXT NOT NULL,
    "versionPolitica" TEXT NOT NULL,
    "otorgadoEn" TIMESTAMP(3) NOT NULL,
    "otorganteNombre" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Consentimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verificacion" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "canjeado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "hashRefreshToken" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActividadEn" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escuela" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Escuela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grado" TEXT NOT NULL,
    "escuelaId" TEXT NOT NULL,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estudiante" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaNac" TIMESTAMP(3) NOT NULL,
    "rangoEdad" TEXT NOT NULL,
    "nivelCNEB" TEXT NOT NULL,
    "cursoId" TEXT,

    CONSTRAINT "Estudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Texto" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoriaId" TEXT,
    "nivelCNEB" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Texto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "textoId" TEXT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionLectura" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEn" TIMESTAMP(3),

    CONSTRAINT "SesionLectura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespuestaSesion" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL,
    "evidencia" TEXT,
    "respondidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaSesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsoPistaSesion" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "nivelPista" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsoPistaSesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Progreso" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hitoActual" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Progreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvento" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "agregadoId" TEXT NOT NULL,
    "ocurrioEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoEn" TIMESTAMP(3),

    CONSTRAINT "OutboxEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cuenta_email_key" ON "Cuenta"("email");

-- CreateIndex
CREATE INDEX "PerfilEstudiante_cuentaResponsableId_idx" ON "PerfilEstudiante"("cuentaResponsableId");

-- CreateIndex
CREATE INDEX "PerfilEstudiante_cuentaResponsableId_alias_idx" ON "PerfilEstudiante"("cuentaResponsableId", "alias");

-- CreateIndex
CREATE INDEX "Consentimiento_cuentaResponsableId_vigente_idx" ON "Consentimiento"("cuentaResponsableId", "vigente");

-- CreateIndex
CREATE UNIQUE INDEX "Verificacion_codigo_key" ON "Verificacion"("codigo");

-- CreateIndex
CREATE INDEX "Verificacion_cuentaId_tipo_idx" ON "Verificacion"("cuentaId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_hashRefreshToken_key" ON "Sesion"("hashRefreshToken");

-- CreateIndex
CREATE INDEX "Sesion_cuentaId_idx" ON "Sesion"("cuentaId");

-- CreateIndex
CREATE INDEX "Curso_escuelaId_idx" ON "Curso"("escuelaId");

-- CreateIndex
CREATE INDEX "Estudiante_cursoId_idx" ON "Estudiante"("cursoId");

-- CreateIndex
CREATE INDEX "Texto_categoriaId_idx" ON "Texto"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nombre_key" ON "Categoria"("nombre");

-- CreateIndex
CREATE INDEX "Item_textoId_idx" ON "Item"("textoId");

-- CreateIndex
CREATE INDEX "SesionLectura_estudianteId_idx" ON "SesionLectura"("estudianteId");

-- CreateIndex
CREATE INDEX "RespuestaSesion_sesionId_idx" ON "RespuestaSesion"("sesionId");

-- CreateIndex
CREATE INDEX "RespuestaSesion_itemId_idx" ON "RespuestaSesion"("itemId");

-- CreateIndex
CREATE INDEX "UsoPistaSesion_sesionId_idx" ON "UsoPistaSesion"("sesionId");

-- CreateIndex
CREATE INDEX "Progreso_estudianteId_idx" ON "Progreso"("estudianteId");

-- CreateIndex
CREATE INDEX "OutboxEvento_publicadoEn_idx" ON "OutboxEvento"("publicadoEn");

-- AddForeignKey
ALTER TABLE "PerfilEstudiante" ADD CONSTRAINT "PerfilEstudiante_cuentaResponsableId_fkey" FOREIGN KEY ("cuentaResponsableId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consentimiento" ADD CONSTRAINT "Consentimiento_cuentaResponsableId_fkey" FOREIGN KEY ("cuentaResponsableId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verificacion" ADD CONSTRAINT "Verificacion_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_escuelaId_fkey" FOREIGN KEY ("escuelaId") REFERENCES "Escuela"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudiante" ADD CONSTRAINT "Estudiante_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Texto" ADD CONSTRAINT "Texto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_textoId_fkey" FOREIGN KEY ("textoId") REFERENCES "Texto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionLectura" ADD CONSTRAINT "SesionLectura_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaSesion" ADD CONSTRAINT "RespuestaSesion_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionLectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaSesion" ADD CONSTRAINT "RespuestaSesion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsoPistaSesion" ADD CONSTRAINT "UsoPistaSesion_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionLectura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Progreso" ADD CONSTRAINT "Progreso_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
