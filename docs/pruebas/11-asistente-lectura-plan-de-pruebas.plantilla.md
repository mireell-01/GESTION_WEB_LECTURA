# Plan Maestro de Pruebas — Módulo 11: Asistente de lectura

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/asistente`. En la web:
> - la ayuda «¿Necesitas ayuda para pensar?» dentro de cada pregunta de la lectura;
> - la tarjeta «Asistente de lectura» en el avance de cada hijo y en el aula de la docente;
> - el botón «Sugerir un comentario» en las respuestas por revisar.
>
> **Requisitos cubiertos:** RF-072 a RF-075, RN-16 (sin datos personales), RN-17 (solo lo propio), RNF-007 (primer token en menos de 3 s), RNF-011 (la lectura nunca se detiene), RNF-022 y RNF-023, ADR-008 (consentimiento, sin la clave en el contexto y retención de 30 días)
> **Fecha de ejecución:** 29/10/2026 · **Resultado global:** ✅ 1047 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 10 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 11 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 631 | 152 (incluye un conjunto adversario de 755 casos) | ✅ 631/631 · cobertura 98,0 % líneas / 93,7 % ramas | 52 s |
| 2 · Integración (Supertest + PostgreSQL real) | 190 | 14 | ✅ 190/190 | 104 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 164 | 9 | ✅ 164/164 contra la compilación de producción (+ 4 omitidas a propósito: los tamaños de laptop solo corren en computadora) | 26 min |
| 3 · Carga (RNF-007) | 2 mediciones | 2 | ✅ 0 errores y 0 fugas en 300 intercambios de un aula de 30 · primer token p95 70 ms · lo conversado p95 32 ms | 2 s |
| 4 · Aceptación (Gherkin en español) | 62 escenarios | 6 | ✅ 62/62 · informe para el Product Owner | 8,3 min |

**Cómo fue la E2E completa:**
- **Primera corrida (26 min):** 160 pasaron y 4 fallaron en el Módulo 10. Era el defecto D-14, el texto de la nueva tarjeta. Se corrigió y las pruebas de familia y del asistente pasaron 15/15.
- **Corrida de confirmación:** computadora y tablet pasaron 110/110 (+ 2 omitidas). La sesión se cerró antes de llegar al celular.
- **Celular:** la primera vez falló entero porque PostgreSQL no estaba encendido; un cierre brusco de la computadora había dejado un archivo de bloqueo viejo. Tras reiniciar la base, pasó 54/54 (+ 2 omitidas).

**Defectos encontrados por las pruebas y corregidos:** 14 · **Brechas con el SRS cerradas:** 11 · **Decisiones documentadas donde el SRS no decía cómo:** 10 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `asistente`: `conversacion` y `turno` (del SRS) y 1 tabla nueva, `activacion` · migración `20261029000000_asistente_lectura` |
| Respuesta en flujo | Server-Sent Events sobre `POST` (el mensaje va en el cuerpo); la web lo lee con `fetch` (sin dependencias nuevas) |
| Motor | Mediador socrático sin conexión, propio (decisión del Product Owner: sin IA externa por ahora), detrás del puerto `MotorAsistente` |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  AsistenteLecturaController (/sesiones-lectura/{id}/asistente GET y …/turnos POST con SSE: ESTUDIANTE)
           ActivacionAsistenteController (/familia/estudiantes/{id}/asistente: FAMILIAR · /aulas/{id}/asistente: DOCENTE)
           BorradorRetroalimentacionController (/respuestas/{id}/borrador-retroalimentacion: DOCENTE)
   │  usa CasosUsoAsistente (token CASOS_USO_ASISTENTE)
   ▼
application ConversarUseCase (moderar → motor → filtro de salida → guardar, hasta 10) ·
           ActivacionUseCase (familia y docente) · BorradorUseCase (RF-075)
   │  puertos: ConversacionRepository, ActivacionRepository, MotorAsistente, AccesoAdultos, IdentidadEstudiantes
   │           + del shared-kernel: PREGUNTA_EN_CURSO y RESPUESTAS_ABIERTAS (los entrega Lectura)
   ▼
domain     Conversacion (10 intercambios, 30 días) · moderación de entrada · intención y mediación socrática ·
           filtro de salida · borrador de retroalimentación

infrastructure PrismaConversacionRepository y PrismaActivacionRepository (solo el schema `asistente`) ·
               MediadorSinConexion (motor y respaldo) · AccesoAdultosIamEscuela · RetencionAsistente (cada 6 h)

Otros módulos (solo por su public-api o el shared-kernel):
  Lectura ──── la pregunta en pantalla con lo ya leído (sin la clave) y, aparte, la clave para el filtro;
               la respuesta abierta para la docente (AsistenciaLecturaUseCase, nuevo)
  IAM ──────── qué familia creó el perfil (hijosDeFamilia) y alias y avatar de cada estudiante
  Escuela ──── el aula de la docente y su matrícula
  shared-kernel  el filtro de palabras (se movió desde Lectura: lo usan los dos)
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `ConversacionRepository` | Interna (puerto) | `ConversacionesEnMemoria`, con la misma regla de concurrencia que el `UPDATE` condicional | **Real**: Prisma + schema `asistente` |
| `ActivacionRepository` | Interna (puerto) | `ActivacionesEnMemoria` | **Real** |
| `MotorAsistente` | Interna (puerto) | `MotorEspia`: responde como el mediador, falla o responde «mal» como un modelo externo | **Real**: `MediadorSinConexion` |
| Pregunta en curso y respuestas abiertas | shared-kernel | `PreguntasFalsas`, `RespuestasFalsas`; y `AsistenciaLecturaUseCase` probado con los dobles de Lectura | **Reales**: Lectura registrada, con una lectura publicada por el flujo real |
| `AccesoAdultos`, `IdentidadEstudiantes` | Anticorrupción | `AccesoFalso`, `IdentidadFalsa` | **Reales**: `IamFacade` y `EscuelaFacade` |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | El filtro de salida bloqueaba guías del propio mediador («está bien», el aviso de privacidad) | Prueba de humo de la API | Se quitaron «está bien / está mal» de las frases que confirman y se reescribió el aviso |
| D-2 | «Pide la respuesta» se detectaba con palabras demasiado comunes («es la», «opción») | Prueba de humo | Patrones más precisos («la b», «opción c», «cuál marco»…) |
| D-3 | Si el guía citaba la pregunta en pantalla y esta se parecía a la clave (p. ej. a una oración de evidencia), el filtro bloqueaba una ayuda legítima | 1 · Conjunto adversario | Citar el enunciado tal cual no cuenta; se revisa todo lo demás |
| D-4 | Palabras de cualquier guía («texto», «dice») hacían parecer que se revelaba una clave como «Porque lo dice el texto» | 1 · Conjunto adversario | No cuentan para la similitud, que además exige al menos 3 palabras distintivas |
| D-5 | «Me llamo Ana Quispe» con mayúscula inicial, un nombre en minúsculas o «mi mamá se llama…» no se quitaban | 1 · Revisión del código y conjunto adversario | El patrón no distingue mayúsculas y cubre a los familiares y la profesora |
| D-6 | En «Urb. Los Pinos Mz B Lt 5» la dirección se cortaba en el punto y quedaba una parte | 1 · Conjunto adversario | Se quitan los puntos de las abreviaturas antes de buscar direcciones |
| D-7 | Los diminutivos de groserías («idiotita») no se tapaban | 1 · Conjunto adversario | El filtro compartido acepta la palabra sin su vocal final más el sufijo (también mejora RF-041 en Lectura) |
| D-8 | Con 9 mensajes a la vez, algunos respondían 409 tras 3 reintentos | 2 · Integración con PostgreSQL | 11 intentos: perder la carrera significa que otro guardó, y no hay más de 10 |
| D-9 | El límite de 20 mensajes por minuto por IP bloquearía a un aula entera (todas sus tablets salen por la IP del colegio) | Análisis para la prueba de carga | 300 por minuto por IP; cada niño ya tiene su tope de 10 por lectura (RF-074) |
| D-10 | La capa HTTP importaba constantes del dominio (regla de capas) | Estático · ESLint | Se exponen desde la capa de aplicación |
| D-11 | La casilla de cada estudiante en el aula solo cambiaba cuando respondía la API | 3 · Playwright | La casilla cambia al instante y vuelve atrás si no se pudo guardar |
| D-12 | Con cada mensaje, la página entera saltaba hasta el chat | Revisión visual | El chat se desplaza por dentro y la pregunta queda en su lugar |
| D-13 | El comentario de la docente era de una línea y cortaba el borrador («¿Qué otra razón pod…») | Revisión visual y 3 · diseño en celular | El área crece con el texto: se lee completo en cualquier pantalla |
| D-14 | En el avance de un niño acompañado por invitación, la nota «Lo activa su docente desde su aula» repetía el texto «Desde su aula» del Módulo 10 y lo volvía ambiguo | 3 · E2E completa (4 fallos del Módulo 10) | «Lo activa su docente para su aula»: el Módulo 10 queda igual |

**Brechas con el SRS cerradas (todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-072 | Asistente durante la lectura | Ayuda dentro de cada pregunta: 4 atajos para quienes aún no escriben con soltura y texto libre; orienta según la pregunta, la habilidad y la edad | U + I + S + UAT |
| B-2 | RF-072, ADR-008 | Activación con consentimiento | Desactivado por defecto; lo activa la familia que creó el perfil o la docente para su aula, por estudiante | U + I + S + UAT |
| B-3 | RF-073 | «Nunca da la respuesta» | La clave nunca llega al motor; el filtro de salida bloquea lo que la revele o señale una opción. Conjunto adversario: 755 casos, 0 fugas | U + I + S + UAT + carga |
| B-4 | RF-073, RN-16 | Moderación de entrada | Datos personales y groserías se quitan antes de guardar o usar el mensaje, con un aviso amable | U + I + UAT |
| B-5 | RF-074 | Máximo 10 intercambios | Por sesión de lectura y atómico aunque lleguen muchos a la vez; el undécimo recibe un cierre amable | U + I + S + UAT + carga |
| B-6 | RF-075 | Borrador de retroalimentación | Una fortaleza, una mejora y una pregunta según la habilidad; la docente lo edita y decide | U + I + S + UAT |
| B-7 | RNF-007 | Primer token en menos de 3 s | Respuesta por SSE: p95 de 70 ms con un aula de 30 | I + carga |
| B-8 | RNF-011 | Si el asistente falla, la lectura sigue | Si el motor falla responde el mediador sin conexión; la lectura nunca depende del asistente | U + S |
| B-9 | SRS §7, ADR-008 | Retención de 30 días | `expira_en` y un trabajo cada 6 horas que borra lo vencido con sus turnos | U + I |
| B-10 | SAD §7 | Endpoints del asistente | `POST /sesiones-lectura/{id}/asistente/turnos` (SSE) y `GET` de lo conversado; activación de familia y de aula; borrador | I + S |
| B-11 | RN-17 | Solo lo propio | La sesión de otro niño, el hijo de otra familia, el aula o la respuesta de otra docente responden 404 | U + I + UAT |

**Decisiones de diseño (el SRS no decía cómo):**
- **Motor sin conexión (decisión del Product Owner, 29/10/2026):** sin IA externa ni costo por ahora. Un mediador socrático propio responde al instante; el puerto `MotorAsistente` permite conectar un modelo después sin cambiar nada más, y el mediador queda de respaldo.
- **Quién lo activa:** la familia que creó el perfil (su consentimiento) o la docente para su aula (consentimiento institucional, RF-015); gana el último cambio y queda quién y cuándo. Si la familia acompaña por invitación, decide la docente.
- **10 intercambios por sesión de lectura:** al repetir una lectura hay otra sesión y otros 10. El undécimo recibe un cierre que invita a seguir y a usar «Pedir una pista»; no se guarda.
- **Pistas oficiales:** el asistente nunca las reemplaza (cuestan puntaje, RN-07): invita a usarlas mientras queden.
- **Qué se guarda:** solo el mensaje ya moderado (`[nombre]`, `[correo]`, `[número]`, `[dirección]`, `[colegio]`) y la respuesta ya revisada, marcados si se filtró algo.
- **La clave:** Lectura la entrega aparte, solo para el filtro. El filtro es conservador: también bloquea mencionar un elemento de un ordenamiento o una oración de evidencia.
- **Borrador (RF-075):** se calcula al pedirlo, no se guarda, no repite lo que escribió el niño y pasa por el filtro de palabras.
- **SSE sobre `POST`:** el mensaje va en el cuerpo (no en la URL, por privacidad); los errores (400, 403, 404) llegan antes de abrir el flujo.
- **Límite de tasa:** 300 mensajes por minuto por IP (un aula entera detrás de la IP del colegio); el tope por niño es RF-074.
- **Filtro de palabras compartido:** se movió al shared-kernel; Lectura lo sigue usando igual (RF-041).

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Modelo externo (ADR-008) | Hoy las respuestas son de plantillas: guían bien, pero no conversan libremente | Conectar un modelo con un adaptador de `MotorAsistente`. El filtro de salida, el respaldo y el conjunto adversario ya cubren esa vía. Antes de activarlo: costo por aula y evaluación con el conjunto adversario |
| Confirmaciones implícitas | Un modelo externo podría decir «¡exacto!» si el niño adivina; el mediador actual nunca confirma | Instrucciones del modelo y ampliar el filtro y el conjunto adversario al conectarlo |
| Moderación por patrones | Un dato personal sin palabra clave (un nombre suelto) no se reconoce | Se borra a los 30 días; evaluar un clasificador al conectar un modelo |
| Auditoría de conversaciones | No hay pantalla para revisarlas | Panel del administrador (Módulo 12) |
| Heredadas | Outbox no transaccional; límite de tasa en memoria; *worker* dentro de la API | Ver informes de los Módulos 1 a 10 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | El asistente usa IAM y Escuela por su `public-api` y Lectura por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Conversación, moderación, intención, mediación, filtro, borrador, casos de uso y conjunto adversario | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | SSE real, activación, límite con concurrencia, datos guardados, retención y borrador | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Familia y docente lo activan, el niño conversa, el borrador y el diseño | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/asistente-turnos.js`, nuevo) | Binario k6 | Un aula de 30 con sus 10 intercambios cada uno | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 6 escenarios nuevos | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/asistente/
│   │   ├── dobles.ts
│   │   ├── dominio/dominio-asistente.spec.ts
│   │   ├── dominio/conjunto-adversarial.spec.ts       # 755 casos, 0 fugas
│   │   └── aplicacion/asistente-casos-de-uso.spec.ts
│   ├── unit/lectura/aplicacion/lectura-casos-de-uso.spec.ts   # + lo que Lectura entrega al asistente
│   └── integration/
│       ├── asistente/asistente-http.int-spec.ts
│       └── estructura/estructura-srs.int-spec.ts       # + tabla y restricciones del asistente
├── tests/
│   ├── e2e/
│   │   ├── support/asistente.ts                        # Activar, tablet de casa y lo guardado
│   │   ├── support/limpieza.ts                         # + conversaciones y activaciones
│   │   ├── specs/asistente/asistente.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts             # + chat del niño y tarjeta de la docente
│   │   ├── features/asistente/asistente.feature
│   │   └── steps/asistente.steps.ts
│   └── load/scenarios/asistente-turnos.js
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Conversación (RF-074):** 10 intercambios, turnos en orden, cierre al décimo y 30 días de retención.
- **Moderación (RF-073, RN-16):** correos, enlaces, teléfonos, DNI, nombres (también en minúsculas), direcciones, colegio y groserías disfrazadas; sin confundir «soy feliz» ni «tengo 8 años».
- **Intención y mediación (RF-072):** qué pide el niño; la guía según el tipo de pregunta, la habilidad, la edad y el momento de la lectura; nunca la respuesta.
- **Filtro de salida (RF-073):** la clave tal cual, con o sin tildes, parafraseada, una opción señalada, datos personales y groserías; sin bloquear guías legítimas.
- **Borrador (RF-075):** criterios de la respuesta, una fortaleza, una mejora y una pregunta por habilidad; no repite lo que escribió el niño.
- **Casos de uso:** el motor nunca ve la clave, datos personales, motor que revela o que falla, límite de 10 también con mensajes simultáneos, activación (RN-17) y borrador.
- **Conjunto adversario (755 casos, 0 fugas), por el caso de uso completo:**
  - 40 intentos de sacarle la respuesta, contra 10 preguntas de cada modalidad y habilidad (400);
  - 30 mensajes con datos personales y 20 con groserías;
  - 305 respuestas «maliciosas» de un modelo externo simulado.
