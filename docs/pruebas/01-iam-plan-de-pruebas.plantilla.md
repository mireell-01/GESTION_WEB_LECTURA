# Plan Maestro de Pruebas — Módulo 1: IAM (Identidad, Consentimiento y Acceso)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/iam` + pantallas web de acceso y panel familiar
> **Requisitos cubiertos:** RF-001 a RF-013, RN-01 a RN-04, RN-17, RNF-001, RNF-008, RNF-017, RNF-019, RNF-022
> **Fecha de ejecución:** 15/10/2026 · **Resultado global:** ✅ 164 pruebas automatizadas en verde en los 4 niveles

| Nivel | Pruebas | Resultado | Tiempo |
| :--- | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 111 | ✅ 111/111 · cobertura 92,2 % líneas / 93,9 % ramas | 5 s |
| 2 · Integración (Supertest + PostgreSQL real) | 27 | ✅ 27/27 | 16 s |
| 3 · Sistema E2E (Playwright, escritorio + tablet) | 16 | ✅ 16/16 | 1,8 min |
| 3 · Carga (RNF-008 / RNF-001) | 2 escenarios | ✅ 0 % errores · p95 108 ms (ingreso) · p95 23 ms (lectura) | 1 min |
| 4 · Aceptación (Gherkin en español) | 10 escenarios | ✅ 10/10 · informe para el Product Owner | 1,2 min |

**Defectos encontrados por las pruebas y corregidos:** 7 (detalle en §1.3).

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
interface (IamController, guards, cookies, DTO class-validator)
   │  usa CasosUsoIam (token CASOS_USO_IAM)
   ▼
application (21 casos de uso, EmisorSesiones, IamFacade) ──► puertos (interfaces)
   ▼                                                          ▲
domain (Cuenta, PerfilEstudiante, Sesion, Consentimiento,     │ implementan
        DispositivoFamiliar, VO Pin/Email/AnioMesNacimiento)  │
                                                              │
infrastructure (Prisma*Repository, Argon2HashService, JwtTokenService,
                OtplibTotpService, Smtp/ConsolaCorreoService, ListaContrasenasFiltradas)
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `CuentaRepository`, `PerfilEstudianteRepository`, `SesionRepository`, `ConsentimientoRepository`, `VerificacionRepository`, `DispositivoRepository` | Interna (puerto) | Doble en memoria (`dobles.ts`) | **Real**: Prisma + PostgreSQL efímero |
| `HashService` (argon2) | Interna/CPU | Doble `HashFalso` (rápido, determinista) + prueba propia del adaptador real | **Real** |
| `TokenService` (JWT + tokens opacos) | Interna/cripto | Doble `TokensFalsos` + prueba propia con `jsonwebtoken` real | **Real** |
| `TotpService` (otplib) | Externa (librería) | Doble `TotpFalso` + prueba con `authenticator.generate` real | **Real** |
| `CorreoService` | Externa (SMTP) | Espía `CorreoEspia` | Bandeja de desarrollo (`/api/iam/dev/correos`) |
| `BusEventos` + Outbox | Interna | Espía `BusEspia` | **Real**: tabla `OutboxEvento` |
| `RecolectorDatosEstudiante` (RF-012) | Interna (otros módulos) | Doble con datos fijos | **Real** (aporta Escuela) |
| Reloj (`() => Date`) | Inyectado | `Reloj` controlable (`avanzarMin`) | Reloj real |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Se aceptaban contraseñas basadas en el nombre (`Rosa123456`) | 1 · `seguridad.spec.ts` | Regla: nombre + solo dígitos/símbolos ⇒ rechazada |
| D-2 | Argon2 usaba parámetros por defecto (64 MiB, t=3, p=4) y no los del **RNF-017** (19 MiB, t=2, p=1) | Análisis estático vs SRS | `PARAMETROS_ARGON2` + prueba que lee los parámetros del hash |
| D-3 | **RNF-019** (límite de tasa) no estaba implementado: se podía probar contraseñas y PIN sin límite | Análisis estático vs SRS | `LimiteTasaGuard` global: 10/min por IP (adulto), 30/min por código de aula (PIN) |
| D-4 | "Salir" llevaba al adulto a la pantalla de ingreso en lugar de la portada (condición de carrera del guard de rutas) | 3 · `seguridad.spec.ts` | `salir(destino)` recarga la app (además limpia la memoria en tablets compartidas, riesgo R-02) |
| D-5 | Código muerto `PoliticaMfa` | 1 · cobertura (0 %) | Eliminado |
| D-6 | El lint de arquitectura del proyecto no funcionaba (regla `boundaries/dependencies` inexistente): la regla de dependencias del SRS no se verificaba | Configuración de CI | Reescrito con `boundaries/element-types`; verificado con violaciones intencionales |
| D-7 | Carácter invisible (BOM) dentro de una expresión regular en Escuela | Lint | Reemplazado por `﻿` |

