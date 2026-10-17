<!-- Generado con node docs/pruebas/construir.mjs desde 01-iam-plan-de-pruebas.plantilla.md. No editar a mano. -->
# Plan Maestro de Pruebas — Módulo 1: IAM (Identidad, Consentimiento y Acceso)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/iam` + pantallas web de acceso y panel familiar
> **Requisitos cubiertos:** RF-001 a RF-013, RF-071, RN-01 a RN-04, RN-17, RNF-001, RNF-005, RNF-008, RNF-017, RNF-019, RNF-020, RNF-022, RNF-023, RNF-031, ADR-005, convenciones del API (SRS §7), caso UAT-05 del SRS el cambio aprobado **CR-01** (tablet sin código de aula) y el reenvío seguro del enlace de verificación (RF-002)
> **Fecha de ejecución:** 16/10/2026 (actualizado con CR-01 y el diseño responsivo) · **Resultado global:** ✅ 259 pruebas automatizadas en verde en los 4 niveles

| Nivel | Pruebas | Resultado | Tiempo |
| :--- | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 150 | ✅ 150/150 · cobertura 93,6 % líneas / 93,0 % ramas | 27 s |
| 2 · Integración (Supertest + PostgreSQL real) | 41 | ✅ 41/41 (incluye reinicio de la API) | 25 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 54 | ✅ 54/54 | 7,7 min |
| 3 · Carga (RNF-008 / RNF-001) | 2 escenarios | ✅ 0 % errores · p95 187 ms (ingreso) · p95 51 ms (lectura) | 1 min |
| 3 · Peso de la web (RNF-005) | 14 rutas | ✅ 110–115 kB de JS inicial por ruta (límite 250 kB) | — |
| 4 · Aceptación (Gherkin en español) | 14 escenarios | ✅ 14/14 · informe para el Product Owner | 1,8 min |

**Defectos encontrados por las pruebas y corregidos:** 13 · **Brechas con el SRS detectadas en la auditoría y cerradas:** 6 · **Cambios de requisitos aprobados:** 1 (CR-01, detalle en [`docs/cambios/CR-01-tablet-sin-codigo-de-aula.md`](../cambios/CR-01-tablet-sin-codigo-de-aula.md)).

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
| D-13 | **Una cuenta podía quedar bloqueada para siempre sin verificar** (RF-002): si el enlace se perdía (la bandeja de desarrollo vive en memoria y se vacía al reiniciar la API) o vencía a las 24 h, no había forma de pedir otro ni de volver a registrarse con el mismo correo | 4 · prueba manual de la Product Owner | `POST /api/v1/auth/verificar-correo/reenviar` + botón "Reenviar enlace de verificación": enlace nuevo de un solo uso (24 h) que anula los anteriores; 60 s de espera y máximo 5 por hora por cuenta; límite 1/min por correo y 5/min por IP; respuesta idéntica exista o no la cuenta; mensajes claros (verificado, ya verificado, vencido, reemplazado) |

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
| ~~Un solo esquema de base de datos~~ | **Resuelto el 16/10/2026:** la base sigue el SRS §7 con 11 schemas, 52 tablas, UUID v7 y TIMESTAMPTZ (ver [`docs/datos/modelo-de-datos.md`](../datos/modelo-de-datos.md)) | — |
| Sin creación de cuentas de backoffice | RF-011 solo se prueba en Nivel 1 porque crear editores/administradores es RF-076 | Se cubrirá con el módulo de Administración |
| El registro responde 409 si el correo ya existe | Permite saber si un correo está registrado (el SRS solo exige anti-enumeración en la recuperación) | Responder 201 genérico y avisar por correo |
| `packages/contracts` no refleja los endpoints reales | La web declara sus tipos a mano (contradice DRY del SRS) | Generar `openapi.yaml` desde los DTO de NestJS |
| Sin Docker en el equipo local | Testcontainers solo corre en CI | Local usa la base efímera `lectoaventura_test` (recreada en cada ejecución) |
| En local, la API en modo `watch` puede reiniciarse a mitad de una corrida E2E/UAT si cambia algún archivo | Falsos negativos (se observó una vez: 4 escenarios fallaron con 500 durante el reinicio y pasaron 13/13 al repetir) | CI usa la compilación de producción; en local, correr las pruebas sin editar archivos |
| Las ilustraciones son versiones SVG simplificadas provisionales | Menos detalle que el diseño aprobado | Reemplazar los componentes de `Ilustraciones.tsx` por las ilustraciones finales (sin tocar las pantallas) |
| ~~Las tarjetas de acceso (RF-017) aún devuelven el código de aula~~ | **Resuelto en el Módulo 2:** PDF A4 sin código de aula; el PIN solo va en la tarjeta impresa (ver [`02-escuela-plan-de-pruebas.md`](02-escuela-plan-de-pruebas.md)) | — |

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
│   │   ├── specs/{smoke.spec.ts, diseno/responsivo.spec.ts, iam/{flujo-familia,seguridad,ingreso-tablet-aula-e-inactividad,verificacion-correo}.spec.ts}
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

