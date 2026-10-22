# Plan Maestro de Pruebas — Módulo 5: Diagnóstico (Reto inicial y reevaluación)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/diagnostico` + reto del estudiante y reto de repaso en el panel docente
> **Requisitos cubiertos:** RF-034 a RF-037, RN-05, RN-07 (puntaje ponderado), RN-08 (nivel declarado), RF-033 (posición inicial con el diagnóstico real), RN-17, RNF-001, RNF-002, RNF-019, RNF-022, RNF-023 y el evento `DiagnosticoFinalizado` del SAD §6
> **Fecha de ejecución:** 21/10/2026 · **Resultado global:** ✅ 577 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 4 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 5 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 336 | 23 | ✅ 336/336 · cobertura 97,0 % líneas / 93,5 % ramas | 28 s |
| 2 · Integración (Supertest + PostgreSQL real) | 104 | 10 | ✅ 104/104 | 181 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 105 | 9 | ✅ 105/105 en una sola corrida completa contra la compilación de producción | 13,9 min |
| 3 · Carga (RNF-001, RNF-002) | 4 mediciones | 4 | ✅ 0 % errores · respuesta p95 71 ms (RNF-002) · siguiente pregunta p95 43 ms | 6 s |
| 4 · Aceptación (Gherkin en español) | 32 escenarios | 4 | ✅ 32/32 · informe para el Product Owner | 5,0 min |

