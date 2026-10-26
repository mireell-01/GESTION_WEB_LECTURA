# Plan Maestro de Pruebas — Módulo 9: Seguimiento docente

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/reporting` + el "Seguimiento del aula" de la docente (`/docente/aulas/{id}/seguimiento`) y el detalle de cada estudiante (`/docente/aulas/{id}/estudiantes/{estudianteId}`)
> **Requisitos cubiertos:** RF-063 a RF-067, RN-08 (nivel declarado), RN-17 (aislamiento por docente), UAT-04 del SRS, RNF-003 (panel de 40 estudiantes en p95 < 1,5 s), RNF-012, RNF-022 y RNF-023, y la lectura agregada por el schema `reporting` refrescada cada 5 minutos (SAD §5, SRS §7)
> **Fecha de ejecución:** 26/10/2026 · **Resultado global:** ✅ 823 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 8 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 9 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 460 | 22 | ✅ 460/460 · cobertura 97,8 % líneas / 93,2 % ramas | 40 s |
| 2 · Integración (Supertest + PostgreSQL real) | 166 | 14 | ✅ 166/166 | 153 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 146 | 8 | ✅ 146/146 en una sola corrida completa contra la compilación de producción (+ 4 omitidas a propósito: los tamaños de laptop solo corren en computadora) | 17,9 min |
| 3 · Carga (RNF-003, RF-064, RF-067) | 4 mediciones | 4 | ✅ 0 % errores en 4.282 peticiones · panel p95 232 ms · detalle p95 181 ms · reporte ≤ 0,8 s | 60 s |
| 4 · Aceptación (Gherkin en español) | 51 escenarios | 5 | ✅ 51/51 · informe para el Product Owner | 6,6 min |

**Defectos encontrados por las pruebas y corregidos:** 9 · **Brechas con el SRS cerradas:** 12 · **Decisiones documentadas donde el SRS no decía cómo:** 11 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `reporting`: 2 tablas nuevas, 4 vistas materializadas (2 nuevas) y 2 vistas · migración `20261026000000_reporting_seguimiento_docente` |
| PDF | `pdf-lib` (ya instalada: la usan la exportación de datos del Módulo 1 y las tarjetas de acceso del Módulo 2) |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  SeguimientoDocenteController (/aulas/{id}/panel, /aulas/{id}/estudiantes/{estudianteId}/detalle,
           /aulas/{id}/reporte?formato=pdf|csv; DOCENTE)
   │  usa CasosUsoReporting (token CASOS_USO_REPORTING)
   ▼
application PanelAulaUseCase (mapa de calor, grupo, alertas, resumen de la semana y refuerzos) ·
           DetalleEstudianteUseCase (habilidades, tasa sin pista y últimas 20 sesiones) ·
           ReporteAulaUseCase (CSV y PDF) · ResumenSemanalUseCase (correo del lunes)
   │  puertos: ReportesRepository, AulasDocente (Escuela), IdentidadEstudiantes y NotificadorDocente (IAM),
   │           GeneradorReportePdf + del shared-kernel: FICHAS_LECTURA, HISTORIAL_LECTURA (nuevo)
   ▼
domain     mapa de calor (nivel declarado, RN-08) · riesgo (7 días o ≥ 2 habilidades en C) · refuerzo
           grupal (≥ 30 %) · resumen semanal y semanas de Lima · tasa sin pista · reporte CSV seguro

infrastructure PrismaReportesRepository (solo el schema `reporting`) · anticorrupción con Escuela e IAM ·
               PdfLibReporte (A4 apaisado) · TrabajosReporting (refresco cada 5 minutos y resumen semanal)

Otros módulos (solo por su public-api, el shared-kernel o vistas de `reporting`):
  Escuela ─────── el aula y su docente (EscuelaFacade); la asignación del refuerzo usa su API existente
  IAM ─────────── alias, avatar y edad; el correo del resumen (IamFacade.notificarCuenta, nuevo)
  Lectura ─────── registra HISTORIAL_LECTURA: cada respuesta legible con sus pistas y evidencias
  Contenido ───── FICHAS_LECTURA (la lectura sugerida del refuerzo)
  Progreso ────── su maestría llega por la vista `mv_maestria_estudiante`
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `ReportesRepository` | Interna (puerto) | `ReportesEnMemoria` (`test/unit/reporting/dobles.ts`): maestrías, matrículas, actividad y un resumen por docente y semana | **Real**: Prisma + vistas del schema `reporting` refrescadas en la prueba |
| `AulasDocente`, `IdentidadEstudiantes`, `NotificadorDocente` | Anticorrupción | Dobles (`AulasFalsas`, `IdentidadFalsa`, `CorreoFalso`) | **Reales**: `EscuelaFacade` e `IamFacade` con la bandeja de correos de desarrollo |
| Fichas e historial de lectura | shared-kernel | `FichasFalsas`, `HistorialFalso` | **Reales**: Contenido y Lectura registrados |
| `GeneradorReportePdf` | Interna | `PdfFalso` | **Real**: `pdf-lib` |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Las páginas del área del estudiante quedaban cargadas a la izquierda en laptops, con un gran espacio vacío a la derecha; el letrero de la barra lateral se cortaba abajo | Revisión del Product Owner en su laptop + 3 · auditoría de 31 pantallas en 5 tamaños de laptop | El contenido se centra con un ancho máximo de 1180 px; las rejillas se reparten con `auto-fit`; el letrero tiene su margen y su dibujo completo (el suelo quedaba fuera del `viewBox`) |
| D-2 | En la pantalla del reto, la lectura y la pregunta iban una debajo de otra y el niño debía desplazarse; en laptops sobraba espacio | Revisión del Product Owner | Desde 1000 px de contenido, la lectura a la izquierda y la pregunta a la derecha, con las opciones una debajo de otra; en tablet y celular, una columna |
| D-3 | La lectura interactiva desperdiciaba el ancho igual que el reto; en el cierre quedaba un hueco entre el texto y "Tu camino en la historia" | Revisión visual de 44 pantallas en 1366 × 768 | El texto (y la historia) a la izquierda y la pregunta, la explicación o el cierre a la derecha, fijos al desplazar; en el cierre, las tarjetas de la izquierda llegan al alto de la actividad |
| D-4 | En "Mis hijos", la tarjeta de cada hijo era angosta y sus 5 acciones quedaban apiladas, aunque había espacio | Revisión del Product Owner | La rejilla de tarjetas usa todo el ancho (`auto-fit`): con un hijo, una tarjeta ancha con las acciones en una fila |
| D-5 | "Dar consentimiento" y "Configurar verificación en dos pasos" cruzaban toda la tarjeta, a diferencia de los demás botones | Revisión visual | En el área de adultos, un botón suelto tiene su ancho natural; los de bloque siguen a todo el ancho |
| D-6 | Los 5 filtros de la biblioteca (docente y familia) se partían en 4 + 1 | Revisión visual | Cada filtro mide desde 140 px: los 5 caben en una fila desde 1280 px |
| D-7 | Otros detalles en laptops: el saludo del inicio quedaba aplastado junto al marcador; los mundos que se abren cortaban su texto en 5 columnas; los avatares del ingreso quedaban a la izquierda; la predicción dejaba una columna vacía junto a la mascota | Revisión visual | El marcador va bajo el saludo; los mundos van en vertical; los avatares se centran; la mascota ocupa solo su ancho |
| D-8 | Una docente que abría el seguimiento de un aula ajena veía el texto técnico «Aula no encontrado» | 4 · UAT (RN-17) | La pantalla dice «No encontramos esta aula entre las tuyas.» (y en el detalle, «No encontramos a este estudiante en tus aulas.») |
| D-9 | Si el correo del resumen semanal de una docente fallaba, ese resumen se perdía y las demás docentes esperaban al siguiente ciclo | Revisión del código al documentar | Se libera su registro para reintentarlo en 5 minutos y se sigue con las demás |

Todos los ajustes de diseño son de CSS (`apps/web/src/app/globals.css`), con *container queries* del área del estudiante: no cambian la identidad visual ni el comportamiento en tablet y celular. La prueba responsiva ahora recorre el área del estudiante en 6 tamaños de laptop (1280 × 720 a 1920 × 1080, una ventana baja y el zoom al 80 %) y los paneles de adultos en 4.

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-063 | Panel de aula | Mapa de calor estudiantes × habilidades con el nivel CNEB declarado (RN-08), la última actividad y las lecturas de la semana; filtros por habilidad y nivel, ordenado de menor a mayor | U + I + S + UAT + carga |
| B-2 | RF-063 | Desempeño grupal por habilidad | Promedio y distribución por nivel de cada habilidad (`mv_desempeno_aula`) | U + I + S |
| B-3 | RF-064 | Detalle individual | Sus 5 habilidades con la tasa de acierto sin pista y sus últimas 20 sesiones | U + I + S + UAT + carga |
| B-4 | RF-064 | Evidencias seleccionadas y pistas usadas | Cada respuesta legible (opción, orden, oraciones o texto), si fue correcta y las pistas P1–P3 o la explicación que usó | U + I + S + UAT |
| B-5 | RF-065 | Alertas | 7 días sin actividad o ≥ 2 habilidades en nivel C, visibles en el panel con su motivo | U + I + S + UAT |
| B-6 | RF-065 | Resumen semanal | Correo del lunes (desde las 07:00 de Lima) a cada docente con sus aulas, alertas y refuerzos | U + I |
| B-7 | RF-066 | Refuerzo grupal | Habilidades en inicio para ≥ 30 % del aula, con la lectura sugerida | U + I + S + UAT |
| B-8 | RF-066 | "Asignable con un clic" | Un botón crea la asignación de Escuela solo para esos estudiantes | S + UAT |
| B-9 | RF-067 | Exportación | CSV (Excel en español) y PDF A4 del aula; 40 estudiantes en menos de 1 s | U + I + S + UAT + carga |
| B-10 | RNF-003 | p95 < 1,5 s con 40 estudiantes | Lectura de vistas materializadas: p95 de 232 ms con 10 docentes a la vez | I + UAT + carga |
| B-11 | UAT-04 del SRS | Escenario completo | 30 estudiantes, 12 con INF en C: filtro, orden y detalle con evidencias y pistas | UAT |
| B-12 | SRS §7 / SAD §5 | "Vistas refrescadas cada 5 minutos" | *Worker* de reportes con candado (`pg_try_advisory_xact_lock`) y la hora del último refresco en el panel | I |

**Decisiones de diseño (el SRS no decía cómo):**
- **Fuente de datos:** el panel lee solo el schema `reporting` (SAD §5). La maestría y la actividad llegan por vistas materializadas; la matrícula, por una vista simple, así un estudiante recién matriculado aparece al instante (sin datos hasta el próximo refresco).
- **Nivel del mapa de calor:** el nivel declarado (RN-08, ≥ 5 ítems); con menos, la celda dice "Aún descubriendo" con su valor, como el perfil del niño.
- **Riesgo por inactividad:** cuenta desde la última lectura o respuesta del reto; quien nunca empezó cuenta desde su matrícula (un aula recién creada no aparece entera en riesgo).
- **Refuerzo grupal:** se sugiere la lectura publicada más sencilla de la edad de esos estudiantes que trabaja la habilidad; asignarla crea una asignación con fecha límite a 7 días solo para ellos.
- **Detalle:** Reporting no lee las tablas de Lectura. Lectura entrega el historial por el puerto `HISTORIAL_LECTURA` del shared-kernel, con cada respuesta ya legible (en ordenar, el orden tal como el niño lo vio).
- **Tasa sin pista:** sobre las preguntas cerradas respondidas; las abiertas no cuentan (se valoran con rúbrica).
- **Reporte:** se genera al pedirlo y no se guarda (`Cache-Control: no-store`); nombre `reporte-<aula>-<fecha de Lima>`. El CSV va en UTF-8 con BOM y CRLF, y neutraliza las celdas que empiezan con `=`, `+`, `-` o `@` (inyección de fórmulas).
- **Resumen semanal:** una vez por docente y semana (`resumen_semanal_enviado`); el correo lo envía IAM, así Reporting nunca ve direcciones de correo. Solo a cuentas activas.
- **Aula ajena (RN-17):** el panel, el detalle y el reporte responden 404, como si no existiera.
- **Refresco:** cada 5 minutos dentro de la API (15 s después de arrancar); apagado en las pruebas (`NODE_ENV=test`) y desactivable con `REPORTES_TRABAJOS=off`.
- **Dispositivos:** el mapa de calor se desplaza dentro de su tabla en tablet y celular; nunca la página.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Datos con hasta 5 minutos de retraso | Una lectura recién terminada tarda en verse en el panel | Es lo que pide el SRS; el panel muestra "Datos actualizados a las …" |
| *Worker* dentro de la API | Con varias instancias, todas intentan refrescar | El candado evita refrescos simultáneos; un planificador externo cuando haya varias instancias |
| Resumen semanal en texto | Sin formato HTML ni gráficos | Plantilla HTML cuando el correo transaccional tenga un diseño común |
| Panel de la familia (RF-068 a RF-072) | Hoy solo la docente ve el seguimiento | Módulo 10 sobre las mismas vistas |
| Heredadas | Outbox no transaccional; límite de tasa en memoria | Ver informes de los Módulos 1 a 8 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Reporting usa Escuela e IAM por su `public-api` y Lectura y Contenido por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Mapa de calor, riesgo, refuerzo, semanas, tasa, CSV y casos de uso con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | Vistas reales, lecturas reales, PDF, correos y aislamiento | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Panel, filtros, refuerzo, detalle, descargas y diseño en laptops | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/seguimiento-panel.js`, nuevo) | Binario k6 | Panel, detalle y reportes con un aula de 40 | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | UAT-04 del SRS y 4 escenarios más | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/reporting/
│   │   ├── dobles.ts
│   │   ├── dominio/dominio-reporting.spec.ts
│   │   └── aplicacion/reporting-casos-de-uso.spec.ts
│   ├── unit/lectura/                                  # + historial de lectura (RF-064)
│   └── integration/reporting/seguimiento-docente-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/seguimiento.ts                     # Maestría, inactividad y refresco de vistas
│   │   ├── support/limpieza.ts                        # + resúmenes semanales de docentes de prueba
│   │   ├── specs/seguimiento/panel.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts            # + seguimiento y laptops (estudiante y adultos)
│   │   ├── features/seguimiento/seguimiento.feature
│   │   └── steps/seguimiento.steps.ts
│   └── load/
│       ├── sembrar-seguimiento.mjs                    # Aula de 40 con su maestría
│       └── scenarios/seguimiento-panel.js
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Mapa de calor (RF-063, RN-08):** 5 celdas en el orden del SRS con su nivel declarado; sin medir, sin datos.
- **Riesgo (RF-065):** 7 días sin actividad o 2 habilidades en inicio; quien nunca empezó cuenta desde su matrícula.
- **Refuerzo grupal (RF-066):** habilidades en inicio para el 30 % o más, de la más extendida a la menos.
- **Resumen semanal (RF-065):** activos de la semana, semanas de Lima y el envío desde el lunes a las 07:00.
- **Tasa sin pista (RF-064):** sobre las cerradas; las abiertas no cuentan.
- **CSV (RF-067):** BOM, una fila por estudiante, fórmulas neutralizadas y comillas.
- **Casos de uso:** panel completo, refuerzo sin lectura disponible, aula ajena (404), aula vacía, detalle con 20 sesiones, estudiante de otra aula, reporte CSV y PDF, formato desconocido, resumen una vez por semana, antes de las 07:00, correo que falla (las demás lo reciben y se reintenta) y aula que ya no existe.
- **Lectura (RF-064):** el historial con la respuesta legible de cada modalidad y sus pistas.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/reporting/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación de Reporting (100 % de líneas en cada archivo; entre 82 % y 100 % de ramas).

