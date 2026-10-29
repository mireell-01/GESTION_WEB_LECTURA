# Plan Maestro de Pruebas — Módulo 10: Acompañamiento familiar

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/reporting` (parte familiar) + el avance de cada hijo (`/familia/hijos/{id}`), el resumen semanal en "Mis hijos" y la página de baja con un clic (`/resumen-familiar/baja`)
> **Requisitos cubiertos:** RF-068 a RF-071, RN-17 (la familia solo ve a sus hijos vinculados), RF-019 (familias que acompañan por invitación de la docente), RNF-001 (panel en p95 < 300 ms), RNF-012, RNF-022 y RNF-023, y el caché de 5 minutos del panel familiar (SRS §7)
> **Fecha de ejecución:** 27/10/2026 · **Resultado global:** ✅ 866 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 9 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 10 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 479 | 19 | ✅ 479/479 · cobertura 97,9 % líneas / 93,4 % ramas | 52 s |
| 2 · Integración (Supertest + PostgreSQL real) | 176 | 10 | ✅ 176/176 | 240 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 155 | 9 | ✅ 155/155 en una sola corrida completa contra la compilación de producción (+ 4 omitidas a propósito: los tamaños de laptop solo corren en computadora) | 19,3 min |
| 3 · Carga (RNF-001) | 2 mediciones | 2 | ✅ 0 % errores en 9.660 peticiones · panel p95 182 ms / p99 433 ms · preferencia p95 82 ms | 60 s |
| 4 · Aceptación (Gherkin en español) | 56 escenarios | 5 | ✅ 56/56 · informe para el Product Owner | 8,5 min |

Una corrida completa anterior tuvo 2 fallos porque Windows suspendió la red durante la ejecución (`net::ERR_NETWORK_IO_SUSPENDED`): ambos pasaron al repetirlos y la corrida completa siguiente, con la computadora sin suspenderse, salió limpia (la de la tabla).

**Defectos encontrados por las pruebas y corregidos:** 7 · **Brechas con el SRS cerradas:** 10 · **Decisiones documentadas donde el SRS no decía cómo:** 9 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `reporting`: 2 tablas nuevas, 2 vistas materializadas nuevas y 1 vista · migración `20261027000000_reporting_acompanamiento_familiar` |
| Firma del enlace de baja | `node:crypto` (HMAC-SHA256, sin dependencias nuevas) |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  AcompanamientoFamiliarController (/familia/estudiantes/{id}/panel, /familia/preferencias-notificacion
           GET y PATCH: FAMILIAR; …/baja y …/alta: públicos con enlace firmado y límite de tasa)
           DesarrolloReportesController (/dev/reportes/ejecutar: solo desarrollo y CI)
   │  usa CasosUsoReporting (token CASOS_USO_REPORTING)
   ▼
application PanelHijoUseCase (semana, avance, habilidades y acompañamiento en casa) ·
           PreferenciasFamiliaUseCase (panel y enlace) · ResumenFamiliarUseCase (correo del domingo)
   │  puertos: ReportesFamiliaRepository, HijosFamilia y NotificadorFamilia (IAM), FirmaBaja
   │           + del shared-kernel: FICHAS_LECTURA, LECTURAS_REALIZADAS
   ▼
domain     habilidades a reforzar (< 65) · catálogo de consejos por habilidad y edad (RF-069) · semana del
           resumen (domingo 18:00 de Lima)

infrastructure PrismaReportesRepository (solo el schema `reporting`) · HijosFamiliaIam y NotificadorFamiliaIam ·
               HmacFirmaBaja · TrabajosReporting (también el resumen familiar)

Otros módulos (solo por su public-api, el shared-kernel o vistas de `reporting`):
  IAM ─────────── los hijos de la familia (IamFacade.hijosDeFamilia, nuevo) y el correo (con cabeceras RFC 8058)
  Lectura ─────── LECTURAS_REALIZADAS (no sugerir una lectura ya terminada)
  Contenido ───── FICHAS_LECTURA (la lectura sugerida para cada habilidad)
  Progreso, Aventura, Gamificación, Lectura ── por las vistas mv_maestria_perfil y mv_avance_estudiante
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `ReportesFamiliaRepository` | Interna (puerto) | `FamiliaEnMemoria` (`test/unit/reporting/dobles-familia.ts`) | **Real**: Prisma + vistas del schema `reporting` refrescadas en la prueba |
| `HijosFamilia`, `NotificadorFamilia` | Anticorrupción | `HijosFalsos`, `CorreoFamiliaFalso` | **Reales**: `IamFacade` con la bandeja de correos de desarrollo |
| Fichas y lecturas realizadas | shared-kernel | `FichasFalsas`, `RealizadasFalsas` | **Reales**: Contenido y Lectura registrados |
| `FirmaBaja` | Interna | **Real**: `HmacFirmaBaja` (es pura) | **Real** |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | La vista de maestría por perfil incluía perfiles ya eliminados (640 filas para 14 perfiles vigentes) | Revisión de las vistas tras migrar | La vista solo toma perfiles vigentes: un niño eliminado (RF-013) no aparece |
| D-2 | En el correo, un niño sin mapa todavía tenía una línea que empezaba en minúscula («lleva 0 lecturas…») | Prueba de humo de la API | «Aún no empieza su aventura…» o «Lleva N lecturas…», según el caso |
| D-3 | El panel mostraba «0 min» junto a «1 lectura terminada» y respuestas (lecturas de pocos segundos) | Revisión visual | Si respondió o terminó algo, al menos 1 minuto |
| D-4 | Junto a una semana con lectura decía «Tampoco leyó la semana anterior» | Revisión visual | Comparación neutra: «La semana anterior: N min» |
| D-5 | El nivel de cada habilidad quedaba a veces a la derecha y a veces debajo, y «Aún descubriendo» no se explicaba | Revisión visual | Nombre y qué significa a la izquierda, nivel a la derecha; una leyenda explica la escala para no especialistas |
| D-6 | Las tarjetas de consejos repartían su contenido a lo alto para igualar a su vecina, y una tercera quedaba sola | Revisión visual | 3 columnas en laptops y el contenido arriba |
| D-7 | La casilla del resumen semanal solo cambiaba cuando respondía la API | 3 · Playwright | La casilla cambia al instante y vuelve atrás si no se pudo guardar |

**Brechas con el SRS cerradas (todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-068 | Panel por hijo | Su semana (minutos, lecturas y respuestas, y la anterior), su avance (mundo, lecturas, puntos e insignias) y sus 5 habilidades | U + I + S + UAT + carga |
| B-2 | RF-068, RN-17 | "Solo estudiantes vinculados a la cuenta" | Hijos propios y los acompañados por invitación de su docente; cualquier otro, 404 | U + I + S + UAT |
| B-3 | RF-069 | Recomendaciones para casa | Hasta 3 habilidades a reforzar con 2 consejos de su edad cada una y una lectura sugerida que aún no terminó | U + I + S + UAT + carga |
| B-4 | RF-069 | "Redactada para no especialistas" | Catálogo sin siglas ni términos técnicos (verificado por prueba); nombres y significado de cada habilidad | U + UAT |
| B-5 | RF-070 | Resumen semanal por correo | Domingos desde las 18:00 de Lima, una vez por familia y semana, con cada hijo activo | U + I + S + UAT |
| B-6 | RF-070 | "Baja con un clic" | Enlace firmado que da de baja al abrirlo (y deshacerlo); botón del programa de correo (RFC 8058); también desde el panel | U + I + S + UAT |
| B-7 | SAD §7 | `GET /familia/estudiantes/{id}/panel` y `PATCH /familia/preferencias-notificacion` | Implementados (más `GET` de la preferencia y `POST …/baja` y `…/alta` por enlace) | I + S |
| B-8 | SRS §7 | "Panel familiar 5 min" | Vistas materializadas refrescadas cada 5 minutos | I |
| B-9 | RF-071 | Pruebas de sistema y aceptación de la gestión de perfiles (solo tenía unitarias del límite) | E2E y UAT: avatar, PIN, desactivar y el tope de 6 | I + S + UAT |
| B-10 | RNF-001 | Tiempo del panel familiar | p95 182 ms y p99 433 ms con 10 familias a la vez | I + carga |

**Decisiones de diseño (el SRS no decía cómo):**
- **Módulo:** el acompañamiento familiar vive en Reporting, junto al seguimiento docente (SRS §7: schema `reporting` para los Módulos 9 y 10) y lee solo sus vistas.
- **Qué reforzar:** las habilidades por debajo de "Logrado" (65), de la más baja a la más alta, hasta 3; con el valor desde el reto inicial, aunque aún no haya nivel declarado (RN-08 solo condiciona el nivel que se muestra).
- **Consejos (RF-069):** catálogo en el dominio, 4 por habilidad y algunos solo para ciertas edades; se muestran 2. Lectura sugerida: la publicada más sencilla de su edad que trabaja la habilidad y que aún no terminó.
- **Hábito:** siempre se muestran 3 ideas para el hábito; son las únicas si no hay nada que reforzar.
- **Semana:** la de Lima (de lunes a domingo); si respondió o terminó algo, al menos 1 minuto.
- **Resumen (RF-070):** el domingo desde las 18:00 resume esa semana; si la API no estaba en marcha, sale en el siguiente ciclo. Solo hijos activos; sin ninguno, no sale. Lo envía IAM (Reporting nunca ve direcciones de correo).
- **Baja con un clic:** el enlace firmado no vence y solo sirve para esta preferencia; abrirlo da de baja con un POST (un enlace que solo se visita no cambia nada) y permite deshacerla. Las cabeceras RFC 8058 hacen lo mismo desde el programa de correo.
- **Sin preferencia guardada, la familia recibe el resumen** (es la forma de que exista la "baja").
- **Pruebas del domingo:** `POST /dev/reportes/ejecutar` corre los trabajos como si fuera otro momento; responde 404 en producción o con un SMTP real.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Minutos de lectura | Se cuentan por sesión terminada (`mv_actividad_semanal`, Módulo 9); una sesión retomada días después suma todo ese tiempo | Registrar el tiempo activo de cada sesión en Lectura |
| Consejos en el código | Cambiarlos requiere una versión nueva | Editables desde la administración (Módulo 12), con revisión del líder pedagógico |
| Resumen en texto | Sin formato HTML ni imágenes | Plantilla HTML común para los correos |
| Heredadas | Outbox no transaccional; límite de tasa en memoria; *worker* dentro de la API | Ver informes de los Módulos 1 a 9 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Reporting usa IAM por su `public-api` y Lectura y Contenido por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Qué reforzar, consejos por edad, semana del domingo, firma del enlace y casos de uso | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | Vistas reales, lectura real, correo, baja por enlace y RFC 8058 | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Avance del hijo, resumen y baja, gestión de perfiles y diseño | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/familia-panel.js`, nuevo) | Binario k6 | Panel de una familia de 6 hijos | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios nuevos | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/reporting/
│   │   ├── dobles-familia.ts
│   │   ├── dominio/dominio-familia.spec.ts
│   │   └── aplicacion/familia-casos-de-uso.spec.ts
│   └── integration/reporting/
│       ├── ayudantes.ts                               # Compartidos con el Módulo 9
│       └── acompanamiento-familiar-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/familia.ts                         # Familias, hijos, el domingo y la bandeja
│   │   ├── support/limpieza.ts                        # + preferencias y resúmenes familiares
│   │   ├── specs/familia/acompanamiento.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts            # + avance del hijo (dispositivos y laptops)
│   │   ├── features/familia/acompanamiento.feature
│   │   └── steps/familia.steps.ts
│   └── load/
│       ├── sembrar-familia.mjs                        # Familia de 6 hijos con su maestría
│       └── scenarios/familia-panel.js
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Qué reforzar (RF-068):** por debajo de 65, de la más baja a la más alta, hasta 3; desde el reto inicial; empates en el orden del SRS.
- **Consejos (RF-069):** al menos uno por habilidad y edad, sin siglas ni términos técnicos; los de una edad no se dan a otra.
- **Semana del resumen (RF-070):** domingo 17:59 y 18:00 de Lima, el resto de la semana.
- **Enlace de baja:** firma válida; alterada, de otra cuenta, con otro secreto o basura no sirven; sin secreto no arranca.
- **Casos de uso:** panel completo y vacío, RN-17, preferencias (panel y enlace), resumen una vez por semana, bajas, hijos desactivados, correo que falla y se reintenta, y los textos del correo.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/reporting/dobles-familia.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La parte familiar del dominio y la aplicación queda al 100 % de líneas (ramas entre 97,6 % y 100 %).