```ts
import { describe, expect, it } from 'vitest';

import { Consentimiento } from '../../../../src/modules/iam/domain/entities/consentimiento';
import { Cuenta } from '../../../../src/modules/iam/domain/entities/cuenta';
import { DispositivoIngreso } from '../../../../src/modules/iam/domain/entities/dispositivo-ingreso';
import {
  DURACION_BLOQUEO_MIN,
  MAX_INTENTOS_PIN,
  PerfilEstudiante,
} from '../../../../src/modules/iam/domain/entities/perfil-estudiante';
import { Sesion } from '../../../../src/modules/iam/domain/entities/sesion';
import { VerificacionCorreo } from '../../../../src/modules/iam/domain/entities/verificacion-correo';
import { DatoInvalidoError } from '../../../../src/modules/iam/domain/errors/errores-iam';
import { PerfilBloqueadoError } from '../../../../src/modules/iam/domain/errors/perfil-bloqueado-error';
import { AnioMesNacimiento } from '../../../../src/modules/iam/domain/value-objects/anio-mes-nacimiento';
import { Contrasena } from '../../../../src/modules/iam/domain/value-objects/contrasena';
import { Email } from '../../../../src/modules/iam/domain/value-objects/email';
import { Rol } from '../../../../src/modules/iam/domain/value-objects/rol';

const T0 = new Date('2026-10-15T15:00:00Z');
const masMin = (min: number) => new Date(T0.getTime() + min * 60_000);

function perfil(alias = 'Lucía', avatar = 'zorro') {
  return PerfilEstudiante.crear({
    id: 'p1',
    cuentaResponsableId: 'c1',
    consentimientoId: 'k1',
    alias,
    anioMesNacimiento: AnioMesNacimiento.de(2018, 5, T0),
    avatar,
    hashPin: 'hash:2580',
    ahora: T0,
  });
}

describe('PerfilEstudiante — datos mínimos (RN-02)', () => {
  it('normaliza espacios del alias', () => {
    expect(perfil('  Ana   Lucía ').alias).toBe('Ana Lucía');
  });

  it.each(['A', 'un alias demasiado largo para un niño', 'ana@correo.pe', 'Ana 987654321'])(
    'rechaza el alias "%s"',
    (alias) => {
      expect(() => perfil(alias)).toThrow(DatoInvalidoError);
    },
  );

  it('solo admite avatares ilustrados de la lista', () => {
    expect(() => perfil('Lucía', 'foto-real.jpg')).toThrow(/avatares disponibles/);
  });
});

describe('PerfilEstudiante — bloqueo por PIN (RF-008, RN-03)', () => {
  it(`se bloquea ${DURACION_BLOQUEO_MIN} min al ${MAX_INTENTOS_PIN}.º PIN incorrecto`, () => {
    const p = perfil();
    for (let i = 1; i < MAX_INTENTOS_PIN; i++) p.registrarIntentoFallido(T0);
    expect(p.estaBloqueado(T0)).toBe(false);
    expect(p.intentosFallidos).toBe(MAX_INTENTOS_PIN - 1);

    p.registrarIntentoFallido(T0);
    expect(p.estaBloqueado(T0)).toBe(true);
    expect(p.estaBloqueado(masMin(DURACION_BLOQUEO_MIN - 0.01))).toBe(true);
    expect(p.estaBloqueado(masMin(DURACION_BLOQUEO_MIN))).toBe(false);
  });

  it('el sexto intento durante el bloqueo se rechaza con la hora de desbloqueo', () => {
    const p = perfil();
    for (let i = 0; i < MAX_INTENTOS_PIN; i++) p.registrarIntentoFallido(T0);
    try {
      p.asegurarNoBloqueado(masMin(1));
      expect.fail('debió lanzar PerfilBloqueadoError');
    } catch (error) {
      expect(error).toBeInstanceOf(PerfilBloqueadoError);
      expect((error as PerfilBloqueadoError).desbloqueaEn).toEqual(masMin(DURACION_BLOQUEO_MIN));
      expect((error as PerfilBloqueadoError).tipo).toBe('BLOQUEADO');
    }
  });

  it('un PIN correcto reinicia el contador de intentos', () => {
    const p = perfil();
    p.registrarIntentoFallido(T0);
    p.registrarIntentoFallido(T0);
    p.registrarIntentoCorrecto();
    expect(p.intentosFallidos).toBe(0);
  });

  it('restablecer el PIN desbloquea el perfil', () => {
    const p = perfil();
    for (let i = 0; i < MAX_INTENTOS_PIN; i++) p.registrarIntentoFallido(T0);
    p.restablecerPin('hash:3691');
    expect(p.estaBloqueado(T0)).toBe(false);
    expect(p.hashPin).toBe('hash:3691');
  });
});

describe('PerfilEstudiante — eliminación (RF-013)', () => {
  it('anonimizar borra datos personales y desactiva', () => {
    const p = perfil();
    p.anonimizar(T0);
    expect(p.alias).toBe('Perfil eliminado');
    expect(p.hashPin).toBe('');
    expect(p.activo).toBe(false);
    expect(p.propsSnapshot.eliminadoEn).toEqual(T0);
  });
});

describe('Sesion — inactividad (RF-010)', () => {
  const abrir = (rol: string) =>
    Sesion.abrir({ id: 's1', sujetoId: 'x', rol, mfa: false, hashRefreshToken: 'h', ahora: T0 });

  it('estudiante: viva a los 10 min, cerrada a los 10 min + 1 ms', () => {
    const s = abrir('ESTUDIANTE');
    expect(s.estaViva(masMin(10))).toBe(true);
    expect(s.estaViva(new Date(masMin(10).getTime() + 1))).toBe(false);
  });

  it('adulto: viva a los 30 min, cerrada después', () => {
    const s = abrir('DOCENTE');
    expect(s.estaViva(masMin(30))).toBe(true);
    expect(s.estaViva(masMin(31))).toBe(false);
  });

  it('la actividad reinicia la ventana y solo pide persistir cada minuto', () => {
    const s = abrir('ESTUDIANTE');
    expect(s.registrarActividad(masMin(0.5))).toBe(false);
    expect(s.registrarActividad(masMin(8))).toBe(true);
    expect(s.estaViva(masMin(17))).toBe(true);
  });

  it('ADR-005: la sesión del estudiante muere a las 8 h aunque tenga actividad; la del adulto no', () => {
    const estudiante = abrir('ESTUDIANTE');
    const adulto = abrir('DOCENTE');
    estudiante.registrarActividad(masMin(8 * 60 - 1));
    adulto.registrarActividad(masMin(8 * 60 - 1));
    expect(estudiante.estaViva(masMin(8 * 60))).toBe(true);
    expect(estudiante.estaViva(masMin(8 * 60 + 0.01))).toBe(false);
    expect(adulto.estaViva(masMin(8 * 60 + 0.01))).toBe(true);
  });

  it('una sesión revocada nunca está viva', () => {
    const s = abrir('FAMILIAR');
    s.revocar(T0);
    expect(s.estaViva(T0)).toBe(false);
  });

  it('rotar el refresh token cambia la huella (RF-003)', () => {
    const s = abrir('FAMILIAR');
    s.rotarRefreshToken('h2', masMin(5));
    expect(s.hashRefreshToken).toBe('h2');
  });
});

describe('Cuenta — ciclo de vida y MFA en dos pasos (RF-002, RF-011, RF-076)', () => {
  const nueva = (rol: Parameters<typeof Rol.de>[0] = 'EDITOR') =>
    Cuenta.registrar({
      id: 'c1',
      nombre: 'Rosa Demo',
      email: Email.de('rosa@lectoaventura.test'),
      contrasena: Contrasena.de('Lectura-Segura-2026'),
      rol: Rol.de(rol),
      hashContrasena: 'hash',
      ahora: T0,
    });

  it('nace pendiente y se activa al verificar', () => {
    const c = nueva();
    expect(c.estaActiva()).toBe(false);
    c.verificar();
    expect(c.estaActiva()).toBe(true);
  });

  it('suspender y reactivar', () => {
    const c = nueva();
    c.verificar();
    c.suspender();
    expect(c.estaSuspendida()).toBe(true);
    c.reactivar();
    expect(c.estaActiva()).toBe(true);
  });

  it('no permite registrar un estudiante con contraseña', () => {
    expect(() => nueva('ESTUDIANTE')).toThrow(/roles adultos/);
  });

  it('confirmar MFA sin haberlo iniciado falla; iniciado lo activa', () => {
    const c = nueva();
    expect(() => c.confirmarMfa()).toThrow(DatoInvalidoError);
    c.iniciarMfa('SECRETO');
    c.confirmarMfa();
    expect(c.mfaHabilitado).toBe(true);
    expect(c.mfaSecret).toBe('SECRETO');
    expect(c.mfaSecretPendiente).toBeNull();
  });
});

describe('VerificacionCorreo (RF-002)', () => {
  const nuevo = () => VerificacionCorreo.paraVerificacionCorreo({ id: 'v1', cuentaId: 'c1', codigo: 'huella', ahora: T0 });

  it('pasa de vigente a vencido a las 24 h y recuerda cuándo se creó', () => {
    const v = nuevo();
    expect(v.creadoEn).toEqual(T0);
    expect(v.estadoEn(masMin(24 * 60))).toBe('VIGENTE');
    expect(v.estadoEn(masMin(24 * 60 + 1))).toBe('VENCIDO');
    expect(v.canjear(masMin(24 * 60 + 1))).toBe(false);
  });

  it('se usa una sola vez', () => {
    const v = nuevo();
    expect(v.canjear(masMin(5))).toBe(true);
    expect(v.estadoEn(masMin(5))).toBe('USADO');
    expect(v.canjear(masMin(6))).toBe(false);
  });

  it('un enlace reemplazado no sirve; uno ya usado no se marca como reemplazado', () => {
    const v = nuevo();
    v.reemplazar(masMin(1));
    expect(v.estadoEn(masMin(2))).toBe('REEMPLAZADO');
    expect(v.estaVigente(masMin(2))).toBe(false);
    expect(v.canjear(masMin(2))).toBe(false);

    const usado = nuevo();
    usado.canjear(masMin(1));
    usado.reemplazar(masMin(2));
    expect(usado.reemplazadoEn).toBeNull();
    expect(usado.estadoEn(masMin(3))).toBe('USADO');
  });
});

describe('Consentimiento y DispositivoIngreso', () => {
  it('el consentimiento institucional exige aula (RN-01)', () => {
    expect(() =>
      Consentimiento.otorgar({
        id: 'k1', cuentaResponsableId: 'c1', tipo: 'INSTITUCIONAL', versionPolitica: '2026-09',
        otorganteNombre: 'Directora Ruiz', medio: 'FISICO', ahora: T0,
      }),
    ).toThrow(/indicar el aula/);
  });

  it('el dispositivo vence a los 30 días o al revocarse (RN-04)', () => {
    const d = DispositivoIngreso.activar({ id: 'd1', cuentaId: 'c1', contexto: { tipo: 'FAMILIA' }, nombre: 'Tablet', hashToken: 'h', ahora: T0 });
    expect(d.estaVigente(masMin(30 * 24 * 60 - 1))).toBe(true);
    expect(d.estaVigente(masMin(30 * 24 * 60))).toBe(false);
    d.revocar(T0);
    expect(d.estaVigente(T0)).toBe(false);
  });

  it('la tablet del aula recuerda su aula y recibe un nombre por defecto (CR-01)', () => {
    const aula = DispositivoIngreso.activar({ id: 'd2', cuentaId: 'docente', contexto: { tipo: 'AULA', aulaId: 'a1' }, nombre: '  ', hashToken: 'h', ahora: T0 });
    const casa = DispositivoIngreso.activar({ id: 'd3', cuentaId: 'familia', contexto: { tipo: 'FAMILIA' }, nombre: '', hashToken: 'h2', ahora: T0 });
    expect(aula.contexto).toEqual({ tipo: 'AULA', aulaId: 'a1' });
    expect(aula.propsSnapshot.nombre).toBe('Tablet del aula');
    expect(casa.contexto).toEqual({ tipo: 'FAMILIA' });
    expect(casa.propsSnapshot.nombre).toBe('Dispositivo familiar');
    expect(casa.propsSnapshot.aulaId).toBeNull();
  });
});
```

Prueba unitaria del guard de límite de tasa, RNF-019 (`apps/api/test/unit/iam/interface/limite-tasa.spec.ts`). Los dobles de los puertos están en `apps/api/test/unit/iam/dobles.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ErrorDeNegocio,
  LIMITE_TASA,
  LimiteTasaGuard,
  ReglaLimiteTasa,
} from '../../../../src/modules/shared-kernel/public-api';

/** Nivel 1 — RNF-019: limitación de tasa (login adulto 10/min por IP; PIN 30/min por código de aula). */
function peticion(regla: ReglaLimiteTasa | undefined, req: { ip?: string; body?: unknown }) {
  const cabeceras: Record<string, string> = {};
  const reflector = { get: (clave: string) => (clave === LIMITE_TASA && regla ? [regla] : undefined) } as unknown as Reflector;
  const ctx = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ setHeader: (k: string, v: string) => (cabeceras[k] = v) }) }),
  } as unknown as ExecutionContext;
  return { reflector, ctx, cabeceras };
}

const LOGIN: ReglaLimiteTasa = { nombre: 'ingreso-adulto', maximoPorMinuto: 10, por: 'ip' };
const TABLET: ReglaLimiteTasa = { nombre: 'ingreso-estudiante-tablet', maximoPorMinuto: 30, por: { campoCuerpo: 'tokenDispositivo' } };

describe('LimiteTasaGuard (RNF-019)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
    delete process.env['LIMITE_TASA_FACTOR'];
  });

  afterEach(() => vi.useRealTimers());

  it('sin regla declarada no limita', () => {
    const { reflector, ctx } = peticion(undefined, { ip: '1.1.1.1' });
    const guard = new LimiteTasaGuard(reflector);
    for (let i = 0; i < 100; i++) expect(guard.canActivate(ctx)).toBe(true);
  });

  it('el intento 11 del minuto desde la misma IP responde LIMITE con Retry-After', () => {
    const { reflector, ctx, cabeceras } = peticion(LOGIN, { ip: '10.0.0.1' });
    const guard = new LimiteTasaGuard(reflector);
    for (let i = 0; i < 10; i++) expect(guard.canActivate(ctx)).toBe(true);

    vi.advanceTimersByTime(20_000);
    const error = (() => {
      try {
        guard.canActivate(ctx);
      } catch (e) {
        return e as ErrorDeNegocio;
      }
    })();
    expect(error).toBeInstanceOf(ErrorDeNegocio);
    expect(error?.tipo).toBe('LIMITE');
    expect(error?.detalle).toEqual({ reintentarEnSeg: 40 });
    expect(cabeceras['Retry-After']).toBe('40');
  });

  it('cada IP tiene su propio contador y la ventana se reinicia al minuto', () => {
    const guard = new LimiteTasaGuard(peticion(LOGIN, {}).reflector);
    const a = peticion(LOGIN, { ip: '10.0.0.1' }).ctx;
    const b = peticion(LOGIN, { ip: '10.0.0.2' }).ctx;
    for (let i = 0; i < 10; i++) guard.canActivate(a);
    expect(() => guard.canActivate(a)).toThrow(ErrorDeNegocio);
    expect(guard.canActivate(b)).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(guard.canActivate(a)).toBe(true);
  });

  it('el ingreso del estudiante cuenta por tablet, no por IP, y no guarda el token en claro', () => {
    const guard = new LimiteTasaGuard(peticion(TABLET, {}).reflector);
    for (let i = 0; i < 30; i++) {
      guard.canActivate(peticion(TABLET, { ip: `10.0.0.${i}`, body: { tokenDispositivo: 'token-tablet-aula-3b' } }).ctx);
    }
    expect(() => guard.canActivate(peticion(TABLET, { ip: '10.9.9.9', body: { tokenDispositivo: 'token-tablet-aula-3b' } }).ctx)).toThrow(
      /Demasiados intentos/,
    );
    expect(guard.canActivate(peticion(TABLET, { ip: '10.9.9.9', body: { tokenDispositivo: 'otra-tablet' } }).ctx)).toBe(true);
    const claves = [...(guard as unknown as { contadores: Map<string, unknown> }).contadores.keys()].join(' ');
    expect(claves).not.toContain('token-tablet-aula-3b');
  });

  it('con dos reglas (IP y tablet), la de tablet no aplica si el cuerpo no trae token', () => {
    const IP: ReglaLimiteTasa = { nombre: 'ingreso-estudiante-ip', maximoPorMinuto: 30, por: 'ip' };
    const reflector = { get: () => [IP, TABLET] } as unknown as Reflector;
    const guard = new LimiteTasaGuard(reflector);
    const ctx = (ip: string, body: unknown) => peticion(TABLET, { ip, body }).ctx;

    // 30 intentos sin token agotan solo la cuota de esa IP.
    for (let i = 0; i < 30; i++) expect(guard.canActivate(ctx('10.1.1.1', {}))).toBe(true);
    expect(() => guard.canActivate(ctx('10.1.1.1', {}))).toThrow(ErrorDeNegocio);
    // Un intento bloqueado no consume la cuota de la tablet: desde otra IP la misma tablet sigue entrando.
    expect(() => guard.canActivate(ctx('10.1.1.1', { tokenDispositivo: 't-aula' }))).toThrow(ErrorDeNegocio);
    expect(guard.canActivate(ctx('10.2.2.2', { tokenDispositivo: 't-aula' }))).toBe(true);
  });

  it('LIMITE_TASA_FACTOR multiplica el máximo en entornos de prueba de carga', () => {
    process.env['LIMITE_TASA_FACTOR'] = '3';
    const { reflector, ctx } = peticion(LOGIN, { ip: '10.0.0.1' });
    const guard = new LimiteTasaGuard(reflector);
    for (let i = 0; i < 30; i++) expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(ErrorDeNegocio);
  });
});
```

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

