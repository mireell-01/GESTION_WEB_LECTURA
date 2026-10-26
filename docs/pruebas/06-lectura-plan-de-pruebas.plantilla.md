# Plan Maestro de Pruebas — Módulo 6: Lectura interactiva

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/lectura` + la lectura del estudiante (`/estudiante/lecturas/{id}`) y la revisión de respuestas abiertas en el panel docente
> **Requisitos cubiertos:** RF-038 a RF-051, RN-06 (pistas), RN-07 (puntaje del ítem), RN-12 (repetición), RN-14 (versión inmutable), RN-17, RN-19, RF-027 (sesión atada a su versión), RF-032 (avance de misiones), UAT-02, UAT-03, RNF-002, RNF-019, RNF-022, RNF-023 y los eventos `SesionLecturaIniciada`, `ItemRespondido`, `SesionLecturaFinalizada` y `RespuestaAbiertaValorada` del SAD §6
> **Fecha de ejecución:** 22/10/2026 · **Resultado global:** ✅ 655 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 5 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 6 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 375 | 39 | ✅ 375/375 · cobertura 97,4 % líneas / 92,8 % ramas | 68 s |
| 2 · Integración (Supertest + PostgreSQL real) | 120 | 16 | ✅ 120/120 | 135 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 123 | 18 | ✅ 123/123 en una sola corrida completa contra la compilación de producción | 18,1 min |
| 3 · Carga (RF-040, RNF-002) | 6 mediciones | 6 | ✅ 0 % errores · corrección p95 67 ms · reanudar p95 26 ms | 3 s |
| 4 · Aceptación (Gherkin en español) | 37 escenarios | 5 | ✅ 37/37 · informe para el Product Owner | 5,7 min |

**Defectos encontrados por las pruebas y corregidos:** 7 · **Brechas con el SRS cerradas:** 16 · **Decisiones documentadas donde el SRS no decía cómo:** 9 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `lectura` (6 tablas, SRS §7) · migración `20261023000000_lectura_sesiones` |
| Voz | Web Speech API del navegador: síntesis (RF-050) y reconocimiento (RF-049); sin servicios externos ni audio en el servidor |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  SesionesLecturaController (/sesiones-lectura/*; ESTUDIANTE) · RespuestasAbiertasController
           (/aulas/{id}/respuestas-abiertas; DOCENTE) · ValoracionesController (/respuestas/{id}/valoracion; DOCENTE)
   │  usa CasosUsoLectura (token CASOS_USO_LECTURA)
   ▼
application SesionesUseCase (iniciar o reanudar, ver, predecir, responder, pedir pista, decidir, finalizar)
           RevisionUseCase (respuestas abiertas del aula, valorar con la rúbrica)
   │  puertos: SesionRepository, ContenidoLecturas (Contenido), IdentidadEstudiantes (IAM),
   │           EscuelaLectura (Escuela), BusEventos
   ▼
domain     SesionLectura (INICIADA → EN_CURSO → FINALIZADA, ABANDONADA a los 7 días) · Guion (orden de pasos y
           texto visible) · corrección por modalidad · política de pistas (RN-06, RN-07) · filtro de palabras

infrastructure PrismaSesionRepository · ContenidoLecturasContenido (versiones en memoria, RN-14)
               IdentidadEstudiantesIam · EscuelaLecturaEscuela · AvanceLecturasRegistro (shared-kernel)

Otros módulos (solo por su public-api o por el shared-kernel):
  Contenido ───── ContenidoFacade (nueva): la versión publicada con sus claves, solo para el servidor
  IAM ─────────── alias, avatar y rango de edad (IamFacade)
  Escuela ─────── aulas, asignaciones y acceso del docente (EscuelaFacade, RN-17)
  Aventura ────── escucha SesionLecturaIniciada/Finalizada y consulta AVANCE_LECTURAS (RF-032)
  Progreso ────── (Módulo 7) recalculará la maestría con ItemRespondido y RespuestaAbiertaValorada
  Gamificación ── (Módulo 8) otorgará puntos e insignias con los mismos eventos
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `SesionRepository` | Interna (puerto) | `SesionesEnMemoria` (`test/unit/lectura/dobles.ts`): la misma restricción única que la base | **Real**: Prisma + PostgreSQL |
| `ContenidoLecturas` (Contenido) | Anticorrupción | `ContenidoFalso` con una lectura de cada modalidad | **Real**: `ContenidoFacade` con lecturas publicadas por el flujo editora → revisora |
| `IdentidadEstudiantes` (IAM) | Anticorrupción | `IdentidadFalsa` | **Real**: `IamFacade` |
| `EscuelaLectura` (Escuela) | Anticorrupción | `EscuelaFalsa` | **Real**: `EscuelaFacade` (aulas, asignaciones, RN-17) |
| `BusEventos` + Outbox | Interna | `BusEspia` | **Real**: `admin.outbox_evento` |
| Reloj y generador de ids | Inyectados | Controlables (abandono a los 7 días) | Reales (UUID v7) |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Quedaba el andamiaje de ejemplo del módulo (`POST /lectura/demo`) y un escenario k6 (`tests/load/scenarios/lectura.js`) que lo llamaba | Auditoría del módulo | Eliminados; el escenario nuevo `lectura-respuestas.js` mide la lectura real |
| D-2 | En la lectura, cada oración salía en una caja con una palabra por línea: la clase `.oracion` ya la usaba el editor de oraciones del Módulo 3 | 3 · capturas de Playwright | Las clases de la lectura pasan a `lectura-oracion`; el editor del Módulo 3 no cambia |
| D-3 | El tipo web de "Misión del docente" no tenía `contenidoId`, aunque la API ya lo enviaba | Estático · `tsc` | Se agregó al tipo; el niño abre la lectura asignada desde su inicio |
| D-4 | El doble del repositorio dejaba crear dos sesiones si llegaban dos pedidos a la vez (comprobaba y escribía con un `await` en medio) | 1 · Vitest | Comprueba y escribe sin ceder el turno, como el índice único parcial de la base |
| D-5 | La prueba de arrastrar fallaba solo en el celular: la última tarjeta quedaba bajo la barra inferior | 3 · Playwright (celular) | La prueba desplaza la lista a la vista antes de arrastrar, como haría el niño; la pantalla no cambió |
| D-6 | La prueba de biblioteca del Módulo 3 esperaba el aviso "¡Muy pronto podrás responder sus actividades…!" | 3 · `biblioteca.spec.ts` | Cambio esperado: ahora hay un botón "¡Leer ahora!"; la prueba lo verifica |
| D-7 | Una prueba de integración leía el mensaje de error en `message`, pero la API responde Problem Details (`detail`) | 2 · Supertest | Se lee `detail` |

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-038 | Predicción antes del texto | Portada con título e imagen; el texto no llega hasta registrar la predicción (escrita, dictada o elegida) | U + I + S + UAT |
| B-2 | RF-039 | Preguntas en las oraciones de anclaje | El servidor envía el texto solo hasta la oración de anclaje; no se responde otra pregunta | U + I + S |
| B-3 | RF-040 | Corrección en el servidor | Selección única y **múltiple** (también en el editor del Módulo 3); la clave nunca sale; p95 67 ms | U + I + S + carga |
| B-4 | RF-041 | Escritura libre con filtro | Hasta 500 caracteres, mínimo de palabras del autor y filtro de palabras no apropiadas | U + I + S |
| B-5 | RF-042 | Ordenar imágenes o secuencias | Arrastrar con dedo o ratón (Pointer Events) y botones Subir/Bajar; orden mostrado mezclado | U + I + S |
| B-6 | RF-043 | Encuentra la evidencia | Las oraciones del texto se tocan; correcta con ≥ 1 de la clave y ≤ 1 ajena (UAT-03) | U + I + S + UAT |
| B-7 | RF-044 | Defiende tu respuesta | Paso obligatorio del guion, asociado a la respuesta original | U + I + S |
| B-8 | RF-045, RN-06 | Pistas progresivas | P1 → P2 → P3 → explicación; también a pedido; párrafo resaltado (UAT-02, UAT-03) | U + I + S + UAT |
| B-9 | RN-07 | Puntaje del ítem | 1 · 0,75 · 0,5 · 0,25 · 0 guardado en la respuesta y publicado en `ItemRespondido` | U + I + S + UAT |
| B-10 | RF-046 | Guardado y reanudación | Cada acción se guarda; al volver sigue igual; envío idempotente | U + I + S |
| B-11 | RF-047 | Cierre | Predicción frente al desenlace (o el final elegido) y reflexión | U + I + S + UAT |
| B-12 | RF-048 | Historias ramificadas | Decisiones registradas en `decision_ruta`; definen el nodo siguiente | U + I + S |
| B-13 | RF-049 | Responder por voz | Dictado del navegador; el niño confirma el texto; el audio no se envía | S |
| B-14 | RF-050 | Lectura en voz alta (R1) | Oración por oración con resaltado sincronizado; Despacio 0,75×, Normal, Rápido 1,25× | S |
| B-15 | RF-051, RN-19 | Revisión docente | Respuestas abiertas del aula con rúbrica de 3 niveles; evento para Progreso | U + I + S + UAT |
| B-16 | RF-032, RF-018 | La lectura no se podía abrir | Enlaces desde las misiones del mapa, la biblioteca y la misión del docente; Aventura recibe el avance | I + S + UAT |

**Decisiones de diseño (el SRS no decía cómo):**
- **Guion:** predicción (la primera actividad PREDICCION o, si no hay, "Mira el título y la imagen…") → lo "antes" sin texto → lo "durante" en el orden de sus oraciones de anclaje → la historia ramificada → lo "después" → el cierre.
- **Pistas:** llegan solas con cada error y también se pueden pedir; con menos de 3 pistas escritas, la explicación llega antes. El párrafo se resalta desde P1 en la evidencia (UAT-03) y desde P2 en las demás (RN-06).
- **Idempotencia:** cada envío lleva su clave; repetir el mismo envío devuelve el mismo resultado.
- **Ordenar:** la lista se mezcla de forma estable por sesión e ítem y nunca viene ya ordenada; el niño responde con posiciones, así la página no revela el orden.
- **Defensa:** se asocia a la pregunta anterior que no es una defensa.
- **Abiertas:** quedan ENVIADA; al terminar la lectura pasan a revisión si el niño tiene docente (RN-19).
- **Abandono:** se aplica al volver a la sesión (7 días sin actividad); entonces se puede empezar otra.
- **Voz en el navegador:** el resaltado por oración (RF-050) se logra con síntesis de voz frase por frase; un audio grabado no trae los tiempos de cada oración. Por eso no se agregó `GET /lecturas/{versionId}/audio`.
- **Versiones en memoria:** una versión publicada no cambia (RN-14); se guarda en memoria para corregir rápido.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Dictado sin navegador compatible | Algunos navegadores no reconocen voz | Respaldo en servidor (SRS V1.1, Sprint 13) sin guardar audio; hoy se escribe |
| Puntos, rachas e insignias (RN-11, UAT-02, UAT-03) | El niño aún no ve puntos | Módulo 8 con los eventos `ItemRespondido` y `SesionLecturaFinalizada` — ✅ resuelto: UAT-02 y UAT-03 verifican ahora los 6 puntos y el avance de "Detective de Evidencias" |
| Maestría (RF-053) | El puntaje del ítem se guarda pero aún no mueve el perfil | Módulo 7 con `ItemRespondido` y `RespuestaAbiertaValorada` |
| Caché de versiones por instancia | Con varias instancias cada una tiene su copia (no hay riesgo: no cambian) | Redis compartido cuando se escale horizontalmente |
| Dos toques simultáneos en una misma pregunta | La página deshabilita los botones mientras envía | Bloqueo optimista por versión de la respuesta si hiciera falta |
| Heredadas | Outbox no transaccional; límite de tasa en memoria | Ver informes de los Módulos 1 a 5 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Lectura usa Contenido, IAM y Escuela solo por su `public-api` | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Guion, corrección, filtro, pistas, agregado `SesionLectura` y casos de uso con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real + lectura publicada por el flujo real + eventos en el outbox | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 (voz simulada con `addInitScript`) | Microsoft Edge (local) / Chromium (CI) | La lectura completa en la web real y la rúbrica docente | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/lectura-respuestas.js`) | Binario k6 | RF-040 al corregir y RF-046 al reanudar | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios Gherkin en español, incluidos UAT-02 y UAT-03 del SRS | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/lectura/
│   │   ├── dobles.ts                                  # Repositorio en memoria y lectura de ejemplo
│   │   ├── dominio/dominio-lectura.spec.ts
│   │   └── aplicacion/lectura-casos-de-uso.spec.ts
│   └── integration/lectura/lectura-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/lectura.ts                         # Lectura de ejemplo, lectura por la API y voz simulada
│   │   ├── specs/lectura/lectura.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts            # + la lectura y la revisión docente
│   │   ├── features/lectura/lectura.feature
│   │   └── steps/lectura.steps.ts
│   └── load/
│       ├── sembrar-lectura.mjs                        # Publica la lectura de ejemplo
│       └── scenarios/lectura-respuestas.js            # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Guion:** la predicción va primero; antes → durante (por oración de anclaje) → después; numeración; qué pregunta defiende cada defensa; consigna general sin ítem de predicción; párrafo de cada pista (RN-06); desenlace.
- **Corrección:** selección única y múltiple, ordenar con la lista mezclada (estable y nunca ordenada), evidencia (UAT-03: ≥ 1 de la clave y ≤ 1 ajena), escritura (500 letras, mínimo de palabras, filtro) y dictado.
- **Filtro de palabras:** tildes, mayúsculas, letras repetidas, plurales y sustituciones; no toca "la zorra", "la perra" ni "una concha".
- **Puntaje (RN-07)** y rúbrica (RF-051).
- **Agregado `SesionLectura`:** predicción obligatoria y única; texto hasta el anclaje; no saltar preguntas; P1 → P2 → P3 → explicación sin revelar la respuesta; 0,75 tras una pista; reenvío idempotente; pedir pistas; defensa obligatoria y asociada; cierre con reflexión; abiertas a revisión con docente (y sin docente, enviadas); valoración única; historia ramificada; abandono a los 7 días; cambios para el repositorio.
- **Casos de uso:** iniciar sin texto y con evento para Aventura; reanudar; claves ocultas; `ItemRespondido` solo al cerrar una pregunta y no al reenviar; pedir pista; cierre con evento y repetición; edad y asignación; sesiones ajenas; versión archivada; abandono; pedidos simultáneos; decisión en la historia; revisión docente con RN-17.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/lectura/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación de Lectura (entre 97,7 % y 100 % de líneas por archivo).

