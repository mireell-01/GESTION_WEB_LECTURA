-- CR-01: el ingreso del estudiante ya no usa código de aula. El dispositivo familiar pasa a ser
-- "dispositivo de ingreso": de una familia (aulaId vacío) o de un aula activada por su docente.
ALTER TABLE "DispositivoFamiliar" RENAME TO "DispositivoIngreso";
ALTER TABLE "DispositivoIngreso" RENAME CONSTRAINT "DispositivoFamiliar_pkey" TO "DispositivoIngreso_pkey";
ALTER TABLE "DispositivoIngreso" RENAME CONSTRAINT "DispositivoFamiliar_cuentaId_fkey" TO "DispositivoIngreso_cuentaId_fkey";
ALTER INDEX "DispositivoFamiliar_hashToken_key" RENAME TO "DispositivoIngreso_hashToken_key";
ALTER INDEX "DispositivoFamiliar_cuentaId_idx" RENAME TO "DispositivoIngreso_cuentaId_idx";

ALTER TABLE "DispositivoIngreso" ADD COLUMN "aulaId" TEXT;
CREATE INDEX "DispositivoIngreso_aulaId_idx" ON "DispositivoIngreso"("aulaId");
