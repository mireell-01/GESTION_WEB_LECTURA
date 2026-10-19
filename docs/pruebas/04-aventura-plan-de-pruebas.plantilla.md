# Plan Maestro de Pruebas — Módulo 4: Aventura (Mapa, Mundos y Misiones)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/aventura` + mapa y mundos del estudiante y backoffice de misiones
> **Requisitos cubiertos:** RF-030 a RF-033, RN-05, RN-09, invariante de `ProgresoAventura` (SRS §6), cardinalidad Mundo — Misión 3..20 (SRS §7), RF-018 (misiones para asignar), RF-077 (parcial: misiones), RF-011 (backoffice con MFA), RNF-001, RNF-019, RNF-022, RNF-023 y los eventos del SAD §6 que llegarán de los Módulos 5, 6 y 7
> **Fecha de ejecución:** 19/10/2026 · **Resultado global:** ✅ 531 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 3 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 4 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 313 | 33 | ✅ 313/313 · cobertura 96,9 % líneas / 93,2 % ramas | 45 s |
| 2 · Integración (Supertest + PostgreSQL real) | 94 | 12 | ✅ 94/94 | 78 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 96 | 15 | ✅ 96/96 en una sola corrida completa contra la compilación de producción | 11,1 min |
| 3 · Carga (RNF-001) | 2 mediciones | 2 | ✅ 0 % errores · p95 de 59 y 73 ms | 1 min |
| 4 · Aceptación (Gherkin en español) | 28 escenarios | 4 | ✅ 28/28 · informe para el Product Owner | 2,5 min |