**Defectos encontrados por las pruebas y corregidos:** 9 · **Brechas con el SRS cerradas:** 8 · **Decisiones documentadas donde el SRS no decía cómo:** 6 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `diagnostico` (3 tablas, SRS §7) · migración `20261022000000_banco_diagnostico` con el banco inicial |
| Contenido | Banco de 80 ítems en [`apps/api/prisma/semillas/banco-diagnostico.json`](../../apps/api/prisma/semillas/banco-diagnostico.json), borrador para el líder pedagógico |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  DiagnosticosController (/diagnosticos/*; ESTUDIANTE) · ReevaluacionesController
           (/aulas/{id}/reevaluaciones; DOCENTE) · DTO de entrada
   │  usa CasosUsoDiagnostico (token CASOS_USO_DIAGNOSTICO)
   ▼
application RetoUseCase (actual, comenzar o reanudar, siguiente, responder, pausar, finalizar, resultado)
           ReevaluacionesUseCase (asignar al aula, resumen con cambios por habilidad)
   │  puertos: DiagnosticoRepository, BancoItems, IdentidadEstudiantes (IAM), AulasDocente (Escuela), BusEventos
   ▼
domain     Diagnostico (NO_INICIADO → EN_CURSO ⇄ PAUSADO → FINALIZADO) · ItemDiagnostico
           · cálculo del nivel (RN-07, RN-08) · plan (15 o 10 ítems, forma A/B) · errores · eventos

infrastructure PrismaDiagnosticoRepository · PrismaBancoItems (en memoria por edad y forma)
               IdentidadEstudiantesIam · AulasDocenteEscuela · DiagnosticoInicialRegistro (shared-kernel)

Otros módulos (solo por su public-api o por el shared-kernel):
  IAM ─────────── alias, avatar y rango de edad del estudiante (IamFacade)
  Escuela ─────── el aula del docente y sus estudiantes (EscuelaFacade, RN-17)
  Aventura ────── consulta DIAGNOSTICO_INICIAL (RN-05) y escucha diagnostico.DiagnosticoFinalizado (RF-033)
  Progreso ────── (Módulo 7) partirá del valor inicial por habilidad que publica el evento
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `DiagnosticoRepository` | Interna (puerto) | `DiagnosticosEnMemoria` (`test/unit/diagnostico/dobles.ts`): las mismas restricciones únicas que la base | **Real**: Prisma + PostgreSQL |
| `BancoItems` | Interna (puerto) | `BancoFalso` con la estructura del real (una pregunta por habilidad, dificultad creciente) | **Real**: el banco que carga la migración |
| `IdentidadEstudiantes` (IAM) | Anticorrupción | `IdentidadFalsa` | **Real**: `IamFacade` |
| `AulasDocente` (Escuela) | Anticorrupción | `AulasFalsas` | **Real**: `EscuelaFacade` |
| `BusEventos` + Outbox | Interna | `BusEspia` | **Real**: `admin.outbox_evento` y la suscripción real de Aventura |
| Reloj y generador de ids | Inyectados | Controlables | Reales (UUID v7) |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Quedaba el andamiaje de ejemplo del módulo, con `POST /diagnostico/demo` que devolvía lo recibido | Auditoría del módulo | Eliminado; una prueba de integración confirma el 404 |
| D-2 | Con RN-05 activo, las pruebas E2E, UAT y de carga del Módulo 4 daban por hecho un mapa abierto para niños nuevos | Análisis del impacto | Ayudante `retoTerminado` (reto por la API) en las pruebas que necesitan el mapa |
| D-3 | La pregunta recibía el foco pero tenía `aria-hidden` (un lector de pantalla quedaba en un elemento oculto) | Revisión de accesibilidad | El grupo de opciones se nombra con el propio enunciado, que es visible y enfocable |
| D-4 | La sección "Reto de repaso" no tenía nombre accesible (las tarjetas del design system no lo ponen) | 3 · Playwright | `aria-labelledby` con su título |
| D-5 | Una expectativa unitaria esperaba el motivo equivocado al omitir a un niño que aún no termina su reto inicial | 1 · Vitest | Se corrigió la expectativa: primero se informa "Aún no termina su reto inicial" |
| D-6 | Un archivo que solo declara un tipo aparecía con 0 % de cobertura | 1 · cobertura | Excluido, como los demás contratos |
| D-7 | El escenario de carga hacía entrar a 40 niños desde una sola tablet en segundos: el límite de 30 ingresos por minuto por tablet (RNF-019) rechazó a 10 y sus retos fallaron | 3 · sondeo de carga | La API se comportó como debía; el escenario ahora usa una tablet cada 20 niños, como un aula real. 0 % de errores |
| D-8 | La prueba esperaba que cambiara el texto de la pregunta, pero tras la última aparece el resultado y la pregunta deja de existir | 3 y 4 · Playwright | Se espera a que ya no haya un título con esa pregunta (otra pregunta o el resultado) |
| D-9 | La prueba de archivar del Módulo 2 buscaba el texto exacto "Ana", que ahora también aparece en la sección del reto de repaso | 3 · `modo-escuela.spec.ts` | Se busca a Ana en la lista de estudiantes del aula; la pantalla del Módulo 2 no cambió |

**Observación (no es defecto):** en desarrollo, el modo estricto de React pide dos veces `POST /diagnosticos` al abrir el reto; ambas respuestas devuelven el mismo reto. Es justo el caso de "dos pedidos simultáneos" que prueban los niveles 1 y 2 (restricción única por estudiante, tipo y secuencia, y un solo reto sin terminar).

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-034 | Reto inicial adaptado a la edad | 15 ítems (R1: 10), 3 (o 2) por habilidad, sobre lecturas breves; una pregunta a la vez y sin decir si acertó | U + I + S + UAT + carga |
| B-2 | RF-035 | Nivel inicial por habilidad | Valor 0–100 ponderado por dificultad y nivel CNEB inicial; vista infantil con estrellas | U + I + S + UAT |
| B-3 | RF-036 | Pausar y reanudar | Estado PAUSADO; al volver sigue en la pregunta siguiente a la última respondida | U + I + S + UAT |
| B-4 | RF-037 | Reevaluación periódica del docente | `POST /aulas/{id}/reevaluaciones`, forma equivalente y comparación por habilidad en el panel del aula | U + I + S + UAT |
| B-5 | RN-05 | El mapa no esperaba al diagnóstico | Diagnóstico registra `DIAGNOSTICO_INICIAL`: sin reto terminado, el mapa sigue cerrado | I + S + UAT |
| B-6 | RF-033 | Posición inicial con un diagnóstico real | `diagnostico.DiagnosticoFinalizado` con la maestría por habilidad; Aventura ubica al niño (UAT-01) | I + S + UAT |
| B-7 | SRS Sprint 0 | No había banco de ítems | Banco inicial de 80 ítems (formas A y B) para validación del líder pedagógico | I |
| B-8 | RN-17 | — | La docente solo reevalúa estudiantes de sus aulas activas | U + I |

**Decisiones de diseño (el SRS no decía cómo):**
- **Formato:** preguntas de opción (3 para 6–7 años, 4 para 8–12) sobre lecturas cortas; cinco preguntas por lectura, una por habilidad.
- **Sin retroalimentación de acierto:** es un reto para conocer al niño, no un examen.
- **Orden fijo:** se responde la pregunta que sigue; así reanudar es exacto y no se puede saltar ni repetir.
- **Puntaje:** 1 o 0 por ítem (no hay pistas en el reto), ponderado por dificultad y promediado (RN-07). RN-08 deja el "nivel declarado" en null: el reto tiene 2 o 3 ítems por habilidad.
- **Formas A/B:** el inicial usa la A; las reevaluaciones alternan B, A, B…
- **Quien ya tenía mapa** antes del Módulo 5 lo conserva y ve su reto inicial como pendiente.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Validación pedagógica del banco | El banco es un borrador | Revisión del líder pedagógico (Sprint 0 del SRS); cambiar el JSON y regenerar la migración |
| Selección adaptativa | El orden es fijo (reglas) | Modelo adaptativo (IRT/BKT) cuando haya ≥ 500 000 respuestas (SRS V2.0) |
| Perfil lector | El valor inicial solo vive en el resultado del diagnóstico | El Módulo 7 lo tomará del evento para inicializar la maestría |
| Audio de las preguntas para 6–7 años | Los más pequeños leen solos | Lectura en voz alta (texto a voz) cuando llegue el Módulo 6 |
| Heredadas | Outbox no transaccional; límite de tasa en memoria; secreto MFA sin cifrar | Ver informes de los Módulos 1 a 4 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Diagnóstico usa IAM y Escuela solo por su `public-api` | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Cálculo del nivel, agregado `Diagnostico`, reto y reevaluación con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real + banco de la migración + posición en Aventura por el evento real | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | El niño hace el reto en la web real; la docente asigna el de repaso | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/diagnostico-reto.js`) | Binario k6 | RNF-002 al responder y RNF-001 al pedir la pregunta | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 4 escenarios Gherkin en español, incluido el UAT-01 del SRS | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/
│   ├── prisma/semillas/banco-diagnostico.json        # Banco inicial (fuente para el líder pedagógico)
│   ├── prisma/semillas/generar-banco-diagnostico.mjs # Genera la migración del banco
│   └── test/
│       ├── unit/diagnostico/
│       │   ├── dobles.ts
│       │   ├── dominio/dominio-diagnostico.spec.ts
│       │   └── aplicacion/diagnostico-casos-de-uso.spec.ts
│       └── integration/diagnostico/diagnostico-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/diagnostico.ts                    # Reto por la API y claves del banco
│   │   ├── specs/diagnostico/reto.spec.ts
│   │   ├── features/diagnostico/diagnostico.feature
│   │   └── steps/diagnostico.steps.ts
│   └── load/scenarios/diagnostico-reto.js            # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Plan y cálculo:** 15/10 ítems por edad, formas A/B alternadas, factor de dificultad (RN-07), valor 0–100 acotado y redondeado, nivel CNEB inicial y nivel declarado solo con 5 ítems (RN-08).
- **Agregado `Diagnostico`:** responder solo la pregunta que sigue, con una opción válida y una sola vez; pausar y reanudar sin perder respuestas (RF-036); finalizar solo completo (RF-035); no retomar uno terminado; banco incompleto detectado; reevaluación con forma B.
- **Reto:** consultar sin crear, empezar una sola vez (también con dos pedidos simultáneos), pregunta sin habilidad ni respuesta, pausa y reanudación, finalización con el evento para Aventura, el inicial no se repite, retos ajenos ocultos.
- **Reevaluación:** a quién se asigna y por qué se omite a los demás, forma equivalente, comparación por habilidad, segunda reevaluación con la forma A, RN-17.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/diagnostico/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación del Diagnóstico (entre 98,8 % y 100 % de líneas por archivo).

## 4.4 Código completo del test unitario
`apps/api/test/unit/diagnostico/dominio/dominio-diagnostico.spec.ts`:

<<archivo:apps/api/test/unit/diagnostico/dominio/dominio-diagnostico.spec.ts>>

`apps/api/test/unit/diagnostico/aplicacion/diagnostico-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/diagnostico/aplicacion/diagnostico-casos-de-uso.spec.ts>>

`apps/api/test/unit/diagnostico/dobles.ts`:

<<archivo:apps/api/test/unit/diagnostico/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **RN-05:** sin reto inicial el mapa no se abre ni se crea progreso; el reto pendiente se consulta sin crear nada.
- **El reto con el banco real:** 15 preguntas de su edad, en orden, sin respuesta correcta en el JSON; validaciones (pregunta fuera de orden 409, opción inexistente 400, id inválido 400); el reto de otro niño responde 404.
- **RF-036:** pausa con 6 respuestas guardadas en la base; responder pausado da 409; al volver sigue en la 7.
- **Segunda barrera:** el índice parcial impide dos retos sin terminar.
- **RF-035 y RF-033 (UAT-01):** finalizar guarda el resultado y publica `diagnostico.DiagnosticoFinalizado`; Aventura ubica a Mateo en el Detective con el Explorador completado, y a Lía (6 años, 10 preguntas) en el Explorador.
- **RF-037:** la docente asigna (otra docente 404, el niño 403, ids inválidos 400), se omite a quien ya tiene un reto pendiente, la reevaluación usa la forma B y el resumen compara por habilidad; el mapa no cambia.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución; el banco se conserva como catálogo) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/diagnostico/diagnostico-http.int-spec.ts`:

<<archivo:apps/api/test/integration/diagnostico/diagnostico-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **El niño en la web real:** el inicio le muestra su reto y el mapa cerrado (RN-05); responde con la lectura a la vista, pausa, vuelve en la pregunta 5, termina, ve sus estrellas por habilidad y su mapa lo ubica en el Detective con el Explorador completado.
- **RN-05 desde el mapa:** ningún mundo se abre y "Ir a mi reto" lleva a la primera pregunta.
- **RF-037:** la docente asigna el reto de repaso desde su aula, el niño lo ve en su inicio y, al terminarlo, la docente ve "Literal +100".
- **Diseño responsivo (RNF-022, RNF-023)** en 1280, 820 y 390 px (pantallas incluidas en las pruebas de los módulos anteriores).

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:diagnostico --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción (`api-compilada` y `web-compilada` de `.claude/launch.json`), como en CI.

**Resultado de carga obtenido el 21/10/2026** (un aula de 40 niños de 9 años hace el reto completo, de a 10 en paralelo, con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /api/v1/diagnosticos/{id}/respuestas` (guardar y corregir) | 600 | 0,00 % | 54 ms | 71 ms | 80 ms | p95 < 300 ms (RNF-002) | ✅ |
| `GET /api/v1/diagnosticos/{id}/siguiente-item` | 640 | 0,00 % | 31 ms | 43 ms | 53 ms | p95 < 300 ms, p99 < 800 ms (RNF-001) | ✅ |
| `POST /api/v1/diagnosticos` (empezar el reto) | 40 | 0,00 % | 98 ms | 149 ms | 232 ms | sin meta en el SRS | ✅ |
| `POST /api/v1/diagnosticos/{id}/finalizar` (nivel + posición en el mapa) | 40 | 0,00 % | 105 ms | 150 ms | 152 ms | sin meta en el SRS | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/diagnostico/reto.spec.ts`:

<<archivo:tests/e2e/specs/diagnostico/reto.spec.ts>>

`tests/e2e/support/diagnostico.ts`:

<<archivo:tests/e2e/support/diagnostico.ts>>

`tests/load/scenarios/diagnostico-reto.js`:

<<archivo:tests/load/scenarios/diagnostico-reto.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/diagnostico/diagnostico.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/diagnostico.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Revisar `banco-diagnostico.json` (lecturas, preguntas, dificultades y respuestas) | Aprobado por el líder pedagógico, o con los cambios anotados |
| ☐ | Entrar como un niño nuevo de 9 años | El inicio muestra "¡Tu reto inicial te espera!" y el mapa dice "Primero, tu reto inicial" |
| ☐ | Responder algunas preguntas y pulsar "Pausar y seguir después" | El inicio dice en qué pregunta va; al continuar, sigue ahí |
| ☐ | Terminar el reto | "¡Reto completado!" con estrellas por habilidad, sin notas ni aciertos |
| ☐ | Abrir el mapa | Empieza en el Explorador, o en el Detective si acertó en literal y vocabulario |
| ☐ | Como docente, "Asignar reto de repaso a toda el aula" | Se asigna a quienes terminaron su reto inicial y explica a quién no |
| ☐ | Al terminar el repaso | La docente ve los cambios por habilidad |
| ☐ | Revisar todo en celular, tablet y computadora | Botones grandes, texto legible, sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `diagnostico.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo diagnostico`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `diagnostico.diagnostico.resultado` y los eventos `diagnostico.*` del outbox.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga del reto (y el escenario del mapa ahora hace antes el reto de cada niño):

```yaml
          k6 run tests/load/scenarios/diagnostico-reto.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DIA-U-01 | Plan y formas (RF-034, RF-037) | Unit | Borde | 15/10 ítems; A, luego B, A, B… | `npm run test:unit` |
| DIA-U-02 | Cálculo del nivel (RF-035, RN-07, RN-08) | Unit | Borde | Ponderado por dificultad, acotado, redondeado; nivel declarado con ≥ 5 ítems | `npm run test:unit` |
| DIA-U-03 | Responder en orden | Unit | Negativo | Fuera de orden, opción inválida o repetida rechazadas | `npm run test:unit` |
| DIA-U-04 | Pausar y reanudar (RF-036) | Unit | Positivo | Sigue en la pregunta siguiente sin perder respuestas | `npm run test:unit` |
| DIA-U-05 | Finalizar (RF-035) | Unit | Pos./Neg. | Solo completo; resultado por habilidad; no se retoma | `npm run test:unit` |
| DIA-U-06 | `RetoUseCase` (RN-05) | Unit | Pos./Neg. | Consulta sin crear; una sola vez; simultáneos; evento para Aventura; ajenos ocultos | `npm run test:unit` |
| DIA-U-07 | `ReevaluacionesUseCase` (RF-037, RN-17) | Unit | Pos./Neg. | Asigna a quien terminó; omite con motivo; compara por habilidad | `npm run test:unit` |
| DIA-I-01 | RN-05 en el mapa | Int | Negativo | Sin reto, mapa cerrado y sin progreso | `npm run test:int` |
| DIA-I-02 | Reto con el banco real (RF-034) | Int | Pos./Neg. | En orden, sin respuesta correcta; 409, 400, 404 | `npm run test:int` |
| DIA-I-03 | Pausa (RF-036) | Int | Positivo | 6 respuestas en la base; sigue en la 7 | `npm run test:int` |
| DIA-I-04 | Índice parcial | Int | Negativo | Dos retos sin terminar rechazados | `npm run test:int` |
| DIA-I-05 | Finalizar → Aventura (RF-035, RF-033, UAT-01) | Int | Positivo | Detective con Explorador completado; Lía en el Explorador | `npm run test:int` |
| DIA-I-06 | Reevaluación (RF-037) | Int | Pos./Neg. | Forma B; comparación; 404, 403, 400 | `npm run test:int` |
| DIA-S-01 | Reto completo en la web (RF-034 a RF-036, RF-033) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| DIA-S-02 | RN-05 desde el mapa | Sys | Negativo | Ningún mundo abierto; "Ir a mi reto" | `npm run test:e2e` |
| DIA-S-03 | Reto de repaso (RF-037) | Sys | Positivo | "Literal +100" en el panel | `npm run test:e2e` |
| DIA-S-04 | Carga RNF-001 / RNF-002 | Sys | Rendimiento | Ver §6.3 | `npm run test:diagnostico --workspace @lectoaventura/tests-load` |
| DIA-A-01..04 | 4 escenarios Gherkin (UAT-01, RN-05, RF-036, RF-037) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — reglas puras (cálculo y transiciones) y casos de uso con puertos; banco y reloj inyectados.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación del Diagnóstico entre 98,8 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — IAM y Escuela por anticorrupción; Aventura se entera por el shared-kernel y el evento.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; humo de carga del reto en CI.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — orden estricto, doble toque, pedidos simultáneos, banco incompleto y retos ajenos cubiertos; pendiente la validación pedagógica del banco.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner y del líder pedagógico (banco)
