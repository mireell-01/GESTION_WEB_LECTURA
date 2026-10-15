-- CreateTable
CREATE TABLE "Aula" (
    "id" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grado" TEXT NOT NULL,
    "anioLectivo" INTEGER NOT NULL,
    "institucion" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivadaEn" TIMESTAMP(3),

    CONSTRAINT "Aula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matricula" (
    "id" TEXT NOT NULL,
    "aulaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiradaEn" TIMESTAMP(3),

    CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Aula_codigo_key" ON "Aula"("codigo");

-- CreateIndex
CREATE INDEX "Aula_docenteId_idx" ON "Aula"("docenteId");

-- CreateIndex
CREATE INDEX "Matricula_estudianteId_idx" ON "Matricula"("estudianteId");

-- CreateIndex
CREATE UNIQUE INDEX "Matricula_aulaId_estudianteId_key" ON "Matricula"("aulaId", "estudianteId");

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
