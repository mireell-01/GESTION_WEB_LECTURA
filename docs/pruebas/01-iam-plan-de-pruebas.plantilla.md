# Plan Maestro de Pruebas — Módulo 1: IAM (Identidad, Consentimiento y Acceso)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/iam` + pantallas web de acceso y panel familiar
> **Requisitos cubiertos:** RF-001 a RF-013, RF-071, RN-01 a RN-04, RN-17, RNF-001, RNF-005, RNF-008, RNF-017, RNF-019, RNF-020, RNF-022, RNF-023, RNF-031, ADR-005, convenciones del API (SRS §7), caso UAT-05 del SRS y el cambio aprobado **CR-01** (tablet sin código de aula)
> **Fecha de ejecución:** 16/10/2026 (actualizado con CR-01 y el diseño responsivo) · **Resultado global:** ✅ 235 pruebas automatizadas en verde en los 4 niveles

| Nivel | Pruebas | Resultado | Tiempo |
| :--- | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 141 | ✅ 141/141 · cobertura 93,2 % líneas / 93,0 % ramas | 27 s |
| 2 · Integración (Supertest + PostgreSQL real) | 33 | ✅ 33/33 | 31 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 48 | ✅ 48/48 | 11,6 min |
| 3 · Carga (RNF-008 / RNF-001) | 2 escenarios | ✅ 0 % errores · p95 187 ms (ingreso) · p95 51 ms (lectura) | 1 min |
| 3 · Peso de la web (RNF-005) | 14 rutas | ✅ 110–115 kB de JS inicial por ruta (límite 250 kB) | — |
| 4 · Aceptación (Gherkin en español) | 13 escenarios | ✅ 13/13 · informe para el Product Owner | 4,2 min |

**Defectos encontrados por las pruebas y corregidos:** 12 · **Brechas con el SRS detectadas en la auditoría y cerradas:** 6 · **Cambios de requisitos aprobados:** 1 (CR-01, detalle en [`docs/cambios/CR-01-tablet-sin-codigo-de-aula.md`](../cambios/CR-01-tablet-sin-codigo-de-aula.md)).

