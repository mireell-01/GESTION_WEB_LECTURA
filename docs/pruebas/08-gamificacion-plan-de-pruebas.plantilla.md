# Plan Maestro de Pruebas — Módulo 8: Gamificación

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/gamificacion` + el "Pasaporte" del estudiante (`/estudiante/pasaporte`), el marcador y el reto del día del inicio, y los logros al terminar una lectura
> **Requisitos cubiertos:** RF-056 a RF-062, RN-10 a RN-13, RN-18, RN-19 (puntos de esfuerzo), UAT-02 y UAT-03 del SRS completos, RF-078 (parámetros versionados: lectura), RNF-001, RNF-019, RNF-022, RNF-023 y los eventos `ItemRespondido`, `SesionLecturaFinalizada`, `MaestriaNivelSubido`, `MaestriaActualizada` y `MundoDesbloqueado` del SAD §6
> **Fecha de ejecución:** 23/10/2026 · **Resultado global:** ✅ 774 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 7 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 8 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 438 | 37 | ✅ 438/438 · cobertura 97,7 % líneas / 93,2 % ramas | 48 s |
| 2 · Integración (Supertest + PostgreSQL real) | 152 | 20 | ✅ 152/152 | 192 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 138 | 6 | ✅ 138/138 en una sola corrida completa contra la compilación de producción | 17,9 min |
| 3 · Carga (RF-040, RNF-001) | 11 mediciones | 3 | ✅ 0 % errores · corrección (con maestría y puntos) p95 170 ms · pasaporte p95 46 ms · reto p95 34 ms · canje p95 55 ms | 6 s |
| 4 · Aceptación (Gherkin en español) | 46 escenarios | 5 (+ 2 completados) | ✅ 46/46 · informe para el Product Owner | 7,6 min |

**Defectos encontrados por las pruebas y corregidos:** 7 · **Brechas con el SRS cerradas:** 16 · **Decisiones documentadas donde el SRS no decía cómo:** 12 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `gamificacion` (6 tablas del SRS + 4 nuevas) · migración `20261025000000_gamificacion_logros` |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  PasaporteController (/yo/pasaporte, /yo/reto-del-dia, /yo/recompensas/{id}/canje; ESTUDIANTE)
   │  usa CasosUsoGamificacion (token CASOS_USO_GAMIFICACION)
   ▼
application LogrosUseCase (reacciona a cada ítem, lectura, subida de nivel, maestría y mundo; propone
           el reto del día) · PasaporteUseCase (pasaporte, reto del día y canje)
   │  puertos: GamificacionRepository, IdentidadEstudiantes (IAM) + del shared-kernel: MAESTRIA_LECTOR,
   │           FICHAS_LECTURA, AVANCE_LECTURAS, LECTURAS_REALIZADAS (nuevo), MUNDOS_COMPLETADOS (nuevo), BusEventos
   ▼
domain     CuentaGamificacion (libro de puntos, insignias, racha y reto en un agregado) · RetoDiario ·
           política de puntos (RN-10 a RN-12, RN-19) · nivel lector (RF-057) · racha con comodín (RF-061) ·
           reglas de insignias (RF-058) · monedas (RF-062) · parámetros versionados (RF-078) · id determinista

infrastructure PrismaGamificacionRepository (candado por estudiante) · IdentidadEstudiantesIam ·
               IntegracionGamificacion (suscripciones)

Otros módulos (solo por su public-api, el shared-kernel o eventos):
  Lectura ─────── ItemRespondido (ahora con la modalidad) y SesionLecturaFinalizada; registra LECTURAS_REALIZADAS
  Progreso ────── MaestriaNivelSubido (+50) y MaestriaActualizada (Maestro de las Inferencias); MAESTRIA_LECTOR
  Aventura ────── MundoDesbloqueado (insignias de rango); registra MUNDOS_COMPLETADOS
  Contenido ───── FICHAS_LECTURA (títulos y la lectura sugerida del reto)
  IAM ─────────── alias, avatar y edad (IamFacade)
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `GamificacionRepository` | Interna (puerto) | `GamificacionEnMemoria` (`test/unit/gamificacion/dobles.ts`): cada evento una vez, asiento único por origen y motivo, un reto por día, un canje por recompensa | **Real**: Prisma + PostgreSQL con candado por estudiante |
| Maestría, fichas, avance, lecturas realizadas, mundos completados | shared-kernel | Dobles | **Reales**: Progreso, Contenido, Lectura y Aventura registrados |
| `IdentidadEstudiantes` (IAM) | Anticorrupción | Doble | **Real**: `IamFacade` |
| `BusEventos` + Outbox | Interna | `BusEspia` | **Real**: eventos reales de Lectura, Progreso y Aventura (y reentregas) |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Quedaba el andamiaje de ejemplo del módulo (`POST /gamificacion/demo`) | Auditoría del módulo | Eliminado |
| D-2 | La prueba de estructura del Módulo 1 insertaba un asiento con el motivo `X` para probar RN-10; ahora la base también exige un motivo conocido | 2 · Supertest | Cambio esperado: la prueba usa un motivo válido y sigue comprobando que los puntos negativos se rechazan |
| D-3 | La prueba de reentrega esperaba un solo avance de insignia, pero la lectura suma a dos ("Primera lectura" y "Detective de Evidencias") | 2 · Supertest | El comportamiento es el correcto; se corrigió la expectativa |
| D-4 | El marcador del inicio decía «1 día seguidos» | Revisión de la prueba E2E | Singular y plural correctos («1 día seguido», «3 días seguidos») |
| D-5 | El puerto 3001 estaba ocupado por otro proyecto local; Playwright comprobaba la API siempre en ese puerto | 3 · Playwright | `tests/e2e/support/servidores.ts` toma la API de `API_URL` (la misma con que se compila la web); por defecto sigue en 3001 |
| D-6 | La limpieza de la suite E2E no borraba el perfil lector de los niños de prueba (Módulo 7) | Auditoría del módulo | Ahora borra maestría, historial y recomendaciones, y la racha, retos y avances de Gamificación |
| D-7 | La prueba responsiva del Módulo 1 esperaba "Mi perfil" con candado | 3 · `responsivo.spec.ts` | Cambio esperado: ahora es la sección real "Pasaporte", que también se revisa sin desbordes y con objetivos de 48 px |

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-056 | Libro de puntos con motivo | Un asiento por logro con su motivo y su origen; el saldo es la suma | U + I + S + UAT |
| B-2 | RN-10, RN-11 | Tabla de puntos | +10 acierto, +6 tras pista, +20 lectura, +50 subida de nivel CNEB, +15 reto, +10/+30/+100 racha; equivocarse no resta | U + I + UAT |
| B-3 | RN-12 | Anti-*farming* | Repetir da el 25 %; tope de 300 por día de Lima, también con 40 logros a la vez | U + I + UAT |
| B-4 | RN-19 | Puntos de esfuerzo en abiertas | ≥ 5 palabras (6–9 años) o ≥ 10 (10–12) al enviarla | U + I |
| B-5 | RF-057 | Nivel lector | 100 × n × (n + 1) / 2, con lo que falta para el siguiente | U + I + S |
| B-6 | RF-058 | Insignias | 9 en el catálogo: Primera lectura, Detective de Evidencias, Maestro de las Inferencias, Lector Perseverante y una de rango por mundo | U + I + S + UAT |
| B-7 | RN-13 | Irrevocables | Una sola vez por niño; el *trigger* impide borrarlas | U + I |
| B-8 | RF-059 | Pasaporte del Lector | Insignias (ganadas y por ganar con su avance), mundos completados, lecturas terminadas, puntos, nivel, racha y monedas; refleja el logro al instante | U + I + S + UAT + carga |
| B-9 | RF-060 | Reto del día | 3 respuestas bien hechas de su habilidad más débil (unos 5 minutos), con una lectura sugerida | U + I + S + UAT + carga |
| B-10 | RN-18 | Uno por día | Único por estudiante y fecha de Lima; el de ayer sin completar vence | U + I + UAT |
| B-11 | RF-061 | Racha con comodín | Días con lectura terminada o reto completado; un comodín por semana | U + I + UAT |
| B-12 | RF-062 | Recompensas | 10 personajes y accesorios; se canjean con monedas, nunca con puntos de nivel | U + I + S + UAT + carga |
| B-13 | UAT-02 del SRS | "recibe 6 puntos por corregir tras pista" | Paso agregado al escenario del Módulo 6 | UAT |
| B-14 | UAT-03 del SRS | "el progreso hacia la insignia Detective de Evidencias aumenta en 1" | Paso agregado al escenario del Módulo 6 | I + S + UAT |
| B-15 | SAD §6 | Eventos sin consumidor | `SesionLecturaFinalizada`, `MaestriaNivelSubido` y `MundoDesbloqueado` ya otorgan puntos e insignias | U + I |
| B-16 | Inicio (Módulo 1) | "La racha y las monedas aparecerán cuando existan los módulos que las generan" | Marcador con nivel, racha y monedas, y el reto del día | S |

**Decisiones de diseño (el SRS no decía cómo):**
- **Idempotencia:** los eventos no traen id. Gamificación guarda cada evento aplicado (`evento_aplicado`, llave `(tipo, origen_id)`); lo que no tiene id propio (subida de nivel, racha, mundo) usa un UUID determinista (versión 8). Reentregar un evento no suma dos veces.
- **Tope diario con concurrencia:** cada logro se aplica en una transacción con un candado por estudiante (`pg_advisory_xact_lock`), así el tope de 300 y la racha no se rompen si llegan varios a la vez.
- **Reto del día:** es una meta (3 respuestas bien hechas de su habilidad más débil en cualquier lectura), no un cuestionario aparte: reusar el banco del diagnóstico contaminaría las reevaluaciones (RF-037). Sugiere la lectura más sencilla de su edad que la trabaja y aún no terminó.
- **Subida de nivel CNEB (+50):** la primera vez que cada habilidad llega a cada nivel; bajar y volver a subir no suma de nuevo.
- **Repetir una lectura:** 25 % redondeado; no suma a las insignias de lecturas ni de evidencias, pero sí cuenta para la racha y el reto (es práctica).
- **Tope diario:** incluye todos los motivos (también el reto y la racha); al llegar al tope no se registran asientos en 0.
- **Abiertas:** los puntos de esfuerzo valen lo de un acierto (10); 6–7 años usan el mínimo de 8–9 (el SRS no lo fija).
- **Monedas:** 1 por cada 10 puntos ganados, menos las gastadas; no hay otra billetera que pueda desincronizarse.
- **Insignias:** Detective de Evidencias con 5 evidencias correctas; Maestro de las Inferencias con el nivel Destacado declarado (RN-08: ≥ 5 ítems); Lector Perseverante con 7 días; los rangos se ganan completando el mundo (el reto inicial ubica, no otorga rango).
- **Nivel lector:** con menos de 100 puntos, nivel 0.
- **"Visible de inmediato" (RF-058, RF-059):** los manejadores corren en el mismo pedido del niño; al terminar la lectura la pantalla compara su pasaporte de antes con el de ahora y muestra los puntos e insignias nuevas.
- **"Mi perfil":** la sección con candado del Módulo 1 pasó a ser "Pasaporte". Las recompensas se ven en su colección del pasaporte; no cambian el avatar con que ingresa (IAM).

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Pantalla de parámetros (RF-078) | Hoy solo se leen (versión vigente) | Módulo 12 (administración) con `PUT /admin/parametros-gamificacion` |
| Ponerse el accesorio en el avatar | Hoy se ve en la colección del pasaporte | Dibujar el accesorio sobre el avatar del inicio y el pasaporte |
| Gamificación para docente y familia | Hoy solo la ve el niño | Paneles RF-063, RF-064 y RF-068 |
| Tiempo de respuesta al corregir | Subió de 154 a 170 ms (p95, local) por aplicar los puntos en el mismo pedido | Dentro de la meta (300 ms); si hiciera falta, guardar en caché los parámetros |
| Asientos e insignias de niños de prueba | Quedan en la base de desarrollo tras la limpieza E2E | Por diseño son de solo agregar (RN-13), como la auditoría |
| Heredadas | Outbox no transaccional; límite de tasa en memoria | Ver informes de los Módulos 1 a 7 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Gamificación usa IAM por su `public-api` y el resto por el shared-kernel y eventos (el módulo salió de la lista de excluidos de ESLint) | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Puntos, nivel, racha, insignias, reto, monedas, cuenta y casos de uso con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | Lecturas reales, reentregas, concurrencia, *triggers* y canjes | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Logros al terminar, pasaporte, marcador, reto y tienda en la web real | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/lectura-respuestas.js`, ampliado) | Binario k6 | Corrección con puntos, pasaporte, reto y canje | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios nuevos y los pasos que faltaban de UAT-02 y UAT-03 | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/gamificacion/
│   │   ├── dobles.ts
│   │   ├── dominio/dominio-gamificacion.spec.ts
│   │   └── aplicacion/gamificacion-casos-de-uso.spec.ts
│   └── integration/gamificacion/gamificacion-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/gamificacion.ts                    # Libro de puntos, avances y racha en la base
│   │   ├── support/servidores.ts                      # + API_URL configurable
│   │   ├── specs/gamificacion/pasaporte.spec.ts
│   │   ├── features/gamificacion/gamificacion.feature
│   │   ├── features/lectura/lectura.feature           # + pasos de UAT-02 y UAT-03
│   │   └── steps/gamificacion.steps.ts
│   └── load/scenarios/lectura-respuestas.js           # + pasaporte, reto y canje
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Parámetros (RF-078):** la versión 1 da los valores del SRS; un cambio se toma y lo inválido vuelve al valor del SRS.
- **Nivel lector (RF-057):** umbrales 100, 300, 600, 1000; avance hacia el siguiente.
- **Política de puntos:** acierto, tras pista, error (RN-10); abiertas por edad (RN-19); 25 % y tope de 300 (RN-12); bonos de racha (RN-11).
- **Racha (RF-061):** inicio, día seguido, mismo día, evento atrasado, comodín (también el del domingo de la semana anterior), comodín ya usado, dos días sin leer y la racha visible.
- **Insignias (RF-058):** lectura de reglas (y descarte de las mal formadas), meta visible, niveles y orden del pasaporte.
- **Id determinista y monedas (RF-062).**
- **Reto del día (RF-060):** la habilidad más débil y su avance hasta completarse.
- **Cuenta:** asientos con tope, subida de nivel lector, conteo hasta la insignia (una sola vez), racha de 7 con bono e insignia, reto completado con +15 y racha, insignias de nivel y de rango.
- **Casos de uso:** cada tipo de logro, reentregas, repeticiones, niveles CNEB, maestría, mundos, reto del día (sugerencia, sin sugerencia, sin perfil, completado), pasaporte completo y canjes.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/gamificacion/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación de Gamificación (100 % de líneas en cada archivo; entre 80 % y 100 % de ramas).