```ts
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

/**
 * Nivel 2 — Base de datos real y efímera para las pruebas de integración.
 *
 * - USAR_TESTCONTAINERS=1 (CI o equipos con Docker): levanta postgres:16-alpine en un contenedor
 *   desechable con Testcontainers.
 * - Sin Docker: usa la base `lectoaventura_test` del PostgreSQL local (nunca la de desarrollo)
 *   y la recrea desde cero en cada ejecución.
 * En ambos casos aplica todas las migraciones de Prisma antes de las pruebas.
 */
let detener: (() => Promise<unknown>) | undefined;

function urlLocalDePruebas(): string {
  if (process.env['DATABASE_URL_PRUEBAS']) return process.env['DATABASE_URL_PRUEBAS'];
  const env = resolve(__dirname, '../../../.env');
  const linea = existsSync(env)
    ? readFileSync(env, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
    : undefined;
  if (!linea) throw new Error('Define DATABASE_URL_PRUEBAS o DATABASE_URL en apps/api/.env');
  const url = new URL(linea.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''));
  url.pathname = '/lectoaventura_test';
  return url.toString();
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let url: string;
  if (process.env['USAR_TESTCONTAINERS'] === '1') {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const contenedor = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('lectoaventura_test')
      .start();
    url = contenedor.getConnectionUri();
    detener = () => contenedor.stop();
  } else {
    url = urlLocalDePruebas();
    if (!new URL(url).pathname.endsWith('_test')) {
      throw new Error('Por seguridad, la base de pruebas debe terminar en "_test"');
    }
  }

  // Recrea el esquema completo aplicando las migraciones reales del proyecto.
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', url);
  return async () => {
    await detener?.();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
```

Prueba automatizada de logs sin secretos, RNF-031 (`apps/api/test/integration/iam/logs-sin-secretos.int-spec.ts`; el recorrido HTTP completo está en `iam-http.int-spec.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinesDelPdf } from '../../support/pdf-texto';
import { AppDePrueba, cookieRefresh, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — RNF-031: "0 ocurrencias de PIN, contraseña, token o texto libre de estudiantes en logs,
 * verificado por prueba automatizada". Se captura TODO lo que la API escribe en stdout/stderr
 * durante un recorrido completo de IAM y se buscan los secretos usados.
 */
const API = '/api/v1';
const CONTRASENA = 'Clave-Secreta-Unica-7319';
const PIN = '4826';

let t: AppDePrueba;
let salida = '';
const originales = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };

beforeAll(async () => {
  t = await crearApp({ conLogs: true });
  await vaciarBase(t.prisma);
  const capturar = (original: typeof process.stdout.write) =>
    ((fragmento: string | Uint8Array, ...resto: unknown[]) => {
      salida += typeof fragmento === 'string' ? fragmento : Buffer.from(fragmento).toString('utf8');
      return (original as (...a: unknown[]) => boolean)(fragmento, ...resto);
    }) as typeof process.stdout.write;
  process.stdout.write = capturar(originales.out);
  process.stderr.write = capturar(originales.err);
});

afterAll(async () => {
  process.stdout.write = originales.out;
  process.stderr.write = originales.err;
  await t?.cerrar();
});

describe('Logs sin secretos (RNF-031)', () => {
  it('un recorrido completo de IAM no deja contraseñas, PIN, tokens ni códigos en los logs', async () => {
    const secretos: string[] = [CONTRASENA, PIN];
    const email = 'secretos@lectoaventura.test';

    await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Prueba', email, contrasena: CONTRASENA, rol: 'FAMILIAR' }).expect(201);
    const [correo] = (await t.http().get(`${API}/dev/correos`)).body as { enlace: string }[];
    const codigo = new URL(correo?.enlace as string).searchParams.get('codigo') as string;
    secretos.push(codigo);
    await t.http().post(`${API}/auth/verificar-correo`).send({ codigo }).expect(200);

    // Errores a propósito: contraseña equivocada y JSON inválido.
    await t.http().post(`${API}/auth/login`).send({ email, contrasena: `${CONTRASENA}-mal` }).expect(401);
    await t.http().post(`${API}/auth/login`).set('Content-Type', 'application/json').send('{"email": roto').expect(400);

    const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
    const token = login.body.accessToken as string;
    const refresh = (cookieRefresh(login) as string).split(';')[0]?.split('=')[1] as string;
    secretos.push(token, refresh);
    const auth = { Authorization: `Bearer ${token}` };

    await t.http().post(`${API}/consentimientos`).set(auth).send({ otorganteNombre: 'Rosa Prueba', aceptaPolitica: true }).expect(201);
    const perfil = await t.http().post(`${API}/estudiantes`).set(auth).send({ alias: 'Mia', anioNacimiento: 2018, mesNacimiento: 2, avatar: 'abeja', pin: PIN }).expect(201);
    const { tokenDispositivo } = (await t.http().post(`${API}/familia/dispositivos`).set(auth).send({ nombre: 'Tablet' }).expect(201)).body;
    secretos.push(tokenDispositivo);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId: perfil.body.id, pin: '1357' }).expect(401);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId: perfil.body.id, pin: PIN }).expect(200);

    const exportacion = (await t.http().post(`${API}/estudiantes/${perfil.body.id}/exportaciones`).set(auth).expect(201)).body;
    secretos.push(new URL(exportacion.enlaces.pdf, 'http://x').searchParams.get('firma') as string);
    await t.http().get(exportacion.enlaces.json).expect(200);
    await t.http().post(`${API}/auth/recuperar`).send({ email }).expect(202);

    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfil.body.id } });
    secretos.push(cuenta.hashContrasena, fila.hashPin);

    expect(salida.length).toBeGreaterThan(0);
    for (const secreto of secretos) {
      expect(salida.includes(secreto), `Un secreto apareció en los logs: ${secreto.slice(0, 6)}…`).toBe(false);
    }
  });

  it('el modo escuela no deja en los logs los PIN de las tarjetas ni los códigos de invitación (RF-017, RF-019)', async () => {
    const registrar = async (email: string, rol: 'DOCENTE' | 'FAMILIAR') => {
      await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
      const correo = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email);
      await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(correo?.enlace as string).searchParams.get('codigo') }).expect(200);
      return { Authorization: `Bearer ${(await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken}` };
    };
    const docente = await registrar('docente.secretos@lectoaventura.test', 'DOCENTE');
    const familia = await registrar('familia.secretos@lectoaventura.test', 'FAMILIAR');

    const aula = (await t.http().post(`${API}/aulas`).set(docente).send({
      nombre: '3.° B', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body;
    const leo = (await t.http().post(`${API}/aulas/${aula.id}/matriculas`).set(docente).send({ alias: 'Leo', anioNacimiento: 2017, mesNacimiento: 2, avatar: 'koala' }).expect(201)).body;
    const pdf = await t.http().post(`${API}/aulas/${aula.id}/tarjetas-acceso.pdf`).set(docente).send({ estudianteIds: [leo.estudianteId] }).buffer(true)
      .parse((res, listo) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => listo(null, Buffer.concat(partes)));
      }).expect(200);
    const [pin] = pinesDelPdf(pdf.body as Buffer);
    const { codigo } = (await t.http().post(`${API}/estudiantes/${leo.estudianteId}/invitaciones-familiar`).set(docente).expect(201)).body;
    await t.http().post(`${API}/familia/vincular`).set(familia).send({ codigo: 'ZZZZ-ZZZZ' }).expect(400);
    await t.http().post(`${API}/familia/vincular`).set(familia).send({ codigo }).expect(201);

    // El PIN tiene 4 cifras y podría aparecer por azar dentro de un id: se busca como dato ("4826" o pin=4826).
    for (const secreto of [codigo, codigo.replace('-', ''), `"${pin}"`, `pin=${pin}`, `PIN ${pin}`]) {
      expect(salida.includes(secreto as string), `Un secreto apareció en los logs: ${secreto}`).toBe(false);
    }
  });
});
```

Prueba de integración del límite de tasa (`apps/api/test/integration/iam/limite-tasa.int-spec.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — RNF-019 integrado: guard global + proxy de confianza (X-Forwarded-For desde loopback).
 */
const API = '/api/v1';
let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
  process.env['LIMITE_TASA_FACTOR'] = '1';
});

afterAll(async () => {
  process.env['LIMITE_TASA_FACTOR'] = '100';
  await t?.cerrar();
});

const intento = (ip: string) =>
  t.http().post(`${API}/auth/login`).set('X-Forwarded-For', ip).send({ email: 'nadie@lectoaventura.test', contrasena: 'cualquier-cosa' });

describe('Límite de tasa (RNF-019)', () => {
  it('ingreso adulto: los 10 primeros intentos son 401 y el 11.º responde 429 con Retry-After', async () => {
    for (let i = 0; i < 10; i++) await intento('203.0.113.7').expect(401);
    const bloqueado = await intento('203.0.113.7').expect(429);
    expect(bloqueado.body).toMatchObject({ status: 429, type: 'https://lectoaventura.pe/problemas/limite' });
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('otra IP (otro dispositivo detrás del proxy) no queda afectada', async () => {
    await intento('198.51.100.20').expect(401);
  });

  it('ingreso del estudiante: 30 intentos por minuto por tablet, aunque cambie la IP', async () => {
    const tablet = 'token-de-una-tablet-que-no-existe-0001';
    const ingreso = (i: number, token = tablet) =>
      t.http().post(`${API}/acceso-estudiante/login`).set('X-Forwarded-For', `10.0.0.${i}`).send({ tokenDispositivo: token, perfilId: 'x', pin: '2580' });
    for (let i = 1; i <= 30; i++) await ingreso(i).expect(403);
    await ingreso(99).expect(429);
    // Otra tablet desde la misma IP sigue pudiendo intentarlo.
    await ingreso(99, 'token-de-otra-tablet-que-no-existe-0002').expect(403);
  });

  it('reenviar la verificación: 1 por minuto por correo (sin importar mayúsculas) y 5 por IP', async () => {
    const reenviar = (ip: string, email: string) =>
      t.http().post(`${API}/auth/verificar-correo/reenviar`).set('X-Forwarded-For', ip).send({ email });
    await reenviar('10.1.0.1', 'ana@lectoaventura.test').expect(202);
    const repetido = await reenviar('10.1.0.2', 'ANA@lectoaventura.test').expect(429);
    expect(repetido.body).toMatchObject({ status: 429, reintentarEnSeg: expect.any(Number) });
    expect(Number(repetido.headers['retry-after'])).toBeGreaterThan(0);

    for (let i = 1; i <= 4; i++) await reenviar('10.1.0.9', `otra${i}@lectoaventura.test`).expect(202);
    await reenviar('10.1.0.9', 'otra5@lectoaventura.test').expect(202);
    await reenviar('10.1.0.9', 'otra6@lectoaventura.test').expect(429);
  });
});
```

`apps/api/test/integration/iam/verificacion-correo.int-spec.ts` (verificación, reenvío y reinicio de la API):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Verificación de correo y reenvío del enlace (RF-002) integrados con PostgreSQL:
 * enlaces de un solo uso guardados como huella, el anterior queda reemplazado al reenviar,
 * mensajes claros por motivo y todo sigue funcionando después de reiniciar la API.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';

let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

async function registrar(app: AppDePrueba, email: string) {
  await app.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Ríos', email, contrasena: CONTRASENA, rol: 'FAMILIAR' }).expect(201);
}

/** Enlaces de la bandeja de desarrollo para ese correo, del más reciente al más antiguo. */
async function enlacesDe(app: AppDePrueba, email: string, asunto = /Confirma tu correo/): Promise<string[]> {
  const correos = (await app.http().get(`${API}/dev/correos`).expect(200)).body as { para: string; asunto: string; enlace?: string }[];
  return correos.filter((c) => c.para === email && asunto.test(c.asunto)).map((c) => new URL(c.enlace as string).searchParams.get('codigo') as string);
}

/** Simula que el último enlace se envió hace `seg` segundos (para no esperar el tiempo de espera real). */
async function retrocederUltimoEnlace(app: AppDePrueba, email: string, seg = 120) {
  const cuenta = await app.prisma.cuenta.findUniqueOrThrow({ where: { email } });
  await app.prisma.verificacion.updateMany({ where: { cuentaId: cuenta.id }, data: { creadoEn: new Date(Date.now() - seg * 1000) } });
}

describe('Reenvío del enlace de verificación (RF-002)', () => {
  it('el ingreso de una cuenta sin verificar lo dice claramente (solo con la contraseña correcta)', async () => {
    await registrar(t, 'pendiente@lectoaventura.test');
    const r = await t.http().post(`${API}/auth/login`).send({ email: 'pendiente@lectoaventura.test', contrasena: CONTRASENA }).expect(403);
    expect(r.body).toMatchObject({ detail: 'Tu cuenta aún no está verificada. Revisa tu correo.', motivo: 'CUENTA_NO_VERIFICADA' });
    const mala = await t.http().post(`${API}/auth/login`).send({ email: 'pendiente@lectoaventura.test', contrasena: 'otra-contrasena-cualquiera' });
    expect(mala.status).toBe(401);
  });

  it('responde 202 igual exista o no la cuenta; el enlace nuevo reemplaza al anterior', async () => {
    const email = 'reenvio@lectoaventura.test';
    await registrar(t, email);
    const [primero] = await enlacesDe(t, email);
    await retrocederUltimoEnlace(t, email);

    const inexistente = await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: 'nadie@lectoaventura.test' }).expect(202);
    const existente = await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: email.toUpperCase() }).expect(202);
    expect(existente.body).toEqual(inexistente.body);
    expect(existente.body).toEqual({ ok: true, reintentarEnSeg: 60 });

    const [nuevo] = await enlacesDe(t, email);
    expect(nuevo).not.toBe(primero);
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
    const filas = await t.prisma.verificacion.findMany({ where: { cuentaId: cuenta.id }, orderBy: { creadoEn: 'asc' } });
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => /^[0-9a-f]{64}$/.test(f.codigo))).toBe(true);
    expect(filas[0]?.reemplazadoEn).not.toBeNull();
    expect(filas[1]?.reemplazadoEn).toBeNull();

    const reemplazado = await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: primero }).expect(400);
    expect(reemplazado.body).toMatchObject({ motivo: 'REEMPLAZADO', detail: expect.stringMatching(/reemplazado por uno más nuevo/) });
    expect((await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200)).body).toEqual({ ok: true, estado: 'VERIFICADA' });
    expect((await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200)).body).toEqual({ ok: true, estado: 'YA_VERIFICADA' });
    await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);

    const outbox = await t.prisma.outboxEvento.findMany({ where: { agregadoId: cuenta.id } });
    expect(outbox.map((e) => e.tipo)).toEqual(expect.arrayContaining(['iam.VerificacionCorreoReenviada', 'iam.CuentaVerificada']));
  });

  it('dentro de los 60 s no se crea otro enlace aunque se pida', async () => {
    const email = 'espera@lectoaventura.test';
    await registrar(t, email);
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email }).expect(202);
    expect(await enlacesDe(t, email)).toHaveLength(1);
  });

  it('un enlace vencido lo explica y se puede pedir otro', async () => {
    const email = 'vencido@lectoaventura.test';
    await registrar(t, email);
    const [codigo] = await enlacesDe(t, email);
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
    await t.prisma.verificacion.updateMany({
      where: { cuentaId: cuenta.id },
      data: { expiraEn: new Date(Date.now() - 1000), creadoEn: new Date(Date.now() - 25 * 3_600_000) },
    });

    const r = await t.http().post(`${API}/auth/verificar-correo`).send({ codigo }).expect(400);
    expect(r.body).toMatchObject({ motivo: 'VENCIDO', detail: 'Este enlace venció. Pide uno nuevo.' });
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email }).expect(202);
    const [nuevo] = await enlacesDe(t, email);
    await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200);
  });

  it('a una cuenta ya verificada le llega un aviso sin enlace de verificación', async () => {
    const email = 'reenvio@lectoaventura.test';
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email }).expect(202);
    expect(await enlacesDe(t, email, /ya está verificado/)).toHaveLength(1);
  });

  it('un correo mal escrito se rechaza con 400 en español', async () => {
    const r = await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: 'no-es-un-correo' }).expect(400);
    expect(r.body.detail).toMatch(/correo electrónico válido/);
  });
});