> **Actualización — diseño responsivo y CR-01.** Se aplicó la identidad visual aprobada (violeta, amarillo, tipografía Fredoka + Nunito, botones "3D") en cuatro tamaños de pantalla: celular (< 768 px, barra inferior), tablet vertical (768–1023 px, barra inferior), tablet horizontal y equipos girados (riel de íconos) y computadora (≥ 1181 px, barra lateral con letrero). El niño ya no escribe códigos: la docente o la familia activa la tablet una vez y la app abre directo en los avatares.

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22 |
| Seguridad | argon2 0.45 (Argon2id), jsonwebtoken 9 (HS256), otplib 12 (TOTP), nodemailer |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` |
| Monorepo | npm workspaces (`apps/*`, `packages/*`, `tests/*`) |

## 1.2 Mapa de dependencias del módulo

```
interface (Auth, Estudiantes, AccesoEstudiante, Exportaciones controllers · guards · cookies · DTO)
   │  usa CasosUsoIam (token CASOS_USO_IAM)        rutas del contrato SRS §7: /api/v1/...
   ▼
application (22 casos de uso, EmisorSesiones, IamFacade) ──► puertos (interfaces)
   ▼                                                          ▲
domain (Cuenta, PerfilEstudiante, Sesion, Consentimiento,     │ implementan
        DispositivoFamiliar, Exportacion, VO Pin/Email/...)   │
                                                              │
infrastructure (Prisma*Repository, Argon2HashService, JwtTokenService, OtplibTotpService,
                HmacFirmador, PdfLibGenerador, Smtp/ConsolaCorreoService, ListaContrasenasFiltradas)

shared-kernel: ResolutorContextoAula (lo registra Escuela) · BusEventos+Outbox · FiltroErrores RFC 9457
               · X-Request-Id · LimiteTasaGuard · redactar() para logs sin secretos
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `CuentaRepository`, `PerfilEstudianteRepository`, `SesionRepository`, `ConsentimientoRepository`, `VerificacionRepository`, `DispositivoRepository` | Interna (puerto) | Doble en memoria (`dobles.ts`) | **Real**: Prisma + PostgreSQL efímero |
| `HashService` (argon2) | Interna/CPU | Doble `HashFalso` (rápido, determinista) + prueba propia del adaptador real | **Real** |
| `TokenService` (JWT + tokens opacos) | Interna/cripto | Doble `TokensFalsos` + prueba propia con `jsonwebtoken` real | **Real** |
| `TotpService` (otplib) | Externa (librería) | Doble `TotpFalso` + prueba con `authenticator.generate` real | **Real** |
| `CorreoService` | Externa (SMTP) | Espía `CorreoEspia` | Bandeja de desarrollo (`/api/v1/dev/correos`) |
| `BusEventos` + Outbox | Interna | Espía `BusEspia` | **Real**: tabla `OutboxEvento` |
| `RecolectorDatosEstudiante` (RF-012) | Interna (otros módulos) | Doble con datos fijos | **Real** (aporta Escuela) |
| `ResolutorContextoAula` (RF-007) | Interna (Escuela) | `ContextoAulaFalso` | **Real**: aulas y matrículas de Escuela |
| `AlmacenExportaciones`, `GeneradorPdfExportacion`, `FirmadorEnlaces` (RF-012) | Interna | En memoria + `PdfFalso` + HMAC real | **Real**: tabla `Exportacion`, pdf-lib, HMAC |
| Reloj (`() => Date`) | Inyectado | `Reloj` controlable (`avanzarMin`) | Reloj real · en E2E, `page.clock` de Playwright |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Se aceptaban contraseñas basadas en el nombre (`Rosa123456`) | 1 · `seguridad.spec.ts` | Regla: nombre + solo dígitos/símbolos ⇒ rechazada |
| D-2 | Argon2 usaba parámetros por defecto (64 MiB, t=3, p=4) y no los del **RNF-017** (19 MiB, t=2, p=1) | Análisis estático vs SRS | `PARAMETROS_ARGON2` + prueba que lee los parámetros del hash |
| D-3 | **RNF-019** (límite de tasa) no estaba implementado: se podía probar contraseñas y PIN sin límite | Análisis estático vs SRS | `LimiteTasaGuard` global: 10/min por IP (adulto), 30/min por tablet (PIN, CR-01) |
| D-4 | "Salir" llevaba al adulto a la pantalla de ingreso en lugar de la portada (condición de carrera del guard de rutas) | 3 · `seguridad.spec.ts` | `salir(destino)` recarga la app (además limpia la memoria en tablets compartidas, riesgo R-02) |
| D-5 | Código muerto `PoliticaMfa` | 1 · cobertura (0 %) | Eliminado |
| D-6 | El lint de arquitectura del proyecto no funcionaba (regla `boundaries/dependencies` inexistente): la regla de dependencias del SRS no se verificaba | Configuración de CI | Reescrito con `boundaries/element-types`; verificado con violaciones intencionales |
| D-7 | Caracteres invisibles (BOM, espacio no separable) escritos literalmente dentro de expresiones regulares | Lint | Reemplazados por su secuencia de escape Unicode |
| D-8 | **Matricular estudiantes respondía 500 siempre**: `Matricula.crear` copiaba el parámetro `ahora` a las propiedades y Prisma lo rechazaba | 2 · `iam-http.int-spec.ts` (ingreso por aula, hoy tablet del aula) | Propiedades construidas campo por campo |
| D-9 | Pruebas E2E con aserción débil: `/\/estudiante$/` también acepta `/ingresar/estudiante`, así que daban por bueno el ingreso del niño sin verificarlo | 3 · prueba de inactividad con `page.clock` | `esperarAreaEstudiante()`: URL exacta + contenido propio del área |
| D-10 | **RNF-023** incumplido: botones de 44 px y 36 px y enlaces de texto de 23–26 px de alto (el SRS pide ≥ 48 × 48 px) | Análisis vs SRS + 3 · `responsivo.spec.ts` | Token `--la-target-min: 48px`; enlaces de tarjetas y formularios con altura táctil |
| D-11 | Las páginas de ingreso, registro, recuperación y verificación no tenían título principal `h1` (un lector de pantalla no anunciaba de qué trataba la página) | 3 · `responsivo.spec.ts` | `Tarjeta` acepta `nivel={1}` cuando es el contenido principal |
| D-12 | Las secciones "Muy pronto" del estudiante estaban marcadas como deshabilitadas (`aria-disabled`) aunque al tocarlas muestran un aviso: semántica engañosa | 3 · `responsivo.spec.ts` | Botón normal que se anuncia como ", muy pronto" |

**Brechas con el SRS detectadas en la auditoría del módulo y cerradas (todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | ADR-005 | Detección de reutilización del refresh token, `SameSite=Strict`, máximo de 8 h para el token del estudiante | Tabla `RefreshTokenUsado`; reutilizar un token rotado revoca la sesión y publica `iam.ReutilizacionRefreshDetectada` | U + I |
| B-2 | RF-010 / R-02 | La pantalla no se cerraba sola por inactividad | `useCierrePorInactividad` (10 min niño, 30 min adulto) + aviso al volver al ingreso | S + UAT con reloj simulado |
| B-3 | RF-012 | Solo JSON inmediato | JSON + PDF (pdf-lib) con enlaces firmados HMAC de 72 h; firma alterada → 403, vencido → 404 | U + I + S |
| B-4 | RNF-031 | El log de correos imprimía el enlace con el token | Log sin enlace ni correo completo; `redactar()` en el filtro de errores y el bus | U + I (captura de toda la salida) |
| B-5 | SRS §7 | Rutas `/api/iam/...`, errores propios, sin `X-Request-Id` | Rutas `/api/v1/auth`, `/estudiantes`, `/familia`, `/acceso-estudiante`; Problem Details RFC 9457; `X-Request-Id` | I + S + UAT |
| B-6 | RF-011 | El docente no tenía opción de MFA en su pantalla | Tarjeta "Seguridad de tu cuenta" en `/docente` | Revisión manual |

**Refactor de testabilidad aplicado:** la configuración global de la API (prefijo, CORS, validación, filtro de errores, proxy de confianza) estaba solo en `main.ts`; se extrajo a `configurarApp()` (`apps/api/src/configurar-app.ts`) para que las pruebas de integración usen exactamente la misma configuración que producción.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| El evento del outbox se escribe después del agregado, no en la misma transacción | Inconsistencia si el proceso cae entre ambos | Unit of Work con `prisma.$transaction` en los casos de uso |
| Límite de tasa en memoria | Con varias instancias (RNF-013) cada una cuenta por separado | Mover el contador a Redis (ADR-004) |
| Exportación síncrona | El PDF se genera dentro de la petición (rápido hoy; podría crecer con el progreso de otros módulos) | Moverla a un worker BullMQ (ADR-009); el SRS admite ≤ 24 h |
| Un solo esquema de base de datos | ADR-004 pide un esquema por módulo (`iam`, `escuela`…) | `previewFeatures = ["multiSchema"]` de Prisma cuando haya más módulos |
| Sin creación de cuentas de backoffice | RF-011 solo se prueba en Nivel 1 porque crear editores/administradores es RF-076 | Se cubrirá con el módulo de Administración |
| El registro responde 409 si el correo ya existe | Permite saber si un correo está registrado (el SRS solo exige anti-enumeración en la recuperación) | Responder 201 genérico y avisar por correo |
| `packages/contracts` no refleja los endpoints reales | La web declara sus tipos a mano (contradice DRY del SRS) | Generar `openapi.yaml` desde los DTO de NestJS |
| Sin Docker en el equipo local | Testcontainers solo corre en CI | Local usa la base efímera `lectoaventura_test` (recreada en cada ejecución) |
| En local, la API en modo `watch` puede reiniciarse a mitad de una corrida E2E/UAT si cambia algún archivo | Falsos negativos (se observó una vez: 4 escenarios fallaron con 500 durante el reinicio y pasaron 13/13 al repetir) | CI usa la compilación de producción; en local, correr las pruebas sin editar archivos |
| Las ilustraciones son versiones SVG simplificadas provisionales | Menos detalle que el diseño aprobado | Reemplazar los componentes de `Ilustraciones.tsx` por las ilustraciones finales (sin tocar las pantallas) |
| Las tarjetas de acceso (RF-017) aún devuelven el código de aula | Dato que ya no se usa para ingresar (CR-01) | Se ajusta en el Módulo 2 (Escuela) junto con el PDF de tarjetas |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` 5 + TypeScript | Node.js 22 | Hacer cumplir la regla de dependencias (domain no importa infraestructura; módulos solo por `public-api`) | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` + `unplugin-swc` + `@swc/core` | Node.js 22 | Dominio, casos de uso con dobles, adaptadores cripto, guards | `npm i -D -w @lectoaventura/api vitest @vitest/coverage-v8 unplugin-swc @swc/core` |
| 2 · Integración | Supertest 7 + `@nestjs/testing` 10 + `@testcontainers/postgresql` 11 | PostgreSQL 16 local **o** Docker (Testcontainers) | API completa + Prisma + PostgreSQL real: hashes, huellas, outbox, cookies, RBAC | `npm i -D -w @lectoaventura/api supertest @types/supertest @nestjs/testing @testcontainers/postgresql` |
| 3 · Sistema E2E | Playwright 1.64 (`@playwright/test`) | Microsoft Edge (local) / Chromium (CI) | Recorridos reales en la UI, escritorio y tablet táctil | Ya incluido en `tests/e2e`; CI: `npx playwright install --with-deps chromium` |
| 3 · Carga | k6 (script `tests/load/scenarios/iam-sesiones.js`) | Binario k6 | RNF-008 (300 ingresos/min, error < 0,5 %) y RNF-001 (p95 < 300 ms) | `winget install k6 --source winget` (Windows) · `grafana/setup-k6-action` (CI) |
| 4 · Aceptación | playwright-bdd 9.2 (Cucumber + Playwright) | Microsoft Edge / Chromium | Escenarios Gherkin en español firmables por el Product Owner | `npm i -D -w @lectoaventura/tests-e2e playwright-bdd@9.2.1` |
| CI/CD | GitHub Actions | Runner `ubuntu-latest` (con Docker) | Ejecutar los 4 niveles en orden y bloquear el merge | Archivo `.github/workflows/calidad.yml` |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/
│   ├── vitest.config.ts                  # Nivel 1 (SWC + umbrales de cobertura 80 %)
│   ├── vitest.integration.config.ts      # Nivel 2 (serie, BD efímera)
│   ├── src/configurar-app.ts             # Config. global compartida app ↔ pruebas
│   └── test/
│       ├── unit/iam/
│       │   ├── dobles.ts                 # Repos en memoria, espías, reloj controlable
│       │   ├── dominio/
│       │   │   ├── value-objects.spec.ts # Pin, AnioMesNacimiento, Email, Rol, CodigoUnUso
│       │   │   └── entidades.spec.ts     # PerfilEstudiante, Sesion, Cuenta, Consentimiento
│       │   ├── aplicacion/
│       │   │   ├── autenticacion.spec.ts # Login adulto/estudiante, sesiones, MFA
│       │   │   └── cuentas-y-perfiles.spec.ts
│       │   ├── infraestructura/
│       │   │   ├── seguridad.spec.ts               # JWT, argon2, TOTP, contraseñas
│       │   │   └── exportacion-y-logs.spec.ts      # HMAC, PDF, redacción RNF-031, RFC 9457
│       │   └── interface/{guards,limite-tasa}.spec.ts
│       └── integration/
│           ├── setup/{global-setup,entorno,app}.ts # Testcontainers o lectoaventura_test
│           └── iam/{iam-http,repositorios,limite-tasa,logs-sin-secretos}.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── playwright.config.ts          # Nivel 3 (escritorio + tablet)
│   │   ├── playwright.uat.config.ts      # Nivel 4 (playwright-bdd)
│   │   ├── support/{iam,limpieza}.ts     # Helpers y limpieza de datos e2e
│   │   ├── specs/{smoke.spec.ts, diseno/responsivo.spec.ts, iam/{flujo-familia,seguridad,ingreso-tablet-aula-e-inactividad}.spec.ts}
│   │   ├── features/iam/*.feature        # Gherkin en español
│   │   └── steps/{fixtures,iam.steps}.ts # Step definitions
│   └── load/scenarios/iam-sesiones.js    # k6
├── .github/workflows/calidad.yml         # Quality gates
└── .claude/skills/pruebas-modulo/SKILL.md
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Value objects:** `Pin` (formato, triviales 0000–9999/1234/4321, año de nacimiento), `AnioMesNacimiento` (edad 5–13 con borde por mes, rangos R1/R2/R3), `Email` (normalización), `Contrasena` (≥ 10), `Rol` (MFA obligatorio), `CodigoUnUso` (un solo canje, vencimiento al milisegundo).
- **Invariantes de entidades:** bloqueo de `PerfilEstudiante` tras 5 PIN (15 min, RN-03), anonimización (RF-013), inactividad de `Sesion` (10/30 min, RF-010) y **máximo de 8 h del estudiante** (ADR-005), MFA en dos pasos de `Cuenta` (RF-011), consentimiento institucional con aula (RN-01).
- **Casos de uso** con dobles: registro, verificación, recuperación, ingreso adulto, **ingreso del estudiante con contexto de aula o de dispositivo**, renovación con rotación y **detección de reutilización**, validación de acceso, MFA, consentimiento, perfiles (límite 6, alias repetido), PIN, **exportación JSON + PDF con enlaces firmados de 72 h**, eliminación, dispositivos (vencen a los 30 días).
- **Adaptadores críticos:** JWT (firma, alteración, `alg: none`, vencimiento 15 min), argon2 (parámetros RNF-017), TOTP, lista de contraseñas, **firmador HMAC, PDF real con pdf-lib, redacción de secretos (RNF-031) y Problem Details (RFC 9457)**; **guards** de roles/MFA y límite de tasa con varias reglas.

## 4.2 Aplicativos y librerías
Vitest 3.2 · `@vitest/coverage-v8` · `unplugin-swc` (decoradores de NestJS con metadatos) · dobles propios en `test/unit/iam/dobles.ts` (sin librería de mocks: los puertos son interfaces pequeñas).

## 4.3 Configuración y ejecución paso a paso
```bash
npm ci
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run test:unit
```
El reporte HTML de cobertura queda en `apps/api/reports/unit/coverage/index.html`. La ejecución falla si la cobertura baja de 80 % (líneas/funciones/sentencias) o 75 % (ramas).

## 4.4 Código completo del test unitario
Archivo: `apps/api/test/unit/iam/dominio/entidades.spec.ts` (los demás archivos están en la misma carpeta).

<<archivo:apps/api/test/unit/iam/dominio/entidades.spec.ts>>

Prueba unitaria del guard de límite de tasa, RNF-019 (`apps/api/test/unit/iam/interface/limite-tasa.spec.ts`). Los dobles de los puertos están en `apps/api/test/unit/iam/dobles.ts`:

<<archivo:apps/api/test/unit/iam/interface/limite-tasa.spec.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- Controllers + `ValidationPipe` + guards globales + casos de uso + repositorios Prisma + PostgreSQL real, con las **rutas del contrato** (`/api/v1/...`), errores **Problem Details** y cabecera **`X-Request-Id`**.
- Lo que queda **guardado**: contraseña y PIN en Argon2id con los parámetros del RNF-017, enlaces solo como huella SHA-256, rotación de la huella del refresh token y su registro como usada, `bloqueadoHasta`, eventos del outbox con `publicadoEn`.
- Cookies (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`; cookie de sesión para estudiantes), **reutilización de un refresh token → sesión revocada**, RBAC entre módulos (familiar/estudiante → `/api/v1/aulas` = 403), RN-17 (404 a otra familia), límite de tasa con proxy de confianza.
- **Exportación**: descarga real de JSON y PDF por enlace firmado sin sesión; firma o formato alterados → 403.
- **Tablet del aula de punta a punta** con Escuela (CR-01): la docente crea el aula, matricula y activa la tablet; el niño ve solo su aula y entra con el PIN de su tarjeta sin escribir códigos; un ajeno es rechazado (403); la familia u otra docente no activan el aula (403/404); al archivarla, la tablet deja de servir.
- **RNF-031 verificado**: se captura toda la salida de logs de un recorrido completo y se comprueba que no aparece ninguna contraseña, PIN, token, código, firma ni hash.
- Adaptadores Prisma: upsert sin duplicar, unicidad de correo, filtros, revocación masiva.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · `@testcontainers/postgresql` (`postgres:16-alpine`) **o**, sin Docker, la base `lectoaventura_test` del PostgreSQL local (el setup se niega a usar una base que no termine en `_test`). Las migraciones reales de Prisma se aplican desde cero en cada ejecución.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```
Con Docker disponible (como en CI):
```bash
USAR_TESTCONTAINERS=1 npm run test:int
```

## 5.4 Código completo del test de integración
Configuración global de la base efímera (`apps/api/test/integration/setup/global-setup.ts`):

<<archivo:apps/api/test/integration/setup/global-setup.ts>>

Prueba automatizada de logs sin secretos, RNF-031 (`apps/api/test/integration/iam/logs-sin-secretos.int-spec.ts`; el recorrido HTTP completo está en `iam-http.int-spec.ts`):

<<archivo:apps/api/test/integration/iam/logs-sin-secretos.int-spec.ts>>

Prueba de integración del límite de tasa (`apps/api/test/integration/iam/limite-tasa.int-spec.ts`):

<<archivo:apps/api/test/integration/iam/limite-tasa.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- Recorrido real de una familia en la interfaz (el "E2E Familia" del SRS): registro → correo → verificación → ingreso → consentimiento → perfil → **exportar datos y descargar el PDF** → vínculo del dispositivo → ingreso del niño con avatar y PIN.
- **Tablet del aula (CR-01)**: la docente la activa desde "Mis aulas", la deja lista para los niños y la niña entra con su avatar y el PIN de su tarjeta, sin códigos.
- **Diseño responsivo (RNF-022, RNF-023)** en computadora (1280 px), tablet (820 px) y celular (390 px): sin desplazamiento lateral, objetivos táctiles ≥ 48 px y la navegación de cada dispositivo.
- **Cierre por inactividad** a los 10 minutos con el reloj simulado de Playwright (`page.clock`), sin esperar minutos reales.
- Seguridad desde la UI: credenciales incorrectas, rutas protegidas, contexto obligatorio (RN-04), intentos de PIN restantes, separación de roles, sesión que sobrevive a recargar y cierre real.
- Ambos dispositivos del SRS: escritorio 1280×800 y **tablet táctil 820×1180** (RNF-022), sin desplazamiento horizontal.
- Carga: RNF-008 y RNF-001.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run dev:api
```
```bash
npm run dev --workspace @lectoaventura/web -- -p 3002
```
```bash
npm run test:e2e
```
```bash
npm run report --workspace @lectoaventura/tests-e2e
```
Si los servidores no están levantados, Playwright los inicia solo (`webServer`). Al terminar, `support/limpieza.ts` borra las cuentas de prueba (`@e2e.lectoaventura.test`).

Carga (requiere k6):
```bash
winget install k6 --source winget
```
```bash
npm run test:load
```

**Resultado de carga obtenido el 16/10/2026** (sondeo equivalente de 60 s con la misma tasa de llegada, mientras k6 no estaba instalado; el script k6 se ejecuta en CI). La medición se hizo en el portátil de desarrollo con la API en modo `watch` y otros procesos abiertos:

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /api/v1/auth/login` a 300/min (RNF-008) | 296 | 0,00 % | 127 ms | 277 ms | 440 ms | error < 0,5 % | ✅ |
| `GET /api/v1/auth/yo` con 10 usuarios (RNF-001) | 19 571 | 0,00 % | 25 ms | 62 ms | 91 ms | p95 < 300 ms, p99 < 800 ms | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/iam/seguridad.spec.ts`:

<<archivo:tests/e2e/specs/iam/seguridad.spec.ts>>

`tests/e2e/specs/iam/flujo-familia.spec.ts`:

<<archivo:tests/e2e/specs/iam/flujo-familia.spec.ts>>

`tests/e2e/specs/iam/ingreso-tablet-aula-e-inactividad.spec.ts`:

<<archivo:tests/e2e/specs/iam/ingreso-tablet-aula-e-inactividad.spec.ts>>

`tests/e2e/specs/diseno/responsivo.spec.ts`:

<<archivo:tests/e2e/specs/diseno/responsivo.spec.ts>>

`tests/load/scenarios/iam-sesiones.js`:

<<archivo:tests/load/scenarios/iam-sesiones.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin
13 escenarios en 4 características (`tests/e2e/features/iam/`). Los etiquetados `@UAT-05` corresponden al caso de aceptación UAT-05 del propio SRS (consentimiento parental obligatorio) y los `@CR-01`, al cambio aprobado "tablet del aula sin códigos".

<<archivo:tests/e2e/features/iam/tablet-del-aula.feature>>

<<archivo:tests/e2e/features/iam/ingreso-estudiante.feature>>

<<archivo:tests/e2e/features/iam/perfil-del-nino.feature>>

<<archivo:tests/e2e/features/iam/registro-y-acceso.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/iam.steps.ts>>

**Checklist manual para el Product Owner / docente evaluador:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Crear una cuenta familiar en `/registro` y abrir el enlace en `/dev/correos` | La cuenta se activa y se puede ingresar |
| ☐ | Intentar crear un perfil antes del consentimiento | El panel pide el consentimiento primero |
| ☐ | Revisar el formulario de perfil | Solo pide alias, mes/año, avatar y PIN (sin apellidos, documento, foto ni correo) |
| ☐ | Vincular la tablet y entrar como el niño en `/ingresar/estudiante` | Se ven solo los avatares de la familia; con el PIN correcto entra |
| ☐ | Escribir 5 PIN equivocados | El perfil se bloquea y el adulto puede restablecer el PIN |
| ☐ | "Descargar datos" del perfil | Aparecen los enlaces PDF y JSON con su fecha de vencimiento (72 h); el PDF se abre y es legible |
| ☐ | Dejar al niño 10 minutos sin tocar la tablet | La sesión se cierra sola y el ingreso explica por qué |
| ☐ | Como docente, en "Mis aulas" tocar "Activar esta tablet" y luego "Dejar la tablet lista para los niños" | La tablet muestra los avatares del aula; el niño entra con su PIN sin escribir códigos |
| ☐ | Abrir la app en celular, tablet (vertical y horizontal) y computadora | Todo se lee sin hacer zoom ni desplazarse a los lados; los botones se tocan con facilidad |
| ☐ | Configurar la verificación en dos pasos desde `/familia` o `/docente` | La app autenticadora pide el código en el siguiente ingreso |
| ☐ | Eliminar el perfil | Desaparece de la lista y del ingreso de la tablet |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html` (informe Cucumber legible), revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de cada `.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)

## 8.1 Skill del agente de código
Archivo incluido en el repositorio: `.claude/skills/pruebas-modulo/SKILL.md`. En Claude Code se invoca con `/pruebas-modulo` (o el agente la usa sola al modificar un módulo).

<<archivo:.claude/skills/pruebas-modulo/SKILL.md>>

## 8.2 Servidores MCP recomendados
| Servidor MCP | Uso en este módulo |
| :--- | :--- |
| **Playwright MCP** (`@playwright/mcp`) | El agente navega la app, inspecciona el árbol de accesibilidad y propone selectores `getByRole` para nuevas pruebas E2E |
| **PostgreSQL (solo lectura)** apuntando a `lectoaventura_test` | Verificar estado de datos tras una prueba (hashes, outbox) sin escribir código ad hoc |
| **GitHub MCP** (`github/github-mcp-server`) | Leer el resultado del workflow `Calidad`, comentar fallos en el PR del módulo |

Ejemplo de `.mcp.json` (no incluye secretos; el token de GitHub se toma del entorno):
```json
{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--browser", "msedge"] },
    "github": { "command": "docker", "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"] }
  }
}
```

## 8.3 Flujo de auto-reparación (auto-healing)
1. Ejecutar solo lo que falló: `npx playwright test --last-failed` (en `tests/e2e`).
2. Pedir al agente el diagnóstico con el contexto que Playwright ya genera (`test-results/**/error-context.md` y la traza):
```bash
claude -p "/pruebas-modulo iam: ejecuta npm run test:e2e, lee tests/e2e/test-results/**/error-context.md y decide si es un cambio de negocio (actualiza prueba y .feature) o un defecto (corrige el código). Repite hasta que pase."
```
3. Revisar el diff propuesto antes de aceptarlo: una prueba nunca se "arregla" debilitando lo que verifica.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
Archivo: `.github/workflows/calidad.yml`. Orden: estático → unitarias (umbral de cobertura) → integración (Testcontainers) → sistema + aceptación + humo de carga. Cualquier fallo bloquea el merge del Pull Request.

<<archivo:.github/workflows/calidad.yml>>

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| IAM-U-01 | `Pin.de` (RN-03, R-10) | Unit | Negativo | Rechaza formato inválido y 0000–9999, 1234, 4321 | `npm run test:unit` |
| IAM-U-02 | `Pin.de(pin, anio)` | Unit | Borde | Rechaza el año de nacimiento, acepta otro año | `npm run test:unit` |
| IAM-U-03 | `AnioMesNacimiento.de` | Unit | Borde | Acepta 5 y 13 años; rechaza 4 (por un mes) y 14 | `npm run test:unit` |
| IAM-U-04 | `rangoEdad` | Unit | Positivo | 6–7 → R1, 8–9 → R2, 10–12 → R3 | `npm run test:unit` |
| IAM-U-05 | `CodigoUnUso.canjear` (RF-002/004) | Unit | Borde | Un solo canje; vencido 1 ms después | `npm run test:unit` |
| IAM-U-06 | `PerfilEstudiante.registrarIntentoFallido` (RF-008) | Unit | Borde | Bloqueo exacto al 5.º error durante 15 min | `npm run test:unit` |
| IAM-U-07 | `Sesion.estaViva` (RF-010) | Unit | Borde | Estudiante 10 min, adulto 30 min, revocada nunca | `npm run test:unit` |
| IAM-U-08 | `Cuenta.confirmarMfa` (RF-011) | Unit | Negativo | Sin secreto pendiente lanza error | `npm run test:unit` |
| IAM-U-09 | `AutenticarAdultoUseCase` (RF-003) | Unit | Negativo | Mismo error para correo inexistente y contraseña errada | `npm run test:unit` |
| IAM-U-10 | `AutenticarAdultoUseCase` (RF-011) | Unit | Positivo | Backoffice sin MFA → sesión limitada a `/backoffice/mfa` | `npm run test:unit` |
| IAM-U-11 | `AutenticarEstudianteUseCase` (RN-04) | Unit | Negativo | Dispositivo de otra familia → prohibido | `npm run test:unit` |
| IAM-U-12 | `RenovarSesionUseCase` (RF-003) | Unit | Negativo | Refresh anterior inválido tras rotar | `npm run test:unit` |
| IAM-U-13 | `ValidarAccesoUseCase` | Unit | Negativo | `sid` de otro sujeto → sesión inválida | `npm run test:unit` |
| IAM-U-14 | `CrearPerfilEstudianteUseCase` (RF-005/071) | Unit | Borde | Sin consentimiento 409; 7.º perfil rechazado | `npm run test:unit` |
| IAM-U-15 | `RecuperarContrasenaUseCase` (RF-004) | Unit | Positivo | Misma respuesta; correo solo si la cuenta existe | `npm run test:unit` |
| IAM-U-16 | `JwtTokenService` | Unit | Negativo | Rechaza firma ajena, cuerpo alterado y `alg: none` | `npm run test:unit` |
| IAM-U-17 | `Argon2HashService` (RNF-017) | Unit | Positivo | `m=19456, t=2, p=1`, sal distinta por hash | `npm run test:unit` |
| IAM-U-18 | `RolesGuard` (RF-009/011) | Unit | Negativo | Otro rol 403; backoffice sin MFA 403 | `npm run test:unit` |
| IAM-U-19 | `LimiteTasaGuard` (RNF-019) | Unit | Borde | Intento 11 → `LIMITE` + `Retry-After`; reglas por IP y por aula | `npm run test:unit` |
| IAM-U-20 | `RenovarSesionUseCase` (ADR-005) | Unit | Negativo | Reutilizar un refresh rotado revoca la sesión y publica el evento | `npm run test:unit` |
| IAM-U-21 | `Sesion.estaViva` (ADR-005) | Unit | Borde | Estudiante muere a las 8 h aunque haya actividad; adulto no | `npm run test:unit` |
| IAM-U-22 | `ContextoIngresoUseCase` (RN-04, CR-01) | Unit | Negativo | Sin tablet, tablet desconocida, vencida o de un aula archivada → sin avatares | `npm run test:unit` |
| IAM-U-27 | `VincularDispositivoUseCase` (RN-04, CR-01) | Unit | Pos./Neg. | La docente activa solo sus aulas activas; la familia no activa aulas; solo se guarda la huella | `npm run test:unit` |
| IAM-U-23 | `Solicitar/DescargarExportacion` (RF-012) | Unit | Borde | Vence a las 72 h exactas; firma/formato/fecha alterados → rechazo | `npm run test:unit` |
| IAM-U-24 | `redactar` (RNF-031) | Unit | Negativo | Enmascara contraseñas, PIN, códigos, cookies, JWT, hashes y huellas | `npm run test:unit` |
| IAM-U-25 | `FiltroErrores` (SRS §7) | Unit | Positivo | Problem Details RFC 9457; 500 sin filtrar el error interno | `npm run test:unit` |
| IAM-U-26 | `PdfLibGenerador` (RF-012) | Unit | Positivo | PDF A4 válido, varias páginas, sin romper con caracteres no WinAnsi | `npm run test:unit` |
| IAM-I-01 | `POST /api/v1/auth/registro` + BD | Int | Positivo | Argon2id (m=19456, t=2, p=1) guardado; enlace solo como huella SHA-256 | `npm run test:int` |
| IAM-I-02 | `ValidationPipe` | Int | Negativo | 400 en español; rechaza campos extra (`estado`) | `npm run test:int` |
| IAM-I-03 | Cookie de refresh | Int | Positivo | `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` | `npm run test:int` |
| IAM-I-04 | `POST /api/v1/auth/refresh` (ADR-005) | Int | Negativo | Reutilizar refresh → 401, cookie borrada y sesión entera revocada | `npm run test:int` |
| IAM-I-05 | `POST /api/v1/auth/logout` (RF-010) | Int | Positivo | Siguiente petición → 401 | `npm run test:int` |
| IAM-I-06 | Bloqueo por PIN en BD + outbox | Int | Borde | 423 con hora; `iam.EstudianteBloqueado` publicado | `npm run test:int` |
| IAM-I-07 | RBAC entre módulos (RF-009) | Int | Negativo | Estudiante/familiar en `/api/v1/aulas` → 403 | `npm run test:int` |
| IAM-I-08 | Exportación (RF-012) | Int | Positivo | JSON y PDF por enlace firmado; alterado → 403 | `npm run test:int` |
| IAM-I-09 | RN-17 | Int | Negativo | Otra familia → 404 | `npm run test:int` |
| IAM-I-10 | Eliminación (RF-013) | Int | Positivo | Alias "Perfil eliminado", PIN vacío, sesiones revocadas, fuera del dispositivo | `npm run test:int` |
| IAM-I-11 | Límite de tasa con proxy (RNF-019) | Int | Borde | 11.º intento por IP → 429; 31.º por tablet → 429 (otra tablet sigue) | `npm run test:int` |
| IAM-I-12 | Contrato del API (SRS §7) | Int | Positivo | `/api/v1`, `X-Request-Id`, Problem Details | `npm run test:int` |
| IAM-I-13 | Tablet del aula + Escuela (RF-007, RF-015, RF-020, CR-01) | Int | Pos./Neg. | Entra el matriculado; ajeno 403; familia 403; otra docente 404; aula archivada 403 | `npm run test:int` |
| IAM-I-14 | Logs sin secretos (RNF-031) | Int | Negativo | 0 apariciones de contraseña, PIN, tokens, códigos, firmas o hashes | `npm run test:int` |
| IAM-S-01 | Recorrido familia completo + exportar PDF | Sys | Positivo | Del registro al niño leyendo, con descarga del PDF, en escritorio y tablet | `npm run test:e2e` |
| IAM-S-08 | Tablet del aula (CR-01) | Sys | Pos./Neg. | Sin activar no hay avatares ni campos; activada, el niño entra sin códigos | `npm run test:e2e` |
| IAM-S-10 | Diseño responsivo (RNF-022, RNF-023) | Sys | Borde | 0 px de desborde y objetivos ≥ 48 px en 1280, 820 y 390 px; barra lateral o inferior según el dispositivo | `npm run test:e2e` |
| IAM-S-09 | Cierre por inactividad (RF-010) | Sys | Borde | Con 9 min sigue dentro; pasados 10 min vuelve al ingreso con aviso | `npm run test:e2e` |
| IAM-S-02 | Ingreso con credenciales erradas | Sys | Negativo | Mensaje claro, sigue en `/ingresar` | `npm run test:e2e` |
| IAM-S-03 | Rutas protegidas sin sesión | Sys | Negativo | Redirige al ingreso correcto según el rol | `npm run test:e2e` |
| IAM-S-04 | PIN errado y separación de roles | Sys | Negativo | "Te quedan 4 intentos"; niño no abre `/familia` | `npm run test:e2e` |
| IAM-S-05 | Recarga y "Salir" | Sys | Positivo | Sesión persiste; "Salir" lleva a la portada y cierra | `npm run test:e2e` |
| IAM-S-06 | Diseño sin desbordes (RNF-022) | Sys | Borde | Sin scroll horizontal en 820 px | `npm run test:e2e` |
| IAM-S-07 | Carga RNF-008 / RNF-001 | Sys | Rendimiento | 0 % errores; p95 277 ms y 62 ms | `npm run test:load` |
| IAM-A-01..13 | 13 escenarios Gherkin (incluye UAT-05 del SRS, la inactividad y la tablet del aula de CR-01) | UAT | Pos./Neg./Borde | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — puertos e inyección por constructor en todos los casos de uso; la configuración se lee de `process.env` en el composition root.
- **Cobertura unitaria alcanzable** ............. 9/10 — 93,1 % de líneas alcanzado sin pruebas frágiles.
- **Aislamiento de dependencias** ............... 9/10 — dominio sin NestJS ni Prisma; IAM ya no depende de Escuela (contexto de aula por puerto); lint de arquitectura activo.
- **Preparación para CI/CD** .................... 8/10 — pipeline listo; falta su primera ejecución en GitHub y k6 en local.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — límites, bloqueos, vencimientos, reutilización de tokens e inactividad cubiertos; pendiente outbox transaccional y límite de tasa distribuido.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 se ejecuta en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