**Defectos encontrados por las pruebas y corregidos:** 8 · **Brechas con el SRS cerradas:** 8 · **Decisiones documentadas donde el SRS no decía cómo:** 6 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `aventura` (5 tablas, SRS §7) · migración `20261021000000_aventura_misiones_por_edad` |
| Eventos | Outbox `admin.outbox_evento` + bus en proceso (ADR-009); contrato de integración en el shared-kernel |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  AventuraController (/aventura/mapa, /aventura/mundos/{id}/misiones, /celebracion; ESTUDIANTE)
           BackofficeMisionesController (/backoffice/mundos/*, /backoffice/misiones/*; EDITOR, REVISOR con MFA)
   │  usa CasosUsoAventura (token CASOS_USO_AVENTURA)
   ▼
application MapaUseCase (mapa, misiones de un mundo, celebración) · ProgresoUseCase (posición inicial,
           avance de misiones, desbloqueo) · MisionesBackofficeUseCase (crear, editar, ordenar)
           · servicio Posicionamiento (RF-033, RN-05)
   │  puertos: AventuraRepository, IdentidadEstudiantes (IAM) y, del shared-kernel: FichasLectura,
   │           DiagnosticoInicial, Maestria, AvanceLecturas, BusEventos
   ▼
domain     ProgresoAventura (BLOQUEADO → DISPONIBLE → COMPLETADO; invariante del SRS §6) · Mision
           · política de progresión (umbral 65, 3 misiones, mundo inicial) · errores · eventos

infrastructure PrismaAventuraRepository (avance de mundo condicional, orden diferible) · IdentidadEstudiantesIam
               SuscripcionesAventura (escucha los eventos de los Módulos 5, 6 y 7) · CatalogoMisiones (Escuela)

Otros módulos (solo por su public-api o por el shared-kernel):
  IAM ─────────── rango de edad del niño (IamFacade)
  Contenido ───── registra las fichas de sus lecturas publicadas (FICHAS_LECTURA)
  Módulo 5 ────── registrará DIAGNOSTICO_INICIAL y publicará diagnostico.DiagnosticoFinalizado
  Módulo 6 ────── registrará AVANCE_LECTURAS y publicará lectura.SesionLectura{Iniciada,Finalizada}
  Módulo 7 ────── registrará MAESTRIA_LECTOR y publicará progreso.MaestriaActualizada
  Escuela ─────── recibe las misiones por el catálogo asignable (con su mundo y su edad)
  Administración  guarda en admin.auditoria las misiones creadas, editadas y reordenadas
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `AventuraRepository` | Interna (puerto) | `AventuraEnMemoria` (`test/unit/aventura/dobles.ts`): copias, avance condicional y orden único como la base | **Real**: Prisma + PostgreSQL |
| `IdentidadEstudiantes` (IAM) | Interna (anticorrupción) | `IdentidadFalsa` | **Real**: `IamFacade` |
| `FichasLectura` (Contenido) | Shared-kernel | `FichasFalsas` (publicar / archivar) | **Real**: lecturas publicadas por el flujo editorial |
| `DiagnosticoInicial`, `Maestria`, `AvanceLecturas` (Módulos 5, 6, 7) | Shared-kernel | Dobles controlables | Implementaciones de prueba registradas en el registro real |
| `BusEventos` + Outbox | Interna | `BusEspia` | **Real**: eventos publicados en el bus, `admin.outbox_evento` y `admin.auditoria` |
| Reloj y generador de ids | Inyectados | Controlables | Reales (UUID v7) |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| A-1 | Quedaba el andamiaje de ejemplo del módulo, con `POST /aventura/demo` que devolvía lo recibido | Auditoría del módulo | Eliminado; una prueba de integración confirma el 404 |
| A-2 | La limpieza de las pruebas no borraba las misiones armadas con lecturas de prueba ni el mapa de los niños de prueba (no hay llave foránea entre schemas) | Revisión de la limpieza | `limpieza.ts` borra misiones con lecturas de prueba y el progreso de los perfiles de prueba |
| A-3 | En el backoffice, con `Promise.all` y *spread*, TypeScript perdía el tipo de cada resultado | Estático · `tsc` | Dos esperas tipadas por separado |
| A-4 | Una prueba unitaria de "evento simultáneo" no ejercitaba la carrera: el mundo aún no tenía misiones completadas | Revisión de pruebas | Reescrita: las misiones se completan con el avance simulado y luego se evalúa con el otro evento ganando |
| A-5 | La rama "dos pedidos simultáneos la primera vez" del posicionamiento no tenía prueba | 1 · cobertura (91,7 %) | Prueba nueva con dos pedidos en paralelo: se posiciona una sola vez |
| A-6 | El selector de edad del backoffice decía "1 misiones" | 3 · navegador | Singular y plural correctos |
| A-7 | El ayudante de E2E y un paso del UAT reconocían el inicio del niño por el texto "Tu mapa de aventuras se está preparando", que el mapa real reemplazó | 3 y 4 · Playwright | Ahora esperan el título "Tus mundos" del mapa |
| A-8 | En celular, el botón "Agregar" del formulario de misión quedaba de 32 px de ancho junto a un título largo (RNF-023) | 3 · `responsivo.spec.ts` | Fila propia (`.mision-lectura`) en la que el botón no se encoge |

**Observación de entorno (no es un defecto):** en una corrida intermedia del UAT, el navegador tardó 12 s en dibujar el panel de la docente después de un ingreso correcto (la red respondió en menos de 50 ms); el escenario pasó en la corrida final completa. Ver el informe del Módulo 3, C-12.

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-030 | Mapa con los 5 mundos y su estado | `GET /aventura/mapa`: estado, habilidades foco (con su maestría cuando se conozca) y misiones completadas de la edad del niño; el inicio y "Mundos" lo muestran | U + I + S + UAT + carga |
| B-2 | RF-031 / RN-09 | Desbloqueo y celebración | Habilidades foco ≥ 65 y 3 misiones completadas abren el mundo siguiente; actualización condicional (nunca dos veces); celebración accesible que se muestra una sola vez; en menos de 2 s tras el evento | U + I + S + UAT |
| B-3 | RF-032 | Misiones de cada mundo | `GET /aventura/mundos/{id}/misiones` con lecturas publicadas y su avance; completada cuando todas sus lecturas tienen sesión finalizada; nunca retrocede | U + I + S + UAT + carga |
| B-4 | RF-033 / RN-05 | Mundo inicial según el diagnóstico | LIT y VOC ≥ 65 → mundo 2 (el 1 completado); si no, mundo 1; diagnóstico pendiente → sin mapa | U + I + UAT |
| B-5 | SRS §6 | Invariante "un mundo no puede estar COMPLETADO si el anterior está BLOQUEADO" | Agregado `ProgresoAventura` + `CHECK ck_progreso_mundo_fechas` | U + I |
| B-6 | SRS §7 | Mundo — Misión 1 : 3..20 sin autoría | Backoffice de misiones por mundo y edad (hasta 20; aviso si hay menos de 3) | U + I + S + UAT |
| B-7 | RF-018 / RF-077 | Misiones reales para asignar y su auditoría | El catálogo de Escuela muestra "Mundo N · nombre · edad"; crear, editar y reordenar quedan en `admin.auditoria` | I |
| B-8 | SAD §6 | Los eventos entre módulos no tenían contrato | `EVENTOS_INTEGRACION` y puertos en el shared-kernel; Aventura ya escucha a Diagnóstico, Lectura y Progreso | U + I |

**Decisiones de diseño (el SRS no decía cómo):**
- **Misiones por edad:** columna `aventura.mision.rango_edad`; las lecturas de una misión son de su edad, así niños de 7 y de 11 años recorren los mismos mundos con lecturas adecuadas.
- **Orden diferible:** la restricción única `(mundo_id, rango_edad, orden)` se comprueba al confirmar la transacción, para poder intercambiar posiciones.
- **Celebración vista:** columna `aventura.progreso_mundo.celebrado_en`; el mundo inicial no se celebra.
- **Sin el Módulo 5 todavía:** todos empiezan en el mundo 1. Cuando exista, un diagnóstico pendiente deja el mapa cerrado (RN-05) y uno finalizado aplica RF-033.
- **Sin los Módulos 6 y 7 todavía:** el mapa no avanza solo; Aventura ya escucha sus eventos. Lo ya leído cuenta al abrir un mundo nuevo (puede abrir dos mundos seguidos).
- **Autoría:** EDITOR arma y ordena; REVISOR consulta. No se borran misiones en esta versión porque podrían tener avance de los niños.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Caché del mapa (60 s, SRS) y del catálogo de misiones (24 h) | Hoy cada visita consulta la base (rinde bien: ver §6.3) | Redis cuando se despliegue (ADR-004), invalidando con `MundoDesbloqueado` y `SesionLecturaFinalizada` |
| "Leer" desde la misión | El niño ve las lecturas de la misión, pero el lector llega con el Módulo 6 | Enlazar cada lectura con la sesión de lectura |
| Insignia de rango al desbloquear | `aventura.MundoDesbloqueado` ya se publica, nadie lo escucha aún | Gamificación (Módulo 8) |
| Retirar misiones | No hay borrado ni archivo | Archivo lógico con su efecto en el avance (Módulo 12) |
| Mundos sin 3 misiones para una edad | El niño no podría pasar de mundo | El backoffice avisa; meta de contenido antes del piloto (≥ 60 lecturas, SRS) |
| Heredadas | Outbox no transaccional; límite de tasa en memoria; secreto MFA sin cifrar | Ver informes de los Módulos 1 a 3 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Aventura usa IAM por su `public-api` y lo demás por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Política de progresión, `ProgresoAventura`, `Mision`, casos de uso con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real; eventos reales en el bus con los puertos de los Módulos 5–7 simulados | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Editora arma misiones; niño recorre mapa y mundos; celebración | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/aventura-mapa.js`) + sembrado `tests/load/sembrar-aventura.mjs` | Binario k6 | RNF-001 en el mapa y las misiones | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 4 escenarios Gherkin en español | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/aventura/
│   │   ├── dobles.ts                           # Repositorio en memoria y puertos de los Módulos 5–7 simulados
│   │   ├── dominio/dominio-aventura.spec.ts    # Política de progresión, ProgresoAventura, Mision
│   │   └── aplicacion/aventura-casos-de-uso.spec.ts
│   └── integration/aventura/aventura-http.int-spec.ts   # HTTP + PostgreSQL + eventos reales
├── tests/
│   ├── e2e/
│   │   ├── support/aventura.ts                 # Misiones por la API, id de mundos, desbloqueo simulado
│   │   ├── specs/aventura/aventura.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts     # + mapa, mundo y backoffice de misiones
│   │   ├── features/aventura/aventura.feature
│   │   └── steps/aventura.steps.ts
│   └── load/
│       ├── sembrado.mjs                        # Utilidades comunes de sembrado (solo desarrollo y CI)
│       ├── sembrar-aventura.mjs                # 3 misiones por mundo para 8–9 años
│       └── scenarios/aventura-mapa.js          # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Política de progresión:** mundo inicial (RF-033: 70/68 → 2; 65/65 → 2; 64,9 → 1; nunca más allá del 2), umbral RN-09 (todas las habilidades foco ≥ 65 y 3 misiones; sin maestría conocida no se desbloquea), estado de una misión y que nunca retroceda.
- **`ProgresoAventura`:** posición inicial, completar y desbloquear, celebración una sola vez, último mundo, y rechazo de progresos imposibles (completado tras bloqueado, dos disponibles, fechas, mundos faltantes).
- **`Mision`:** título, descripción, 1 a 10 lecturas sin repetir, posición 1–20 y edad.
- **Casos de uso:** mapa sin el Módulo 5, con diagnóstico pendiente y finalizado; dos pedidos simultáneos; misiones de su edad sin lecturas retiradas; mundo bloqueado; avance por eventos; desbloqueo con celebración; varios mundos seguidos; evento simultáneo; último mundo; backoffice (orden, edad, publicadas, límite 20, reordenar, auditoría).

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/aventura/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación de Aventura (entre 91 % y 100 % de líneas por archivo).

## 4.4 Código completo del test unitario
`apps/api/test/unit/aventura/dominio/dominio-aventura.spec.ts`:

<<archivo:apps/api/test/unit/aventura/dominio/dominio-aventura.spec.ts>>

`apps/api/test/unit/aventura/aplicacion/aventura-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/aventura/aplicacion/aventura-casos-de-uso.spec.ts>>

`apps/api/test/unit/aventura/dobles.ts`:

<<archivo:apps/api/test/unit/aventura/dobles.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **Backoffice con MFA:** docentes y niños reciben 403; el revisor consulta pero no crea; `POST /aventura/demo` ya no existe.
- **Misiones en la base:** orden por mundo y edad, lecturas en orden en `aventura.mision_lectura`, rechazo de lecturas de otra edad o no publicadas, auditoría con actor y rol, **reordenar con la restricción diferible**.
- **Segunda barrera de la base:** `ck_mision_rango_edad` y `ck_progreso_mundo_fechas`.
- **Mapa:** posición una sola vez (5 filas y un evento), misiones de la edad sin respuestas, 409 en un mundo bloqueado, 404 en uno inexistente, 403 para adultos.
- **Eventos reales en el bus** (lo que publicarán los Módulos 5, 6 y 7): diagnóstico pendiente y finalizado (RF-033), sesiones finalizadas que completan misiones, desbloqueo en menos de 2 s con `aventura.MundoDesbloqueado` en el outbox, celebración marcada; repetir eventos no desbloquea dos veces.
- **Módulo 2:** las misiones aparecen para asignar con su mundo y su edad.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/aventura/aventura-http.int-spec.ts`:

<<archivo:apps/api/test/integration/aventura/aventura-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **La editora en la web real** (con MFA) elige mundo y edad, arma una misión con una lectura publicada y la ve en la lista.
- **El niño** (9 años) entra con su PIN: su inicio y "Mundos" lo ubican en el Explorador con los demás bloqueados; abre el mundo y ve la misión con su lectura.
- **Un mundo bloqueado** no se abre ni escribiendo su dirección.
- **RF-031:** tras un desbloqueo, la celebración aparece con el foco en "¡Vamos!", se cierra y no vuelve; el mundo nuevo se abre con sus misiones.
- **El revisor** consulta las misiones sin poder cambiarlas.
- **Diseño responsivo (RNF-022, RNF-023)** del mapa, del mundo y del backoffice de misiones con el formulario abierto, en 1280, 820 y 390 px.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:aventura --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción (`api-compilada` y `web-compilada` de `.claude/launch.json`), como en CI; ver el informe del Módulo 3, C-12.

**Resultado de carga obtenido el 19/10/2026** (3 misiones de 8–9 años por mundo con `sembrar-aventura.mjs`; 10 niños durante 60 s con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /api/v1/aventura/mapa`, 10 niños (5 mundos con su estado y misiones) | 6 730 | 0,00 % | 35 ms | 59 ms | 90 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `GET /api/v1/aventura/mundos/{id}/misiones` (3 misiones con 2 lecturas cada una) | 6 730 | 0,00 % | 46 ms | 73 ms | 105 ms | p95 < 300 ms, p99 < 800 ms | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/aventura/aventura.spec.ts`:

<<archivo:tests/e2e/specs/aventura/aventura.spec.ts>>

`tests/e2e/support/aventura.ts`:

<<archivo:tests/e2e/support/aventura.ts>>

`tests/load/scenarios/aventura-mapa.js`:

<<archivo:tests/load/scenarios/aventura-mapa.js>>

`tests/load/sembrar-aventura.mjs`:

<<archivo:tests/load/sembrar-aventura.mjs>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/aventura/aventura.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/aventura.steps.ts>>

**Checklist manual para el Product Owner / equipo de contenidos:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como editora, "Misiones" → Mundo 1 · Explorador → 8–9 años → "+ Nueva misión" | Solo ofrece lecturas publicadas de 8–9 años; se crea en la posición siguiente |
| ☐ | Crear menos de 3 misiones en un mundo | El backoffice avisa que los niños necesitan completar al menos 3 |
| ☐ | "↑ Subir" / "↓ Bajar" | El orden cambia y se mantiene al recargar |
| ☐ | Entrar como revisor a "Misiones" | Puede consultar, pero no crear, editar ni ordenar |
| ☐ | Entrar como niño de 9 años | Su inicio y "Mundos" muestran el Explorador disponible y los demás con candado |
| ☐ | Abrir el Explorador | Se ven sus misiones en orden, con sus lecturas "Por leer" |
| ☐ | Escribir la dirección de un mundo bloqueado | Explica que primero debe completar el anterior |
| ☐ | Revisar todo en celular, tablet y computadora | Sin desplazarse a los lados; botones fáciles de tocar |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `aventura.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo aventura`. Los servidores MCP recomendados (Playwright, PostgreSQL de solo lectura sobre `lectoaventura_test`, GitHub) están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `aventura.progreso_mundo`, `aventura.progreso_mision` y los eventos `aventura.*` de `admin.outbox_evento`.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga del mapa (con su sembrado):

```yaml
          node tests/load/sembrar-aventura.mjs
          k6 run -e DURACION=30s tests/load/scenarios/aventura-mapa.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| AVE-U-01 | `mundoInicial` (RF-033) | Unit | Borde | 70/68 y 65/65 → 2; 64,9 → 1; nunca > 2; sin dato → 1 | `npm run test:unit` |
| AVE-U-02 | `evaluarUmbral` (RN-09) | Unit | Borde | Foco ≥ 65 y 3 misiones; sin maestría no desbloquea | `npm run test:unit` |
| AVE-U-03 | Estado de misión (RF-032) | Unit | Pos./Borde | Completada con todas finalizadas; en curso si alguna empezó; nunca retrocede | `npm run test:unit` |
| AVE-U-04 | `ProgresoAventura` (RF-031, SRS §6) | Unit | Pos./Neg. | Posición inicial, desbloqueo, celebración única, último mundo, progresos imposibles rechazados | `npm run test:unit` |
| AVE-U-05 | `Mision` | Unit | Neg./Borde | Título 3–80, descripción ≤ 300, 1–10 lecturas sin repetir, posición 1–20, edad | `npm run test:unit` |
| AVE-U-06 | `MapaUseCase` (RF-030, RN-05) | Unit | Pos./Neg. | Sin Módulo 5 → mundo 1; pendiente → sin mapa; finalizado → mundo 2; simultáneos → una vez | `npm run test:unit` |
| AVE-U-07 | Misiones de un mundo (RF-032) | Unit | Pos./Neg. | Su edad, en orden, sin lecturas retiradas; bloqueado 409; inexistente 404 | `npm run test:unit` |
| AVE-U-08 | `ProgresoUseCase` (RF-031, RF-032) | Unit | Pos./Borde | Avance por eventos; desbloqueo con celebración; dos mundos seguidos; evento simultáneo; último mundo | `npm run test:unit` |
| AVE-U-09 | `MisionesBackofficeUseCase` | Unit | Pos./Neg. | Orden por mundo y edad; solo publicadas de su edad; límite 20; reordenar completo; auditoría | `npm run test:unit` |
| AVE-I-01 | Backoffice protegido (RF-011) | Int | Negativo | Docente y niño 403; revisor no crea; demo 404 | `npm run test:int` |
| AVE-I-02 | Crear y validar misiones | Int | Pos./Neg. | Filas en `mision_lectura`; edad y publicación validadas; auditoría | `npm run test:int` |
| AVE-I-03 | Reordenar (restricción diferible) | Int | Positivo | Intercambio en una transacción; 400 si falta una | `npm run test:int` |
| AVE-I-04 | Restricciones `CHECK` | Int | Negativo | Edad y fechas de progreso imposibles rechazadas | `npm run test:int` |
| AVE-I-05 | Mapa y misiones del niño (RF-030, RF-032) | Int | Pos./Neg. | Posición única; sin respuestas; 409, 404, 403 | `npm run test:int` |
| AVE-I-06 | Diagnóstico por eventos (RF-033, RN-05) | Int | Pos./Neg. | Pendiente sin mapa; finalizado 80/66 → Detective | `npm run test:int` |
| AVE-I-07 | Desbloqueo por eventos (RF-031, RN-09) | Int | Pos./Borde | ≤ 2 s; `MundoDesbloqueado` en el outbox; celebración marcada; sin duplicados | `npm run test:int` |
| AVE-I-08 | Catálogo de Escuela (RF-018) | Int | Positivo | "Mundo 1 · Explorador · 8–9 años" | `npm run test:int` |
| AVE-S-01 | Editora arma la misión → el niño la ve (RF-030, RF-032, RF-033) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| AVE-S-02 | Mundo bloqueado por dirección (RF-030) | Sys | Negativo | Mensaje y vuelta al mapa | `npm run test:e2e` |
| AVE-S-03 | Celebración (RF-031) | Sys | Positivo | Foco en "¡Vamos!", una sola vez | `npm run test:e2e` |
| AVE-S-04 | Revisor solo consulta | Sys | Negativo | Sin botones para crear ni editar | `npm run test:e2e` |
| AVE-S-05 | Mapa, mundo y backoffice responsivos (RNF-022, RNF-023) | Sys | Borde | 0 px de desborde y ≥ 48 px | `npm run test:e2e` |
| AVE-S-06 | Carga RNF-001 | Sys | Rendimiento | Ver §6.3 | `npm run test:aventura --workspace @lectoaventura/tests-load` |
| AVE-A-01..04 | 4 escenarios Gherkin (RF-030 a RF-033) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — reglas puras en el dominio; los datos de los Módulos 5–7 llegan por puertos fáciles de simular.
- **Cobertura unitaria alcanzable** ............. 9/10 — dominio y aplicación de Aventura entre 91 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — sin importar módulos que aún no existen: contrato de eventos y puertos en el shared-kernel.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; humo de carga k6 del mapa con su sembrado.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — avance condicional, orden diferible, invariante en dominio y base, eventos repetidos o simultáneos; pendiente la caché del SRS.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
