-- DropForeignKey
ALTER TABLE "Curso" DROP CONSTRAINT "Curso_escuelaId_fkey";

-- DropForeignKey
ALTER TABLE "Estudiante" DROP CONSTRAINT "Estudiante_cursoId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_textoId_fkey";

-- DropForeignKey
ALTER TABLE "Progreso" DROP CONSTRAINT "Progreso_estudianteId_fkey";

-- DropForeignKey
ALTER TABLE "RespuestaSesion" DROP CONSTRAINT "RespuestaSesion_itemId_fkey";

-- DropForeignKey
ALTER TABLE "RespuestaSesion" DROP CONSTRAINT "RespuestaSesion_sesionId_fkey";

-- DropForeignKey
ALTER TABLE "Sesion" DROP CONSTRAINT "Sesion_cuentaId_fkey";

-- DropForeignKey
ALTER TABLE "SesionLectura" DROP CONSTRAINT "SesionLectura_estudianteId_fkey";

-- DropForeignKey
ALTER TABLE "Texto" DROP CONSTRAINT "Texto_categoriaId_fkey";

-- DropForeignKey
ALTER TABLE "UsoPistaSesion" DROP CONSTRAINT "UsoPistaSesion_sesionId_fkey";

-- DropIndex
DROP INDEX "Consentimiento_cuentaResponsableId_vigente_idx";

-- DropIndex
DROP INDEX "PerfilEstudiante_cuentaResponsableId_alias_idx";

-- DropIndex
DROP INDEX "Sesion_cuentaId_idx";

-- AlterTable
ALTER TABLE "Consentimiento" ADD COLUMN     "aulaId" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'PARENTAL';

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "mfaSecretPendiente" TEXT;

-- AlterTable
ALTER TABLE "PerfilEstudiante" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "consentimientoId" TEXT NOT NULL,
ADD COLUMN     "eliminadoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sesion" DROP COLUMN "cuentaId",
ADD COLUMN     "mfa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sujetoId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Categoria";

-- DropTable
DROP TABLE "Curso";

-- DropTable
DROP TABLE "Escuela";

-- DropTable
DROP TABLE "Estudiante";

-- DropTable
DROP TABLE "Item";

-- DropTable
DROP TABLE "Progreso";

-- DropTable
DROP TABLE "RespuestaSesion";

-- DropTable
DROP TABLE "SesionLectura";

-- DropTable
DROP TABLE "Texto";

-- DropTable
DROP TABLE "UsoPistaSesion";

-- CreateTable
CREATE TABLE "DispositivoFamiliar" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hashToken" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadoEn" TIMESTAMP(3),

    CONSTRAINT "DispositivoFamiliar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DispositivoFamiliar_hashToken_key" ON "DispositivoFamiliar"("hashToken");

-- CreateIndex
CREATE INDEX "DispositivoFamiliar_cuentaId_idx" ON "DispositivoFamiliar"("cuentaId");

-- CreateIndex
CREATE INDEX "Consentimiento_cuentaResponsableId_tipo_vigente_idx" ON "Consentimiento"("cuentaResponsableId", "tipo", "vigente");

-- CreateIndex
CREATE INDEX "Cuenta_rol_idx" ON "Cuenta"("rol");

-- CreateIndex
CREATE INDEX "OutboxEvento_tipo_agregadoId_idx" ON "OutboxEvento"("tipo", "agregadoId");

-- CreateIndex
CREATE INDEX "Sesion_sujetoId_idx" ON "Sesion"("sujetoId");

-- AddForeignKey
ALTER TABLE "DispositivoFamiliar" ADD CONSTRAINT "DispositivoFamiliar_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