## 4.4 Código completo del test unitario
`apps/api/test/unit/reporting/dominio/dominio-reporting.spec.ts`:

<<archivo:apps/api/test/unit/reporting/dominio/dominio-reporting.spec.ts>>

`apps/api/test/unit/reporting/aplicacion/reporting-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/reporting/aplicacion/reporting-casos-de-uso.spec.ts>>

`apps/api/test/unit/reporting/dobles.ts`:

<<archivo:apps/api/test/unit/reporting/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **RF-063:** el mapa de calor con el nivel declarado, calculado desde la base real.
- **RF-065:** alerta por 2 habilidades en inicio; quien nunca empezó cuenta desde su matrícula; con 9 días sin leer aparece con sus días; el resumen de la semana sale de `mv_actividad_semanal`.
- **RF-066:** refuerzo para INF (40 % del aula) con una lectura, asignable.
- **Vistas:** al refrescarse aparece un estudiante nuevo.
- **RF-064:** sus últimas sesiones con lo que respondió, las evidencias que eligió y las pistas que usó (lectura real).
- **RN-17:** el estudiante de otra aula y el aula de otra docente responden 404; solo la docente del aula ve su panel (401, 403).
- **RF-067:** CSV listo para Excel y PDF A4; un formato desconocido se rechaza.
- **Resumen semanal:** desde el lunes a las 07:00 de Lima, una vez por docente, con sus aulas (bandeja de correos real).
- **RNF-003:** el panel de un aula de 40 con datos responde en menos de 1,5 s.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/reporting/seguimiento-docente-http.int-spec.ts`:

<<archivo:apps/api/test/integration/reporting/seguimiento-docente-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **Panel (RF-063, RNF-003):** la docente abre "Ver seguimiento" desde su aula; el panel responde en menos de 1,5 s; una fila por estudiante con su nivel en cada habilidad.
- **Filtros (UAT-04):** inferencias en nivel C deja a los 2 de 4, de menor a mayor.
- **Alertas (RF-065)** y **refuerzo con un clic (RF-066):** la asignación queda solo para quienes lo necesitan (comprobado en la base).
- **Detalle (RF-064):** la sesión terminada de Mateo, la evidencia que eligió y las pistas que usó.
- **Reporte (RF-067):** CSV con BOM y una fila por estudiante; PDF válido.
- **Diseño responsivo (RNF-022, RNF-023):** el seguimiento y el detalle en 1280, 820 y 390 px; el área del estudiante en 6 tamaños de laptop (centrada, sin desbordes, con la barra completa) y los paneles de adultos en 4 (acciones del hijo en una fila, botones a su medida y los 5 filtros de la biblioteca en una fila).

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:seguimiento --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción, como en CI.

**Resultado de carga obtenido el 26/10/2026** (un aula de 40 estudiantes con su maestría repartida entre los 4 niveles —26 alertas y 5 refuerzos—; 10 docentes abren el panel y el detalle de un estudiante sin pausa durante 60 s y se descargan 6 reportes por minuto, mitad PDF y mitad CSV; mismo perfil que el script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /api/v1/aulas/{id}/panel` (40 estudiantes) | 2.138 | 0,00 % | 141 ms | 232 ms | 357 ms | p95 < 1,5 s (RF-063, RNF-003) | ✅ |
| `GET /api/v1/aulas/{id}/estudiantes/{id}/detalle` | 2.138 | 0,00 % | 117 ms | 181 ms | 297 ms | sin meta propia (k6: p95 < 1,5 s) | ✅ |
| `GET /api/v1/aulas/{id}/reporte?formato=pdf` | 3 | 0,00 % | 347 ms | 789 ms | 789 ms | ≤ 30 s (RF-067) | ✅ |
| `GET /api/v1/aulas/{id}/reporte?formato=csv` | 3 | 0,00 % | 164 ms | 270 ms | 270 ms | ≤ 30 s (RF-067) | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/seguimiento/panel.spec.ts`:

<<archivo:tests/e2e/specs/seguimiento/panel.spec.ts>>

`tests/e2e/support/seguimiento.ts`:

<<archivo:tests/e2e/support/seguimiento.ts>>

`tests/e2e/specs/diseno/responsivo.spec.ts`:

<<archivo:tests/e2e/specs/diseno/responsivo.spec.ts>>

`tests/load/sembrar-seguimiento.mjs`:

<<archivo:tests/load/sembrar-seguimiento.mjs>>

`tests/load/scenarios/seguimiento-panel.js`:

<<archivo:tests/load/scenarios/seguimiento-panel.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/seguimiento/seguimiento.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/seguimiento.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como docente, abrir un aula y "Ver seguimiento" | Resumen de la semana, estudiantes para acompañar, refuerzos, el aula por habilidad y el mapa de calor |
| ☐ | Filtrar el mapa por una habilidad y el nivel "En inicio" | Solo quienes están en inicio, de menor a mayor |
| ☐ | Asignar un refuerzo con un clic | "quedó asignada a N estudiantes hasta el …"; aparece en las asignaciones del aula |
| ☐ | Abrir a un estudiante | Sus habilidades, su tasa sin pista y sus sesiones con respuestas, evidencias y pistas |
| ☐ | Descargar el reporte en CSV y en PDF | El CSV abre bien en Excel (tildes y eñes); el PDF en A4 con todo el aula |
| ☐ | Revisar el correo del lunes | Resumen de cada aula con alertas y refuerzos, y el enlace al panel |
| ☐ | Revisar los textos de las alertas y los niveles con el líder pedagógico | Lenguaje claro y respetuoso con los estudiantes |
| ☐ | Revisar en laptops de distinto tamaño, tablet y celular | Contenido centrado que usa el ancho; sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `seguimiento.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo reporting`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar las vistas `reporting.*`, la hora de `reporting.refresco_vistas` y `reporting.resumen_semanal_enviado`; el navegador integrado ayudó a revisar el diseño pantalla por pantalla en distintos tamaños.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el escenario k6 del seguimiento (siembra el aula de 40 y mide panel, detalle y reportes), con sus tiempos en las anotaciones de la ejecución.

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SEG-U-01 | Mapa de calor (RF-063, RN-08) | Unit | Pos./Borde | Nivel declarado; sin datos | `npm run test:unit` |
| SEG-U-02 | Riesgo (RF-065) | Unit | Pos./Borde | 7 días o 2 en C; desde la matrícula | `npm run test:unit` |
| SEG-U-03 | Refuerzo, resumen y tasa (RF-064 a RF-066) | Unit | Pos./Borde | 30 %; semanas de Lima; cerradas | `npm run test:unit` |
| SEG-U-04 | CSV seguro (RF-067) | Unit | Pos./Neg. | BOM; fórmulas neutralizadas | `npm run test:unit` |
| SEG-U-05 | Casos de uso de Reporting | Unit | Pos./Neg. | 404, 400, una vez por semana, reintento | `npm run test:unit` |
| SEG-U-06 | Historial de lectura (RF-064) | Unit | Positivo | Respuesta legible y pistas | `npm run test:unit` |
| SEG-I-01 | Panel con vistas reales (RF-063, RF-065, RF-066) | Int | Pos./Borde | Niveles, alertas, refuerzo, refresco | `npm run test:int` |
| SEG-I-02 | Detalle (RF-064, RN-17) | Int | Pos./Neg. | Evidencias y pistas; 404 | `npm run test:int` |
| SEG-I-03 | Reporte (RF-067) | Int | Pos./Neg. | CSV y PDF; 400 | `npm run test:int` |
| SEG-I-04 | Resumen semanal e inactividad (RF-065) | Int | Pos./Borde | Lunes 07:00; una vez; 9 días | `npm run test:int` |
| SEG-I-05 | Acceso y rendimiento (RNF-003, RNF-012) | Int | Neg./Rendimiento | 401/403; < 1,5 s | `npm run test:int` |
| SEG-S-01 | Panel, filtros, refuerzo y detalle | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| SEG-S-02 | Descargas CSV y PDF (RF-067) | Sys | Positivo | Archivos válidos | `npm run test:e2e` |
| SEG-S-03 | Diseño en laptops y dispositivos (RNF-022, RNF-023) | Sys | Accesibilidad | Centrado; sin desbordes; acciones en fila | `npm run test:e2e` |
| SEG-S-04 | Carga | Sys | Rendimiento | Ver §6.3 | `npm run test:seguimiento --workspace @lectoaventura/tests-load` |
| SEG-A-01 | UAT-04 del SRS | UAT | Positivo | 30 estudiantes, 12 en C, < 1,5 s | `npm run test:uat` |
| SEG-A-02..05 | Alertas, refuerzo, reporte de 40 y aula ajena | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 10/10 — reglas puras (mapa de calor, riesgo, refuerzo, semanas, CSV) y casos de uso con puertos.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de Reporting cubiertos.
- **Aislamiento de dependencias** ............... 10/10 — Reporting lee solo su schema; Escuela e IAM por su `public-api`, Lectura y Contenido por el shared-kernel.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; escenario k6 propio en CI.
- **Resiliencia ante fallos (edge cases)** ...... 10/10 — aulas ajenas, aulas vacías o borradas, estudiantes sin datos, correos que fallan, refrescos simultáneos y celdas peligrosas en el CSV cubiertos.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner y del líder pedagógico (textos de alertas y niveles)