describe('Verificación después de reiniciar la API', () => {
  it('el enlace sigue funcionando y, si el correo se perdió, se puede pedir otro', async () => {
    await registrar(t, 'antes@lectoaventura.test');
    await registrar(t, 'perdido@lectoaventura.test');
    const [enlaceAntes] = await enlacesDe(t, 'antes@lectoaventura.test');

    // Reinicio: la bandeja de desarrollo (en memoria) se vacía; los enlaces viven en la base.
    await t.cerrar();
    t = await crearApp();
    expect(await enlacesDe(t, 'perdido@lectoaventura.test')).toHaveLength(0);

    expect((await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: enlaceAntes }).expect(200)).body.estado).toBe('VERIFICADA');

    await retrocederUltimoEnlace(t, 'perdido@lectoaventura.test');
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: 'perdido@lectoaventura.test' }).expect(202);
    const [nuevo] = await enlacesDe(t, 'perdido@lectoaventura.test');
    await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200);
    await t.http().post(`${API}/auth/login`).send({ email: 'perdido@lectoaventura.test', contrasena: CONTRASENA }).expect(200);
  });
});
```

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

```ts
import { expect, test } from '@playwright/test';

import {
  cuentaVerificada,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  prepararFamilia,
  salirDelPanel,
  URL_AREA_ESTUDIANTE,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/** Nivel 3 — Casos negativos y de seguridad de IAM vistos desde la interfaz. */
test.describe('IAM — seguridad de acceso', () => {
  test('credenciales incorrectas muestran un error claro y no dejan entrar (RF-003)', async ({ page, request }) => {
    const { email } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, 'no-es-la-contraseña');
    await expect(page.getByRole('alert').filter({ hasText: /Correo o contraseña incorrectos/ })).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('sin sesión, las áreas protegidas llevan al ingreso correcto (RF-009)', async ({ page }) => {
    await page.goto('/familia');
    await expect(page).toHaveURL(/\/ingresar\?volver=%2Ffamilia/);
    await page.goto('/estudiante');
    await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
    await expect(page.getByRole('heading', { name: 'Esta tablet aún no está activada' })).toBeVisible();
  });

  test('sin tablet activada no se muestran avatares ni se pide ningún código (RN-04, CR-01)', async ({ page }) => {
    await page.goto('/ingresar/estudiante');
    await expect(page.getByRole('heading', { name: 'Esta tablet aún no está activada' })).toBeVisible();
    // Ni campo para códigos ni avatares: solo la explicación para los adultos.
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Soy un adulto: ingresar', exact: true })).toHaveAttribute('href', '/ingresar');
  });

  test('PIN incorrecto avisa los intentos restantes; el niño no puede abrir el panel familiar (RF-008, RF-009)', async ({ page, request }) => {
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias: 'Lucía', avatar: 'Zorro', pin: '3691' });
    await salirDelPanel(page);

    await page.goto('/ingresar/estudiante');
    await page.getByRole('button', { name: 'Lucía' }).click();
    await escribirPin(page, '9090');
    await expect(page.getByRole('alert').filter({ hasText: /Te quedan 4 intentos/ })).toBeVisible();

    await escribirPin(page, '3691');
    await esperarAreaEstudiante(page, 'Lucía');
    await page.goto('/familia');
    await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
  });

  test('la sesión sobrevive a recargar y "Salir" la cierra de verdad (RF-003, RF-010)', async ({ page, request }) => {
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await expect(page).toHaveURL(/\/familia$/);

    await page.reload();
    await expect(page.getByRole('heading', { name: /Hola, Rosa/ })).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/familia');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});
```

`tests/e2e/specs/iam/flujo-familia.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import {
  CONTRASENA_E2E,
  correoUnico,
  enlaceDelCorreo,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  prepararFamilia,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/**
 * Nivel 3 — Recorrido completo de IAM desde la interfaz, como lo haría una familia real:
 * RF-001 → RF-002 → RF-003 → RF-005 → RF-006 → RF-007 → RF-009.
 */
test('una familia se registra, crea el perfil de su hijo y el niño entra con avatar y PIN', async ({ page, request }) => {
  const email = correoUnico('familia');

  // RF-001: registro desde la web.
  await page.goto('/registro');
  await page.getByRole('button', { name: /Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill('Rosa Prueba');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_E2E);
  await page.getByLabel('Repite la contraseña').fill(CONTRASENA_E2E);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: /Revisa tu correo/ })).toBeVisible();

  // RF-002: el enlace del correo activa la cuenta.
  const enlace = await enlaceDelCorreo(request, email, /Confirma tu correo/);
  await page.goto(new URL(enlace).pathname + new URL(enlace).search);
  await expect(page.getByRole('heading', { name: /Correo verificado/ })).toBeVisible();

  // RF-003 + RF-009: ingreso y aterrizaje en el panel familiar.
  await ingresarComoAdulto(page, email, CONTRASENA_E2E);
  await expect(page.getByRole('heading', { name: /Hola, Rosa/ })).toBeVisible();

  // RF-005, RF-006 y vínculo del dispositivo (RN-04).
  await prepararFamilia(page, { alias: 'Mateo', avatar: 'León', pin: '2580' });
  await expect(page.getByText('8–9 años')).toBeVisible();

  // RF-012 (E2E Familia del SRS): exportar los datos del hijo en PDF y JSON.
  await page.getByRole('button', { name: 'Descargar datos' }).click();
  await expect(page.getByText(/Datos listos en PDF y JSON/)).toBeVisible();
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Descargar PDF' }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^lectoaventura-datos-\d{4}-\d{2}-\d{2}\.pdf$/);

  // RF-007 / CR-01: al salir, la tablet vinculada se abre directo en los avatares; el niño entra con su PIN.
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
  await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toBeVisible();
  await page.getByRole('button', { name: 'Mateo' }).click();
  await expect(page.getByRole('heading', { name: '¡Hola, Mateo!' })).toBeVisible();
  await escribirPin(page, '2580');
  await esperarAreaEstudiante(page, 'Mateo');
});
```

`tests/e2e/specs/iam/ingreso-tablet-aula-e-inactividad.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import {
  activarTabletDelAula,
  aulaConEstudiante,
  cuentaVerificada,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  prepararFamilia,
  salirDelPanel,
  URL_AREA_ESTUDIANTE,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/** Nivel 3 — Tablet del aula sin código (RF-007, RN-04, CR-01) y cierre por inactividad (RF-010, R-02). */
test.describe('IAM — tablet del aula e inactividad', () => {
  test('la docente activa la tablet y el niño entra con su avatar y el PIN de su tarjeta, sin escribir códigos', async ({ page, request }) => {
    const tarjeta = await aulaConEstudiante(request, { alias: 'Sofía', avatar: 'buho' });

    await activarTabletDelAula(page, tarjeta.docente, tarjeta.aula);
    await expect(page.getByText('Aula 3.° B')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Sofía' }).click();
    await expect(page.getByRole('heading', { name: '¡Hola, Sofía!' })).toBeVisible();
    await escribirPin(page, tarjeta.pin);
    await esperarAreaEstudiante(page, 'Sofía');

    // Al salir, la tablet vuelve sola a los avatares del aula para el siguiente niño.
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
    await expect(page.getByRole('button', { name: 'Sofía' })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
  });

  test('si nadie toca la tablet por 10 minutos, la sesión del niño se cierra sola', async ({ page, request }) => {
    await page.clock.install();
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias: 'Nico', avatar: 'Koala', pin: '3691' });
    await salirDelPanel(page);

    await page.goto('/ingresar/estudiante');
    await page.getByRole('button', { name: 'Nico' }).click();
    await escribirPin(page, '3691');
    await esperarAreaEstudiante(page, 'Nico');

    // 9 minutos sin actividad: sigue dentro.
    await page.clock.fastForward('09:00');
    await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
    // Al pasar los 10 minutos vuelve al ingreso y se le explica por qué.
    await page.clock.fastForward('01:10');
    await expect(page).toHaveURL(/\/ingresar\/estudiante\?motivo=inactividad$/);
    await expect(page.getByText(/no hubo actividad por un rato/)).toBeVisible();
  });
});
```

`tests/e2e/specs/iam/verificacion-correo.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import {
  correoUnico,
  cuentaSinVerificar,
  enlaceDelCorreo,
  ingresarComoAdulto,
  ipSimulada,
  retrocederEnlacesDeVerificacion,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

const CONFIRMA = /Confirma tu correo/;
const rutaDe = (enlace: string) => new URL(enlace).pathname + new URL(enlace).search;

/** Nivel 3 — Verificación de correo y reenvío del enlace desde la interfaz (RF-002). */
test.describe('IAM — verificación de correo', () => {
  test('si el enlace se perdió, se pide otro desde el ingreso; el anterior deja de servir', async ({ page, request }) => {
    const { email, contrasena } = await cuentaSinVerificar(request);
    const primero = await enlaceDelCorreo(request, email, CONFIRMA);
    await retrocederEnlacesDeVerificacion(email);

    // Con la contraseña correcta, el ingreso explica qué falta y ofrece un enlace nuevo.
    await ingresarComoAdulto(page, email, contrasena);
    await expect(page.getByText('Tu cuenta aún no está verificada.')).toBeVisible();
    await page.getByRole('button', { name: 'Reenviar enlace de verificación' }).click();
    await expect(page.getByText(/te enviamos un enlace nuevo/)).toBeVisible();
    // Tiempo de espera visible antes de poder pedir otro.
    await expect(page.getByRole('button', { name: /Podrás pedir otro enlace en \d+ s/ })).toBeDisabled();

    const nuevo = await enlaceDelCorreo(request, email, CONFIRMA);
    expect(nuevo).not.toBe(primero);

    await page.goto(rutaDe(primero));
    await expect(page.getByRole('heading', { name: 'Este enlace ya no sirve', level: 1 })).toBeVisible();
    await expect(page.getByText(/reemplazado por uno más nuevo/)).toBeVisible();

    await page.goto(rutaDe(nuevo));
    await expect(page.getByRole('heading', { name: /Correo verificado/, level: 1 })).toBeVisible();
    await page.goto(rutaDe(nuevo));
    await expect(page.getByRole('heading', { name: 'Tu correo ya estaba verificado', level: 1 })).toBeVisible();

    await ingresarComoAdulto(page, email, contrasena);
    await expect(page).toHaveURL(/\/familia$/);
  });

  test('un enlace incompleto lo explica y permite pedir otro escribiendo el correo', async ({ page }) => {
    await page.goto('/verificar');
    await expect(page.getByRole('heading', { name: 'No pudimos verificar', level: 1 })).toBeVisible();
    await expect(page.getByText(/El enlace está incompleto/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviar enlace de verificación' })).toBeDisabled();
    await page.getByLabel('Tu correo electrónico').fill(correoUnico('nadie'));
    await page.getByRole('button', { name: 'Reenviar enlace de verificación' }).click();
    // Misma respuesta exista o no la cuenta (no revela qué correos están registrados).
    await expect(page.getByText(/Si tu cuenta está pendiente de verificación, te enviamos un enlace nuevo/)).toBeVisible();
  });
});
```

`tests/e2e/specs/diseno/responsivo.spec.ts`:

```ts
import { expect, Page, test as base } from '@playwright/test';

import { cuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada, sesionBackoffice, TEXTO_E2E } from '../../support/contenido';
import { abrirAula, docenteConAula, sembrarCatalogoE2E, sesionApi } from '../../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada) para que el límite por IP (RNF-019) no las mezcle. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Diseño responsivo (RNF-022, RNF-023). Se ejecuta en los tres proyectos
 * (escritorio 1280 px, tablet 820 px y celular 390 px): sin desplazamiento lateral y con
 * todo lo que se toca de al menos 48 × 48 px.
 */
async function revisarPantalla(page: Page): Promise<void> {
  const resultado = await page.evaluate(() => {
    // Casillas, opciones y "elegir archivo" se tocan por su etiqueta, que es la que mide 48 px.
    const tocables = 'button, a, select, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), label.casilla, label.subir-archivo';
    const visibles = [...document.querySelectorAll<HTMLElement>(tocables)].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
    return {
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      pequenos: visibles
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return Math.round(r.height) < 48 || Math.round(r.width) < 48;
        })
        .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30)} (${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)})`),
    };
  });
  expect(resultado.desborde, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(0);
  expect(resultado.pequenos, 'objetivos táctiles menores de 48 px').toEqual([]);
}

test.describe('Diseño responsivo (RNF-022, RNF-023)', () => {
  for (const ruta of ['/', '/ingresar', '/registro', '/recuperar', '/ingresar/estudiante']) {
    test(`${ruta} se adapta sin desbordes y con objetivos táctiles grandes`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await revisarPantalla(page);
    });
  }

  test('el área del estudiante usa la navegación de cada dispositivo', async ({ page, request }, info) => {
    // Familia con un perfil y la tablet vinculada, preparada por la API (RF-005, RF-006, RN-04).
    const { email, contrasena } = await cuentaVerificada(request, { prefijo: 'diseno' });
    const login = await request.post('/api/v1/auth/login', { data: { email, contrasena } });
    const auth = { Authorization: `Bearer ${(await login.json()).accessToken}` };
    await request.post('/api/v1/consentimientos', { headers: auth, data: { otorganteNombre: 'Rosa Prueba', aceptaPolitica: true } });
    const perfil = await request.post('/api/v1/estudiantes', {
      headers: auth,
      data: { alias: 'Mateo', anioNacimiento: 2018, mesNacimiento: 5, avatar: 'zorro', pin: '2580' },
    });
    expect(perfil.status(), await perfil.text()).toBe(201);
    const { tokenDispositivo } = await (await request.post('/api/v1/familia/dispositivos', { headers: auth, data: { nombre: 'Tablet' } })).json();
    await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);

    // Con la tablet vinculada, la app se abre directo en los avatares (CR-01).
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: 'Mateo' }).click();
    await revisarPantalla(page);
    await escribirPin(page, '2580');
    await esperarAreaEstudiante(page, 'Mateo');
    await revisarPantalla(page);

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const caja = (await nav.boundingBox())!;
    const ventana = page.viewportSize()!;
    if (info.project.name === 'escritorio') {
      // Computadora: barra lateral a la izquierda, de alto completo, con el letrero.
      expect(caja.x).toBe(0);
      expect(caja.height).toBeGreaterThanOrEqual(ventana.height - 1);
    } else {
      // Tablet vertical y celular: barra inferior al alcance del pulgar.
      expect(Math.round(caja.y + caja.height)).toBeGreaterThanOrEqual(ventana.height - 1);
      expect(caja.width).toBeGreaterThanOrEqual(ventana.width - 1);
    }
    // Las secciones futuras se muestran con candado y avisan "muy pronto".
    await nav.getByRole('button', { name: /Mundos/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Mundos llegará muy pronto' })).toBeVisible();
    // Un solo botón "Salir" visible en cada diseño.
    await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(1);
  });
  test('los paneles del modo escuela se adaptan: docente y familia vinculada (RF-014 a RF-019)', async ({ page, request }) => {
    await sembrarCatalogoE2E();
    const aula = await docenteConAula(request, [
      { alias: 'Mateo', avatar: 'leon' },
      { alias: 'Ana', avatar: 'buho' },
    ]);
    await abrirAula(page, aula);
    await revisarPantalla(page);

    await page.getByRole('button', { name: 'Invitar a la familia de Mateo' }).click();
    const caja = page.getByRole('region', { name: 'Código de invitación para la familia de Mateo' });
    const codigo = (await caja.locator('.invitacion__codigo').innerText()).trim();
    await revisarPantalla(page);

    await page.getByRole('button', { name: '+ Nueva asignación' }).click();
    await page.getByRole('radio', { name: 'Solo algunos estudiantes' }).check();
    await expect(page.getByRole('checkbox', { name: 'Ana', exact: true })).toBeVisible();
    await revisarPantalla(page);

    await page.getByRole('button', { name: 'Varios con CSV' }).click();
    await revisarPantalla(page);

    await page.getByRole('link', { name: 'Mis aulas' }).first().click();
    await expect(page.getByRole('link', { name: 'Abrir 3.° B' })).toBeVisible();
    await revisarPantalla(page);
    await salirDelPanel(page);

    // La familia que canjeó el código ve al niño "Desde su aula".
    const familia = await cuentaVerificada(request, { prefijo: 'diseno-familia' });
    const vinculo = await request.post('/api/v1/familia/vincular', { headers: await sesionApi(request, familia), data: { codigo } });
    expect(vinculo.status(), await vinculo.text()).toBe(201);
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page.getByRole('heading', { name: 'Desde su aula (1)' })).toBeVisible();
    await revisarPantalla(page);
  });
  test('el backoffice de contenido y la biblioteca se adaptan (RF-021 a RF-028)', async ({ page, request }) => {
    test.setTimeout(150_000); // dos cuentas con MFA, una lectura publicada, un aula y siete pantallas
    const sufijo = Date.now().toString(36);
    const { lecturaId, titulo } = await lecturaPublicada(request, { titulo: `Responsiva ${sufijo}`, tematica: `Responsiva ${sufijo}` });
    const tituloBorrador = `Borrador responsivo ${sufijo}`;
    const editora = await cuentaBackoffice('EDITOR');
    const borrador = await request.post('/api/v1/backoffice/lecturas', {
      headers: await sesionBackoffice(request, editora),
      data: { metadatos: { titulo: tituloBorrador, rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: 'CC BY 4.0' }, texto: TEXTO_E2E },
    });
    const { lecturaId: idBorrador } = await borrador.json();

    await ingresarBackoffice(page, editora);
    await page.goto('/backoffice/lecturas');
    await expect(page.getByRole('link', { name: `Abrir ${tituloBorrador}` })).toBeVisible();
    await revisarPantalla(page);
    await page.goto(`/backoffice/lecturas/${idBorrador}`);
    await page.getByRole('button', { name: '+ Actividad durante la lectura' }).click();
    await page.getByRole('button', { name: 'Cortar la oración 1' }).click();
    await revisarPantalla(page);
    await page.goto('/backoffice/lecturas/nueva');
    await revisarPantalla(page);
    await salirDelPanel(page);

    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/); // ingresarComoAdulto no espera: sin esto, el goto cortaría el ingreso
    await page.goto('/docente/biblioteca');
    await filtrarPorTema(page, sufijo);
    await expect(page.getByRole('link', { name: `Abrir ${titulo}` })).toBeVisible();
    await revisarPantalla(page);
    await page.goto(`/docente/biblioteca/${lecturaId}`);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await revisarPantalla(page);
  });
});
```

`tests/load/scenarios/iam-sesiones.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de IAM (k6).
 *   RNF-008: pico de ingreso al inicio de la jornada escolar → 300 inicios de sesión/min con error < 0,5 %.
 *   RNF-001: endpoints de lectura (GET /auth/yo) con p95 < 300 ms y p99 < 800 ms.
 * Cada iteración simula un dispositivo distinto (X-Forwarded-For) para no mezclarse con el
 * límite de 10 ingresos/min por IP (RNF-019), como ocurriría con las tablets de un colegio.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa, sin SMTP).
 * Ejecutar:   k6 run tests/load/scenarios/iam-sesiones.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 tests/load/scenarios/iam-sesiones.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    pico_ingreso: {
      executor: 'constant-arrival-rate',
      rate: 300,
      timeUnit: '1m',
      duration: __ENV.DURACION || '2m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: 'ingresar',
      tags: { escenario: 'pico_ingreso' },
    },
    lectura_perfil: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '2m',
      exec: 'consultarPerfil',
      tags: { escenario: 'lectura_perfil' },
    },
  },
  thresholds: {
    'http_req_failed{escenario:pico_ingreso}': ['rate<0.005'],
    'http_req_duration{escenario:pico_ingreso}': ['p(95)<1000'],
    'http_req_duration{escenario:lectura_perfil}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Crea y verifica la cuenta de carga usando la bandeja de correos de desarrollo. */
export function setup() {
  const email = `carga.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);

  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  const codigo = correo.enlace.split('codigo=')[1];
  const verificacion = http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo }), cabeceras);
  if (verificacion.status !== 200) fail('No se pudo verificar la cuenta de carga');

  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  return { email, accessToken: sesion.accessToken };
}

export function ingresar(datos) {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email: datos.email, contrasena: CONTRASENA }), {
    headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() },
    tags: { nombre: 'POST /auth/login' },
  });
  check(res, {
    'ingreso 200': (r) => r.status === 200,
    'entrega access token': (r) => !!r.json('accessToken'),
    'refresh en cookie httpOnly': (r) => /HttpOnly/i.test(r.headers['Set-Cookie'] || ''),
  });
}