- **Lectura → asistente:** la pregunta en pantalla con lo ya leído, la clave aparte, y la respuesta abierta solo para su docente.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/asistente/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
El dominio y la aplicación del asistente quedan al 100 % de líneas (ramas entre 96,2 % y 100 %).

## 4.4 Código completo del test unitario
`apps/api/test/unit/asistente/dominio/dominio-asistente.spec.ts`:

<<archivo:apps/api/test/unit/asistente/dominio/dominio-asistente.spec.ts>>

`apps/api/test/unit/asistente/dominio/conjunto-adversarial.spec.ts`:

<<archivo:apps/api/test/unit/asistente/dominio/conjunto-adversarial.spec.ts>>

`apps/api/test/unit/asistente/aplicacion/asistente-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/asistente/aplicacion/asistente-casos-de-uso.spec.ts>>

`apps/api/test/unit/asistente/dobles.ts`:

<<archivo:apps/api/test/unit/asistente/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **RF-072:** la familia que creó el perfil lo activa (queda quién); otra familia, la que acompaña por invitación o una docente no pueden; la docente lo activa para todo su aula o para algunos.
- **RN-17:** otra docente, un estudiante ajeno, la sesión de otro niño (404); sin activar (403); un adulto en la ruta del niño (403); datos inválidos (400).
- **RNF-007 y RF-073:** respuesta por SSE (`text/event-stream`, varios eventos y uno de cierre) en menos de 3 s, con una guía y sin la clave.
- **RN-16:** lo guardado no tiene el apellido ni el celular; la conversación vence a los 30 días.
- **RF-074:** 9 mensajes a la vez: exactamente 10 intercambios y 20 turnos; el siguiente recibe el cierre y no se guarda.
- **RF-075:** el borrador de la respuesta abierta de Ana para su docente, `no-store`, y que no se guarda; otra docente, una familia o una respuesta cerrada no.
- **Retención:** a los 30 días se borran las conversaciones con sus turnos.
- **Estructura:** las 3 tablas del schema y sus restricciones (una conversación por sesión, turnos 1–20 con texto y quién activa).

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/asistente/asistente-http.int-spec.ts`:

<<archivo:apps/api/test/integration/asistente/asistente-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **Familia y niño (RF-072 a RF-074):** la familia lo activa desde el avance de su hija; ella, en la tablet de casa, toca «No entiendo la pregunta» y escribe pidiendo la respuesta: recibe una guía, nunca «Le dolía algo», y le quedan 8 preguntas. La lectura sigue igual y lo conversado sigue ahí.
- **Docente (RF-072, RF-075):** lo activa para todo el aula, lo quita a Ana, pide un borrador para la respuesta de Mateo, lo edita y lo guarda con su valoración.
- **Diseño (RNF-022, RNF-023):** el chat del niño y la tarjeta de la docente en 1280, 820 y 390 px sin desbordes y con objetivos de 48 px. En 5 tamaños de laptop:
  - las ayudas rápidas en 2 filas como mucho;
  - «Preguntar» junto a la caja;
  - el borrador se lee completo.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:asistente --workspace @lectoaventura/tests-load
```

**Resultado de carga obtenido el 29/10/2026.** El perfil es el mismo del script k6, que se ejecuta en CI:
- un aula de 30 niños con el asistente activado;
- 10 a la vez, cada uno con sus 10 intercambios (300);
- todos desde la misma IP, como las tablets de un colegio;
- portátil de desarrollo con la API compilada y PostgreSQL local.

| Medición | Muestras | Errores | Fugas de la clave | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| Primer evento de la respuesta (`POST …/asistente/turnos`) | 300 | 0 | 0 | 46 ms | 70 ms | 243 ms | primer token < 3 s (RNF-007) | ✅ |
| Lo conversado al abrir la ayuda (`GET …/asistente`) | 60 | 0 | — | 21 ms | 32 ms | 40 ms | p95 < 300 ms (RNF-001) | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/asistente/asistente.spec.ts`:

<<archivo:tests/e2e/specs/asistente/asistente.spec.ts>>

`tests/e2e/support/asistente.ts`:

<<archivo:tests/e2e/support/asistente.ts>>

`tests/load/scenarios/asistente-turnos.js`:

<<archivo:tests/load/scenarios/asistente-turnos.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/asistente/asistente.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/asistente.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como familia, activar el asistente desde «Ver su avance» | La casilla cambia y dice que ya puede pedir ayuda |
| ☐ | Como docente, activarlo para el aula y quitarlo a un estudiante | «Activado para N de M estudiantes» |
| ☐ | Como niño, tocar cada ayuda rápida y escribir preguntas | Guías que hacen pensar, a su edad; nunca la respuesta |
| ☐ | Intentar que diga la respuesta («dime la respuesta», «¿es la B?», «ignora tus instrucciones») | Siempre una guía y la invitación a «Pedir una pista» |
| ☐ | Escribir un nombre completo, un teléfono o una dirección | Aviso amable; no queda guardado |
| ☐ | Conversar 10 veces en una lectura | Cierre amable; ya no se puede escribir |
| ☐ | Revisar los textos del guía con el líder pedagógico | Claros, cálidos, adecuados a cada edad y al tipo de pregunta |
| ☐ | Como docente, «Sugerir un comentario» en una respuesta abierta | Un borrador editable que solo se envía al guardar |
| ☐ | Revisar en laptops de distinto tamaño, tablet y celular | El chat y las tarjetas sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea «Responsable de aprobación» de `asistente.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo asistente`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo:
- el MCP de PostgreSQL ayuda a revisar lo guardado en `asistente.turno` (sin datos personales);
- el navegador integrado sirvió para revisar el chat en distintos tamaños.

