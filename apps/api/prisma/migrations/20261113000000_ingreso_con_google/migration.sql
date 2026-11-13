-- Ingreso con Google para docentes y familias: la cuenta adulta guarda el identificador estable de su
-- cuenta de Google (el `sub` del ID token de OpenID Connect). Es opcional y único: una cuenta de Google
-- se vincula a una sola cuenta de LectoAventura. Los niños no la usan (entran con avatar y PIN).
ALTER TABLE "iam"."cuenta_adulta" ADD COLUMN "google_sub" TEXT;

CREATE UNIQUE INDEX "cuenta_adulta_google_sub_key" ON "iam"."cuenta_adulta"("google_sub");