## 4.4 Código completo del test unitario
`apps/api/test/unit/lectura/dominio/dominio-lectura.spec.ts`:

<<archivo:apps/api/test/unit/lectura/dominio/dominio-lectura.spec.ts>>

`apps/api/test/unit/lectura/aplicacion/lectura-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/lectura/aplicacion/lectura-casos-de-uso.spec.ts>>

`apps/api/test/unit/lectura/dobles.ts`:

<<archivo:apps/api/test/unit/lectura/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **Una lectura publicada por el flujo real** (editora → revisora) con una actividad de cada tipo, selección múltiple y una historia ramificada.
- **RF-038, RF-039:** empieza sin texto; no se responde antes de predecir (409); al predecir llega el texto hasta el anclaje; la predicción no se cambia.
- **RF-040, RF-045, RF-046:** P1 sin la clave en el JSON; reenviar con la misma clave no suma pistas; acertar guarda 0,75 (RN-07) y publica `ItemRespondido`.
- **RF-043, RF-048, RF-042, RF-041, RF-044:** evidencia (también una oración aún no leída, 400); decisión en la historia (`decision_ruta`); ordenar; selección múltiple; escritura de 501 letras (400), con pocas palabras (400) y con el filtro en la base; defensa en `justificacion`.
- **RF-047:** cierre con el final elegido; reflexión vacía (400); resumen; respuesta abierta a revisión; `SesionLecturaFinalizada`; avance para Aventura; no se responde después (409).
- **RF-046, RF-027:** se publica una versión nueva y la sesión de Lía sigue con la suya; RF-050 marcado para 6–7 años.
- **Acceso:** edad distinta (404), asignación de la docente (se guarda), sesión ajena (404), formato (400), rol (403) y sin sesión (401).
- **RF-051:** la docente ve la respuesta con su defensa; nivel inválido (400); valora (puntaje 1,00, evento); no se valora dos veces (409); otra docente no ve el aula (404) ni valora (404); el niño no accede (403).

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/lectura/lectura-http.int-spec.ts`:

<<archivo:apps/api/test/integration/lectura/lectura-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **La lectura completa en la web real:** desde su biblioteca, predice, lee hasta el anclaje, falla y recibe P1, acierta, toca la evidencia, cierra la página y vuelve donde quedó, elige el río, ordena con los botones, marca varias opciones, escribe (con el filtro), defiende lo escrito, contrasta su predicción con el final y termina.
- **RF-045:** tras P1, P2 y P3 ve "Mira por qué" con la explicación y puede seguir (puntaje 0).
- **RF-042:** ordenar arrastrando las tarjetas.
- **RF-049, RF-050:** con 6 años, dicta su predicción (la revisa antes de enviarla) y escucha la lectura despacio, con la oración resaltada.
- **RF-018, RF-051:** abre la lectura desde la misión de su docente; la docente la valora con la rúbrica.
- **Diseño responsivo (RNF-022, RNF-023):** la lectura y la revisión en 1280, 820 y 390 px, sin desbordes y con objetivos de 48 px (cada oración de la evidencia también).

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI); la voz del navegador se simula en la prueba · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:lectura --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción (`api-compilada` y `web-compilada` de `.claude/launch.json`), como en CI.

**Resultado de carga obtenido el 22/10/2026** (un aula de 40 niños de 9 años lee "Killa y la llama" completa, de a 10 en paralelo, con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /api/v1/sesiones-lectura/{id}/respuestas` (corregir y dar la pista) | 280 | 0,00 % | 55 ms | 67 ms | 77 ms | p95 < 300 ms (RF-040, RNF-002) | ✅ |
| `GET /api/v1/sesiones-lectura/{id}` (reanudar) | 360 | 0,00 % | 20 ms | 26 ms | 31 ms | p95 < 300 ms (RF-046) | ✅ |
| `POST /api/v1/sesiones-lectura` (abrir la lectura) | 40 | 0,00 % | 60 ms | 252 ms | 276 ms | sin meta en el SRS | ✅ |
| `PUT /api/v1/sesiones-lectura/{id}/prediccion` | 40 | 0,00 % | 33 ms | 49 ms | 52 ms | sin meta en el SRS | ✅ |
| `POST /api/v1/sesiones-lectura/{id}/decisiones` | 40 | 0,00 % | 43 ms | 50 ms | 52 ms | sin meta en el SRS | ✅ |
| `POST /api/v1/sesiones-lectura/{id}/finalizar` | 40 | 0,00 % | 70 ms | 84 ms | 91 ms | sin meta en el SRS | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/lectura/lectura.spec.ts`:

<<archivo:tests/e2e/specs/lectura/lectura.spec.ts>>

`tests/e2e/support/lectura.ts`:

<<archivo:tests/e2e/support/lectura.ts>>

`tests/load/scenarios/lectura-respuestas.js`:

<<archivo:tests/load/scenarios/lectura-respuestas.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/lectura/lectura.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/lectura.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Abrir una lectura desde la biblioteca, una misión o la misión del docente | Primero pide la predicción; el texto aún no se ve |
| ☐ | Responder mal una pregunta "durante" | Aparece la pista 1, nunca la respuesta; con P2 se resalta el párrafo |
| ☐ | Equivocarse tras las 3 pistas | "Mira por qué" con la explicación y "Seguir" |
| ☐ | "Encuentra la evidencia" | Las oraciones se tocan; elegir la de la clave da "¡Muy bien!" |
| ☐ | Cerrar el navegador a mitad de la lectura y volver | Sigue en la misma pregunta |
| ☐ | Historia ramificada | La elección cambia el final que se ve en el cierre |
| ☐ | Ordenar en una tablet, arrastrando con el dedo | Las tarjetas se mueven; también con Subir y Bajar |
| ☐ | Escribir una palabra no apropiada | Se reemplaza por *** y se avisa |
| ☐ | Con un niño de 6–7 años, "Escuchar la lectura" (Despacio, Normal, Rápido) | Se oye oración por oración y se resalta la que suena |
| ☐ | "Decirlo con mi voz" | El texto dictado aparece para revisarlo antes de enviarlo |
| ☐ | Cierre | Muestra "Lo que pensaste" y "Lo que pasó" y pide la reflexión |
| ☐ | Como docente, "Respuestas por revisar" en el aula | Se valora con la rúbrica de 3 niveles y pasa a "Valoradas" |
| ☐ | Revisar todo en celular, tablet y computadora | Botones grandes, texto legible, sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `lectura.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo lectura`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `lectura.respuesta` (pistas y puntajes) y los eventos `lectura.*` del outbox.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga de la lectura:

```yaml
          LECTURA_ID=$(node tests/load/sembrar-lectura.mjs)
          k6 run -e LECTURA_ID="$LECTURA_ID" tests/load/scenarios/lectura-respuestas.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LEC-U-01 | Guion (RF-038, RF-039, RF-044, RF-047) | Unit | Borde | Orden de pasos, defensa asociada, consigna general, párrafo de la pista, desenlace | `npm run test:unit` |
| LEC-U-02 | Corrección (RF-040 a RF-043) | Unit | Pos./Neg. | Única, múltiple, ordenar mezclado, evidencia (UAT-03), escritura y dictado | `npm run test:unit` |
| LEC-U-03 | Filtro de palabras (RF-041) | Unit | Borde | Variantes filtradas; palabras de los cuentos intactas | `npm run test:unit` |
| LEC-U-04 | Puntaje (RN-07) y rúbrica (RF-051) | Unit | Borde | 1 · 0,75 · 0,5 · 0,25 · 0; 0,33 · 0,67 · 1 | `npm run test:unit` |
| LEC-U-05 | Pistas (RF-045, RN-06, UAT-02) | Unit | Pos./Neg. | P1 → P2 → P3 → explicación; a pedido; sin la respuesta | `npm run test:unit` |
| LEC-U-06 | Agregado `SesionLectura` (RF-046 a RF-048) | Unit | Pos./Neg. | Idempotencia, defensa, cierre, historia, abandono, valoración única | `npm run test:unit` |
| LEC-U-07 | `SesionesUseCase` y `RevisionUseCase` (RN-17) | Unit | Pos./Neg. | Eventos, acceso por edad y asignación, simultáneos, revisión docente | `npm run test:unit` |
| LEC-I-01 | Predicción y anclaje (RF-038, RF-039) | Int | Pos./Neg. | Sin texto antes; 409 fuera de orden | `npm run test:int` |
| LEC-I-02 | Corrección, pistas e idempotencia (RF-040, RF-045, RF-046) | Int | Positivo | Sin clave; 0,75; `ItemRespondido` | `npm run test:int` |
| LEC-I-03 | Evidencia, historia, ordenar, múltiple, escritura, defensa | Int | Pos./Neg. | 400 y 409 en los casos inválidos | `npm run test:int` |
| LEC-I-04 | Cierre (RF-047) | Int | Positivo | Resumen; a revisión; evento; avance para Aventura | `npm run test:int` |
| LEC-I-05 | Versión nueva y reanudación (RF-027, RF-046) | Int | Positivo | Misma sesión y misma versión | `npm run test:int` |
| LEC-I-06 | Acceso y validación | Int | Negativo | 404, 400, 403, 401 | `npm run test:int` |
| LEC-I-07 | Revisión docente (RF-051, RN-17) | Int | Pos./Neg. | Valoración única; 404 y 403 | `npm run test:int` |
| LEC-S-01 | Lectura completa en la web (RF-038 a RF-048) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| LEC-S-02 | Explicación tras las pistas (RF-045) | Sys | Negativo | "Mira por qué" y "Seguir" | `npm run test:e2e` |
| LEC-S-03 | Ordenar arrastrando (RF-042) | Sys | Positivo | Las tarjetas quedan en orden | `npm run test:e2e` |
| LEC-S-04 | Voz (RF-049, RF-050) | Sys | Positivo | Dictado revisable; lectura despacio con resaltado | `npm run test:e2e` |
| LEC-S-05 | Misión del docente y rúbrica (RF-018, RF-051) | Sys | Positivo | "Nivel 3: Logrado" | `npm run test:e2e` |
| LEC-S-06 | Diseño responsivo (RNF-022, RNF-023) | Sys | Borde | Sin desbordes; objetivos de 48 px | `npm run test:e2e` |
| LEC-S-07 | Carga RF-040 / RF-046 | Sys | Rendimiento | Ver §6.3 | `npm run test:lectura --workspace @lectoaventura/tests-load` |
| LEC-A-01..05 | 5 escenarios Gherkin (UAT-02, UAT-03 ×2, RF-047, RF-051) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — reglas puras (guion, corrección, pistas, filtro) y casos de uso con puertos; reloj e ids inyectados.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de Lectura entre 97,7 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — Contenido, IAM y Escuela por anticorrupción; Aventura, Progreso y Gamificación por eventos.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; humo de carga de la lectura en CI.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — reenvíos, pedidos simultáneos, saltos de pregunta, versiones nuevas, abandono y accesos ajenos cubiertos; pendiente el dictado en servidor (V1.1).

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
