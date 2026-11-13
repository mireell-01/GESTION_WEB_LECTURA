# CR-02 — Ingreso y registro con Google para docentes y familias

| Campo | Valor |
| :--- | :--- |
| Estado | **Implementado**, pendiente de revisión de la Product Owner |
| Solicitado por | Product Owner (13/11/2026) |
| Módulo | 1 · Identidad, Consentimiento y Acceso (IAM) — con apoyo de Administración (auditoría) |
| Rama | `login-google` |

## 1. Pedido

> "Para realizar el inicio de sesión, también que tenga la opción de vincularlo con cuenta Google."

## 2. Decisión

| Quién | ¿Puede usar Google? | Por qué |
| :--- | :--- | :--- |
| **Docentes y familias** | ✅ Sí: ingresar, registrarse y vincular su cuenta | Es más simple: un clic, sin recordar otra contraseña, y Google ya confirmó el correo. |
| **Niños y niñas** | ❌ No: siguen con avatar y PIN | RN-02 (identidad mínima del menor): no se piden ni se guardan cuentas ni correos de los niños. |
| **Equipo de contenidos y administración** | ❌ No: siguen con contraseña y código (MFA) | RF-011: sus cuentas exigen un segundo factor; Google no debe saltárselo. |
| Docente o familiar **con verificación en dos pasos** | ❌ No | Activó un segundo factor a propósito: sigue entrando con contraseña y código. |

**Cómo se reconoce a la persona.** Por el identificador estable de su cuenta de Google (`sub`), no por el correo:
aunque cambie su correo en Google, sigue entrando a la misma cuenta.

- **Ingresar:** la cuenta vinculada a esa cuenta de Google. Si no hay, la cuenta de ese mismo correo, que queda
  vinculada (Google confirmó que el correo es suyo; si la cuenta esperaba verificar el correo, queda verificada).
  Sin cuenta, la página explica cómo registrarse.
- **Registrarse:** igual; si no hay cuenta, se crea **ACTIVA** con el rol elegido (docente o familiar). La contraseña
  es una clave al azar que nadie conoce; si algún día quiere ingresar con contraseña, la crea con
  "¿Olvidaste tu contraseña?" (RF-004).
- **Vincular:** desde "Seguridad de tu cuenta", en el panel de docente o de familia. También se puede **desvincular**.

## 3. Seguridad (OpenID Connect)

- Flujo de **código de autorización con PKCE** (RFC 7636, reto S256): el código que devuelve Google no sirve sin el
  verificador, que nunca sale del servidor.
- **state** y **nonce** de un solo viaje, guardados en una cookie **firmada** (HMAC), `httpOnly`, `SameSite=Lax`, solo
  para `/api/v1/auth/google` y con **10 minutos** de vigencia. Una vuelta con otra cookie u otro state no abre sesión.
- El **ID token** se valida como pide la especificación: firma **RS256** con las llaves públicas de Google (JWKS, en
  caché una hora), emisor, audiencia (nuestro *client ID*), vigencia y nonce. Nunca se acepta `alg: none`.
- Solo se usa un correo que **Google verificó** (`email_verified`).
- La vuelta pasa por la web (que reenvía `/api` a la API), así la sesión es la de siempre: la misma cookie
  `httpOnly` de refresh (RF-003, ADR-005).
- Sin dependencias nuevas: `fetch` y `node:crypto`.
- **Auditoría** (RF-077): `CUENTA_GOOGLE_VINCULADA` y `CUENTA_GOOGLE_DESVINCULADA`.
- Límite de tasa (RNF-019): 20 por minuto por IP al salir a Google y al volver.

## 4. Qué cambia respecto al SRS

| Elemento | Cambio |
| :--- | :--- |
| Base de datos | `iam.cuenta_adulta.google_sub` (texto, opcional, **único**). Migración `20261113000000_ingreso_con_google`. |
| API (SRS §7) | Nuevas: `GET /auth/google/disponible`, `GET /auth/google/inicio`, `GET /auth/google/callback`, `POST /auth/google/vincular`, `GET /auth/google/estado`, `POST /auth/google/desvincular`. |
| Solo desarrollo | `GET/POST /dev/google/autorizar`: el **"Google de prueba"** (ver §5). Nunca existe en producción. |
| Web | Botón "Continuar con Google" en el ingreso, "Registrarme con Google" en el registro (con el rol elegido) e "Ingreso con Google" en "Seguridad de tu cuenta". |

**Lo que no cambia:** el registro y el ingreso con correo y contraseña, la verificación del correo, la recuperación de
contraseña, la verificación en dos pasos y el ingreso de los niños funcionan igual que antes.

## 5. Cómo se activa

**En la computadora del equipo y en las pruebas automáticas**, sin credenciales, funciona el **"Google de prueba"**:
una página que pide un correo y un nombre y simula la elección de cuenta. Usa el mismo código que habla con Google
(firma, emisor, audiencia, nonce y PKCE). Como deja entrar con cualquier correo, tiene **dos candados**: solo existe
fuera de producción **y** con la web en esta computadora (localhost, 127.0.0.1, ::1, *.localhost o *.test). En un
dominio real nunca se activa, aunque falte . Con credenciales reales, se usa Google de verdad.

**Para usar Google de verdad** (una sola vez, con la cuenta de Google del proyecto):

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) y crear (o elegir) un proyecto.
2. **APIs y servicios → Pantalla de consentimiento de OAuth:** tipo **Externo**; nombre "LectoAventura", correo de
   soporte y el dominio de la plataforma. Permisos: `openid`, `email` y `profile` (no hace falta ningún otro).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.**
   - *Orígenes de JavaScript autorizados:* la dirección de la web (por ejemplo `http://localhost:3002`).
   - *URI de redireccionamiento autorizados:* **`<dirección de la web>/api/v1/auth/google/callback`**, por ejemplo
     `http://localhost:3002/api/v1/auth/google/callback` y, al publicar, `https://<dominio>/api/v1/auth/google/callback`.
4. Copiar el **ID de cliente** y el **secreto** en `apps/api/.env` (nunca en el repositorio ni en un chat):
   `GOOGLE_CLIENT_ID=...` y `GOOGLE_CLIENT_SECRET=...`. `WEB_ORIGIN` debe ser la misma dirección de la web.
5. Reiniciar la API. El botón dirá "Continuar con Google" y abrirá Google de verdad.

## 6. Pruebas

| Nivel | Archivo | Qué verifica |
| :--- | :--- | :--- |
| 1 | `apps/api/test/unit/iam/aplicacion/ingreso-google.spec.ts` | Ingresar, registrarse y vincular; límites (correo no verificado, suspendida, equipo de contenidos, MFA); la cookie del viaje (firma, vigencia, state); desvincular. |
| 1 | `apps/api/test/unit/iam/infraestructura/oidc-google.spec.ts` | PKCE S256; código de un solo uso; ID token con otra llave, sin firma, `none`, otro emisor, otra audiencia, vencido, del futuro u otro nonce. |
| 2 | `apps/api/test/integration/iam/google-http.int-spec.ts` | El viaje completo por HTTP con PostgreSQL: cookies, cuenta creada o vinculada, sesión de siempre, auditoría y permisos. |
| 3 | `tests/e2e/specs/iam/ingreso-google.spec.ts` | En el navegador (computadora, tablet y celular): una familia se registra y vuelve a entrar; una docente vincula su cuenta; sin cuenta, la explicación. |
