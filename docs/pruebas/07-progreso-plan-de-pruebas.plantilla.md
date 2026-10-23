# Plan Maestro de Pruebas — Módulo 7: Perfil lector y recomendaciones

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/progreso` + la sección "Progreso" del estudiante (`/estudiante/progreso`)
> **Requisitos cubiertos:** RF-052 a RF-055, RN-07 (maestría), RN-08 (nivel declarado), RN-19 (abiertas valoradas), RN-20 (recomendaciones), RN-09 (desbloqueo con la maestría real), RF-028 (biblioteca a su nivel), UAT-01 del SRS completo, RNF-001, RNF-002, RNF-019, RNF-022, RNF-023 y los eventos `DiagnosticoFinalizado`, `ItemRespondido`, `RespuestaAbiertaValorada`, `MaestriaActualizada` y `MaestriaNivelSubido` del SAD §6
> **Fecha de ejecución:** 22/10/2026 · **Resultado global:** ✅ 706 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 6 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 7 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 401 | 26 | ✅ 401/401 · cobertura 97,5 % líneas / 92,9 % ramas | 46 s |
| 2 · Integración (Supertest + PostgreSQL real) | 132 | 12 | ✅ 132/132 | 133 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 132 | 9 | ✅ 132/132 en una sola corrida completa contra la compilación de producción | 19,5 min |
| 3 · Carga (RF-040, RNF-001, RNF-002) | 8 mediciones | 2 | ✅ 0 % errores · corrección (con la maestría) p95 154 ms · perfil p95 46 ms · recomendaciones p95 124 ms | 6 s |
| 4 · Aceptación (Gherkin en español) | 41 escenarios | 4 | ✅ 41/41 · informe para el Product Owner | 7,7 min |

**Defectos encontrados por las pruebas y corregidos:** 7 · **Brechas con el SRS cerradas:** 10 · **Decisiones documentadas donde el SRS no decía cómo:** 9 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `progreso` (3 tablas, SRS §7) · migración `20261024000000_progreso_perfil_lector` |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  PerfilLectorController (/yo/perfil-lector, /yo/recomendaciones; ESTUDIANTE)
   │  usa CasosUsoProgreso (token CASOS_USO_PROGRESO)
   ▼
application PerfilLectorUseCase (perfil, maestría para Aventura, nivel para la biblioteca; reacciona al
           reto inicial, a cada ítem y a cada valoración) · RecomendacionesUseCase (RN-20)
   │  puertos: PerfilRepository, RecomendacionRepository, IdentidadEstudiantes (IAM),
   │           AsignacionesEstudiante (Escuela) + del shared-kernel: DIAGNOSTICO_INICIAL,
   │           FICHAS_LECTURA, AVANCE_LECTURAS, MISION_EN_CURSO (nuevo), BusEventos
   ▼
domain     PerfilLector (5 maestrías en [0, 100], versión por habilidad) · maestría (RN-07, RF-054,
           nivel de lectura) · recomendador (RN-20) · eventos · errores

infrastructure PrismaPerfilRepository · PrismaRecomendacionRepository · IdentidadEstudiantesIam ·
               AsignacionesEscuela · IntegracionProgreso (suscripciones y registros del shared-kernel)

Otros módulos (solo por su public-api, el shared-kernel o eventos):
  Diagnóstico ─── DiagnosticoFinalizado (ahora con los ítems por habilidad) inicializa el perfil
  Lectura ─────── ItemRespondido (ahora con el id de la respuesta) y RespuestaAbiertaValorada
  Aventura ────── consulta MAESTRIA_LECTOR (RN-09) y registra MISION_EN_CURSO (nuevo)
  Contenido ───── consulta NIVEL_LECTOR (RF-028); sus fichas incluyen ahora las habilidades
  Escuela ─────── las asignaciones en curso (EscuelaFacade, RF-018)
  Gamificación ── (Módulo 8) otorgará los +50 con MaestriaNivelSubido
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `PerfilRepository` | Interna (puerto) | `PerfilesEnMemoria` (`test/unit/progreso/dobles.ts`): versión por habilidad, perfil creado una vez, un origen por habilidad | **Real**: Prisma + PostgreSQL |
| `RecomendacionRepository` | Interna (puerto) | `RecomendacionesEnMemoria` | **Real** |
| Diagnóstico, fichas, avance, misión en curso | shared-kernel | Dobles | **Reales**: Diagnóstico, Contenido, Lectura y Aventura registrados |
| `IdentidadEstudiantes` (IAM) · `AsignacionesEstudiante` (Escuela) | Anticorrupción | Dobles | **Reales**: `IamFacade`, `EscuelaFacade` |
| `BusEventos` + Outbox | Interna | `BusEspia` | **Real**: eventos reales de Diagnóstico y Lectura |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Quedaba el andamiaje de ejemplo del módulo (`POST /progreso/demo`) | Auditoría del módulo | Eliminado |
| D-2 | Un niño con valor del reto inicial pero sin ítems registrados (datos anteriores) perdía ese valor con su primera respuesta: el primer ítem "tomaba su valor tal cual" | 1 · Vitest | El primer ítem solo reemplaza si no hay nada medido (ni ítems ni valor); si no, promedia (EMA) |
| D-3 | Una asignación cuya lectura ya se archivó ocupaba un lugar entre las 3 recomendaciones y luego no se mostraba | 1 · Vitest | Se descarta antes de elegir |
| D-4 | La prueba E2E del perfil chocó con el límite de 10 ingresos por minuto por IP (RNF-019): publicaba 3 lecturas con cuentas nuevas y pedía otra sesión docente por lectura | 3 · Playwright | La API se comportó como debía; los ayudantes reutilizan la editora, el revisor y la sesión del niño |
| D-5 | La prueba de integración esperaba que Lía (6 años) no tuviera recomendaciones, pero la docente asignó una lectura a toda el aula | 2 · Supertest | El comportamiento es el correcto (RN-20: la asignación tiene prioridad aunque sea de otra edad); se corrigió la expectativa |
| D-6 | En la habilidad "¡A practicar!" las etiquetas amarillas no se distinguían del fondo amarillo, y "Lees en el nivel N" ocupaba todo el ancho | 3 · capturas de Playwright | Etiquetas con fondo blanco en esa tarjeta; la píldora del nivel se ajusta a su texto |
| D-7 | La prueba responsiva del Módulo 1 esperaba "Progreso" con candado | 3 · `responsivo.spec.ts` | Cambio esperado: ahora es una sección real; el candado se verifica en "Mi perfil" |

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-052 | Perfil lector del niño | Sección "Progreso": 5 habilidades en su lenguaje con barra y etiqueta (En inicio, En proceso, Logrado, Destacado) | U + I + S + UAT |
| B-2 | RN-08 | Nivel declarado | "Aún descubriendo" con menos de 5 ítems | U + I + S + UAT |
| B-3 | RF-053, RN-07 | Maestría por ítem | EMA α = 0,3 del puntaje ponderado por dificultad, con cada ítem cerrado y en el mismo pedido de la respuesta | U + I + S + UAT + carga |
| B-4 | RN-19 | Abiertas en ARG/CRI | Cuentan al ser valoradas por la docente (RF-051) | U + I |
| B-5 | RF-054 | Habilidades a reforzar | Menos de 40 con al menos 5 ítems: "¡A practicar!" | U + I + S + UAT |
| B-6 | RF-055, RN-20 | Recomendaciones | Entre 1 y 3: asignación docente, misión en curso y habilidad más débil a su nivel; refuerzo si no hay nada más | U + I + S + UAT |
| B-7 | SAD §6 | Perfil desde el diagnóstico | `DiagnosticoFinalizado` inicializa el perfil; los niños de antes lo obtienen de su reto al abrirlo | U + I |
| B-8 | RN-09 (Módulo 4) | El mapa no avanzaba solo | La maestría real llega a Aventura: con 3 lecturas el niño abre el mundo Investigador | I + UAT |
| B-9 | RF-028 (Módulo 3) | La biblioteca partía del nivel típico de la edad | Usa el nivel de lectura del perfil (± 1) | I |
| B-10 | UAT-01 del SRS | "su perfil lector muestra el nivel de cada una de las 5 habilidades" | Escenario Gherkin con el perfil real | UAT |

**Decisiones de diseño (el SRS no decía cómo):**
- **Inicio del promedio:** con nada medido, el primer ítem toma su valor; con valor del reto inicial, promedia (EMA) desde ahí.
- **"En la misma transacción que la respuesta" (RF-053):** se aplica en el mismo pedido, por el evento `ItemRespondido` del outbox, así cada módulo guarda en su schema (SAD §6). Si fallara, el evento se reintenta.
- **Idempotencia:** el historial guarda el origen (reto, respuesta o valoración); cada uno mueve cada habilidad una sola vez.
- **Bloqueo optimista:** si dos cambios llegan a la vez, el segundo se recalcula (hasta 3 veces).
- **Nivel de lectura:** el típico de la edad (R1 1, R2 2, R3 3) ajustado por la maestría promedio con la escala CNEB (−1, 0, +1, +2), entre 1 y 5.
- **Habilidad más débil:** la de menor maestría; a igualdad, la menos practicada.
- **Recomendaciones:** se calculan al pedirlas y se guardan solo si cambian; la asignación más próxima a vencer va primero (también de otra edad); nunca se repite una lectura ni se recomienda una ya terminada.
- **Reevaluaciones (RF-037):** se comparan con el reto inicial, pero no cambian la maestría.
- **Releer:** una lectura repetida también cuenta para la maestría (es práctica); los puntos menores de RN-12 son de Gamificación.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Perfil para la docente y la familia | Hoy solo lo ve el niño | Paneles docente y familiar (RF-063, RF-064, RF-068) con una fachada de Progreso |
| +50 por subir de nivel (RN-11) | El evento ya se publica, nadie lo escucha | Gamificación (Módulo 8) — ✅ resuelto: +50 la primera vez que cada habilidad llega a cada nivel |
| Tiempo de respuesta al corregir | Subió de 67 a 154 ms (p95) por calcular la maestría y el desbloqueo en el mismo pedido | Dentro de la meta (300 ms); si hiciera falta, evaluar el desbloqueo de Aventura fuera del pedido |
| Heredadas | Outbox no transaccional; límite de tasa en memoria | Ver informes de los Módulos 1 a 6 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Progreso usa IAM y Escuela por su `public-api` y el resto por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Maestría, perfil, recomendador y casos de uso con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | Reto, lectura y valoración reales moviendo la maestría; Aventura y biblioteca | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | El perfil y las recomendaciones en la web real | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/lectura-respuestas.js`, ampliado) | Binario k6 | Corrección con la maestría, perfil y recomendaciones | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 4 escenarios Gherkin, incluido el final del UAT-01 del SRS y el desbloqueo real | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/progreso/
│   │   ├── dobles.ts
│   │   ├── dominio/dominio-progreso.spec.ts
│   │   └── aplicacion/progreso-casos-de-uso.spec.ts
│   └── integration/progreso/progreso-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/progreso.ts                        # Maestría e historial en la base
│   │   ├── support/lectura.ts                         # + publicadores y sesión del niño reutilizables
│   │   ├── specs/progreso/perfil.spec.ts
│   │   ├── features/progreso/progreso.feature
│   │   └── steps/progreso.steps.ts
│   └── load/scenarios/lectura-respuestas.js           # + perfil y recomendaciones
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Maestría:** factor de dificultad, puntaje observado acotado, EMA (también desde el valor del reto inicial), "a reforzar" y nivel de lectura por edad y maestría.
- **PerfilLector:** 5 habilidades en 0; el reto inicial una sola vez; cada ítem mueve su habilidad y suma un ítem; nivel declarado con 5 ítems y "subida" de nivel; habilidades a reforzar; la más débil; versiones.
- **Recomendador:** asignación → misión → habilidad débil; cercanía al nivel; sin repetir ni lo ya leído; asignación de misión; máximo 3; refuerzo; ninguna sin lecturas.
- **Casos de uso:** perfil desde el reto inicial (y no desde la reevaluación); idempotencia; abiertas solo valoradas; perfil de niños anteriores al módulo; evento de subida de nivel; reintento por bloqueo optimista; maestría y nivel para Aventura y la biblioteca; vista del perfil; recomendaciones guardadas solo si cambian.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/progreso/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación de Progreso (entre 98,6 % y 100 % de líneas por archivo).