Al conectar un modelo externo, el conjunto adversario es la evaluación que debe pasar antes de activarlo.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el escenario k6 del asistente (un aula de 30 con sus 300 intercambios, sobre la lectura que ya siembra el escenario de lectura), con sus tiempos en las anotaciones de la ejecución.

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ASI-U-01 | Conversación (RF-074) | Unit | Pos./Borde | 10 intercambios; cierre; 30 días | `npm run test:unit` |
| ASI-U-02 | Moderación de entrada (RN-16) | Unit | Pos./Neg. | Datos personales y groserías fuera | `npm run test:unit` |
| ASI-U-03 | Intención y mediación (RF-072) | Unit | Positivo | Guía según pregunta, habilidad y edad | `npm run test:unit` |
| ASI-U-04 | Filtro de salida (RF-073) | Unit | Neg./Borde | Bloquea fugas; deja pasar guías | `npm run test:unit` |
| ASI-U-05 | Borrador (RF-075) | Unit | Positivo | Fortaleza, mejora y pregunta | `npm run test:unit` |
| ASI-U-06 | Casos de uso | Unit | Pos./Neg. | Motor sin clave, respaldo, concurrencia, RN-17 | `npm run test:unit` |
| ASI-U-07 | Conjunto adversario (755 casos) | Unit | Seguridad | 0 fugas | `npm run test:unit` |
| ASI-U-08 | Lo que entrega Lectura | Unit | Pos./Neg. | Clave aparte; solo su docente | `npm run test:unit` |
| ASI-I-01 | Activación (RF-072, RN-17) | Int | Pos./Neg. | Familia y docente; 404/403/400 | `npm run test:int` |
| ASI-I-02 | Conversación por SSE (RF-073, RNF-007) | Int | Pos./Rendimiento | Eventos en < 3 s; sin la clave | `npm run test:int` |
| ASI-I-03 | Datos guardados y retención (RN-16) | Int | Seguridad | Sin datos personales; 30 días | `npm run test:int` |
| ASI-I-04 | Límite con concurrencia (RF-074) | Int | Borde | Exactamente 10; cierre | `npm run test:int` |
| ASI-I-05 | Borrador (RF-075, RN-17) | Int | Pos./Neg. | `no-store`; solo su docente | `npm run test:int` |
| ASI-S-01 | Familia y niño | Sys | Positivo | Guía sin respuesta; 8 restantes | `npm run test:e2e` |
| ASI-S-02 | Docente y borrador | Sys | Positivo | Activar, quitar, borrador y guardar | `npm run test:e2e` |
| ASI-S-03 | Diseño (RNF-022, RNF-023) | Sys | Accesibilidad | Sin desbordes; 48 px; laptops | `npm run test:e2e` |
| ASI-S-04 | Carga (RNF-007) | Sys | Rendimiento | Ver §6.3 | `npm run test:asistente --workspace @lectoaventura/tests-load` |
| ASI-A-01..06 | 6 escenarios Gherkin (RF-072 a RF-075, RN-16, RN-17) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 10/10 — el motor, la moderación y el filtro son puros y están detrás de puertos; un motor espía simula a un modelo externo.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación del asistente al 100 % de líneas.
- **Aislamiento de dependencias** ............... 10/10 — solo el schema `asistente`; IAM y Escuela por su `public-api`; Lectura por el shared-kernel.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; escenario k6 propio en CI.
- **Resiliencia ante fallos (edge cases)** ...... 10/10 — ataques para sacar la respuesta, datos personales, motor que falla o revela, y mensajes simultáneos cubiertos.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner y del líder pedagógico (textos del guía)