## 4.4 Código completo del test unitario
`apps/api/test/unit/reporting/dominio/dominio-familia.spec.ts`:

<<archivo:apps/api/test/unit/reporting/dominio/dominio-familia.spec.ts>>

`apps/api/test/unit/reporting/aplicacion/familia-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/reporting/aplicacion/familia-casos-de-uso.spec.ts>>

`apps/api/test/unit/reporting/dobles-familia.ts`:

<<archivo:apps/api/test/unit/reporting/dobles-familia.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **RF-068:** el avance real de Mateo tras su reto inicial y una lectura (mundo 2, puntos, insignia) para la familia que lo acompaña por invitación.
- **RF-069:** las habilidades de Lucía por reforzar con 2 consejos y la lectura sugerida; a Mateo no se le sugiere la que ya terminó.
- **RN-17:** otra familia, la docente y sin sesión no ven el panel (404, 403, 401).
- **RNF-001:** el panel responde en menos de 300 ms (mediana) y nunca más de 800 ms.
- **RF-070:** preferencia por defecto, cambio y validación; resumen del domingo (y el de la semana anterior) una vez por familia; baja por enlace sin sesión, deshacerla y por RFC 8058; enlaces alterados; el domingo siguiente no llega.
- **Solo desarrollo:** los trabajos se corren como si fuera otro momento; en producción, 404.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/reporting/acompanamiento-familiar-http.int-spec.ts`:

<<archivo:apps/api/test/integration/reporting/acompanamiento-familiar-http.int-spec.ts>>

`apps/api/test/integration/reporting/ayudantes.ts`:

<<archivo:apps/api/test/integration/reporting/ayudantes.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **Avance del hijo (RF-068, RF-069):** desde "Mis hijos", "Ver su avance": su semana, su mundo, sus 5 habilidades, inferencias por reforzar con 2 ideas y una lectura que aún no leyó, y las ideas para el hábito.
- **Resumen (RF-070):** la casilla del panel; el correo del domingo; la baja con un clic en otro navegador sin sesión, deshacerla, y que el domingo siguiente no llegue.
- **Perfiles (RF-071):** avatar, PIN, desactivar y el tope de 6 (también por la API: 409).
- **Diseño (RNF-022, RNF-023):** el avance del hijo en 1280, 820 y 390 px sin desbordes y con objetivos de 48 px; en 4 tamaños de laptop, la semana y las habilidades lado a lado.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:familia --workspace @lectoaventura/tests-load
```

**Resultado de carga obtenido el 27/10/2026** (una familia con 6 hijos, cada uno con habilidades por reforzar; 10 sesiones abren sin pausa el avance de un hijo al azar y su preferencia durante 60 s; mismo perfil que el script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /api/v1/familia/estudiantes/{id}/panel` | 4.830 | 0,00 % | 68 ms | 182 ms | 433 ms | p95 < 300 ms, p99 < 800 ms (RNF-001) | ✅ |
| `GET /api/v1/familia/preferencias-notificacion` | 4.830 | 0,00 % | 29 ms | 82 ms | 170 ms | p95 < 300 ms, p99 < 800 ms (RNF-001) | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/familia/acompanamiento.spec.ts`:

<<archivo:tests/e2e/specs/familia/acompanamiento.spec.ts>>

`tests/e2e/support/familia.ts`:

<<archivo:tests/e2e/support/familia.ts>>

`tests/load/sembrar-familia.mjs`:

<<archivo:tests/load/sembrar-familia.mjs>>

`tests/load/scenarios/familia-panel.js`:

<<archivo:tests/load/scenarios/familia-panel.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/familia/acompanamiento.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/familia.steps.ts>>

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como familia, "Ver su avance" de un hijo | Su semana, su mundo, sus habilidades y cómo acompañarle en casa |
| ☐ | Revisar los consejos de cada habilidad con el líder pedagógico | Prácticos, de 5 a 10 minutos, sin términos técnicos, adecuados a cada edad |
| ☐ | Acompañar a un niño por el código de su docente | También se ve su avance ("Desde su aula") |
| ☐ | Revisar el correo del domingo | Cada hijo con su semana y un consejo; enlace al panel y enlace de baja |
| ☐ | Abrir el enlace de baja del correo | "Ya no recibirás el resumen semanal", sin pedir contraseña; se puede deshacer |
| ☐ | Desactivar y activar el resumen desde "Mis hijos" | La casilla cambia y se guarda |
| ☐ | Editar avatar, cambiar PIN, desactivar, llegar a 6 perfiles | Todo desde "Mis hijos"; con 6 ya no se puede agregar otro |
| ☐ | Revisar en laptops de distinto tamaño, tablet y celular | Contenido centrado que usa el ancho; sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `acompanamiento.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo reporting`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `reporting.mv_avance_estudiante`, `reporting.v_hijos_familia` y `reporting.preferencia_familiar`; el navegador integrado sirvió para revisar el panel de cada hijo en distintos tamaños.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el escenario k6 del panel familiar (siembra una familia de 6 hijos), con sus tiempos en las anotaciones de la ejecución.

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FAM-U-01 | Qué reforzar (RF-068) | Unit | Pos./Borde | < 65, ordenadas, hasta 3 | `npm run test:unit` |
| FAM-U-02 | Consejos por habilidad y edad (RF-069) | Unit | Pos./Neg. | ≥ 1 por habilidad y edad; sin tecnicismos | `npm run test:unit` |
| FAM-U-03 | Semana del domingo y enlace firmado (RF-070) | Unit | Borde/Neg. | 17:59 / 18:00; firmas inválidas | `npm run test:unit` |
| FAM-U-04 | Casos de uso de la familia | Unit | Pos./Neg. | 404, 400, una vez, reintento, textos | `npm run test:unit` |
| FAM-I-01 | Panel con datos reales (RF-068, RF-069) | Int | Positivo | Avance real; consejos y lectura | `npm run test:int` |
| FAM-I-02 | Acceso (RN-17) y tiempo (RNF-001) | Int | Neg./Rendimiento | 404/403/401; < 300 ms | `npm run test:int` |
| FAM-I-03 | Resumen y baja (RF-070) | Int | Pos./Neg. | Una vez; baja por enlace y RFC 8058 | `npm run test:int` |
| FAM-S-01 | Avance del hijo | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| FAM-S-02 | Resumen y baja con un clic | Sys | Pos./Neg. | Baja sin sesión; deshacer | `npm run test:e2e` |
| FAM-S-03 | Gestión de perfiles (RF-071) | Sys | Pos./Borde | Avatar, PIN, desactivar; 6 máximo | `npm run test:e2e` |
| FAM-S-04 | Diseño (RNF-022, RNF-023) | Sys | Accesibilidad | Sin desbordes; 48 px; lado a lado en laptops | `npm run test:e2e` |
| FAM-S-05 | Carga | Sys | Rendimiento | Ver §6.3 | `npm run test:familia --workspace @lectoaventura/tests-load` |
| FAM-A-01..05 | 5 escenarios Gherkin (RF-068 a RF-071, RN-17) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 10/10 — reglas puras (qué reforzar, consejos, semana) y casos de uso con puertos; la firma es pura.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de la parte familiar cubiertos.
- **Aislamiento de dependencias** ............... 10/10 — lee solo el schema `reporting`; IAM por su `public-api`; Lectura y Contenido por el shared-kernel.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; escenario k6 propio en CI.
- **Resiliencia ante fallos (edge cases)** ...... 10/10 — hijos ajenos, desactivados o sin datos, enlaces alterados, correos que fallan y envíos repetidos cubiertos.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner y del líder pedagógico (consejos para casa)