## 4.4 Código completo del test unitario
`apps/api/test/unit/progreso/dominio/dominio-progreso.spec.ts`:

<<archivo:apps/api/test/unit/progreso/dominio/dominio-progreso.spec.ts>>

`apps/api/test/unit/progreso/aplicacion/progreso-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/progreso/aplicacion/progreso-casos-de-uso.spec.ts>>

`apps/api/test/unit/progreso/dobles.ts`:

<<archivo:apps/api/test/unit/progreso/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **Sin reto:** todo por descubrir y nada guardado.
- **SAD §6:** el reto inicial real crea las 5 maestrías con su valor e ítems, el historial y `PerfilLectorIniciado`.
- **RF-053:** en una lectura real, el error con pista no mueve la maestría; al acertar, sube con RN-07; reintentar el mismo `ItemRespondido` no cuenta doble; la respuesta abierta no cuenta hasta valorarse.
- **RN-19:** la valoración docente mueve ARG.
- **RN-08:** con 4 ítems aún "Aún descubriendo"; su nivel de lectura.
- **RF-028 y RN-09:** la biblioteca muestra su nivel ± 1 y el mapa la maestría real de las habilidades foco.
- **RF-055:** recomendaciones; con asignación y misión en el orden de RN-20; guardadas como vigentes y sin reescribirse si no cambian; la asignación al aula llega también a Lía; acceso solo del estudiante (403, 401).

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/progreso/progreso-http.int-spec.ts`:

<<archivo:apps/api/test/integration/progreso/progreso-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **El perfil en la web real:** tras su reto y dos lecturas (fallando las inferencias), ve sus 5 habilidades en su lenguaje: "Destacado", "En proceso", "Aún descubriendo" y "Descubrir lo que no se dice" en inicio con "¡A practicar!"; su nivel de lectura y una lectura para practicar, que se abre.
- **RN-20:** lo que dejó su profe va primero y se abre con la asignación.
- **Sin reto:** todo por descubrir.
- **Diseño responsivo (RNF-022, RNF-023):** la sección "Progreso" en 1280, 820 y 390 px, sin desbordes y con objetivos de 48 px.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:lectura --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción (`api-compilada` y `web-compilada` de `.claude/launch.json`), como en CI.

**Resultado de carga obtenido el 22/10/2026** (un aula de 40 niños de 9 años lee "Killa y la llama" completa, de a 10 en paralelo, y al final abre su perfil y sus recomendaciones; mismo perfil que el script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /api/v1/sesiones-lectura/{id}/respuestas` (corregir + maestría + desbloqueo) | 280 | 0,00 % | 116 ms | 154 ms | 184 ms | p95 < 300 ms (RF-040, RNF-002) | ✅ |
| `GET /api/v1/yo/perfil-lector` | 40 | 0,00 % | 31 ms | 46 ms | 49 ms | p95 < 300 ms (RNF-001) | ✅ |
| `GET /api/v1/yo/recomendaciones` | 40 | 0,00 % | 93 ms | 124 ms | 132 ms | p95 < 300 ms (RNF-001) | ✅ |
| `GET /api/v1/sesiones-lectura/{id}` | 360 | 0,00 % | 24 ms | 33 ms | 43 ms | p95 < 300 ms (RF-046) | ✅ |
| `POST /api/v1/sesiones-lectura/{id}/finalizar` | 40 | 0,00 % | 102 ms | 127 ms | 135 ms | sin meta en el SRS | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/progreso/perfil.spec.ts`:

<<archivo:tests/e2e/specs/progreso/perfil.spec.ts>>

`tests/e2e/support/progreso.ts`:

<<archivo:tests/e2e/support/progreso.ts>>

`tests/load/scenarios/lectura-respuestas.js`:

<<archivo:tests/load/scenarios/lectura-respuestas.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/progreso/progreso.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/progreso.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como niño nuevo, abrir "Progreso" antes del reto | Las 5 habilidades "Aún descubriendo" |
| ☐ | Hacer el reto inicial y volver a "Progreso" | Las barras muestran lo que ya sabe; con menos de 5 preguntas, "Aún descubriendo" |
| ☐ | Leer y responder (bien, con pistas y mal) | Cada habilidad sube o baja poco a poco |
| ☐ | Equivocarse varias veces en la misma habilidad | Aparece "¡A practicar!" y una lectura "Para practicar" |
| ☐ | Como docente, asignar una lectura | En "Tus próximas lecturas" del niño aparece primero como "Misión de tu profe" |
| ☐ | Terminar 3 misiones del mundo con buenas inferencias | Se abre el mundo siguiente con su celebración |
| ☐ | Revisar las etiquetas y las frases con el líder pedagógico | Lenguaje adecuado para 6–12 años |
| ☐ | Revisar en celular, tablet y computadora | Botones grandes, texto legible, sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `progreso.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo progreso`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `progreso.historial_maestria` y los eventos `progreso.*` del outbox.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. El escenario k6 de la lectura ahora mide también el perfil y las recomendaciones (mismo paso de CI).

**Cambio en el paso de carga:** tras el merge del Módulo 6, la ejecución de `main` falló en ese paso (k6 salió con código 99: algún umbral no se cumplió), aunque el mismo código había pasado en el PR. Los registros de GitHub piden iniciar sesión, así que no se veía cuál. Ahora cada escenario corre con `--summary-export` y [`tests/load/anotar-resumen.mjs`](../../tests/load/anotar-resumen.mjs) publica sus tiempos (p95 y p99 de cada métrica con umbral) como anotación de la ejecución; si uno falla, los demás igual corren y el paso falla al final indicando cuáles:

```yaml
          escenario() {
            nombre="$1"; shift
            k6 run --summary-trend-stats "avg,med,p(95),p(99),max" --summary-export "k6-$nombre.json" "$@" || fallidos="$fallidos $nombre"
            node tests/load/anotar-resumen.mjs "k6-$nombre.json" "$nombre"
          }
```

**Resultado en GitHub tras el cambio** (PR #9 y `main`, 22/10/2026): todos los umbrales con mucho margen; por ejemplo, corregir una respuesta (con la maestría) p95 66–76 ms frente a 300 ms, y el perfil p95 21–22 ms. La falla anterior de `main` no fue de tiempos (ninguno se acerca a su umbral): una petición con error, que no volvió a repetirse; si ocurre otra vez, la anotación dirá cuál.

**Compilación:** la otra falla de `main` (tras el Módulo 5) fue al compilar la web, que descarga las fuentes de Google (`next/font`). Ahora, si esa compilación falla, se reintenta una vez; un error de código falla igual las dos veces.

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| PRO-U-01 | Maestría (RN-07, RF-054, nivel de lectura) | Unit | Borde | Factor, acotado, EMA, refuerzo, nivel 1–5 | `npm run test:unit` |
| PRO-U-02 | PerfilLector (RF-052, RF-053, RN-08) | Unit | Pos./Neg. | Reto una vez, ítems, nivel declarado, subida, la más débil | `npm run test:unit` |
| PRO-U-03 | Recomendador (RF-055, RN-20) | Unit | Pos./Neg. | Orden, cercanía, sin repetir, máximo 3, refuerzo | `npm run test:unit` |
| PRO-U-04 | `PerfilLectorUseCase` | Unit | Pos./Neg. | Idempotencia, RN-19, niños anteriores, reintentos, Aventura y biblioteca | `npm run test:unit` |
| PRO-U-05 | `RecomendacionesUseCase` | Unit | Pos./Neg. | Títulos, vigentes, cambios, archivadas | `npm run test:unit` |
| PRO-I-01 | Reto inicial → perfil (SAD §6) | Int | Positivo | 5 maestrías e historial | `npm run test:int` |
| PRO-I-02 | Lectura → maestría (RF-053) | Int | Pos./Neg. | RN-07; sin doble conteo; abiertas esperan | `npm run test:int` |
| PRO-I-03 | Valoración → ARG (RN-19) | Int | Positivo | Sube con la rúbrica | `npm run test:int` |
| PRO-I-04 | Biblioteca y mapa (RF-028, RN-09) | Int | Positivo | Nivel ± 1; maestría real | `npm run test:int` |
| PRO-I-05 | Recomendaciones (RF-055) | Int | Pos./Neg. | Orden RN-20; vigentes; 403/401 | `npm run test:int` |
| PRO-S-01 | Perfil en la web (RF-052 a RF-055) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| PRO-S-02 | Asignación primero (RN-20) | Sys | Positivo | "Misión de tu profe" | `npm run test:e2e` |
| PRO-S-03 | Sin reto | Sys | Borde | Todo por descubrir | `npm run test:e2e` |
| PRO-S-04 | Carga | Sys | Rendimiento | Ver §6.3 | `npm run test:lectura --workspace @lectoaventura/tests-load` |
| PRO-A-01..04 | 4 escenarios Gherkin (UAT-01, RF-053, RN-09, RN-20) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 10/10 — reglas puras (maestría y recomendador) y casos de uso con puertos; todo lo externo por el shared-kernel.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de Progreso entre 98,6 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — sin dependencias directas con Diagnóstico, Lectura, Aventura ni Contenido: eventos y puertos.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; perfil y recomendaciones en el humo de carga.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — eventos repetidos, cambios simultáneos, niños sin reto o anteriores al módulo, lecturas archivadas y edades distintas cubiertos.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner y del líder pedagógico (etiquetas)