## 4.4 Código completo del test unitario
`apps/api/test/unit/gamificacion/dominio/dominio-gamificacion.spec.ts`:

<<archivo:apps/api/test/unit/gamificacion/dominio/dominio-gamificacion.spec.ts>>

`apps/api/test/unit/gamificacion/aplicacion/gamificacion-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/gamificacion/aplicacion/gamificacion-casos-de-uso.spec.ts>>

`apps/api/test/unit/gamificacion/dobles.ts`:

<<archivo:apps/api/test/unit/gamificacion/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **RF-059:** sin logros, el pasaporte muestra el catálogo por ganar, nivel 0 y ninguna moneda.
- **RF-060, RN-18:** un reto por día para la habilidad más débil con su lectura sugerida; el de ayer vence.
- **RF-056, UAT-02, UAT-03:** una lectura real deja `CORRECTO_TRAS_PISTA 6`, `ITEM_CORRECTO 10`, `RESPUESTA_ABIERTA 10` y `LECTURA_COMPLETADA 20`, con la fecha de Lima y su origen; suma a la evidencia, la racha y el reto; "Primera lectura".
- **Idempotencia:** reentregar los eventos de la lectura desde el outbox no suma nada.
- **RN-12:** repetir da 3, 3, 3 y 5 puntos y no suma a las insignias.
- **RF-060, RF-057:** completar el reto da +15 y, con 105 puntos, nivel 1 (`NivelLectorSubido`).
- **RN-11:** +50 una sola vez por nivel CNEB de una habilidad.
- **RF-058:** Detective de Evidencias a la quinta; Maestro de las Inferencias solo con el nivel declarado; rango del mundo completado.
- **RF-061:** el comodín cubre un día (racha 7, +30 y Lector Perseverante); sin comodín, reinicio.
- **RN-13:** el libro, las insignias otorgadas y los canjes rechazan cambios; la base rechaza puntos negativos y motivos desconocidos.
- **RN-12 con concurrencia:** 40 aciertos a la vez dejan exactamente 300 puntos (30 asientos).
- **RF-062:** canje con monedas sin tocar los puntos; una vez por recompensa; sin monedas no; dos canjes a la vez no gastan de más; 404.
- **Acceso:** solo el estudiante (401, 403).

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/gamificacion/gamificacion-http.int-spec.ts`:

<<archivo:apps/api/test/integration/gamificacion/gamificacion-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **Logros al terminar (RF-056, RF-058):** el niño termina en la tablet la lectura que respondía y ve "¡Ganaste N puntos!" (N = lo que el libro sumó en esa visita) y "Nueva insignia: Primera lectura".
- **Pasaporte (RF-059):** 9 insignias (ganada, "1 de 5", "1 de 7", "Por ganar"), la lectura terminada, el mundo Explorador completado, sus puntos y sus últimos puntos.
- **Inicio (RF-057, RF-060, RF-061):** marcador con nivel, "1 día seguido" y sus monedas; el reto del día para "descubrir lo que no se dice" en "1 de 3".
- **Tienda (RF-062):** el dragón deshabilitado por monedas; la lupa canjeada ("¡Es tuya!"), 5 monedas menos y los mismos puntos.
- **Diseño responsivo (RNF-022, RNF-023):** el Pasaporte en 1280, 820 y 390 px, sin desbordes y con objetivos de 48 px.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:lectura --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción, como en CI. Si el puerto 3001 está ocupado, la API compilada puede arrancar en otro (`PORT`) y la web compilarse con `API_URL` apuntando a ella; Playwright usa la misma `API_URL`.

**Resultado de carga obtenido el 23/10/2026** (un aula de 40 niños de 9 años lee "Killa y la llama" completa, de a 10 en paralelo; al final abre su perfil, sus recomendaciones, su pasaporte y su reto del día y canjea la lupa; mismo perfil que el script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local). Cada niño terminó con 76 puntos, ni uno más ni uno menos:

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /api/v1/sesiones-lectura/{id}/respuestas` (corregir + maestría + puntos) | 280 | 0,00 % | 122 ms | 170 ms | 191 ms | p95 < 300 ms (RF-040, RNF-002) | ✅ |
| `GET /api/v1/yo/pasaporte` | 40 | 0,00 % | 37 ms | 46 ms | 49 ms | p95 < 300 ms (RNF-001) | ✅ |
| `GET /api/v1/yo/reto-del-dia` | 40 | 0,00 % | 29 ms | 34 ms | 36 ms | p95 < 300 ms (RNF-001) | ✅ |
| `POST /api/v1/yo/recompensas/{id}/canje` | 40 | 0,00 % | 47 ms | 55 ms | 62 ms | sin meta en el SRS (k6: p95 < 500 ms) | ✅ |
| `POST /api/v1/sesiones-lectura/{id}/finalizar` (+20, racha e insignia) | 40 | 0,00 % | 121 ms | 146 ms | 154 ms | sin meta en el SRS | ✅ |
| `GET /api/v1/yo/perfil-lector` | 40 | 0,00 % | 25 ms | 31 ms | 32 ms | p95 < 300 ms (RNF-001) | ✅ |
| `GET /api/v1/yo/recomendaciones` | 40 | 0,00 % | 74 ms | 90 ms | 94 ms | p95 < 300 ms (RNF-001) | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/gamificacion/pasaporte.spec.ts`:

<<archivo:tests/e2e/specs/gamificacion/pasaporte.spec.ts>>

`tests/e2e/support/gamificacion.ts`:

<<archivo:tests/e2e/support/gamificacion.ts>>

`tests/load/scenarios/lectura-respuestas.js`:

<<archivo:tests/load/scenarios/lectura-respuestas.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/gamificacion/gamificacion.feature>>

En `tests/e2e/features/lectura/lectura.feature` (Módulo 6) se completaron los dos escenarios del SRS que esperaban a este módulo: UAT-02 ahora verifica "recibe 6 puntos por corregir tras pista" y UAT-03 "el progreso hacia la insignia Detective de Evidencias aumenta en 1".

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/gamificacion.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como niño, terminar una lectura | Al final ve "¡Ganaste N puntos!" y, la primera vez, "Nueva insignia: Primera lectura" |
| ☐ | Abrir "Pasaporte" | Nivel con lo que falta para el siguiente, puntos, racha, monedas, insignias, mundos y lecturas |
| ☐ | Equivocarse en una pregunta y corregir con la pista | Suma 6 puntos (no resta por el error) |
| ☐ | Ver el inicio por la mañana | Marcador (nivel, racha y monedas) y el reto del día de su habilidad más débil |
| ☐ | Cumplir el reto del día | "¡Reto cumplido!" y 15 puntos |
| ☐ | Leer dos días seguidos y saltarse uno | La racha sigue gracias al comodín de la semana |
| ☐ | Volver a leer una lectura ya terminada | Gana menos puntos (25 %) |
| ☐ | Canjear un personaje o accesorio en la tienda | Aparece "¡Es tuya!"; bajan las monedas y no los puntos |
| ☐ | Revisar los nombres de insignias y recompensas con el líder pedagógico | Lenguaje y referencias adecuados para 6–12 años |
| ☐ | Revisar en celular, tablet y computadora | Botones grandes, texto legible, sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `gamificacion.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo gamificacion`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `gamificacion.asiento_puntos` (suma por día de Lima), `gamificacion.evento_aplicado` y los eventos `gamificacion.*` del outbox.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. El escenario k6 de la lectura mide ahora también el pasaporte, el reto del día y el canje (mismo paso de CI, con sus tiempos en las anotaciones de la ejecución). En CI la API corre en el 3001, así que `API_URL` no hace falta.

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| GAM-U-01 | Parámetros versionados (RF-078) | Unit | Pos./Neg. | Valores del SRS; inválidos vuelven al SRS | `npm run test:unit` |
| GAM-U-02 | Nivel lector (RF-057) | Unit | Borde | Umbrales y avance | `npm run test:unit` |
| GAM-U-03 | Política de puntos (RN-10 a RN-12, RN-19) | Unit | Pos./Neg./Borde | 10, 6, 0; abiertas por edad; 25 %; tope | `npm run test:unit` |
| GAM-U-04 | Racha con comodín (RF-061) | Unit | Borde | Suma, comodín, reinicio, visible | `npm run test:unit` |
| GAM-U-05 | Insignias, monedas, reto y cuenta (RF-058, RF-060, RF-062) | Unit | Pos./Neg. | Una vez; tope; +15; canje válido | `npm run test:unit` |
| GAM-U-06 | `LogrosUseCase` y `PasaporteUseCase` | Unit | Pos./Neg. | Reentregas, repeticiones, sugerencia, pasaporte, 404 | `npm run test:unit` |
| GAM-I-01 | Pasaporte y reto (RF-059, RF-060, RN-18) | Int | Pos./Borde | Catálogo; uno por día; vencido | `npm run test:int` |
| GAM-I-02 | Lectura real → libro (RF-056, UAT-02, UAT-03) | Int | Positivo | 4 asientos con motivo; avance 1 | `npm run test:int` |
| GAM-I-03 | Reentrega, repetición y tope (RN-12) | Int | Neg./Concurrencia | Sin doble conteo; 25 %; 300 exactos | `npm run test:int` |
| GAM-I-04 | Insignias y racha (RF-058, RF-061, RN-13) | Int | Pos./Neg. | Una vez; comodín; *triggers* | `npm run test:int` |
| GAM-I-05 | Recompensas (RF-062) y acceso | Int | Pos./Neg./Concurrencia | Monedas, no puntos; 409; 404; 401/403 | `npm run test:int` |
| GAM-S-01 | Logros al terminar y pasaporte (RF-058, RF-059) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| GAM-S-02 | Marcador, reto y tienda (RF-057, RF-060 a RF-062) | Sys | Pos./Neg. | Canje sin perder puntos | `npm run test:e2e` |
| GAM-S-03 | Pasaporte responsivo (RNF-022, RNF-023) | Sys | Accesibilidad | Sin desbordes; 48 px | `npm run test:e2e` |
| GAM-S-04 | Carga | Sys | Rendimiento | Ver §6.3 | `npm run test:lectura --workspace @lectoaventura/tests-load` |
| GAM-A-01..05 | 5 escenarios Gherkin (RF-056 a RF-062, RN-11, RN-12, RN-18) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |
| GAM-A-06..07 | UAT-02 y UAT-03 completos | UAT | Positivo | 6 puntos; Detective + 1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 10/10 — reglas puras (puntos, nivel, racha, insignias, monedas) y un agregado que se carga y guarda junto; casos de uso con puertos.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de Gamificación al 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — sin dependencias directas con Lectura, Progreso, Aventura ni Contenido: eventos y puertos del shared-kernel.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; pasaporte, reto y canje en el humo de carga.
- **Resiliencia ante fallos (edge cases)** ...... 10/10 — reentregas, logros simultáneos (tope y canjes), repeticiones, cambios de día y de semana, catálogo mal formado y niños sin perfil cubiertos.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner y del líder pedagógico (nombres de insignias y recompensas)
