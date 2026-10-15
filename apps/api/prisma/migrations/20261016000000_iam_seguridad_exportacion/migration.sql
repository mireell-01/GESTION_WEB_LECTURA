-- CreateTable
CREATE TABLE "RefreshTokenUsado" (
    "hash" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshTokenUsado_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "Exportacion" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "solicitadaPor" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "archivoJson" BYTEA NOT NULL,
    "archivoPdf" BYTEA NOT NULL,

    CONSTRAINT "Exportacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefreshTokenUsado_sesionId_idx" ON "RefreshTokenUsado"("sesionId");

-- CreateIndex
CREATE INDEX "Exportacion_perfilId_idx" ON "Exportacion"("perfilId");

-- CreateIndex
CREATE INDEX "Exportacion_expiraEn_idx" ON "Exportacion"("expiraEn");