**Refactor de testabilidad aplicado:** la configuración global de la API (prefijo, CORS, validación, filtro de errores, proxy de confianza) estaba solo en `main.ts`; se extrajo a `configurarApp()` (`apps/api/src/configurar-app.ts`) para que las pruebas de integración usen exactamente la misma configuración que producción.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| El evento del outbox se escribe después del agregado, no en la misma transacción | Inconsistencia si el proceso cae entre ambos | Unit of Work con `prisma.$transaction` en los casos de uso |
| Límite de tasa en memoria | Con varias instancias (RNF-013) cada una cuenta por separado | Mover el contador a Redis (ADR-004) |
| RF-012 parcial | Se entrega JSON inmediato; falta PDF y enlace firmado de 72 h | Exportación asíncrona con worker (ADR-009) |
| El registro responde 409 si el correo ya existe | Permite saber si un correo está registrado (el SRS solo exige anti-enumeración en la recuperación) | Responder 201 genérico y avisar por correo |
| `packages/contracts` no refleja los endpoints reales | La web declara sus tipos a mano (contradice DRY del SRS) | Generar `openapi.yaml` desde los DTO de NestJS |
| Sin Docker en el equipo local | Testcontainers solo corre en CI | Local usa la base efímera `lectoaventura_test` (recreada en cada ejecución) |

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
│       │   ├── infraestructura/seguridad.spec.ts   # JWT, argon2, TOTP, contraseñas
│       │   └── interface/{guards,limite-tasa}.spec.ts
│       └── integration/
│           ├── setup/{global-setup,entorno,app}.ts # Testcontainers o lectoaventura_test
│           └── iam/{iam-http,repositorios,limite-tasa}.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── playwright.config.ts          # Nivel 3 (escritorio + tablet)
│   │   ├── playwright.uat.config.ts      # Nivel 4 (playwright-bdd)
│   │   ├── support/{iam,limpieza}.ts     # Helpers y limpieza de datos e2e
│   │   ├── specs/{smoke.spec.ts, iam/{flujo-familia,seguridad}.spec.ts}
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
- **Invariantes de entidades:** bloqueo de `PerfilEstudiante` tras 5 PIN (15 min, RN-03), anonimización (RF-013), inactividad de `Sesion` (10/30 min, RF-010), MFA en dos pasos de `Cuenta` (RF-011), consentimiento institucional con aula (RN-01).
- **Casos de uso** con dobles: registro, verificación, recuperación, ingreso adulto/estudiante, renovación con rotación, validación de acceso, MFA, consentimiento, perfiles (límite 6, alias repetido), PIN, exportación, eliminación, dispositivos.
- **Adaptadores críticos:** JWT (firma, alteración, `alg: none`, vencimiento 15 min), argon2 (parámetros RNF-017), TOTP, lista de contraseñas; **guards** de roles/MFA y límite de tasa.

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
- Controller + `ValidationPipe` + guards globales + casos de uso + repositorios Prisma + PostgreSQL real.
- Lo que queda **guardado**: contraseña y PIN en Argon2id, enlaces solo como huella SHA-256, rotación de la huella del refresh token, `bloqueadoHasta`, eventos del outbox con `publicadoEn`.
- Cookies (`HttpOnly`, `SameSite=Lax`, `Path=/api/iam/sesiones`; cookie de sesión para estudiantes), RBAC entre módulos (familiar/estudiante → `/api/escuela/aulas` = 403), RN-17 (404 a otra familia), límite de tasa con proxy de confianza.
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

Prueba de integración del límite de tasa (`apps/api/test/integration/iam/limite-tasa.int-spec.ts`; el recorrido HTTP completo está en `iam-http.int-spec.ts`):

<<archivo:apps/api/test/integration/iam/limite-tasa.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- Recorrido real de una familia en la interfaz: registro → correo → verificación → ingreso → consentimiento → perfil → vínculo del dispositivo → ingreso del niño con avatar y PIN.
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

**Resultado de carga obtenido el 15/10/2026** (sondeo equivalente de 60 s con la misma tasa de llegada, mientras k6 no estaba instalado; el script k6 se ejecuta en CI):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /iam/sesiones` a 300/min (RNF-008) | 297 | 0,00 % | 90 ms | 108 ms | 114 ms | error < 0,5 % | ✅ |
| `GET /iam/yo` con 10 usuarios (RNF-001) | 36 938 | 0,00 % | 16 ms | 23 ms | 26 ms | p95 < 300 ms, p99 < 800 ms | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/iam/seguridad.spec.ts`:

<<archivo:tests/e2e/specs/iam/seguridad.spec.ts>>

`tests/e2e/specs/iam/flujo-familia.spec.ts`:

<<archivo:tests/e2e/specs/iam/flujo-familia.spec.ts>>

`tests/load/scenarios/iam-sesiones.js`:

<<archivo:tests/load/scenarios/iam-sesiones.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin
10 escenarios en 3 características (`tests/e2e/features/iam/`). Ejemplo completo:

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
| ☐ | Descargar los datos del perfil | Se baja un JSON con datos personales, consentimiento y aulas |
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
| IAM-U-19 | `LimiteTasaGuard` (RNF-019) | Unit | Borde | Intento 11 → `LIMITE` + `Retry-After` | `npm run test:unit` |
| IAM-I-01 | `POST /api/iam/cuentas` + BD | Int | Positivo | Argon2id guardado; enlace solo como huella SHA-256 | `npm run test:int` |
| IAM-I-02 | `ValidationPipe` | Int | Negativo | 400 en español; rechaza campos extra (`estado`) | `npm run test:int` |
| IAM-I-03 | Cookie de refresh | Int | Positivo | `HttpOnly`, `SameSite=Lax`, ruta acotada | `npm run test:int` |
| IAM-I-04 | `POST /api/iam/sesiones/renovar` | Int | Negativo | Reutilizar refresh → 401 y borra la cookie | `npm run test:int` |
| IAM-I-05 | `POST /api/iam/sesiones/cerrar` (RF-010) | Int | Positivo | Siguiente petición → 401 | `npm run test:int` |
| IAM-I-06 | Bloqueo por PIN en BD + outbox | Int | Borde | 423 con hora; `iam.EstudianteBloqueado` publicado | `npm run test:int` |
| IAM-I-07 | RBAC entre módulos (RF-009) | Int | Negativo | Estudiante/familiar en `/api/escuela/aulas` → 403 | `npm run test:int` |
| IAM-I-08 | Exportación (RF-012) | Int | Positivo | JSON descargable sin hashes, incluye aulas | `npm run test:int` |
| IAM-I-09 | RN-17 | Int | Negativo | Otra familia → 404 | `npm run test:int` |
| IAM-I-10 | Eliminación (RF-013) | Int | Positivo | Alias "Perfil eliminado", PIN vacío, sesiones revocadas | `npm run test:int` |
| IAM-I-11 | Límite de tasa con proxy (RNF-019) | Int | Borde | 11.º intento por IP → 429; otra IP no afectada | `npm run test:int` |
| IAM-S-01 | Recorrido familia completo | Sys | Positivo | Del registro al niño leyendo, en escritorio y tablet | `npm run test:e2e` |
| IAM-S-02 | Ingreso con credenciales erradas | Sys | Negativo | Mensaje claro, sigue en `/ingresar` | `npm run test:e2e` |
| IAM-S-03 | Rutas protegidas sin sesión | Sys | Negativo | Redirige al ingreso correcto según el rol | `npm run test:e2e` |
| IAM-S-04 | PIN errado y separación de roles | Sys | Negativo | "Te quedan 4 intentos"; niño no abre `/familia` | `npm run test:e2e` |
| IAM-S-05 | Recarga y "Salir" | Sys | Positivo | Sesión persiste; "Salir" lleva a la portada y cierra | `npm run test:e2e` |
| IAM-S-06 | Diseño sin desbordes (RNF-022) | Sys | Borde | Sin scroll horizontal en 820 px | `npm run test:e2e` |
| IAM-S-07 | Carga RNF-008 / RNF-001 | Sys | Rendimiento | 0 % errores; p95 108 ms y 23 ms | `npm run test:load` |
| IAM-A-01..10 | 10 escenarios Gherkin | UAT | Pos./Neg./Borde | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — puertos e inyección por constructor en todos los casos de uso; la configuración se lee de `process.env` en el composition root.
- **Cobertura unitaria alcanzable** ............. 9/10 — 92,2 % de líneas alcanzado sin pruebas frágiles.
- **Aislamiento de dependencias** ............... 9/10 — dominio sin NestJS ni Prisma; lint de arquitectura activo.
- **Preparación para CI/CD** .................... 8/10 — pipeline listo; falta su primera ejecución en GitHub y k6 en local.
- **Resiliencia ante fallos (edge cases)** ...... 8/10 — límites, bloqueos y vencimientos cubiertos; pendiente outbox transaccional y límite de tasa distribuido.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 se ejecuta en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