export function consultarPerfil(datos) {
  const res = http.get(`${BASE}/auth/yo`, {
    headers: { Authorization: `Bearer ${datos.accessToken}` },
    tags: { nombre: 'GET /auth/yo' },
  });
  check(res, { 'perfil 200': (r) => r.status === 200 });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin
14 escenarios en 4 características (`tests/e2e/features/iam/`). Los etiquetados `@UAT-05` corresponden al caso de aceptación UAT-05 del propio SRS (consentimiento parental obligatorio) y los `@CR-01`, al cambio aprobado "tablet del aula sin códigos".

```gherkin
# language: es
@iam @estudiante @CR-01
Característica: Tablet del aula sin códigos
  Como docente de primaria
  Quiero activar una sola vez la tablet de mi aula
  Para que mis estudiantes entren solo con su avatar y su PIN, sin escribir códigos

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-007 @RN-04 @camino-feliz @smoke
  Escenario: La docente activa la tablet y una estudiante entra sin escribir códigos
    Dado que soy docente del aula "3.° B" con la estudiante "Sofía"
    Cuando activo esta tablet para el aula "3.° B" y la dejo lista para los niños
    Entonces la tablet muestra los avatares del "Aula 3.° B" sin pedir ningún código
    Cuando toco mi avatar "Sofía"
    Y escribo el PIN de su tarjeta
    Entonces llego a mi área de lectura con el saludo "Hola, Sofía"

  @RN-04 @seguridad
  Escenario: Una tablet que nadie activó no muestra avatares ni pide códigos
    Dado que abro la app en una tablet que nadie activó
    Entonces veo el título "Esta tablet aún no está activada"
    Y no aparece ningún avatar ni campo para escribir códigos
```

```gherkin
# language: es
@iam @estudiante
Característica: Ingreso del estudiante con avatar y PIN
  Como niña o niño de 6 a 12 años
  Quiero entrar tocando mi avatar y escribiendo mi PIN
  Para empezar a leer sin depender de una contraseña

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  Antecedentes:
    Dado que mi familia vinculó esta tablet y creó mi perfil "Lucía" con el avatar "Zorro" y el PIN "3691"

  @RF-007 @camino-feliz @smoke
  Escenario: Entro con mi avatar y mi PIN
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "3691"
    Entonces llego a mi área de lectura con el saludo "Hola, Lucía"

  @RF-008 @negativo
  Escenario: Un PIN equivocado me avisa cuántos intentos me quedan
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "9090"
    Entonces veo el mensaje "Te quedan 4 intentos"

  @RF-008 @RN-03 @borde
  Escenario: Cinco PIN equivocados seguidos bloquean mi perfil
    Cuando toco mi avatar "Lucía"
    Y escribo 5 veces el PIN equivocado "9090"
    Entonces veo el mensaje "Espera 15 minutos o pide ayuda a un adulto"

  @RF-009 @seguridad
  Escenario: Desde mi sesión no puedo abrir el panel de mi familia
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "3691"
    Y intento abrir el panel familiar
    Entonces vuelvo a mi área de lectura con el saludo "Hola, Lucía"

  @RF-010 @R-02 @reloj
  Escenario: Si dejo la tablet sin usar 10 minutos, se cierra mi sesión
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "3691"
    Y llego a mi área de lectura con el saludo "Hola, Lucía"
    Y nadie toca la tablet durante 10 minutos
    Entonces vuelvo a la pantalla de ingreso con el aviso "no hubo actividad por un rato"
```

```gherkin
# language: es
@iam @familia
Característica: Perfil del niño protegido por el consentimiento del adulto
  Como adulto responsable
  Quiero autorizar y crear el perfil de mi hijo con los datos mínimos
  Para que use la plataforma sin exponer su identidad

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  Antecedentes:
    Dado que ingresé con mi cuenta familiar verificada

  @RF-005 @RN-01 @UAT-05
  Escenario: Sin consentimiento no se puede crear ningún perfil
    Entonces se me pide dar mi consentimiento antes de agregar perfiles
    Y no puedo agregar perfiles todavía

  @RF-006 @RN-02 @UAT-05 @camino-feliz
  Escenario: Con consentimiento creo el perfil pidiendo solo datos mínimos
    Cuando doy mi consentimiento como adulto responsable
    Y abro el formulario para agregar un perfil
    Entonces el formulario solo pide alias, mes y año de nacimiento, avatar y PIN
    Cuando creo el perfil de "Mateo" con el avatar "León" y el PIN "2580"
    Entonces veo la tarjeta de "Mateo" con la edad "8–9 años"

  @RF-006 @negativo
  Escenario: Un PIN fácil de adivinar no se acepta
    Cuando doy mi consentimiento como adulto responsable
    Y abro el formulario para agregar un perfil
    Y creo el perfil de "Mateo" con el avatar "León" y el PIN "1234"
    Entonces veo el mensaje "muy fácil de adivinar"
```

```gherkin
# language: es
@iam @familia
Característica: Registro y acceso seguro de una familia
  Como madre, padre o apoderado
  Quiero crear mi cuenta y entrar de forma segura
  Para acompañar la lectura de mis hijos desde casa

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-001 @RF-002 @RF-003 @RF-009 @camino-feliz
  Escenario: La familia crea su cuenta, verifica el correo y llega a su panel
    Dado que estoy en la página de registro
    Cuando me registro como familiar con el nombre "Rosa Prueba", un correo nuevo y una contraseña segura
    Y abro el enlace de verificación que me llegó por correo
    Y ingreso con mi correo y mi contraseña
    Entonces veo mi panel familiar con el saludo "Hola, Rosa"

  @RF-002 @borde
  Escenario: Si pierdo el correo de confirmación, pido un enlace nuevo y activo mi cuenta
    Dado que me registré pero perdí el correo de confirmación
    Cuando ingreso con mi correo y mi contraseña
    Entonces veo el aviso "Tu cuenta aún no está verificada"
    Cuando pido un nuevo enlace de verificación
    Y abro el enlace más reciente
    Entonces veo el título "¡Correo verificado! 🎉"
    Cuando ingreso con mi correo y mi contraseña
    Entonces veo mi panel familiar con el saludo "Hola, Rosa"

  @RF-001 @negativo
  Escenario: Una contraseña muy común no se acepta al registrarse
    Dado que estoy en la página de registro
    Cuando me registro como familiar con el nombre "Rosa Prueba", un correo nuevo y la contraseña "1234567890"
    Entonces veo el mensaje "aparece en filtraciones conocidas o es muy común"

  @RF-003 @negativo
  Escenario: Con una contraseña equivocada no se puede entrar
    Dado que tengo una cuenta familiar verificada
    Cuando intento ingresar con una contraseña equivocada
    Entonces veo el mensaje "Correo o contraseña incorrectos"
    Y sigo en la pantalla de ingreso
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect } from '@playwright/test';

import {
  activarTabletDelAula,
  aulaConEstudiante,
  CONTRASENA_E2E,
  correoUnico,
  cuentaSinVerificar,
  cuentaVerificada,
  enlaceDelCorreo,
  escribirPin,
  ingresarComoAdulto,
  prepararFamilia,
  retrocederEnlacesDeVerificacion,
  salirDelPanel,
  URL_AREA_ESTUDIANTE,
} from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Definición de pasos (Step Definitions) de los escenarios de IAM en español. */

// ── Registro y acceso ─────────────────────────────────────────────────────

Dado('que estoy en la página de registro', async ({ page }) => {
  await page.goto('/registro');
});

async function registrarme(page: import('@playwright/test').Page, mundo: { email?: string; contrasena?: string }, nombre: string, contrasena: string) {
  mundo.email = correoUnico('uat');
  mundo.contrasena = contrasena;
  await page.getByRole('button', { name: /Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill(nombre);
  await page.getByLabel('Correo electrónico').fill(mundo.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByLabel('Repite la contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
}

Cuando(
  'me registro como familiar con el nombre {string}, un correo nuevo y una contraseña segura',
  async ({ page, mundo }, nombre: string) => {
    await registrarme(page, mundo, nombre, CONTRASENA_E2E);
    await expect(page.getByRole('heading', { name: /Revisa tu correo/ })).toBeVisible();
  },
);

Cuando(
  'me registro como familiar con el nombre {string}, un correo nuevo y la contraseña {string}',
  async ({ page, mundo }, nombre: string, contrasena: string) => {
    await registrarme(page, mundo, nombre, contrasena);
  },
);

Cuando('abro el enlace de verificación que me llegó por correo', async ({ page, request, mundo }) => {
  const enlace = new URL(await enlaceDelCorreo(request, mundo.email as string, /Confirma tu correo/));
  await page.goto(enlace.pathname + enlace.search);
  await expect(page.getByRole('heading', { name: /Correo verificado/ })).toBeVisible();
});

Cuando('ingreso con mi correo y mi contraseña', async ({ page, mundo }) => {
  await ingresarComoAdulto(page, mundo.email as string, mundo.contrasena as string);
});

// ── Reenvío del enlace de verificación (RF-002) ───────────────────────────

Dado('que me registré pero perdí el correo de confirmación', async ({ request, mundo }) => {
  Object.assign(mundo, await cuentaSinVerificar(request, 'uat'));
  await retrocederEnlacesDeVerificacion(mundo.email as string);
});

Entonces('veo el aviso {string}', async ({ page }, aviso: string) => {
  await expect(page.getByText(aviso)).toBeVisible();
});

Cuando('pido un nuevo enlace de verificación', async ({ page }) => {
  await page.getByRole('button', { name: 'Reenviar enlace de verificación' }).click();
  await expect(page.getByText(/te enviamos un enlace nuevo/)).toBeVisible();
});

Cuando('abro el enlace más reciente', async ({ page, request, mundo }) => {
  const enlace = new URL(await enlaceDelCorreo(request, mundo.email as string, /Confirma tu correo/));
  await page.goto(enlace.pathname + enlace.search);
});

Entonces('veo mi panel familiar con el saludo {string}', async ({ page }, saludo: string) => {
  await expect(page).toHaveURL(/\/familia$/);
  await expect(page.getByRole('heading', { name: new RegExp(saludo) })).toBeVisible();
});

Dado('que tengo una cuenta familiar verificada', async ({ request, mundo }) => {
  Object.assign(mundo, await cuentaVerificada(request, { prefijo: 'uat' }));
});

Cuando('intento ingresar con una contraseña equivocada', async ({ page, mundo }) => {
  await ingresarComoAdulto(page, mundo.email as string, 'no-es-mi-contraseña');
});

Entonces('veo el mensaje {string}', async ({ page }, mensaje: string) => {
  await expect(page.getByRole('alert').filter({ hasText: mensaje })).toBeVisible();
});

Entonces('sigo en la pantalla de ingreso', async ({ page }) => {
  await expect(page).toHaveURL(/\/ingresar/);
});

// ── Consentimiento y perfil ───────────────────────────────────────────────

Dado('que ingresé con mi cuenta familiar verificada', async ({ page, request, mundo }) => {
  Object.assign(mundo, await cuentaVerificada(request, { prefijo: 'uat' }));
  await ingresarComoAdulto(page, mundo.email as string, mundo.contrasena as string);
  await expect(page).toHaveURL(/\/familia$/);
});

Entonces('se me pide dar mi consentimiento antes de agregar perfiles', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /tu consentimiento/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dar consentimiento' })).toBeDisabled();
});

Entonces('no puedo agregar perfiles todavía', async ({ page }) => {
  await expect(page.getByRole('button', { name: '+ Agregar perfil' })).toHaveCount(0);
});

Cuando('doy mi consentimiento como adulto responsable', async ({ page }) => {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Dar consentimiento' }).click();
  await expect(page.getByRole('heading', { name: /Mis hijos/ })).toBeVisible();
});

Cuando('abro el formulario para agregar un perfil', async ({ page }) => {
  await page.getByRole('button', { name: '+ Agregar perfil' }).click();
});

Entonces('el formulario solo pide alias, mes y año de nacimiento, avatar y PIN', async ({ page }) => {
  const formulario = page.locator('form').filter({ has: page.getByLabel('Alias o apodo') });
  const etiquetas = (await formulario.locator('label.la-campo__etiqueta, legend').allInnerTexts()).map((t) => t.trim());
  expect(etiquetas).toEqual(['Alias o apodo', 'Mes de nacimiento', 'Año de nacimiento', 'Avatar', 'PIN de 4 números', 'Repite el PIN']);
  // RN-02: nada de apellidos, documento, foto, correo ni teléfono del menor.
  await expect(formulario.locator('input[type="email"], input[type="file"], input[type="tel"]')).toHaveCount(0);
});

Cuando(
  'creo el perfil de {string} con el avatar {string} y el PIN {string}',
  async ({ page }, alias: string, avatar: string, pin: string) => {
    await page.getByLabel('Alias o apodo').fill(alias);
    await page.getByRole('button', { name: avatar, exact: true }).click();
    await page.getByLabel('PIN de 4 números').fill(pin);
    await page.getByLabel('Repite el PIN').fill(pin);
    await page.getByRole('button', { name: 'Crear perfil' }).click();
  },
);

Entonces('veo la tarjeta de {string} con la edad {string}', async ({ page }, alias: string, edad: string) => {
  const tarjeta = page.locator('article').filter({ has: page.getByRole('heading', { name: alias }) });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.getByText(edad)).toBeVisible();
});

// ── Ingreso del estudiante ────────────────────────────────────────────────

Dado(
  'que mi familia vinculó esta tablet y creó mi perfil {string} con el avatar {string} y el PIN {string}',
  async ({ page, request }, alias: string, avatar: string, pin: string) => {
    const { email, contrasena } = await cuentaVerificada(request, { prefijo: 'uat' });
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias, avatar, pin });
    await salirDelPanel(page);
    await page.goto('/ingresar/estudiante');
  },
);

// ── Tablet del aula sin códigos (CR-01) ───────────────────────────────────

Dado('que soy docente del aula {string} con la estudiante {string}', async ({ request, mundo }, aula: string, alias: string) => {
  mundo.tarjeta = await aulaConEstudiante(request, { alias, avatar: 'buho' });
  expect(mundo.tarjeta.aula).toBe(aula);
});

Cuando('activo esta tablet para el aula {string} y la dejo lista para los niños', async ({ page, mundo }, aula: string) => {
  await activarTabletDelAula(page, mundo.tarjeta!.docente, aula);
});

Entonces('la tablet muestra los avatares del {string} sin pedir ningún código', async ({ page, mundo }, contexto: string) => {
  await expect(page.getByText(contexto)).toBeVisible();
  await expect(page.getByRole('button', { name: mundo.tarjeta!.alias })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

Cuando('escribo el PIN de su tarjeta', async ({ page, mundo }) => {
  await escribirPin(page, mundo.tarjeta!.pin);
});

Dado('que abro la app en una tablet que nadie activó', async ({ page }) => {
  await page.goto('/ingresar/estudiante');
});

Entonces('veo el título {string}', async ({ page }, titulo: string) => {
  await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible();
});

Entonces('no aparece ningún avatar ni campo para escribir códigos', async ({ page }) => {
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toHaveCount(0);
});

Cuando('toco mi avatar {string}', async ({ page }, alias: string) => {
  await page.getByRole('button', { name: alias }).click();
  await expect(page.getByRole('heading', { name: `¡Hola, ${alias}!` })).toBeVisible();
});

Cuando('escribo el PIN {string}', async ({ page }, pin: string) => {
  await escribirPin(page, pin);
});

Cuando('escribo {int} veces el PIN equivocado {string}', async ({ page }, veces: number, pin: string) => {
  for (let i = 1; i <= veces; i++) {
    await escribirPin(page, pin);
    if (i < veces) await expect(page.getByRole('alert').filter({ hasText: `Te quedan ${5 - i} intentos` })).toBeVisible();
  }
});

Cuando('intento abrir el panel familiar', async ({ page }) => {
  await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
  await page.goto('/familia');
});

Entonces(
  /^(?:llego a|vuelvo a) mi área de lectura con el saludo "(.+)"$/,
  async ({ page }, saludo: string) => {
    await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
    await expect(page.getByText(/Tu mapa de aventuras/)).toBeVisible();
    await expect(page.getByRole('heading', { name: saludo })).toBeVisible();
  },
);

Cuando('nadie toca la tablet durante {int} minutos', async ({ page }, minutos: number) => {
  await page.clock.fastForward(`${String(minutos).padStart(2, '0')}:10`);
});

Entonces('vuelvo a la pantalla de ingreso con el aviso {string}', async ({ page }, aviso: string) => {
  await expect(page).toHaveURL(/\/ingresar\/estudiante\?motivo=inactividad$/);
  await expect(page.getByText(aviso)).toBeVisible();
});
```

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

```markdown
---
name: pruebas-modulo
description: Genera, ejecuta y repara la suite de pruebas de 4 niveles (Modelo V) de un módulo de LectoAventura — unitarias (Vitest), integración (Supertest + PostgreSQL efímero/Testcontainers), sistema (Playwright + k6) y aceptación (Gherkin en español con playwright-bdd). Úsala al terminar o modificar un módulo de apps/api/src/modules, o cuando una prueba falle tras un cambio de negocio.
---

# Pruebas de 4 niveles por módulo (LectoAventura)

Sigue el plan de referencia `docs/pruebas/01-iam-plan-de-pruebas.md`. Para un módulo `<modulo>`:

## 1. Antes de escribir pruebas
- Lee los RF/RN del módulo en el SRS y su código en `apps/api/src/modules/<modulo>` (domain → application → infrastructure → interface).
- Anota casos borde por cada RF/RN (límites numéricos, estados, permisos RN-17, datos del menor RN-02).

## 2. Dónde va cada prueba
| Nivel | Carpeta | Comando |
|---|---|---|
| 1 Unitarias | `apps/api/test/unit/<modulo>/{dominio,aplicacion,infraestructura,interface}/*.spec.ts` | `npm run test:unit` |
| 2 Integración | `apps/api/test/integration/<modulo>/*.int-spec.ts` | `npm run test:int` |
| 3 Sistema E2E | `tests/e2e/specs/<modulo>/*.spec.ts` · carga: `tests/load/scenarios/<modulo>-*.js` | `npm run test:e2e` · `npm run test:load` |
| 4 Aceptación | `tests/e2e/features/<modulo>/*.feature` + `tests/e2e/steps/<modulo>.steps.ts` | `npm run test:uat` |

## 3. Reglas
- Usa las entidades, casos de uso, endpoints y mensajes reales; nunca ejemplos genéricos.
- Nivel 1: casos de uso con dobles en memoria de los puertos (ver `apps/api/test/unit/iam/dobles.ts`); reloj controlado para vencimientos; nada de red ni base de datos. Cobertura ≥ 80 % líneas del módulo (añade la carpeta del módulo a `coverage.include` en `apps/api/vitest.config.ts`).
- Nivel 2: arranca la app con `crearApp()` de `test/integration/setup/app.ts`; verifica también lo guardado en PostgreSQL (hashes, outbox, estados). Nunca uses la base de desarrollo: el setup exige un nombre terminado en `_test`.
- Nivel 3: selectores accesibles (`getByRole`, `getByLabel`); filtra `getByRole('alert')` por texto (Next.js añade su propio `role="alert"`); correos con `correoUnico()` del dominio `e2e.lectoaventura.test` (la limpieza global los borra); `X-Forwarded-For` simulado por prueba por el límite de tasa (RNF-019).
- Nivel 4: Gherkin en español (`# language: es`), lenguaje de negocio, etiquetas `@RF-xxx`/`@RN-xx`, al menos un escenario feliz, uno negativo y uno de borde.
- Si una prueba encuentra un defecto real, corrige el código (no la prueba) y regístralo en el informe.
- Al eliminar la plantilla de un módulo pendiente, quítalo de la lista de `ignores` de `eslint.config.mjs`.

## 4. Al terminar
1. Ejecuta, en este orden: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e`, `npm run test:uat` (y `npm run test:load` si k6 está instalado).
2. Actualiza `docs/pruebas/<nn>-<modulo>-plan-de-pruebas.md` con resultados reales (número de pruebas, cobertura, defectos encontrados) y la matriz de trazabilidad.

## 5. Auto-reparación de pruebas rotas
Ante un fallo: lee `error-context.md` en `tests/e2e/test-results/` o la traza (`npx playwright show-trace`), decide si cambió el negocio (actualiza la prueba y el escenario Gherkin) o si es un defecto (corrige el código), y vuelve a ejecutar solo el nivel afectado antes de la suite completa.
```

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

```yaml
# Pipeline de calidad (Modelo V): ejecuta los 4 niveles de prueba en orden y bloquea el merge
# si alguno falla o si la cobertura unitaria baja del umbral (80 % líneas, definido en vitest.config.ts).
name: Calidad

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: calidad-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'
  JWT_SECRET: secreto-de-ci-solo-para-pruebas-con-mas-de-32-caracteres
  WEB_ORIGIN: http://localhost:3002

jobs:
  estatico:
    name: Lint, arquitectura y tipos
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: npm }
      - run: npm ci
      - run: npx prisma generate --schema apps/api/prisma/schema.prisma
      - run: npm run contracts:generate
      - run: npm run lint
      - run: npm run typecheck

  unitarias:
    name: 'Nivel 1: unitarias + cobertura'
    needs: estatico
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: npm }
      - run: npm ci
      - run: npx prisma generate --schema apps/api/prisma/schema.prisma
      # Falla si la cobertura baja de los umbrales de vitest.config.ts.
      - run: npm run test:unit
        env: { CI: 'true' }
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: cobertura-unitaria, path: apps/api/reports/unit }

  integracion:
    name: 'Nivel 2: integración (Testcontainers)'
    needs: unitarias
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: npm }
      - run: npm ci
      - run: npx prisma generate --schema apps/api/prisma/schema.prisma
      # El runner de GitHub tiene Docker: PostgreSQL 16 efímero con Testcontainers.
      - run: npm run test:int
        env: { CI: 'true', USAR_TESTCONTAINERS: '1' }

  sistema-y-aceptacion:
    name: 'Niveles 3 y 4: sistema (E2E), carga y aceptación (UAT)'
    needs: integracion
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: lectoaventura_e2e }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      CI: 'true'
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/lectoaventura_e2e?schema=public
      PW_CANAL: chromium
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: npm }
      - run: npm ci
      - run: npx prisma generate --schema apps/api/prisma/schema.prisma
      - run: npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
      - run: npm run contracts:generate
      - run: npx playwright install --with-deps chromium
        working-directory: tests/e2e
      # Se compila una sola vez; E2E, UAT y k6 arrancan la compilación de producción.
      - name: Compilar API y web
        run: npm run build --workspace @lectoaventura/api && npm run build --workspace @lectoaventura/web
      - name: 'Nivel 3: sistema E2E (escritorio y tablet)'
        run: npm run test:e2e
      - name: 'Nivel 4: aceptación (Gherkin)'
        run: npm run test:uat
      - name: 'Nivel 3: humo de carga con k6 (RNF-001, RNF-003, RNF-008)'
        uses: grafana/setup-k6-action@v1
      - run: |
          npm run start --workspace @lectoaventura/api &
          npx wait-on -t 120000 http-get://localhost:3001/api/v1/dev/correos
          k6 run -e DURACION=30s tests/load/scenarios/iam-sesiones.js
          k6 run -e DURACION=30s tests/load/scenarios/escuela-panel.js
          node tests/load/sembrar-biblioteca.mjs
          k6 run -e DURACION=30s tests/load/scenarios/biblioteca.js
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: reportes-sistema-y-uat
          path: |
            tests/e2e/reportes
            tests/e2e/test-results
```

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
| IAM-U-28 | `ReenviarVerificacionUseCase` + `VerificacionCorreo` (RF-002) | Unit | Pos./Neg./Borde | Enlace nuevo anula el anterior; sirve aunque el primero haya vencido; 60 s de espera y 5 por hora; cuenta ya verificada recibe aviso sin enlace; inexistente o suspendida: misma respuesta y nada enviado | `npm run test:unit` |
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
| IAM-I-11 | Límite de tasa con proxy (RNF-019) | Int | Borde | 11.º intento por IP → 429; 31.º por tablet → 429 (otra tablet sigue); reenviar verificación: 2.º pedido del mismo correo en 1 min → 429, 6.º de la misma IP → 429 | `npm run test:int` |
| IAM-I-15 | Verificación y reenvío (RF-002) | Int | Pos./Neg./Borde | 202 idéntico exista o no la cuenta; huellas SHA-256; anterior `REEMPLAZADO`, vencido `VENCIDO`, repetido `YA_VERIFICADA`; **funciona después de reiniciar la API** | `npm run test:int` |
| IAM-I-12 | Contrato del API (SRS §7) | Int | Positivo | `/api/v1`, `X-Request-Id`, Problem Details | `npm run test:int` |
| IAM-I-13 | Tablet del aula + Escuela (RF-007, RF-015, RF-020, CR-01) | Int | Pos./Neg. | Entra el matriculado; ajeno 403; familia 403; otra docente 404; aula archivada 403 | `npm run test:int` |
| IAM-I-14 | Logs sin secretos (RNF-031) | Int | Negativo | 0 apariciones de contraseña, PIN, tokens, códigos, firmas o hashes | `npm run test:int` |
| IAM-S-01 | Recorrido familia completo + exportar PDF | Sys | Positivo | Del registro al niño leyendo, con descarga del PDF, en escritorio y tablet | `npm run test:e2e` |
| IAM-S-08 | Tablet del aula (CR-01) | Sys | Pos./Neg. | Sin activar no hay avatares ni campos; activada, el niño entra sin códigos | `npm run test:e2e` |
| IAM-S-10 | Diseño responsivo (RNF-022, RNF-023) | Sys | Borde | 0 px de desborde y objetivos ≥ 48 px en 1280, 820 y 390 px; barra lateral o inferior según el dispositivo | `npm run test:e2e` |
| IAM-S-11 | Reenvío de la verificación desde la interfaz (RF-002) | Sys | Pos./Neg. | El ingreso ofrece "Reenviar enlace"; cuenta regresiva; enlace viejo "ya no sirve"; nuevo verifica; repetido "ya estaba verificado"; enlace incompleto permite pedir otro | `npm run test:e2e` |
| IAM-S-09 | Cierre por inactividad (RF-010) | Sys | Borde | Con 9 min sigue dentro; pasados 10 min vuelve al ingreso con aviso | `npm run test:e2e` |
| IAM-S-02 | Ingreso con credenciales erradas | Sys | Negativo | Mensaje claro, sigue en `/ingresar` | `npm run test:e2e` |
| IAM-S-03 | Rutas protegidas sin sesión | Sys | Negativo | Redirige al ingreso correcto según el rol | `npm run test:e2e` |
| IAM-S-04 | PIN errado y separación de roles | Sys | Negativo | "Te quedan 4 intentos"; niño no abre `/familia` | `npm run test:e2e` |
| IAM-S-05 | Recarga y "Salir" | Sys | Positivo | Sesión persiste; "Salir" lleva a la portada y cierra | `npm run test:e2e` |
| IAM-S-06 | Diseño sin desbordes (RNF-022) | Sys | Borde | Sin scroll horizontal en 820 px | `npm run test:e2e` |
| IAM-S-07 | Carga RNF-008 / RNF-001 | Sys | Rendimiento | 0 % errores; p95 277 ms y 62 ms | `npm run test:load` |
| IAM-A-01..14 | 14 escenarios Gherkin (incluye UAT-05 del SRS, la inactividad, la tablet del aula de CR-01 y el reenvío de la verificación) | UAT | Pos./Neg./Borde | Ver §7.1 | `npm run test:uat` |

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
