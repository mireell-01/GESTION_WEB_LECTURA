# Plan Maestro de Pruebas — Módulo 2: Escuela (Aulas y Asignaciones)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/escuela` + pantallas web del modo escuela, del panel familiar y del inicio del estudiante
> **Requisitos cubiertos:** RF-014 a RF-020, RN-01, RN-03, RN-04, RN-17, RF-077 (parcial: vinculación, invitaciones y tarjetas), RNF-001, RNF-003, RNF-019, RNF-022, RNF-023, RNF-031, convenciones del API (SRS §7), cardinalidad "1 responsable + hasta 2 familiares vinculados" (SRS §7) y el cambio aprobado **CR-01** (tarjetas sin código de aula)
> **Fecha de ejecución:** 16/10/2026 · **Resultado global:** ✅ 380 pruebas automatizadas en verde en los 4 niveles (las del Módulo 1 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 2 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 220 | 70 | ✅ 220/220 · cobertura 95,9 % líneas / 93,9 % ramas | 30 s |
| 2 · Integración (Supertest + PostgreSQL real) | 72 | 21 | ✅ 72/72 | 71 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 69 | 15 | ✅ 69/69 (64 en la corrida completa; las otras 5 pasaron al repetirlas: 3 tenían un selector de prueba ambiguo, ya corregido, y 2 fueron un cuelgue del navegador en celular) | 24,7 min |
| 3 · Carga (RNF-003 / RNF-001) | 5 mediciones | 5 | ✅ 0 % errores · panel con 40 estudiantes p95 91 ms · lecturas p95 ≤ 73 ms | 1 min |
| 4 · Aceptación (Gherkin en español) | 19 escenarios | 5 | ✅ 19/19 · informe para el Product Owner | 4,5 min |

**Defectos encontrados por las pruebas y corregidos:** 9 · **Brechas con el SRS cerradas:** 7 · **Desviaciones del SRS documentadas:** 1 (tarjetas por `POST`, ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `escuela` (SRS §7) |
| PDF | pdf-lib 1.17 (ya usada en el Módulo 1; sin dependencias nuevas) |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` |

## 1.2 Mapa de dependencias del módulo

```
interface  EscuelaController (/aulas/*, DOCENTE) · FamiliaYEstudianteController
           (/estudiantes/{id}/invitaciones-familiar, /familia/vincular, /yo/asignaciones) · DTO
   │  usa CasosUsoEscuela (token CASOS_USO_ESCUELA)
   ▼
application 14 casos de uso (aulas, matrícula, tarjetas, asignaciones, invitaciones) · EscuelaFacade
   │  puertos: AulaRepository, MatriculaRepository, AsignacionRepository, InvitacionRepository,
   │           GeneradorTarjetasPdf, ServicioIdentidad (anticorrupción hacia IAM), CatalogoAsignable
   ▼
domain     Aula, Matricula, Asignacion (PROGRAMADA→ACTIVA→VENCIDA→CERRADA), InvitacionFamiliar
           · VO CodigoAula, CodigoInvitacion, FechaLima · PoliticaMatricula · errores · eventos

infrastructure Prisma*Repository · PdfLibTarjetas · ServicioIdentidadIam (sobre IamFacade)

Otros módulos (solo por su public-api o por el shared-kernel):
  IAM ─────────── perfiles, PIN, vínculos familiares (VincularFamiliarUseCase, iam.vinculo_responsable)
  shared-kernel ─ CatalogoAsignable: Contenido registra las lecturas publicadas y Aventura las misiones
                  ResolutorContextoAula (Escuela lo registra para la tablet del aula, CR-01)
  Administración  escucha los eventos de Escuela y los guarda en admin.auditoria (RF-077)
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `AulaRepository`, `MatriculaRepository`, `AsignacionRepository`, `InvitacionRepository` | Interna (puerto) | En memoria (`test/unit/escuela/dobles.ts`); la de invitaciones copia filas como una base real | **Real**: Prisma + PostgreSQL |
| `ServicioIdentidad` (IAM) | Interna (anticorrupción) | `IdentidadFalsa` con errores configurables | **Real**: `IamFacade` + `iam.*` |
| `CatalogoAsignable` (Contenido, Aventura) | Interna (registro) | `CatalogoFalso` | **Real**: lectura publicada y misión sembradas en la base de pruebas |
| `GeneradorTarjetasPdf` | Interna | `TarjetasEspia` + prueba propia del adaptador real con pdf-lib | **Real** (se leen los PIN del PDF) |
| Huella de códigos (SHA-256) | Inyectada | Huella legible `huella(...)` | **Real** |
| Fuente aleatoria (`randomInt`) | Inyectada | Cola controlable | **Real** |
| Reloj | Inyectado | Reloj controlable (`avanzarMin`) | Reloj real |
| `BusEventos` + Outbox + auditoría | Interna | `BusEspia` | **Real**: `admin.outbox_evento` y `admin.auditoria` |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| E-1 | La matrícula (RF-015/RF-016) devolvía el **PIN en la respuesta JSON** y las tarjetas eran un JSON con PIN: la pantalla podía mostrarlo, contra "PIN visible solo en la tarjeta impresa" (RF-017) | Análisis vs SRS | La matrícula ya no devuelve el PIN; el PIN se asigna al imprimir y existe solo dentro del PDF |
| E-2 | Las tarjetas seguían llevando el **código de aula**, que tras CR-01 ya no sirve para entrar | Análisis vs CR-01 | Tarjeta con aula, avatar, alias y PIN; prueba que el PDF no contiene "código" |
| E-3 | Código muerto de CR-01: `CodigoAulaInvalidoError`, `AulaRepository.buscarPorCodigo`, `CodigoAula.intentar` | Revisión de cobertura | Eliminado |
| E-4 | Una fecha límite imposible se informaba como "asignación repetida" (409) si el contenido ya estaba asignado | 2 · `escuela-http.int-spec.ts` | Primero las reglas de la asignación (fechas), después las del aula |
| E-5 | El título del PDF perdía el guion largo: el filtro de caracteres de la fuente estándar se aplicaba también a los metadatos (que admiten Unicode) | 1 · `tarjetas-y-auditoria.spec.ts` | El filtro solo se aplica al texto dibujado |
| E-6 | En Edge reciente `scrollIntoView` devuelve una promesa y el `useEffect` del código de invitación la retornaba: React lo marca como error | 3 · `modo-escuela.spec.ts` | El efecto ya no retorna nada |
| E-7 | Las pruebas de un mismo archivo compartían la IP simulada; con 3 dispositivos superaban el límite de 10 ingresos/min (RNF-019) y fallaban con 429 | 3 · E2E | IP simulada distinta por prueba (`base.extend` de `extraHTTPHeaders`) |
| E-8 | Un alias de 20 letras o un nombre de aula largo se salían de la tarjeta impresa | Revisión del PDF de ejemplo | `ajustarAlAncho`: achica la letra y, si no alcanza, recorta con "..."; prueba con textos largos |
| E-9 | Pruebas mal escritas: el nombre "Ana" también coincidía con la casilla "Elegir a Ana…" y un paso Gherkin no recibía su parámetro | 3 y 4 · Playwright / bddgen | Selector exacto y paso con su parámetro |

**Brechas con el SRS detectadas en la auditoría del módulo y cerradas (todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-017 | No había PDF; un `POST` devolvía JSON | PDF A4 con 8 tarjetas por hoja y líneas de corte (pdf-lib); `Cache-Control: no-store`; reimprimir invalida la tarjeta anterior | U + I + S + UAT |
| B-2 | RF-018 | No existían las asignaciones | Agregado `Asignacion` con estados por fecha de Lima, destinatarios, catálogo de lecturas/misiones publicadas, cierre y "Misión del docente" en el inicio del estudiante | U + I + S + UAT |
| B-3 | RF-019 | No existía la invitación familiar | Código de 8 caracteres de un solo uso y 7 días; en la base solo su huella SHA-256; canje atómico; anti-enumeración; límite 10/min por IP | U + I + S + UAT |
| B-4 | RF-019 / RF-077 | "Vinculación queda auditada": la tabla `admin.auditoria` no se usaba | Administración registra `FAMILIAR_VINCULADO`, `INVITACION_FAMILIAR_GENERADA` y `TARJETAS_ACCESO_GENERADAS` con actor, rol, recurso, fecha e IP | U + I |
| B-5 | RN-17 / SRS §7 | IAM no tenía familiares vinculados ("hasta 2") | `VincularFamiliarUseCase` (máx. 2 por estudiante, 6 estudiantes por familia), panel "Desde su aula" y la tablet de casa muestra al niño vinculado | U + I + S |
| B-6 | RF-014 a RF-020 | Escuela no tenía pantallas | Mis aulas, crear aula, detalle, matrícula uno/CSV, tarjetas, invitación, asignaciones, archivar; responsivas | S + UAT |
| B-7 | RF-020 | Archivar no cerraba las asignaciones abiertas | Archivar cierra las asignaciones abiertas; las invitaciones pendientes dejan de servir | U + I + S |

**Desviación documentada del SRS:** el SRS (§7) define `GET /api/v1/aulas/{id}/tarjetas-acceso.pdf`. Como el PIN solo se guarda cifrado, imprimir **asigna PIN nuevos**: un `GET` con ese efecto podría dispararse solo (vista previa de enlaces, reintentos del navegador) e invalidar tarjetas ya entregadas. Se implementó `POST /api/v1/aulas/{id}/tarjetas-acceso.pdf` con los estudiantes elegidos en el cuerpo. Registrado también en [`docs/datos/modelo-de-datos.md`](../datos/modelo-de-datos.md).

**Decisiones de diseño (no estaban en el SRS):**
- Fecha límite de una asignación: hasta 6 meses adelante; las fechas son días de Lima (UTC−5 todo el año).
- Hasta 3 códigos de invitación sin usar por estudiante.
- El familiar vinculado acompaña y puede hacer entrar al niño en la tablet de casa, pero no edita su perfil de aula ni cambia su PIN (los gestiona la docente, responsable del perfil).
- La familia puede canjear el código sin dar antes el consentimiento parental: el perfil ya existe bajo el consentimiento institucional del aula (RN-01).

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| No hay pantalla para quitar un vínculo familiar | Si un código llega a la persona equivocada, hoy solo se corrige en la base | La columna `revocado_en` ya existe; agregar "Quitar familiar" en el panel docente (Módulo 10 o 12) |
| Las lecturas y misiones reales llegan con los Módulos 3 y 4 | En la base de desarrollo el catálogo está vacío y no se puede asignar nada todavía | Contenido y Aventura ya registran su fuente; al publicar contenido aparecerá solo |
| "Misión del docente" aún no abre la lectura | El niño la ve, pero el lector llega con los Módulos 4 y 6 | Enlazar la tarjeta a la sesión de lectura |
| La auditoría registra solo las acciones de Escuela | Cambios de PIN, consentimientos, exportaciones y eliminaciones de IAM aún no se auditan (RF-077) | Agregar sus eventos a `AuditoriaSuscripciones` en el Módulo 12 |
| `institucion_id` del aula sigue vacío | La institución se guarda como texto | Registro de instituciones (RF-076) |
| La auditoría acumula los registros de las pruebas E2E en la base de desarrollo | Es de solo agregar por diseño; no contienen datos personales (cuentas de prueba, IP simuladas) | Usar una base propia para E2E en local, como en CI |
| Heredadas del Módulo 1 | Outbox no transaccional; límite de tasa en memoria; la API en modo `watch` se reinicia si cambia un archivo durante las E2E | Ver informe del Módulo 1 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva: el módulo usa las mismas herramientas del Módulo 1.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Escuela solo usa IAM por su `public-api`; los demás módulos, por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` + `unplugin-swc` | Node.js 22 | Dominio de Escuela, casos de uso con dobles, PDF real, auditoría y vínculos de IAM | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real: huellas, destinatarios, auditoría, canje atómico, PIN del PDF | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | La docente usa la web real; descarga del PDF; el niño entra con el PIN impreso | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/escuela-panel.js`) | Binario k6 | RNF-003 (panel con aula de 40 < 1,5 s p95) y RNF-001 | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios Gherkin en español para el Product Owner | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── support/pdf-texto.ts                 # Lee el texto y los PIN de un PDF generado (I, S, UAT)
│   ├── unit/escuela/
│   │   ├── dobles.ts                        # Repos en memoria, IAM simulado, catálogo, PDF espía
│   │   ├── dominio/dominio-escuela.spec.ts  # Aula, Matricula, FechaLima, Asignacion, invitación
│   │   ├── aplicacion/{aulas-y-matriculas,asignaciones,invitaciones}.spec.ts
│   │   └── infraestructura/tarjetas-y-auditoria.spec.ts   # PDF real + RF-077
│   ├── unit/iam/aplicacion/vinculos-familiares.spec.ts   # RF-019 en IAM y tablet de casa
│   └── integration/escuela/escuela-http.int-spec.ts       # HTTP + PostgreSQL
├── tests/
│   ├── e2e/
│   │   ├── support/escuela.ts               # Aula preparada, catálogo de prueba, PIN del PDF descargado
│   │   ├── specs/escuela/modo-escuela.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts  # + paneles del modo escuela
│   │   ├── features/escuela/modo-escuela.feature
│   │   └── steps/escuela.steps.ts
│   └── load/scenarios/escuela-panel.js      # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Dominio:** `Aula` (datos válidos, archivado de solo lectura), `Matricula`, `PoliticaMatricula` (45 activos, alias + avatar distinguibles, PIN sin repetidos/escaleras/años), `FechaLima` (día de Lima aunque en UTC ya sea mañana, fechas imposibles), `Asignacion` (estados por fecha al milisegundo del cierre del día en Lima, CERRADA definitiva, destinatarios sin repetir, límites de fechas), `CodigoInvitacion` (alfabeto sin ambiguos, lo que escribe la familia) e `InvitacionFamiliar` (7 días exactos, un solo uso).
- **Casos de uso** con dobles: crear aula con código único (reintenta si choca), consultar con RN-17, matricular uno y CSV (sin PIN en la respuesta), **tarjetas con PIN nuevo solo en el PDF**, retirar, archivar (cierra asignaciones), **asignaciones** (catálogo, duplicados, destinatarios, estados guardados al consultarlas, misión del docente), **invitación y canje** (huella, anti-enumeración, código no gastado si IAM rechaza, dos canjes simultáneos, liberación).
- **IAM:** vínculo familiar (solo familias activas, sin duplicar, máx. 2 y 6) y tablet de casa con el niño vinculado.
- **Adaptadores:** PDF real (A4, 8 por hoja, textos y PIN) y registro de auditoría (IP inválida → desconocida).

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/escuela/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
El reporte de cobertura queda en `apps/api/reports/unit/coverage/index.html`; ahora incluye el dominio, la aplicación y el PDF de Escuela.

## 4.4 Código completo del test unitario
`apps/api/test/unit/escuela/aplicacion/invitaciones.spec.ts`:

<<archivo:apps/api/test/unit/escuela/aplicacion/invitaciones.spec.ts>>

`apps/api/test/unit/escuela/dominio/dominio-escuela.spec.ts`:

<<archivo:apps/api/test/unit/escuela/dominio/dominio-escuela.spec.ts>>

`apps/api/test/unit/escuela/aplicacion/asignaciones.spec.ts`:

<<archivo:apps/api/test/unit/escuela/aplicacion/asignaciones.spec.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- Rutas `/api/v1/aulas/*`, `/estudiantes/{id}/invitaciones-familiar`, `/familia/vincular` y `/yo/asignaciones` con validación, roles (403), RN-17 (404 a otra docente), Problem Details y la base real.
- **El PIN impreso funciona:** se descarga el PDF, se leen los PIN y el niño entra desde la tablet del aula; reimprimir invalida el PIN anterior; queda auditado.
- **Asignaciones en la base:** `lectura_id`/`mision_id` según el tipo (restricción `ck_asignacion_destino`), destinatarios, fecha límite a las 23:59:59,999 de Lima, estado VENCIDO guardado al consultar.
- **Invitación:** solo la huella SHA-256 en la base, canje con IP real detrás del proxy, auditoría con actor e IP, vínculo en `iam.vinculo_responsable`, mismo mensaje para código usado o inventado, **429 al 11.º intento por minuto**.
- **Archivar:** solo lectura (409), perfiles conservados, asignaciones cerradas, invitaciones anuladas.
- **RNF-031:** el recorrido del modo escuela no deja PIN de tarjetas ni códigos de invitación en los logs.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/escuela/escuela-http.int-spec.ts`:

<<archivo:apps/api/test/integration/escuela/escuela-http.int-spec.ts>>

Lector de PDF usado por las pruebas (`apps/api/test/support/pdf-texto.ts`):

<<archivo:apps/api/test/support/pdf-texto.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **La docente en la web real:** crea su aula, matricula uno por uno y por CSV (fila rechazada con su motivo), descarga el PDF, activa la tablet y el niño entra con el PIN leído del PDF descargado; el PIN nunca aparece en pantalla.
- **Asignación → "Misión del docente"** en el inicio del niño.
- **Invitación familiar:** el código se lee en pantalla, la familia lo canjea (en minúsculas), lo ve en "Desde su aula", el código no sirve dos veces y el niño entra desde la tablet de casa.
- **Archivar:** el aula queda de solo lectura.
- **Diseño responsivo (RNF-022, RNF-023)** de los paneles nuevos en 1280, 820 y 390 px: sin desbordes y con objetivos táctiles ≥ 48 px (las casillas se miden por su etiqueta).

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:escuela --workspace @lectoaventura/tests-load
```
Al terminar, `support/limpieza.ts` borra las cuentas `@e2e.lectoaventura.test` (con sus aulas, matrículas, asignaciones, invitaciones y vínculos) y el contenido "Prueba E2E".

**Resultado de carga obtenido el 16/10/2026** (sondeo equivalente de 60 s con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API en modo `watch`):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /api/v1/aulas/{id}` con 40 estudiantes, 10 docentes (RNF-003) | 3 671 | 0,00 % | 70 ms | 91 ms | 108 ms | p95 < 1,5 s | ✅ |
| `GET /api/v1/aulas` (RNF-001) | 3 671 | 0,00 % | 44 ms | 57 ms | 66 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `GET /api/v1/aulas/{id}/asignaciones` | 3 671 | 0,00 % | 46 ms | 60 ms | 70 ms | p95 < 300 ms | ✅ |
| `GET /api/v1/yo/asignaciones`, 10 niños (RNF-001) | 10 466 | 0,00 % | 56 ms | 73 ms | 85 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `POST /api/v1/aulas/{id}/tarjetas-acceso.pdf` (8 PIN con Argon2id + PDF), cada 5 s | 10 | 0,00 % | 1 456 ms | 1 697 ms | 1 697 ms | sin meta en el SRS | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/escuela/modo-escuela.spec.ts`:

<<archivo:tests/e2e/specs/escuela/modo-escuela.spec.ts>>

`tests/e2e/support/escuela.ts`:

<<archivo:tests/e2e/support/escuela.ts>>

`tests/load/scenarios/escuela-panel.js`:

<<archivo:tests/load/scenarios/escuela-panel.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/escuela/modo-escuela.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/escuela.steps.ts>>

**Checklist manual para el Product Owner / docente evaluador:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como docente, "Mis aulas → + Nueva aula" | El aula se crea solo si se declara el consentimiento de la institución |
| ☐ | Matricular uno por uno | Solo pide alias, mes y año de nacimiento y avatar; no muestra ningún PIN |
| ☐ | Matricular con un CSV con una fila mal escrita | Matricula las buenas y explica por qué rechazó la otra |
| ☐ | "Descargar tarjetas" e imprimir en A4 | 8 tarjetas por hoja con aula, avatar, alias y PIN; sin código de aula |
| ☐ | Activar la tablet del aula y entrar con el PIN de una tarjeta | El niño entra; una tarjeta vieja ya no sirve |
| ☐ | "+ Nueva asignación" para toda el aula | Aparece "En curso" con su fecha límite; el niño la ve como "Misión del docente" |
| ☐ | "Invitar familia" y canjear el código desde otra cuenta familiar | La familia ve al niño en "Desde su aula"; el código no sirve una segunda vez |
| ☐ | "Archivar aula" | Queda "Archivada", solo para consultar |
| ☐ | Revisar todo en celular, tablet y computadora | Sin desplazarse a los lados; botones fáciles de tocar |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `modo-escuela.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo escuela`. Los servidores MCP recomendados (Playwright, PostgreSQL de solo lectura sobre `lectoaventura_test`, GitHub) y el flujo de auto-reparación están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL es especialmente útil para revisar `admin.auditoria` y `escuela.invitacion_familiar` después de una prueba.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga del modo escuela:

```yaml
      - run: |
          npm run start --workspace @lectoaventura/api &
          npx wait-on -t 120000 http-get://localhost:3001/api/v1/dev/correos
          k6 run -e DURACION=30s tests/load/scenarios/iam-sesiones.js
          k6 run -e DURACION=30s tests/load/scenarios/escuela-panel.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ESC-U-01 | `Aula.crear` / `archivar` (RF-014, RF-020) | Unit | Pos./Neg. | Datos inválidos rechazados; archivada = solo lectura | `npm run test:unit` |
| ESC-U-02 | `PoliticaMatricula` (RF-015) | Unit | Borde | 45 activos; alias + avatar únicos; PIN sin patrones fáciles | `npm run test:unit` |
| ESC-U-03 | `FechaLima` | Unit | Borde | 23:30 en Lima sigue siendo "hoy" aunque en UTC sea mañana; fechas imposibles rechazadas | `npm run test:unit` |
| ESC-U-04 | `Asignacion.estadoEn` (RF-018) | Unit | Borde | PROGRAMADA → ACTIVA a las 00:00 de Lima → VENCIDA a las 23:59:59,999; CERRADA definitiva | `npm run test:unit` |
| ESC-U-05 | `CodigoInvitacion` / `InvitacionFamiliar` (RF-019) | Unit | Borde | 8 caracteres sin ambiguos; vence a los 7 días exactos; un solo uso | `npm run test:unit` |
| ESC-U-06 | `CrearAulaUseCase` (RF-014, RN-01) | Unit | Positivo | Código único con reintento; consentimiento institucional registrado | `npm run test:unit` |
| ESC-U-07 | `MatricularEstudiantesUseCase` (RF-015, RF-016) | Unit | Pos./Neg. | Sin PIN en la respuesta; CSV con encabezado, avatares asignados y filas rechazadas con motivo; 60 filas y cupo | `npm run test:unit` |
| ESC-U-08 | `GenerarTarjetasUseCase` (RF-017) | Unit | Positivo | PIN nuevo por elegido, solo en el PDF; sin código de aula; solo matriculados | `npm run test:unit` |
| ESC-U-09 | `CrearAsignacionUseCase` (RF-018) | Unit | Pos./Neg. | Contenido publicado; destinatarios del aula; sin duplicar abiertas; aula activa | `npm run test:unit` |
| ESC-U-10 | `ListarAsignaciones` / `MisionesDelDocente` (RF-018) | Unit | Borde | En curso primero; estados que cambió el tiempo se guardan; el niño ve solo lo suyo y en curso | `npm run test:unit` |
| ESC-U-11 | `GenerarInvitacionFamiliar` (RF-019, RN-17) | Unit | Pos./Neg. | Solo la huella guardada; 404 a otra docente; 409 aula archivada, 3 pendientes o familia completa | `npm run test:unit` |
| ESC-U-12 | `CanjearInvitacionFamiliar` (RF-019) | Unit | Neg./Borde | Mismo error para usado, vencido, inventado o mal escrito; no se gasta si IAM rechaza; dos canjes simultáneos → uno | `npm run test:unit` |
| ESC-U-13 | `VincularFamiliarUseCase` (IAM, SRS §7) | Unit | Borde | Solo familias activas; sin duplicar; máx. 2 por estudiante y 6 por familia | `npm run test:unit` |
| ESC-U-14 | Tablet de casa con niño vinculado (RN-04) | Unit | Pos./Neg. | La familia vinculada lo ve y lo hace entrar; otra familia no | `npm run test:unit` |
| ESC-U-15 | `PdfLibTarjetas` (RF-017) | Unit | Pos./Borde | A4, 8 por hoja, textos y PIN legibles; alias y aulas largos dentro de la tarjeta; caracteres no soportados reemplazados | `npm run test:unit` |
| ESC-U-16 | `RegistrarAuditoria` (RF-077) | Unit | Borde | Actor, acción, recurso, fecha e IP; IP inválida → desconocida | `npm run test:unit` |
| ESC-I-01 | `POST/GET /api/v1/aulas` (RF-014) | Int | Pos./Neg. | Código con alfabeto sin ambiguos; consentimiento en BD; 400 sin declarar | `npm run test:int` |
| ESC-I-02 | Matrícula uno y CSV (RF-015, RF-016) | Int | Pos./Neg. | Sin PIN; PIN Argon2id en BD; filas rechazadas | `npm run test:int` |
| ESC-I-03 | RN-17 en el modo escuela | Int | Negativo | Otra docente 404; familia 403; id mal formado 404 | `npm run test:int` |
| ESC-I-04 | `POST /aulas/{id}/tarjetas-acceso.pdf` (RF-017) | Int | Positivo | PDF descargable sin caché; el PIN impreso abre la sesión; reimprimir invalida; auditado | `npm run test:int` |
| ESC-I-05 | Asignaciones (RF-018) | Int | Pos./Neg. | Solo lo publicado; columnas según el tipo; destinatarios; 404/409/400; misión del docente; VENCIDA guardada | `npm run test:int` |
| ESC-I-06 | Invitación y vínculo (RF-019) | Int | Pos./Neg./Borde | Huella SHA-256; auditoría con IP; vínculo en `iam.vinculo_responsable`; mismo mensaje; 429 al 11.º intento; tablet de casa | `npm run test:int` |
| ESC-I-07 | Archivar y retirar (RF-020) | Int | Pos./Neg. | 409 al modificar; perfiles conservados; asignaciones cerradas; invitación anulada; retirado fuera de la tablet | `npm run test:int` |
| ESC-I-08 | Logs sin secretos (RNF-031) | Int | Negativo | 0 apariciones de PIN de tarjetas y códigos de invitación | `npm run test:int` |
| ESC-S-01 | Aula → matrícula → PDF → niño entra (RF-014 a RF-017, CR-01) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| ESC-S-02 | Asignación → "Misión del docente" (RF-018) | Sys | Positivo | Aparece en el inicio del niño | `npm run test:e2e` |
| ESC-S-03 | Invitación → familia → tablet de casa (RF-019) | Sys | Pos./Neg. | Vinculada; segundo uso rechazado; el niño entra en casa | `npm run test:e2e` |
| ESC-S-04 | Archivar (RF-020) | Sys | Positivo | Solo lectura, "Archivada" en Mis aulas | `npm run test:e2e` |
| ESC-S-05 | Paneles responsivos (RNF-022, RNF-023) | Sys | Borde | 0 px de desborde y ≥ 48 px en docente y familia | `npm run test:e2e` |
| ESC-S-06 | Carga RNF-003 / RNF-001 | Sys | Rendimiento | Ver §6.3 | `npm run test:escuela --workspace @lectoaventura/tests-load` |
| ESC-A-01..05 | 5 escenarios Gherkin (RF-014 a RF-020) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — casos de uso con puertos e inyección por constructor; reloj, aleatoriedad y huella inyectados.
- **Cobertura unitaria alcanzable** ............. 9/10 — dominio y aplicación de Escuela entre 89 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — Escuela usa IAM por un puerto anticorrupción y el catálogo por el shared-kernel; Contenido y Aventura no conocen a Escuela.
- **Preparación para CI/CD** .................... 9/10 — las suites nuevas entran solas en el pipeline; humo de carga k6 agregado.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — un solo uso con canje atómico, horarios de Lima, aulas archivadas y límites cubiertos; pendiente quitar vínculos desde la interfaz.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
