<!-- Generado con node docs/pruebas/construir.mjs desde 09-seguimiento-docente-plan-de-pruebas.plantilla.md. No editar a mano. -->
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

```ts
import { describe, expect, it } from 'vitest';

import { celdasDe, habilidadesEnInicio } from '../../../../src/modules/reporting/domain/services/mapa-calor';
import { dificultadesCompartidas } from '../../../../src/modules/reporting/domain/services/refuerzo-grupal';
import { celdaCsv, reporteCsv, textoNivel } from '../../../../src/modules/reporting/domain/services/reporte-csv';
import { resumirSemana, semanaPorResumir, semanasDe } from '../../../../src/modules/reporting/domain/services/resumen-semanal';
import { evaluarRiesgo } from '../../../../src/modules/reporting/domain/services/riesgo';
import { tasaSinPista, tasasPorHabilidad } from '../../../../src/modules/reporting/domain/services/tasa-sin-pista';

/** Nivel 1 — Dominio del seguimiento docente (RF-063 a RF-067, RN-08). */
const AHORA = new Date('2026-10-21T15:00:00Z'); // miércoles 21, 10:00 en Lima
const medidas = (v: Record<string, number>, items = 6) => Object.entries(v).map(([habilidad, valor]) => ({ habilidad, valor, items }));
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

describe('Mapa de calor (RF-063, RN-08)', () => {
  it('5 celdas en el orden del SRS con su nivel CNEB declarado; sin medir, sin datos', () => {
    const c = celdasDe([...medidas({ INF: 20, LIT: 90, VOC: 64.996 }), { habilidad: 'CRI', valor: 70, items: 4 }]);
    expect(c.map((x) => `${x.habilidad}:${x.nivel}:${x.valor}`)).toEqual(['LIT:AD:90', 'INF:C:20', 'VOC:B:65', 'CRI:null:70', 'ARG:null:null']);
    expect(c.find((x) => x.habilidad === 'ARG')).toEqual({ habilidad: 'ARG', valor: null, items: 0, nivel: null });
    expect(habilidadesEnInicio(c)).toEqual(['INF']);
  });
});

describe('Estudiantes en riesgo (RF-065)', () => {
  const celdas = celdasDe(medidas({ INF: 20, ARG: 30, LIT: 80 }));

  it('7 días sin actividad o 2 habilidades en inicio', () => {
    expect(evaluarRiesgo({ ultimaActividad: dias(7), matriculadoEn: dias(30), celdas: celdasDe([]), ahora: AHORA })).toEqual({ enRiesgo: true, motivos: ['SIN_ACTIVIDAD'], diasSinActividad: 7, habilidadesEnInicio: [] });
    expect(evaluarRiesgo({ ultimaActividad: dias(6.9), matriculadoEn: dias(30), celdas: celdasDe([]), ahora: AHORA }).enRiesgo).toBe(false);
    expect(evaluarRiesgo({ ultimaActividad: dias(1), matriculadoEn: dias(30), celdas, ahora: AHORA })).toMatchObject({ motivos: ['HABILIDADES_EN_INICIO'], habilidadesEnInicio: ['INF', 'ARG'] });
    expect(evaluarRiesgo({ ultimaActividad: dias(9), matriculadoEn: dias(30), celdas, ahora: AHORA }).motivos).toEqual(['SIN_ACTIVIDAD', 'HABILIDADES_EN_INICIO']);
    expect(evaluarRiesgo({ ultimaActividad: dias(1), matriculadoEn: dias(30), celdas: celdasDe(medidas({ INF: 20 })), ahora: AHORA }).enRiesgo).toBe(false);
  });

  it('quien nunca empezó cuenta desde su matrícula (un aula nueva no aparece entera en riesgo)', () => {
    expect(evaluarRiesgo({ ultimaActividad: null, matriculadoEn: dias(2), celdas: celdasDe([]), ahora: AHORA }).enRiesgo).toBe(false);
    expect(evaluarRiesgo({ ultimaActividad: null, matriculadoEn: dias(10), celdas: celdasDe([]), ahora: AHORA })).toMatchObject({ motivos: ['SIN_ACTIVIDAD'], diasSinActividad: null });
  });
});

describe('Refuerzo grupal (RF-066)', () => {
  it('habilidades en inicio para el 30 % del aula o más, de la más extendida a la menos', () => {
    const e = (id: string, v: Record<string, number>) => ({ id, celdas: celdasDe(medidas(v)) });
    const aula = [e('a', { INF: 20, CRI: 30 }), e('b', { INF: 25, CRI: 30 }), e('c', { INF: 35 }), e('d', { CRI: 10 }), e('e', { INF: 90, ARG: 20 }), e('f', {}), e('g', {}), e('h', {}), e('i', {}), e('j', {})];
    expect(dificultadesCompartidas(aula)).toEqual([
      { habilidad: 'INF', estudianteIds: ['a', 'b', 'c'], porcentaje: 30 },
      { habilidad: 'CRI', estudianteIds: ['a', 'b', 'd'], porcentaje: 30 },
    ]);
    expect(dificultadesCompartidas(aula.slice(0, 2).concat(aula.slice(5)))).toEqual([]); // 2 de 7 = 29 %
    expect(dificultadesCompartidas([])).toEqual([]);
  });
});

describe('Resumen semanal (RF-065)', () => {
  it('cuánto leyó el aula en la semana; activos = con al menos una sesión', () => {
    const semanal = [
      { estudianteId: 'a', semana: '2026-10-19', lecturas: 2, minutos: 12.4, respuestas: 10 },
      { estudianteId: 'b', semana: '2026-10-19', lecturas: 0, minutos: 3.3, respuestas: 2 },
      { estudianteId: 'a', semana: '2026-10-12', lecturas: 1, minutos: 5, respuestas: 4 },
    ];
    expect(resumirSemana('2026-10-19', semanal, 5)).toEqual({ semana: '2026-10-19', estudiantesActivos: 2, totalEstudiantes: 5, lecturasFinalizadas: 2, minutosLectura: 16, respuestas: 12 });
    expect(resumirSemana('2026-10-05', semanal, 5).estudiantesActivos).toBe(0);
  });

  it('semanas de Lima y el envío desde el lunes a las 07:00', () => {
    expect(semanasDe(AHORA)).toEqual({ actual: '2026-10-19', anterior: '2026-10-12' });
    expect(semanasDe(new Date('2026-10-19T04:59:00Z'))).toEqual({ actual: '2026-10-12', anterior: '2026-10-05' }); // aún domingo en Lima
    expect(semanaPorResumir(AHORA)).toBe('2026-10-12');
    expect(semanaPorResumir(new Date('2026-10-19T11:59:00Z'))).toBeNull(); // lunes 06:59 en Lima
    expect(semanaPorResumir(new Date('2026-10-19T12:00:00Z'))).toBe('2026-10-12'); // lunes 07:00 en Lima
  });
});

describe('Tasa de acierto sin pista (RF-064)', () => {
  const r = (habilidad: string, esCorrecta: boolean | null, pistasUsadas = 0) => ({ habilidad, esCorrecta, pistasUsadas });

  it('sobre las cerradas respondidas; las abiertas no cuentan', () => {
    expect(tasaSinPista([r('INF', true), r('INF', true, 1), r('LIT', false, 3), r('ARG', null)])).toEqual({ cerradas: 3, sinPista: 1, tasa: 33 });
    expect(tasaSinPista([r('ARG', null)])).toEqual({ cerradas: 0, sinPista: 0, tasa: null });
    const porHabilidad = tasasPorHabilidad([r('INF', true), r('INF', true, 2), r('LIT', true)]);
    expect([porHabilidad.INF, porHabilidad.LIT, porHabilidad.VOC]).toEqual([{ cerradas: 2, sinPista: 1, tasa: 50 }, { cerradas: 1, sinPista: 1, tasa: 100 }, { cerradas: 0, sinPista: 0, tasa: null }]);
  });
});

describe('Reporte CSV (RF-067)', () => {
  it('UTF-8 con BOM, una fila por estudiante y celdas seguras para la hoja de cálculo', () => {
    const csv = reporteCsv([
      { alias: 'Sofía', celdas: celdasDe(medidas({ LIT: 70, INF: 20 })), ultimaActividad: new Date('2026-10-20T20:00:00Z'), lecturasSemana: 2, motivosRiesgo: ['HABILIDADES_EN_INICIO'] },
      { alias: '=Luis, "el grande"', celdas: celdasDe([]), ultimaActividad: null, lecturasSemana: 0, motivosRiesgo: ['SIN_ACTIVIDAD', 'HABILIDADES_EN_INICIO'] },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [cabecera, sofia, luis] = csv.slice(1).trimEnd().split('\r\n');
    expect(cabecera).toBe(
      'Estudiante,Comprensión literal (maestría),Comprensión literal (nivel),Inferencias (maestría),Inferencias (nivel),Vocabulario (maestría),Vocabulario (nivel),Pensamiento crítico (maestría),Pensamiento crítico (nivel),Argumentación (maestría),Argumentación (nivel),Última actividad,Lecturas esta semana,En riesgo',
    );
    expect(sofia).toBe('Sofía,70,A (Logrado),20,C (En inicio),,Aún descubriendo,,Aún descubriendo,,Aún descubriendo,2026-10-20,2,Sí: 2 o más habilidades en inicio');
    expect(luis).toMatch(/^"'=Luis, ""el grande""",/);
    expect(luis).toContain('Sin actividad,0,Sí: 7 días o más sin actividad; 2 o más habilidades en inicio');
    expect(reporteCsv([])).toBe('\uFEFFEstudiante,Última actividad,Lecturas esta semana,En riesgo\r\n');
  });

  it('celdas: fórmulas neutralizadas, comillas dobladas y vacíos', () => {
    expect([celdaCsv('+1'), celdaCsv('-2'), celdaCsv('@x'), celdaCsv('a\nb'), celdaCsv(null), celdaCsv(7)]).toEqual(["'+1", "'-2", "'@x", '"a\nb"', '', '7']);
    expect([textoNivel('AD'), textoNivel(null)]).toEqual(['AD (Destacado)', 'Aún descubriendo']);
  });
});
```

`apps/api/test/unit/reporting/aplicacion/reporting-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { SESIONES_DETALLE } from '../../../../src/modules/reporting/application/use-cases/detalle-estudiante.use-case';
import { ErrorDeNegocio, NoEncontradoError, SesionDeHistorial } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoReporting, EntornoReporting } from '../dobles';

/** Nivel 1 — Casos de uso del seguimiento docente con dobles (RF-063 a RF-067, RN-17). */
const ROSA = 'docente-rosa';
const AULA = 'aula-4a';
const M = (n: number) => `est-${n}`;

const sesion = (id: string, respuestas: Partial<SesionDeHistorial['respuestas'][number]>[]): SesionDeHistorial => ({
  sesionId: id,
  lecturaId: 'l-killa',
  titulo: 'Killa y la llama',
  estado: 'FINALIZADA',
  esRepeticion: false,
  iniciadaEn: new Date('2026-10-20T15:00:00Z'),
  ultimaActividadEn: new Date('2026-10-20T15:10:00Z'),
  finalizadaEn: new Date('2026-10-20T15:10:00Z'),
  respuestas: respuestas.map((r, i) => ({
    itemId: `i-${i}`,
    enunciado: '¿Por qué?',
    habilidad: 'INF',
    modalidad: 'SELECCION',
    esCorrecta: true,
    pistasUsadas: 0,
    pistas: [],
    evidencias: [],
    respuesta: 'Le dolía algo',
    estado: 'ENVIADA',
    ...r,
  })),
});

describe('Seguimiento docente: panel, detalle, reporte y resumen semanal', () => {
  let e: EntornoReporting;

  beforeEach(() => {
    e = crearEntornoReporting();
    e.aulas.aulas.set(AULA, { id: AULA, nombre: '4.° A', grado: '4', estado: 'ACTIVA', docenteId: ROSA });
    const perfiles: [string, string][] = [['Sofía', 'unicornio'], ['Teo', 'panda'], ['Ana', 'buho'], ['Luis', 'tortuga'], ['Mateo', 'leon']];
    perfiles.forEach(([alias, avatar], i) => e.identidad.perfilesPorId.set(M(i + 1), { id: M(i + 1), alias, avatar, rangoEdad: 'R2' }));
    e.repo.estudiante(AULA, M(1), { LIT: 70, INF: 20, VOC: 70, CRI: 70, ARG: 30 });
    e.repo.estudiante(AULA, M(2), { LIT: 70, INF: 25, VOC: 70, CRI: 70, ARG: 70 });
    e.repo.estudiante(AULA, M(3), { LIT: 90, INF: 90, VOC: 85, CRI: 88, ARG: 86 });
    e.repo.estudiante(AULA, M(4), null, new Date('2026-10-20T15:00:00Z'));
    e.repo.estudiante(AULA, M(5), { LIT: 60, INF: 50, VOC: 55, CRI: 45, ARG: 40 });
    for (const n of [1, 2, 3]) e.repo.actividad.set(M(n), new Date('2026-10-20T15:00:00Z'));
    e.repo.actividad.set(M(5), new Date('2026-10-10T15:00:00Z')); // 11 días sin leer
    e.repo.semanal.push(
      { estudianteId: M(1), semana: '2026-10-19', lecturas: 2, minutos: 14, respuestas: 12 },
      { estudianteId: M(5), semana: '2026-10-05', lecturas: 1, minutos: 6, respuestas: 6 },
    );
    e.repo.desempenos.set(AULA, [{ habilidad: 'INF', estudiantes: 4, promedio: 46.25, descubriendo: 0, C: 2, B: 1, A: 0, AD: 1 }]);
    e.fichas.lista.push(
      { id: 'l-dificil', titulo: 'El cóndor', rangoEdad: 'R2', nivelDificultad: 3, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
      { id: 'l-killa', titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', habilidadesObjetivo: ['INF', 'ARG'] },
      { id: 'l-r3', titulo: 'Para grandes', rangoEdad: 'R3', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['INF'] },
    );
  });

  describe('Panel (RF-063, RF-065, RF-066)', () => {
    it('mapa de calor por alias, grupo, alertas ordenadas, resumen y refuerzo con lectura', async () => {
      const p = await e.panel.panel(ROSA, AULA);
      expect(p.aula).toEqual({ id: AULA, nombre: '4.° A', grado: '4', estado: 'ACTIVA' });
      expect(p.actualizadoEn).toBe('2026-10-21T14:55:00.000Z');
      expect(p.estudiantes.map((x) => x.alias)).toEqual(['Ana', 'Luis', 'Mateo', 'Sofía', 'Teo']);
      expect(p.estudiantes.find((x) => x.alias === 'Sofía')!.celdas.map((c) => c.nivel)).toEqual(['A', 'C', 'A', 'A', 'C']);
      expect(p.grupo.find((g) => g.habilidad === 'INF')).toEqual({ habilidad: 'INF', promedio: 46.3, distribucion: { C: 2, B: 1, A: 0, AD: 1, descubriendo: 0 }, sinDatos: 1 });
      expect(p.grupo.find((g) => g.habilidad === 'LIT')).toEqual({ habilidad: 'LIT', promedio: null, distribucion: { C: 0, B: 0, A: 0, AD: 0, descubriendo: 0 }, sinDatos: 5 });
      // Mateo (11 días y 0 en C) antes que Sofía (2 en C); Luis se matriculó ayer: aún no.
      expect(p.alertas.map((a) => `${a.alias}:${a.riesgo.motivos.join('+')}`)).toEqual(['Mateo:SIN_ACTIVIDAD', 'Sofía:HABILIDADES_EN_INICIO']);
      expect(p.resumenSemanal).toEqual({
        actual: { semana: '2026-10-19', estudiantesActivos: 1, totalEstudiantes: 5, lecturasFinalizadas: 2, minutosLectura: 14, respuestas: 12 },
        anterior: { semana: '2026-10-12', estudiantesActivos: 0, totalEstudiantes: 5, lecturasFinalizadas: 0, minutosLectura: 0, respuestas: 0 },
        enRiesgo: 2,
      });
      expect(p.estudiantes.find((x) => x.alias === 'Sofía')!.lecturasSemana).toBe(2);
      expect(p.refuerzos).toEqual([{ habilidad: 'INF', estudianteIds: [M(1), M(2)], alias: ['Sofía', 'Teo'], porcentaje: 40, lectura: { id: 'l-killa', titulo: 'Killa y la llama', nivelDificultad: 2 } }]);
    });

    it('sin lectura para la habilidad y edad el refuerzo va sin sugerencia; el catálogo se consulta una vez por edad', async () => {
      e.fichas.lista.splice(0);
      // Tres más sin perfil en IAM con INF y CRI en inicio: INF 5 de 8, CRI 3 de 8.
      for (const n of [7, 8, 9]) e.repo.estudiante(AULA, M(n), { LIT: 70, INF: 20, VOC: 70, CRI: 20, ARG: 70 });
      const p = await e.panel.panel(ROSA, AULA);
      expect(p.refuerzos.map((r) => [r.habilidad, r.lectura, r.alias])).toEqual([
        ['INF', null, ['Estudiante', 'Estudiante', 'Estudiante', 'Sofía', 'Teo']],
        ['CRI', null, ['Estudiante', 'Estudiante', 'Estudiante']],
      ]);
      expect(e.fichas.consultas).toBe(1);
    });

    it('RN-17: el aula de otra docente o que no existe responde 404', async () => {
      await expect(e.panel.panel('otra-docente', AULA)).rejects.toThrow(NoEncontradoError);
      await expect(e.panel.panel(ROSA, 'no-existe')).rejects.toThrow(NoEncontradoError);
    });

    it('un aula sin estudiantes ni refresco aún', async () => {
      e.aulas.aulas.set('vacia', { id: 'vacia', nombre: 'Vacía', grado: '1', estado: 'ARCHIVADA', docenteId: ROSA });
      e.repo.refresco = null;
      const p = await e.panel.panel(ROSA, 'vacia');
      expect(p).toMatchObject({ actualizadoEn: null, totalEstudiantes: 0, estudiantes: [], alertas: [], refuerzos: [] });
    });
  });

  describe('Detalle (RF-064)', () => {
    it('sus habilidades con la tasa sin pista de sus últimas 20 sesiones', async () => {
      e.historial.sesiones.set(M(1), [
        sesion('s-2', [{ esCorrecta: true }, { habilidad: 'LIT', modalidad: 'EVIDENCIA', evidencias: ['Killa vio la espina.'], respuesta: 'Killa vio la espina.' }]),
        sesion('s-1', [{ esCorrecta: true, pistasUsadas: 1, pistas: [{ nivel: 'P1', texto: 'Vuelve a leer.' }] }, { habilidad: 'ARG', modalidad: 'ESCRITURA', esCorrecta: null }]),
      ]);
      const d = await e.detalle.detalle(ROSA, AULA, M(1));
      expect(e.historial.limitePedido).toBe(SESIONES_DETALLE);
      expect(d.estudiante).toEqual({ id: M(1), alias: 'Sofía', avatar: 'unicornio' });
      expect(d.tasaSinPista).toEqual({ cerradas: 3, sinPista: 2, tasa: 67 });
      expect(d.habilidades.map((h) => [h.habilidad, h.nivel, h.tasa.tasa])).toEqual([['LIT', 'A', 100], ['INF', 'C', 50], ['VOC', 'A', null], ['CRI', 'A', null], ['ARG', 'C', null]]);
      expect(d.sesiones.map((s) => [s.id, s.tasa.tasa, s.iniciadaEn])).toEqual([['s-2', 100, '2026-10-20T15:00:00.000Z'], ['s-1', 0, '2026-10-20T15:00:00.000Z']]);
      expect(d.sesiones[1]!.respuestas[0]!.pistas).toEqual([{ nivel: 'P1', texto: 'Vuelve a leer.' }]);
      expect(d.riesgo).toMatchObject({ enRiesgo: true, motivos: ['HABILIDADES_EN_INICIO'] });
      expect(d.ultimaActividad).toBe('2026-10-20T15:00:00.000Z');
    });

    it('RN-17: solo estudiantes matriculados en el aula de la docente', async () => {
      await expect(e.detalle.detalle(ROSA, AULA, 'de-otra-aula')).rejects.toThrow(NoEncontradoError);
      await expect(e.detalle.detalle('otra-docente', AULA, M(1))).rejects.toThrow(NoEncontradoError);
      const sinPerfil = await e.detalle.detalle(ROSA, AULA, M(4));
      expect(sinPerfil).toMatchObject({ tasaSinPista: { tasa: null }, sesiones: [], ultimaActividad: null });
    });
  });

  describe('Reporte (RF-067)', () => {
    it('CSV y PDF con los datos del panel; nombre con el aula y la fecha de Lima', async () => {
      const csv = await e.reporte.reporte(ROSA, AULA, 'csv');
      expect(csv).toMatchObject({ tipo: 'text/csv; charset=utf-8', nombreArchivo: 'reporte-4-a-2026-10-21.csv' });
      expect(new TextDecoder().decode(csv.contenido).split('\r\n')).toHaveLength(7); // cabecera + 5 + final
      const pdf = await e.reporte.reporte(ROSA, AULA, 'pdf');
      expect(pdf).toMatchObject({ tipo: 'application/pdf', nombreArchivo: 'reporte-4-a-2026-10-21.pdf' });
      expect(e.pdf.ultimo).toMatchObject({ aula: { nombre: '4.° A' }, enRiesgo: 2, resumen: { semana: '2026-10-19' } });
      expect(e.pdf.ultimo!.filas.map((f) => f.alias)).toEqual(['Ana', 'Luis', 'Mateo', 'Sofía', 'Teo']);
    });

    it('formato desconocido 400; aula ajena 404', async () => {
      await expect(e.reporte.reporte(ROSA, AULA, 'xls')).rejects.toThrow(ErrorDeNegocio);
      await expect(e.reporte.reporte('otra-docente', AULA, 'csv')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Resumen semanal (RF-065)', () => {
    it('una vez por docente y semana, con cada aula, sus alertas y refuerzos', async () => {
      e.repo.aulas.push({ aulaId: AULA, docenteId: ROSA, nombre: '4.° A', estudiantes: 5 }, { aulaId: 'aula-otra', docenteId: 'docente-elena', nombre: '3.° B', estudiantes: 1 });
      e.aulas.aulas.set('aula-otra', { id: 'aula-otra', nombre: '3.° B', grado: '3', estado: 'ACTIVA', docenteId: 'docente-elena' });
      expect(await e.resumen.enviarPendientes()).toBe(2);
      expect(await e.resumen.enviarPendientes()).toBe(0);
      const deRosa = e.correo.enviados.find((c) => c.docenteId === ROSA)!;
      expect(deRosa.asunto).toBe('Resumen semanal de tus aulas (semana del 12 de octubre)');
      expect(deRosa.enlace).toBe('https://lectoaventura.pe/docente');
      expect(deRosa.texto).toContain('4.° A: 0 de 5 estudiantes leyeron; 0 lecturas terminadas (0 min).');
      expect(deRosa.texto).toContain('Para acompañar (2): Mateo, Sofía.');
      expect(deRosa.texto).toContain('Refuerzo grupal sugerido: inferencias (40 % del aula en inicio).');
    });

    it('el lunes antes de las 07:00 de Lima no envía; si el correo no sale, no cuenta', async () => {
      e.repo.aulas.push({ aulaId: AULA, docenteId: ROSA, nombre: '4.° A', estudiantes: 5 });
      e.reloj.actual = new Date('2026-10-19T11:00:00Z');
      expect(await e.resumen.enviarPendientes()).toBe(0);
      e.reloj.actual = new Date('2026-10-26T13:00:00Z');
      e.correo.activo = false;
      expect(await e.resumen.enviarPendientes()).toBe(0);
      expect(e.repo.resumenes.has(`${ROSA}:2026-10-19`)).toBe(true); // se registró: no se reintenta en bucle
    });

    it('si el correo de una docente falla, las demás lo reciben y el suyo se reintenta en el próximo ciclo', async () => {
      e.repo.aulas.push({ aulaId: AULA, docenteId: ROSA, nombre: '4.° A', estudiantes: 5 }, { aulaId: 'aula-otra', docenteId: 'docente-elena', nombre: '3.° B', estudiantes: 1 });
      e.aulas.aulas.set('aula-otra', { id: 'aula-otra', nombre: '3.° B', grado: '3', estado: 'ACTIVA', docenteId: 'docente-elena' });
      e.correo.fallaPara.add(ROSA);
      await expect(e.resumen.enviarPendientes()).rejects.toThrow('No salió el resumen semanal de 1 docente(s); se reintentará');
      expect(e.correo.enviados.map((c) => c.docenteId)).toEqual(['docente-elena']);
      expect(e.repo.resumenes.has(`${ROSA}:2026-10-12`)).toBe(false);
      e.correo.fallaPara.clear();
      expect(await e.resumen.enviarPendientes()).toBe(1);
      expect(e.correo.enviados.map((c) => c.docenteId)).toEqual(['docente-elena', ROSA]);
    });

    it('omite un aula que ya no existe en Escuela', async () => {
      e.repo.aulas.push({ aulaId: 'borrada', docenteId: ROSA, nombre: 'Borrada', estudiantes: 1 });
      expect(await e.resumen.enviarPendientes()).toBe(1);
      expect(e.correo.enviados[0]!.texto).not.toContain('Borrada');
    });
  });
});
```

`apps/api/test/unit/reporting/dobles.ts`:

```ts
/**
 * Dobles de prueba de Reporting: las vistas del schema `reporting` en memoria, el aula de Escuela, los
 * perfiles de IAM, el correo de la docente, el PDF, las fichas de Contenido y el historial de Lectura.
 */
import type {
  FichaLecturaPublicada,
  FuenteFichasLectura,
  RangoEdad,
  ResolutorHistorialLectura,
  SesionDeHistorial,
} from '../../../src/modules/shared-kernel/public-api';
import type { ReporteAula } from '../../../src/modules/reporting/application/dto/reporting.dto';
import type {
  AulaActiva,
  AulasDocente,
  DesempenoHabilidad,
  GeneradorReportePdf,
  IdentidadEstudiantes,
  NotificadorDocente,
  ReportesRepository,
} from '../../../src/modules/reporting/application/ports/reporting.ports';
import { DetalleEstudianteUseCase } from '../../../src/modules/reporting/application/use-cases/detalle-estudiante.use-case';
import { PanelAulaUseCase } from '../../../src/modules/reporting/application/use-cases/panel-aula.use-case';
import { ReporteAulaUseCase } from '../../../src/modules/reporting/application/use-cases/reporte-aula.use-case';
import { ResumenSemanalUseCase } from '../../../src/modules/reporting/application/use-cases/resumen-semanal.use-case';
import { MaestriaMedida } from '../../../src/modules/reporting/domain/services/mapa-calor';
import { ActividadSemanal } from '../../../src/modules/reporting/domain/services/resumen-semanal';
import { Reloj } from '../iam/dobles';

export class ReportesEnMemoria implements ReportesRepository {
  refresco: Date | null = new Date('2026-10-21T14:55:00Z');
  refrescos = 0;
  readonly matriculas: { aulaId: string; estudianteId: string; matriculadoEn: Date }[] = [];
  readonly medidas: (MaestriaMedida & { aulaId: string; estudianteId: string })[] = [];
  readonly desempenos = new Map<string, DesempenoHabilidad[]>();
  readonly actividad = new Map<string, Date>();
  readonly semanal: ActividadSemanal[] = [];
  readonly aulas: AulaActiva[] = [];
  readonly resumenes = new Set<string>();

  async refrescadoEn() {
    return this.refresco;
  }
  async refrescar() {
    this.refrescos += 1;
  }
  async estudiantesDeAula(aulaId: string) {
    return this.matriculas.filter((m) => m.aulaId === aulaId).map(({ estudianteId, matriculadoEn }) => ({ estudianteId, matriculadoEn }));
  }
  async maestrias(aulaId: string) {
    return this.medidas.filter((m) => m.aulaId === aulaId);
  }
  async desempeno(aulaId: string) {
    return this.desempenos.get(aulaId) ?? [];
  }
  async ultimaActividad(ids: string[]) {
    return new Map([...this.actividad].filter(([id]) => ids.includes(id)));
  }
  async actividadSemanal(ids: string[], semanas: string[]) {
    return this.semanal.filter((a) => ids.includes(a.estudianteId) && semanas.includes(a.semana));
  }
  async aulasActivas() {
    return this.aulas;
  }
  async registrarResumen(docenteId: string, semana: string) {
    const llave = `${docenteId}:${semana}`;
    if (this.resumenes.has(llave)) return false;
    this.resumenes.add(llave);
    return true;
  }
  async liberarResumen(docenteId: string, semana: string) {
    this.resumenes.delete(`${docenteId}:${semana}`);
  }

  /** Atajo: un estudiante con su maestría en las 5 habilidades (6 preguntas cada una). */
  estudiante(aulaId: string, estudianteId: string, valores: Record<string, number> | null, matriculadoEn = new Date('2026-10-01T15:00:00Z')) {
    this.matriculas.push({ aulaId, estudianteId, matriculadoEn });
    if (valores) for (const [habilidad, valor] of Object.entries(valores)) this.medidas.push({ aulaId, estudianteId, habilidad, valor, items: 6 });
  }
}

export class AulasFalsas implements AulasDocente {
  readonly aulas = new Map<string, { id: string; nombre: string; grado: string; estado: string; docenteId: string }>();
  async aula(aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a ? { id: a.id, nombre: a.nombre, grado: a.grado, estado: a.estado } : null;
  }
  async aulaDe(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? this.aula(aulaId) : null;
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { id: string; alias: string; avatar: string; rangoEdad: RangoEdad }>();
  async perfiles(ids: string[]) {
    return ids.flatMap((id) => (this.perfilesPorId.has(id) ? [this.perfilesPorId.get(id)!] : []));
  }
}

export class CorreoFalso implements NotificadorDocente {
  readonly enviados: { docenteId: string; asunto: string; texto: string; enlace?: string }[] = [];
  activo = true;
  /** Docentes a las que el servidor de correo rechaza el envío. */
  readonly fallaPara = new Set<string>();
  async notificar(docenteId: string, mensaje: { asunto: string; texto: string; enlace?: string }) {
    if (!this.activo) return false;
    if (this.fallaPara.has(docenteId)) throw new Error('SMTP no disponible');
    this.enviados.push({ docenteId, ...mensaje });
    return true;
  }
}

export class PdfFalso implements GeneradorReportePdf {
  ultimo: ReporteAula | null = null;
  async generar(r: ReporteAula) {
    this.ultimo = r;
    return new TextEncoder().encode('%PDF-falso');
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly lista: FichaLecturaPublicada[] = [];
  consultas = 0;
  async fichas(ids: string[]) {
    return this.lista.filter((f) => ids.includes(f.id));
  }
  async publicadas(rango: RangoEdad) {
    this.consultas += 1;
    return this.lista.filter((f) => f.rangoEdad === rango);
  }
}

export class HistorialFalso implements ResolutorHistorialLectura {
  readonly sesiones = new Map<string, SesionDeHistorial[]>();
  limitePedido: number | null = null;
  async historialDe(estudianteId: string, limite: number) {
    this.limitePedido = limite;
    return (this.sesiones.get(estudianteId) ?? []).slice(0, limite);
  }
}

/** Ensambla los casos de uso con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoReporting() {
  const reloj = new Reloj(new Date('2026-10-21T15:00:00Z')); // miércoles 21, 10:00 en Lima
  const repo = new ReportesEnMemoria();
  const aulas = new AulasFalsas();
  const identidad = new IdentidadFalsa();
  const fichas = new FichasFalsas();
  const historial = new HistorialFalso();
  const correo = new CorreoFalso();
  const pdf = new PdfFalso();
  const panel = new PanelAulaUseCase(repo, aulas, identidad, fichas, reloj.ahora);
  return {
    reloj,
    repo,
    aulas,
    identidad,
    fichas,
    historial,
    correo,
    pdf,
    panel,
    detalle: new DetalleEstudianteUseCase(repo, aulas, identidad, historial, reloj.ahora),
    reporte: new ReporteAulaUseCase(aulas, panel, pdf, reloj.ahora),
    resumen: new ResumenSemanalUseCase(repo, aulas, panel, correo, 'https://lectoaventura.pe', reloj.ahora),
  };
}

export type EntornoReporting = ReturnType<typeof crearEntornoReporting>;
```

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

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EscuelaFacade } from '../../../src/modules/escuela/public-api';
import { IamFacade } from '../../../src/modules/iam/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../../src/modules/reporting/application/casos-uso-reporting';
import { ResumenSemanalUseCase } from '../../../src/modules/reporting/application/use-cases/resumen-semanal.use-case';
import { AulasDocenteEscuela, NotificadorDocenteIam } from '../../../src/modules/reporting/infrastructure/anticorrupcion';
import { PrismaReportesRepository } from '../../../src/modules/reporting/infrastructure/persistence/prisma-reportes-repository';
import { fechaLocalLima, lunesDeLaSemana, nivelDeclarado } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';
import { API, ayudantesReporting, bearer, HABILIDADES } from './ayudantes';

/**
 * Nivel 2 — Seguimiento docente (RF-063 a RF-067) contra PostgreSQL real: el panel lee las vistas de
 * reportes refrescadas (mapa de calor con el nivel CNEB, grupo, alertas, resumen de la semana y refuerzo
 * para una dificultad del 40 % del aula, asignable con el endpoint de asignaciones); el detalle muestra
 * las evidencias y pistas de una lectura real; el reporte sale en CSV y PDF; el resumen semanal se envía
 * una vez; RN-17; y el panel de un aula de 40 estudiantes responde en menos de 1,5 s (RNF-003).
 */

let t: AppDePrueba;
let casos: CasosUsoReporting;
const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoReporting>(CASOS_USO_REPORTING);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

const { backoffice, docente, publicarKilla, retoInicial, leerKilla, maestria, crearAula } = ayudantesReporting(() => t);

let rosa: { email: string; token: string; id: string };
let otra: { email: string; token: string; id: string };
let aula: { aulaId: string; ids: Record<string, string> };
let aulaOtra: { aulaId: string; ids: Record<string, string> };
let killa: { lecturaId: string; o: string[] };
let tokenMateo: string;

const panel = (aulaId = aula.aulaId, token = rosa.token) => t.http().get(`${API}/aulas/${aulaId}/panel`).set(bearer(token));
const estudiante = (v: { estudiantes: { alias: string }[] }, alias: string) => v.estudiantes.find((e) => e.alias === alias) as unknown as Record<string, unknown> & { celdas: { habilidad: string; nivel: string | null; valor: number | null }[]; riesgo: { motivos: string[]; diasSinActividad: number | null } };

describe('Preparación', () => {
  it('una lectura publicada, la docente Rosa con 5 estudiantes de 9 años y otra docente con su aula', async () => {
    const editora = await backoffice('EDITOR');
    killa = await publicarKilla(editora, await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    otra = await docente('Elena Quispe');
    aula = await crearAula(rosa.token, '4.° A', ['Mateo', 'Sofía', 'Teo', 'Ana', 'Luis']);
    aulaOtra = await crearAula(otra.token, '4.° B', ['Iris']);
    const tablet = (await t.http().post(`${API}/aulas/${aula.aulaId}/dispositivos`).set(bearer(rosa.token)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    await t.http().post(`${API}/estudiantes/${aula.ids['Mateo']}/pin/restablecer`).set(bearer(rosa.token)).send({ pinNuevo: '4826' }).expect(200);
    tokenMateo = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: aula.ids['Mateo'], pin: '4826' }).expect(200)).body.accessToken;

    // Mateo: reto inicial real (bien en LIT y VOC) y dos lecturas reales con una pista y su evidencia.
    await retoInicial(tokenMateo, ['LIT', 'VOC']);
    await leerKilla(tokenMateo, killa);
    await leerKilla(tokenMateo, killa);
    // Lo que Progreso habría medido a los demás: Sofía con INF y ARG en inicio, Teo con INF en inicio, Ana destacada.
    await maestria(aula.ids['Sofía'] as string, { INF: 20, ARG: 30 });
    await maestria(aula.ids['Teo'] as string, { INF: 25 });
    await maestria(aula.ids['Ana'] as string, { INF: 90, LIT: 88 }, 8);
    await maestria(aulaOtra.ids['Iris'] as string, { INF: 10, CRI: 10 });
    await casos.vistas.refrescar();
  });
});

describe('Panel del aula (RF-063, RF-065, RF-066)', () => {
  it('RF-063: mapa de calor estudiantes × habilidades con el nivel CNEB declarado (RN-08)', async () => {
    const v = (await panel().expect(200)).body;
    expect(v.aula).toMatchObject({ id: aula.aulaId, nombre: '4.° A', estado: 'ACTIVA' });
    expect(v.totalEstudiantes).toBe(5);
    expect(new Date(v.actualizadoEn).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(v.estudiantes.map((e: { alias: string }) => e.alias)).toEqual(['Ana', 'Luis', 'Mateo', 'Sofía', 'Teo']);
    expect(estudiante(v, 'Sofía').celdas.map((c) => `${c.habilidad}:${c.nivel}:${c.valor}`)).toEqual(['LIT:A:70', 'INF:C:20', 'VOC:A:70', 'CRI:A:70', 'ARG:C:30']);
    expect(estudiante(v, 'Ana').celdas.find((c) => c.habilidad === 'INF')).toMatchObject({ nivel: 'AD', valor: 90 });
    // Luis aún no tiene nada medido; Mateo, lo que midió Progreso con su reto y sus lecturas (RN-08).
    expect(estudiante(v, 'Luis').celdas.every((c) => c.valor === null && c.nivel === null)).toBe(true);
    const deMateo = await t.prisma.maestriaHabilidad.findMany({ where: { estudianteId: aula.ids['Mateo'] } });
    const nivelMateo = (h: string) => { const f = deMateo.find((x) => x.habilidad === h)!; return nivelDeclarado(Number(f.valor), f.itemsContados); };
    expect(estudiante(v, 'Mateo').celdas.map((c) => `${c.habilidad}:${c.nivel}`)).toEqual(HABILIDADES.map((h) => `${h}:${nivelMateo(h)}`));
    // El grupo, de la vista mv_desempeno_aula: Sofía y Teo en C, Ana en AD y Mateo donde esté.
    const m = nivelMateo('INF');
    const inf = v.grupo.find((g: { habilidad: string }) => g.habilidad === 'INF');
    expect(inf).toMatchObject({ distribucion: { C: 2 + Number(m === 'C'), B: Number(m === 'B'), A: Number(m === 'A'), AD: 1 + Number(m === 'AD'), descubriendo: Number(m === null) }, sinDatos: 1 });
    expect(JSON.stringify(v)).not.toMatch(/indicesCorrectos|clavesEvidencia|hashPin|email/);
  });

  it('RF-065: alerta por 2 habilidades en inicio; quien nunca empezó cuenta desde su matrícula', async () => {
    let v = (await panel().expect(200)).body;
    expect(v.alertas.map((a: { alias: string; riesgo: { motivos: string[] } }) => `${a.alias}:${a.riesgo.motivos.join('+')}`)).toEqual(['Sofía:HABILIDADES_EN_INICIO']);
    await t.prisma.matricula.updateMany({ where: { aulaId: aula.aulaId, estudianteId: aula.ids['Luis'] }, data: { creadaEn: haceDias(10) } });
    v = (await panel().expect(200)).body;
    expect(estudiante(v, 'Luis').riesgo).toMatchObject({ enRiesgo: true, motivos: ['SIN_ACTIVIDAD'], diasSinActividad: null });
    expect(v.resumenSemanal.enRiesgo).toBe(2);
  });

  it('RF-065: el resumen de la semana sale de la vista de actividad semanal', async () => {
    const v = (await panel().expect(200)).body;
    const hoy = fechaLocalLima(new Date());
    expect(v.resumenSemanal.actual).toMatchObject({ semana: lunesDeLaSemana(hoy), estudiantesActivos: 1, totalEstudiantes: 5, lecturasFinalizadas: 2 });
    expect(v.resumenSemanal.actual.respuestas).toBeGreaterThanOrEqual(6);
    expect(v.resumenSemanal.anterior).toMatchObject({ estudiantesActivos: 0, lecturasFinalizadas: 0 });
    expect(estudiante(v, 'Mateo').lecturasSemana).toBe(2);
  });

  it('RF-066: refuerzo grupal para INF (40 % del aula en inicio) con una lectura, asignable con un clic', async () => {
    const v = (await panel().expect(200)).body;
    expect(v.refuerzos).toEqual([
      { habilidad: 'INF', estudianteIds: [aula.ids['Sofía'], aula.ids['Teo']], alias: ['Sofía', 'Teo'], porcentaje: 40, lectura: { id: killa.lecturaId, titulo: 'Killa y la llama', nivelDificultad: 2 } },
    ]);
    const r = v.refuerzos[0];
    const fechaLimite = new Date(Date.now() + 7 * 86_400_000 - 5 * 3_600_000).toISOString().slice(0, 10);
    const asignacion = (await t.http().post(`${API}/aulas/${aula.aulaId}/asignaciones`).set(bearer(rosa.token)).send({ tipo: 'LECTURA', contenidoId: r.lectura.id, fechaLimite, estudianteIds: r.estudianteIds }).expect(201)).body;
    const destinatarios = await t.prisma.asignacionDestinatario.findMany({ where: { asignacionId: asignacion.id } });
    expect(destinatarios.map((d) => d.estudianteId).sort()).toEqual([aula.ids['Sofía'], aula.ids['Teo']].sort());
  });

  it('las vistas se actualizan al refrescarse (cada 5 minutos): un estudiante nuevo aparece al instante', async () => {
    await t.http().post(`${API}/aulas/${aula.aulaId}/matriculas`).set(bearer(rosa.token)).send({ alias: 'Zoe', anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 2, avatar: 'panda' }).expect(201);
    const v = (await panel().expect(200)).body;
    expect(v.totalEstudiantes).toBe(6);
    expect(estudiante(v, 'Zoe').celdas.every((c) => c.valor === null)).toBe(true);
    const antes = v.actualizadoEn;
    await casos.vistas.refrescar();
    expect((await panel().expect(200)).body.actualizadoEn > antes).toBe(true);
  });
});

describe('Detalle del estudiante (RF-064)', () => {
  it('sus últimas sesiones con lo que respondió, las evidencias que eligió y las pistas que usó', async () => {
    const v = (await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aula.ids['Mateo']}/detalle`).set(bearer(rosa.token)).expect(200)).body;
    expect(v.estudiante).toMatchObject({ id: aula.ids['Mateo'], alias: 'Mateo', avatar: 'zorro' });
    expect(v.sesiones).toHaveLength(2);
    expect(v.sesiones[0].esRepeticion).toBe(true); // la más reciente primero
    expect(new Date(v.sesiones[0].iniciadaEn).getTime()).toBeGreaterThanOrEqual(new Date(v.sesiones[1].iniciadaEn).getTime());
    const [inf, evidencia, abierta] = v.sesiones[1].respuestas;
    expect(inf).toMatchObject({ habilidad: 'INF', esCorrecta: true, pistasUsadas: 1, pistas: [{ nivel: 'P1', texto: 'Vuelve a la oración que acabas de leer.' }], respuesta: 'Le dolía algo' });
    expect(evidencia).toMatchObject({ habilidad: 'LIT', modalidad: 'EVIDENCIA', esCorrecta: true, pistasUsadas: 0, evidencias: ['Killa vio que tenía una espina en la pata.'] });
    expect(abierta).toMatchObject({ habilidad: 'ARG', esCorrecta: null, respuesta: 'Sí, porque así encontró la espina y lo curó' });
    // Tasa de acierto sin pista: 1 de 2 cerradas en cada lectura.
    expect(v.sesiones[1].tasa).toEqual({ cerradas: 2, sinPista: 1, tasa: 50 });
    expect(v.tasaSinPista).toEqual({ cerradas: 4, sinPista: 2, tasa: 50 });
    expect(v.habilidades.find((h: { habilidad: string }) => h.habilidad === 'INF').tasa).toEqual({ cerradas: 2, sinPista: 0, tasa: 0 });
    expect(v.habilidades.find((h: { habilidad: string }) => h.habilidad === 'LIT').tasa).toEqual({ cerradas: 2, sinPista: 2, tasa: 100 });
    expect(JSON.stringify(v)).not.toMatch(/indicesCorrectos|clavesEvidencia|explicacionModelada/);
  });

  it('RN-17: el estudiante de otra aula o el aula de otra docente responden como si no existieran', async () => {
    await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aulaOtra.ids['Iris']}/detalle`).set(bearer(rosa.token)).expect(404);
    await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aula.ids['Mateo']}/detalle`).set(bearer(otra.token)).expect(404);
    await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/no-es-un-id/detalle`).set(bearer(rosa.token)).expect(404);
  });
});

describe('Reporte del aula (RF-067)', () => {
  const reporte = (formato: string) => t.http().get(`${API}/aulas/${aula.aulaId}/reporte?formato=${formato}`).set(bearer(rosa.token)).buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (c: Buffer) => partes.push(c));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  });

  it('CSV: una fila por estudiante con su maestría y nivel por habilidad, listo para Excel', async () => {
    const r = await reporte('csv').expect(200);
    expect(r.headers['content-type']).toMatch(/^text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="reporte-4-a-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(r.headers['cache-control']).toBe('no-store');
    const texto = (r.body as Buffer).toString('utf8');
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const lineas = texto.slice(1).trim().split('\r\n');
    expect(lineas).toHaveLength(7);
    expect(lineas[0]).toMatch(/^Estudiante,Comprensión literal \(maestría\),Comprensión literal \(nivel\),Inferencias/);
    expect(lineas.find((l) => l.startsWith('Sofía,'))).toContain('20,C (En inicio)');
    expect(lineas.find((l) => l.startsWith('Luis,'))).toContain('Sin actividad');
  });

  it('PDF (A4) en segundos, y un formato desconocido se rechaza', async () => {
    const inicio = Date.now();
    const r = await reporte('pdf').expect(200);
    expect(Date.now() - inicio).toBeLessThan(30_000);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((r.body as Buffer).length).toBeGreaterThan(1500);
    await t.http().get(`${API}/aulas/${aula.aulaId}/reporte?formato=xls`).set(bearer(rosa.token)).expect(400);
    await t.http().get(`${API}/aulas/${aula.aulaId}/reporte?formato=csv`).set(bearer(otra.token)).expect(404);
  });
});

describe('Resumen semanal (RF-065)', () => {
  it('desde el lunes a las 07:00 de Lima se envía una vez a cada docente con sus aulas', async () => {
    const lunes = lunesDeLaSemana(fechaLocalLima(new Date()));
    // El miércoles de la próxima semana: toca resumir la semana en curso (la de las lecturas de Mateo).
    const miercoles = new Date(Date.parse(`${lunes}T15:00:00Z`) + 9 * 86_400_000);
    const resumen = new ResumenSemanalUseCase(
      new PrismaReportesRepository(t.prisma),
      new AulasDocenteEscuela(t.app.get(EscuelaFacade)),
      casos.panel,
      new NotificadorDocenteIam(t.app.get(IamFacade)),
      'http://localhost:3002',
      () => miercoles,
    );
    expect(await resumen.enviarPendientes()).toBe(2);
    expect(await resumen.enviarPendientes()).toBe(0);
    const correos = (await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; texto: string; enlace: string }[];
    const deRosa = correos.filter((c) => c.para === rosa.email && c.asunto.startsWith('Resumen semanal de tus aulas'));
    expect(deRosa).toHaveLength(1);
    expect(deRosa[0]!.texto).toContain('4.° A: 1 de 6 estudiantes leyeron; 2 lecturas terminadas');
    expect(deRosa[0]!.texto).toContain('Para acompañar');
    expect(deRosa[0]!.texto).toContain('Refuerzo grupal sugerido: inferencias (33 % del aula en inicio)');
    expect(deRosa[0]!.enlace).toBe('http://localhost:3002/docente');
    expect(await t.prisma.resumenSemanalEnviado.count({ where: { semana: new Date(`${lunes}T00:00:00Z`) } })).toBe(2);
    // El lunes antes de las 07:00 de Lima aún no se envía.
    const temprano = new ResumenSemanalUseCase(new PrismaReportesRepository(t.prisma), new AulasDocenteEscuela(t.app.get(EscuelaFacade)), casos.panel, new NotificadorDocenteIam(t.app.get(IamFacade)), '', () => new Date(Date.parse(`${lunes}T10:00:00Z`) + 14 * 86_400_000));
    expect(await temprano.enviarPendientes()).toBe(0);
  });
});

describe('Riesgo por inactividad (RF-065)', () => {
  it('RF-065: con 9 días sin leer aparece en riesgo con sus días', async () => {
    await t.prisma.sesionLectura.updateMany({ where: { estudianteId: aula.ids['Mateo'] }, data: { iniciadaEn: haceDias(9), ultimaActividadEn: haceDias(9) } });
    await t.prisma.respuestaDiagnostico.updateMany({ where: { diagnostico: { estudianteId: aula.ids['Mateo'] } }, data: { respondidaEn: haceDias(12) } });
    await casos.vistas.refrescar();
    const v = (await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aula.ids['Mateo']}/detalle`).set(bearer(rosa.token)).expect(200)).body;
    expect(v.riesgo).toMatchObject({ enRiesgo: true, motivos: ['SIN_ACTIVIDAD'], diasSinActividad: 9 });
  });
});

describe('Acceso (RN-17, RNF-012)', () => {
  it('solo la docente del aula ve su panel', async () => {
    await panel(aula.aulaId, otra.token).expect(404);
    await panel('no-es-un-id').expect(404);
    await t.http().get(`${API}/aulas/${aula.aulaId}/panel`).expect(401);
    await t.http().get(`${API}/aulas/${aula.aulaId}/panel`).set(bearer(tokenMateo)).expect(403);
  });
});

describe('Rendimiento (RNF-003)', () => {
  it('el panel de un aula de 40 estudiantes con datos responde en menos de 1,5 s', async () => {
    const grande = await crearAula(rosa.token, '4.° C', Array.from({ length: 40 }, (_, i) => `Niño ${i + 1}`));
    for (const [i, id] of Object.values(grande.ids).entries()) await maestria(id, { INF: i % 3 === 0 ? 20 : 75, CRI: i % 4 === 0 ? 30 : 60 });
    await casos.vistas.refrescar();
    await panel(grande.aulaId).expect(200); // calienta conexiones
    const inicio = Date.now();
    const v = (await panel(grande.aulaId).expect(200)).body;
    expect(Date.now() - inicio).toBeLessThan(1500);
    expect(v.totalEstudiantes).toBe(40);
    expect(v.refuerzos.map((r: { habilidad: string }) => r.habilidad)).toEqual(['INF']); // 14 de 40 = 35 %; CRI 10 de 40 = 25 %
  });
});
```

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

```ts
import { readFileSync } from 'node:fs';

import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { abrirAula, AulaPreparada, docenteConAula } from '../../support/escuela';
import { ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';
import { destinatariosDeAsignaciones, refrescarVistas, sembrarMaestria } from '../../support/seguimiento';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Seguimiento docente de punta a punta (RF-063 a RF-067) en escritorio, tablet y celular: la
 * docente abre el seguimiento de su aula, filtra el mapa de calor, ve a quién acompañar, asigna el
 * refuerzo grupal con un clic, abre el detalle de un estudiante con sus evidencias y pistas, y descarga
 * el reporte en CSV y PDF.
 */
test.describe('Seguimiento docente (RF-063 a RF-067)', () => {
  test.setTimeout(150_000);

  /** Mateo lee de verdad (se equivoca en la inferencia hasta la explicación); a los demás, lo que mediría Progreso. */
  async function aulaConDatos(request: Parameters<typeof docenteConAula>[0]): Promise<AulaPreparada> {
    const aula = await docenteConAula(request, [
      { alias: 'Mateo', avatar: 'leon' },
      { alias: 'Sofía', avatar: 'unicornio' },
      { alias: 'Teo', avatar: 'panda' },
      { alias: 'Ana', avatar: 'buho' },
    ]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
    await sembrarMaestria(aula.estudiantes['Sofía'] as string, { INF: 20, ARG: 30 });
    await sembrarMaestria(aula.estudiantes['Teo'] as string, { INF: 25 });
    await sembrarMaestria(aula.estudiantes['Ana'] as string, { INF: 90, LIT: 88 }, 8);
    await refrescarVistas();
    return aula;
  }

  async function abrirSeguimiento(page: Page, aula: AulaPreparada) {
    await abrirAula(page, aula);
    const panel = page.waitForResponse((r) => r.url().endsWith(`/api/v1/aulas/${aula.aulaId}/panel`));
    await page.getByRole('link', { name: 'Ver seguimiento' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento del aula' })).toBeVisible();
    return panel;
  }

  const filas = (page: Page) => page.getByRole('region', { name: 'Mapa de calor por habilidad' }).getByRole('table').getByRole('row');

  test('mapa de calor con filtros, alertas, refuerzo con un clic y el detalle con evidencias y pistas', async ({ page, request }) => {
    const aula = await aulaConDatos(request);
    const respuesta = await abrirSeguimiento(page, aula);
    expect(respuesta.ok()).toBe(true);
    // RNF-003: el panel de aula responde en menos de 1,5 s.
    expect(respuesta.request().timing().responseEnd).toBeLessThan(1500);

    // RF-063: una fila por estudiante y su nivel CNEB en cada habilidad.
    await expect(filas(page)).toHaveCount(5); // cabecera + 4
    const sofia = filas(page).filter({ hasText: 'Sofía' });
    await expect(sofia.getByRole('cell', { name: 'Inferencias: En inicio (20)' })).toBeVisible();
    await expect(sofia.getByRole('cell', { name: 'Argumentación: En inicio (30)' })).toBeVisible();
    await expect(filas(page).filter({ hasText: 'Ana' }).getByRole('cell', { name: 'Inferencias: Destacado (90)' })).toBeVisible();

    // UAT-04: filtrar a quienes tienen inferencias en nivel C.
    await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('INF');
    await page.getByRole('combobox', { name: 'Nivel' }).selectOption('C');
    await expect(page.getByText('2 de 4 estudiantes, de menor a mayor en inferencias')).toBeVisible();
    await expect(filas(page)).toHaveCount(3);
    await expect(filas(page).nth(1)).toContainText('Sofía');
    await expect(filas(page).nth(2)).toContainText('Teo');

    // RF-065: a quién acompañar.
    const alertas = page.getByRole('list', { name: 'Alertas' }).getByRole('listitem');
    await expect(alertas).toHaveCount(1);
    await expect(alertas.first()).toContainText('Sofía');
    await expect(alertas.first()).toContainText('2 habilidades en inicio: inferencias, argumentación');

    // RF-066: el 50 % del aula tiene inferencias en inicio; se asigna la lectura sugerida con un clic.
    const refuerzo = page.getByRole('list', { name: 'Refuerzos sugeridos' }).getByRole('listitem');
    await expect(refuerzo.first()).toContainText('Inferencias: 50 % del aula en inicio');
    await expect(refuerzo.first()).toContainText('Lectura sugerida:');
    await refuerzo.first().getByRole('button', { name: /^Asignar «.+» a 2 estudiantes para reforzar inferencias$/ }).click();
    await expect(refuerzo.first().getByText(/quedó asignada a 2 estudiantes hasta el/)).toBeVisible();
    expect(await destinatariosDeAsignaciones(aula.aulaId)).toEqual([aula.estudiantes['Sofía'], aula.estudiantes['Teo']].sort());

    // RF-064: el detalle de Mateo, con la evidencia que eligió y las pistas que usó.
    await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('');
    await page.getByRole('combobox', { name: 'Nivel' }).selectOption('');
    await filas(page).filter({ hasText: 'Mateo' }).getByRole('link', { name: 'Mateo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Habilidades' }).getByRole('listitem')).toHaveCount(5);
    const sesion = page.getByRole('list', { name: 'Sesiones' }).getByRole('listitem').first();
    await expect(sesion).toContainText('Terminada');
    const respuestas = sesion.getByRole('list', { name: /^Respuestas de / });
    const inferencia = respuestas.getByRole('listitem').filter({ hasText: ENUNCIADOS.seleccion }).first();
    await expect(inferencia).toContainText('Con la explicación');
    await expect(inferencia.getByRole('list', { name: 'Pistas usadas' })).toContainText('P1: Vuelve a la oración que acabas de leer.');
    await expect(inferencia.getByRole('list', { name: 'Pistas usadas' })).toContainText('Explicación:');
    await expect(respuestas).toContainText('Evidencia elegida: «Killa vio que tenía una espina en la pata.»');
  });

  test('RF-067: descarga el reporte del aula en CSV y PDF', async ({ page, request }) => {
    const aula = await aulaConDatos(request);
    await abrirSeguimiento(page, aula);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar CSV' }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^reporte-3-b-\d{4}-\d{2}-\d{2}\.csv$/);
    const texto = readFileSync((await csv.path()) as string, 'utf8');
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const lineas = texto.slice(1).trim().split('\r\n');
    expect(lineas).toHaveLength(5);
    expect(lineas.find((l) => l.startsWith('Sofía,'))).toContain('20,C (En inicio)');

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^reporte-3-b-.*\.pdf$/);
    expect(readFileSync((await pdf.path()) as string).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
```

`tests/e2e/support/seguimiento.ts`:

```ts
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

/**
 * Ayudantes del Módulo 9 (seguimiento docente): la maestría que habría medido Progreso, el paso del
 * tiempo sin leer y el refresco de las vistas de reportes (el worker lo hace cada 5 minutos).
 */

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

async function conBase<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = db();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;

type Valores = Partial<Record<(typeof HABILIDADES)[number], number>>;

/** La maestría de un estudiante en las 5 habilidades (70 donde no se indique), con `items` preguntas cada una. */
export function sembrarMaestria(estudianteId: string, valores: Valores, items = 6): Promise<void> {
  return sembrarMaestrias([{ estudianteId, valores }], items);
}

/** Lo mismo para varios estudiantes con una sola conexión (aulas de 30 o 40). */
export function sembrarMaestrias(lista: { estudianteId: string; valores: Valores }[], items = 6): Promise<void> {
  return conBase(async (p) => {
    for (const { estudianteId, valores } of lista) {
      for (const habilidad of HABILIDADES) {
        const valor = valores[habilidad] ?? 70;
        await p.maestriaHabilidad.upsert({
          where: { estudianteId_habilidad: { estudianteId, habilidad } },
          create: { estudianteId, habilidad, valor, itemsContados: items, actualizadoEn: new Date() },
          update: { valor, itemsContados: items },
        });
      }
    }
  });
}

/** RF-065: lleva `dias` días sin actividad (sus sesiones y su reto inicial quedan en el pasado). */
export function sinActividadDesde(estudianteId: string, dias: number): Promise<void> {
  const fecha = new Date(Date.now() - dias * 86_400_000);
  return conBase(async (p) => {
    await p.sesionLectura.updateMany({ where: { estudianteId }, data: { iniciadaEn: fecha, ultimaActividadEn: fecha } });
    await p.respuestaDiagnostico.updateMany({ where: { diagnostico: { estudianteId } }, data: { respondidaEn: fecha } });
    await p.matricula.updateMany({ where: { estudianteId }, data: { creadaEn: fecha } });
  });
}

/** Lo que hace el worker de reportes cada 5 minutos (SRS §7). */
export function refrescarVistas(): Promise<unknown> {
  return conBase((p) => p.$executeRawUnsafe('SELECT "reporting"."refrescar_vistas"()'));
}

/** RF-066: los estudiantes a los que quedó asignada la lectura de refuerzo. */
export function destinatariosDeAsignaciones(aulaId: string): Promise<string[]> {
  return conBase(async (p) => (await p.asignacionDestinatario.findMany({ where: { asignacion: { aulaId } }, select: { estudianteId: true } })).map((d) => d.estudianteId).sort());
}
```

`tests/e2e/specs/diseno/responsivo.spec.ts`:

```ts
import { expect, Locator, Page, test as base } from '@playwright/test';

import { misionConLecturas, tituloMision } from '../../support/aventura';
import { cuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada, sesionBackoffice, TEXTO_E2E } from '../../support/contenido';
import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, sembrarCatalogoE2E, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';

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
    const raiz = document.documentElement;
    return {
      // En un celular emulado, si algo ensancha la página el navegador aleja el zoom y innerWidth crece
      // con ella: se compara también con el ancho real del documento (clientWidth).
      desborde: Math.max(raiz.scrollWidth - window.innerWidth, raiz.scrollWidth - raiz.clientWidth),
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
    // Módulo 8: el Pasaporte del Lector (antes "Mi perfil", con candado) ya es una sección real.
    await nav.getByRole('link', { name: 'Pasaporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recompensas' }).getByRole('listitem')).toHaveCount(10);
    await revisarPantalla(page);
    // Módulos 4 y 7: Mundos y Progreso ya son secciones reales.
    await expect(nav.getByRole('link', { name: 'Mundos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Progreso' })).toBeVisible();
    // Un solo botón "Salir" visible en cada diseño.
    await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(1);
    if (info.project.name === 'celular') {
      // RNF-022: desde 360 px, la barra de 5 secciones no ensancha la página.
      await page.setViewportSize({ width: 360, height: 780 });
      await revisarPantalla(page);
    }
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

    // Módulo 9: el seguimiento del aula (el mapa de calor se desplaza dentro de su tabla) y el detalle.
    await page.getByRole('link', { name: 'Ver seguimiento' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento del aula' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('region', { name: 'Mapa de calor por habilidad' }).getByRole('link', { name: 'Mateo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
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

    // Módulo 10: el avance de Mateo para su familia.
    await page.getByRole('link', { name: 'Ver el avance de Mateo' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sus habilidades' })).toBeVisible();
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
  test('el mapa, un mundo y el backoffice de misiones se adaptan (RF-030 a RF-032)', async ({ page, request }) => {
    test.setTimeout(150_000);
    const editora = await cuentaBackoffice('EDITOR');
    const mision = await misionConLecturas(request, editora, 1, tituloMision('Responsiva'), ['Lectura responsiva']);
    await ingresarBackoffice(page, editora);
    await page.goto('/backoffice/misiones');
    await expect(page.getByRole('heading', { level: 2, name: mision.titulo })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: '+ Nueva misión' }).click();
    await expect(page.getByLabel('Título de la misión')).toBeVisible();
    await revisarPantalla(page);
    await salirDelPanel(page);

    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await retoTerminado(request, aula, 'Ana');
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Ana' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Ana');
    await revisarPantalla(page);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' }).click();
    await expect(page.getByRole('heading', { level: 2, name: mision.titulo })).toBeVisible();
    await revisarPantalla(page);
  });

  test('la lectura interactiva y la revisión docente se adaptan (RF-038 a RF-051)', async ({ page, request }) => {
    test.setTimeout(150_000);
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Mateo');
    await page.goto(`/estudiante/lecturas/${lectura.lecturaId}`);
    const titulo = (enunciado: string) => expect(page.getByRole('heading', { level: 2, name: enunciado, exact: true })).toBeVisible();

    await titulo('¿Qué crees que le pasará a la llama?');
    await revisarPantalla(page);
    await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();
    await page.getByRole('button', { name: 'Opción A: Estaba feliz' }).click();
    await expect(page.getByRole('list', { name: 'Tus pistas' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
    await titulo(ENUNCIADOS.evidencia);
    await page.getByRole('button', { name: 'Killa vio que tenía una espina en la pata.' }).click();
    await revisarPantalla(page); // cada oración se toca con 48 px
    await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();
    await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: 'Ir al río' }).click();
    await titulo(ENUNCIADOS.ordenar);
    await revisarPantalla(page);

    await leerPorApi(request, aula, 'Mateo', lectura.lecturaId);
    await page.reload();
    await expect(page.getByRole('heading', { name: '¿Acertaste?' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Me gustó');
    await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
    await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
    await revisarPantalla(page);

    // Módulo 7: el perfil lector y sus próximas lecturas.
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Progreso' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Tus próximas lecturas' })).toBeVisible();
    await revisarPantalla(page);

    await salirDelPanel(page);
    await abrirAula(page, aula);
    await expect(page.getByRole('region', { name: 'Respuestas por revisar' }).getByRole('listitem', { name: 'Respuesta de Mateo' })).toBeVisible();
    await revisarPantalla(page);
  });

  test('el asistente de lectura se adapta: el chat del niño y la tarjeta de la docente (RF-072 a RF-075)', async ({ page, request }, info) => {
    test.setTimeout(150_000);
    const killa = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }, { alias: 'Ana', avatar: 'buho' }]);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true });

    // La docente lo activa para su aula y pide un borrador: se lee completo, sin desplazarlo.
    await abrirAula(page, aula);
    const tarjeta = page.getByRole('region', { name: 'Asistente de lectura' });
    await tarjeta.getByRole('button', { name: 'Activar para todos', exact: true }).click();
    await tarjeta.getByText('Elegir estudiantes').click();
    const respuesta = page.getByRole('listitem', { name: 'Respuesta de Mateo' });
    await respuesta.getByRole('button', { name: 'Sugerir un comentario' }).click();
    const comentario = respuesta.getByLabel('Comentario para el estudiante (opcional)');
    await expect(comentario).toHaveValue(/^Me gusta que/);
    expect(await comentario.evaluate((e) => e.scrollHeight - e.clientHeight), 'el borrador se lee completo').toBeLessThanOrEqual(1);
    await revisarPantalla(page);
    await salirDelPanel(page);

    // Ana conversa con su guía durante la lectura.
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Ana' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Ana');
    await page.goto(`/estudiante/lecturas/${killa.lecturaId}`);
    await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();
    await page.getByRole('button', { name: '¿Necesitas ayuda para pensar?' }).click();
    await page.getByRole('button', { name: 'No entiendo la pregunta' }).click();
    await expect(page.getByRole('list', { name: 'Conversación con tu guía' }).getByRole('listitem')).toHaveCount(2);
    await revisarPantalla(page);

    if (info.project.name !== 'escritorio') return;
    const centro = async (l: Locator) => {
      const b = (await l.boundingBox())!;
      return Math.round(b.y + b.height / 2);
    };
    for (const [ancho, alto] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080], [1365, 600]] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      await revisarPantalla(page);
      // En laptop las ayudas rápidas no se apilan (2 filas como mucho) y «Preguntar» va junto a la caja.
      const atajos = await page.getByRole('group', { name: 'Ayudas rápidas' }).getByRole('button').all();
      const filas = new Set(await Promise.all(atajos.map(async (b) => Math.round((await b.boundingBox())!.y))));
      expect(filas.size, `ayudas rápidas en ${ancho}×${alto}`).toBeLessThanOrEqual(2);
      const fila = Math.abs((await centro(page.getByLabel('Escribe tu pregunta'))) - (await centro(page.getByRole('button', { name: 'Preguntar' }))));
      expect(fila, `«Preguntar» junto a la caja en ${ancho}×${alto}`).toBeLessThanOrEqual(4);
    }
  });

  test('el área del estudiante se adapta a laptops de distintos tamaños: centrada, sin desbordes y con la barra completa', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Tamaños de laptop: solo en el proyecto de computadora');
    test.setTimeout(150_000);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Mateo');
    // Laptops comunes y dos casos límite: una ventana baja y una de 1366 px con el zoom del navegador al 80 %.
    for (const [ancho, alto] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080], [1365, 600], [1707, 750]] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const ruta of ['/estudiante', '/estudiante/biblioteca', '/estudiante/mundos', '/estudiante/progreso', '/estudiante/pasaporte']) {
        await page.goto(ruta);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        const m = await page.evaluate(() => {
          const main = document.querySelector('.est-main') as HTMLElement;
          const caja = main.getBoundingClientRect();
          const estilo = getComputedStyle(main);
          const seccion = (main.firstElementChild as HTMLElement).getBoundingClientRect();
          const nav = document.querySelector('.est-nav') as HTMLElement;
          const letrero = document.querySelector('.est-nav__letrero');
          return {
            desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            // La sección queda centrada: el mismo espacio libre a cada lado.
            descentrado: Math.abs(seccion.left - caja.left - parseFloat(estilo.paddingLeft) - (caja.right - parseFloat(estilo.paddingRight) - seccion.right)),
            barraCortada: nav.scrollHeight - nav.clientHeight,
            letreroFuera: letrero ? Math.round(letrero.getBoundingClientRect().bottom - window.innerHeight) : 0,
          };
        });
        expect(m, `${ruta} en ${ancho}×${alto}`).toEqual({ desborde: 0, descentrado: expect.any(Number), barraCortada: 0, letreroFuera: expect.any(Number) });
        expect(m.descentrado, `${ruta} centrada en ${ancho}×${alto}`).toBeLessThanOrEqual(2);
        expect(m.letreroFuera, `letrero completo en ${ancho}×${alto}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('los paneles de adultos aprovechan el ancho de las laptops: acciones en una fila y botones a su medida', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Tamaños de laptop: solo en el proyecto de computadora');
    test.setTimeout(120_000);
    const familia = await cuentaVerificada(request, { prefijo: 'diseno-laptop' });
    const auth = await sesionApi(request, familia);
    await request.post('/api/v1/consentimientos', { headers: auth, data: { otorganteNombre: 'Rosa Prueba', aceptaPolitica: true } });
    const perfil = await request.post('/api/v1/estudiantes', { headers: auth, data: { alias: 'Lucía', anioNacimiento: 2017, mesNacimiento: 3, avatar: 'koala', pin: '2580' } });
    expect(perfil.status(), await perfil.text()).toBe(201);
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page.getByRole('button', { name: 'Cambiar PIN' })).toBeVisible();

    const arriba = async (nombres: string[], rol: 'button' | 'combobox' | 'textbox') =>
      Promise.all(nombres.map(async (name) => Math.round((await page.getByRole(rol, { name, exact: true }).boundingBox())!.y)));
    for (const [ancho, alto] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080]] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      await page.goto('/familia');
      await expect(page.getByRole('button', { name: 'Cambiar PIN' })).toBeVisible();
      await revisarPantalla(page);
      // Las acciones del perfil del hijo, en una sola fila (no apiladas en una tarjeta angosta).
      const acciones = await arriba(['Editar', 'Cambiar PIN', 'Desactivar', 'Descargar datos', 'Eliminar'], 'button');
      expect(new Set(acciones).size, `acciones del perfil en una fila en ${ancho}×${alto}`).toBe(1);
      // Un botón suelto tiene su ancho natural, no el de toda la tarjeta.
      const mfa = (await page.getByRole('button', { name: 'Configurar verificación en dos pasos' }).boundingBox())!;
      const tarjeta = (await page.getByRole('heading', { name: 'Seguridad de tu cuenta' }).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " la-tarjeta ")][1]').boundingBox())!;
      expect(mfa.width, `botón de verificación a su medida en ${ancho}×${alto}`).toBeLessThan(tarjeta.width * 0.6);

      // Los 5 filtros de la biblioteca caben en una fila.
      await page.goto('/familia/biblioteca');
      await expect(page.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeVisible();
      await revisarPantalla(page);
      const filtros = [...(await arriba(['Temática'], 'textbox')), ...(await arriba(['Edad', 'Nivel', 'Tipo de texto', 'Habilidad'], 'combobox'))];
      expect(new Set(filtros).size, `filtros en una fila en ${ancho}×${alto}`).toBe(1);

      // Módulo 10: el avance de la hija usa el ancho — su semana y sus habilidades lado a lado.
      await page.goto('/familia');
      await page.getByRole('link', { name: 'Ver el avance de Lucía' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Sus habilidades' })).toBeVisible();
      await revisarPantalla(page);
      const semana = (await page.getByRole('heading', { level: 2, name: 'Esta semana' }).boundingBox())!;
      const habilidades = (await page.getByRole('heading', { level: 2, name: 'Sus habilidades' }).boundingBox())!;
      expect(Math.abs(semana.y - habilidades.y), `semana y habilidades en la misma fila en ${ancho}×${alto}`).toBeLessThan(4);
      expect(habilidades.x, `habilidades a la derecha en ${ancho}×${alto}`).toBeGreaterThan(semana.x + 300);
    }
  });
});
```

`tests/load/sembrar-seguimiento.mjs`:

```js
// Un aula de 40 estudiantes con su maestría en las 5 habilidades (la que Progreso mediría al leer),
// para el escenario k6 del seguimiento docente (scenarios/seguimiento-panel.js, RNF-003, RF-064, RF-067).
// SOLO para desarrollo y CI (ver sembrado.mjs). La docente usa la contraseña fija de las cuentas de
// carga (dominio e2e.lectoaventura.test, que la limpieza de las pruebas E2E borra).
// Imprime solo "aulaId email".
//
// Uso (con la API en marcha):  node tests/load/sembrar-seguimiento.mjs
import { conPrisma, exigirEntornoLocal, llamar, salir } from './sembrado.mjs';

const CONTRASENA = 'Carga-Lectora-2026-k6';
const ESTUDIANTES = 40;
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];
const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'];

exigirEntornoLocal();
const email = `carga.seguimiento.${Date.now().toString(36)}@e2e.lectoaventura.test`;
await llamar('POST', '/auth/registro', { nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' });
const correo = (await llamar('GET', '/dev/correos')).find((c) => c.para === email);
if (!correo) salir('No llegó el correo de verificación (¿la API corre con la bandeja de desarrollo?).');
await llamar('POST', '/auth/verificar-correo', { codigo: correo.enlace.split('codigo=')[1] });
const { accessToken } = await llamar('POST', '/auth/login', { email, contrasena: CONTRASENA });
const docente = { Authorization: `Bearer ${accessToken}` };

const aula = await llamar(
  'POST',
  '/aulas',
  { nombre: '4.° Seguimiento carga', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga', autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true },
  docente,
);
const csv = Array.from({ length: ESTUDIANTES }, (_, i) => `Lector ${i + 1},2016,${(i % 12) + 1},${AVATARES[i % 12]}`).join('\n');
const { matriculados } = await llamar('POST', `/aulas/${aula.id}/matriculas/importacion`, { csv }, docente);
if (matriculados?.length !== ESTUDIANTES) salir(`No se matricularon los ${ESTUDIANTES} estudiantes de carga.`);

// Maestría repartida entre los 4 niveles CNEB: hay alertas, refuerzos grupales y lecturas sugeridas.
await conPrisma(async (prisma) => {
  await prisma.maestriaHabilidad.createMany({
    data: matriculados.flatMap((m, i) =>
      HABILIDADES.map((habilidad, j) => ({ estudianteId: m.estudianteId, habilidad, valor: (i * 7 + j * 13) % 100, itemsContados: 6, actualizadoEn: new Date() })),
    ),
  });
  // Lo que hace el worker de reportes cada 5 minutos.
  await prisma.$executeRawUnsafe('SELECT "reporting"."refrescar_vistas"()');
});
console.log(`${aula.id} ${email}`);
```

`tests/load/scenarios/seguimiento-panel.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del seguimiento docente (k6), con un aula de 40 estudiantes:
 *   RNF-003 / RF-063: panel del aula (mapa de calor, alertas y refuerzos) → p95 < 1,5 s.
 *   RF-064: detalle de un estudiante (sus últimas 20 sesiones) → p95 < 1,5 s.
 *   RF-067: reporte del aula en PDF y CSV → cada descarga en ≤ 30 s.
 *
 * Requisitos: API en marcha y el aula sembrada (sembrar-seguimiento.mjs imprime "aulaId email").
 * Ejecutar:   D=$(node tests/load/sembrar-seguimiento.mjs)
 *             k6 run -e AULA_ID="${D% *}" -e EMAIL="${D#* }" tests/load/scenarios/seguimiento-panel.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const ESTUDIANTES = 40;

export const options = {
  scenarios: {
    panel_docente: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'seguirAlAula',
      tags: { escenario: 'panel_docente' },
    },
    reporte: {
      executor: 'constant-arrival-rate',
      rate: 6,
      timeUnit: '1m',
      duration: __ENV.DURACION || '1m',
      preAllocatedVUs: 2,
      maxVUs: 4,
      exec: 'descargarReporte',
      tags: { escenario: 'reporte' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /aulas/{id}/panel}': ['p(95)<1500'],
    'http_req_duration{nombre:GET /aulas/{id}/estudiantes/{id}/detalle}': ['p(95)<1500'],
    'http_req_duration{nombre:GET /aulas/{id}/reporte}': ['max<30000'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** La docente del aula sembrada inicia sesión una vez; los ids de sus estudiantes salen del panel. */
export function setup() {
  if (!__ENV.AULA_ID || !__ENV.EMAIL) fail('Faltan AULA_ID y EMAIL: siembra el aula con node tests/load/sembrar-seguimiento.mjs');
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email: __ENV.EMAIL, contrasena: CONTRASENA }), {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipDispositivo() },
  });
  if (sesion.status !== 200) fail(`La docente de carga no pudo ingresar: ${sesion.status}`);
  const docente = { Authorization: `Bearer ${sesion.json('accessToken')}` };
  const panel = http.get(`${BASE}/aulas/${__ENV.AULA_ID}/panel`, { headers: docente });
  if (panel.status !== 200 || panel.json('estudiantes').length !== ESTUDIANTES) fail(`El aula sembrada no tiene ${ESTUDIANTES} estudiantes`);
  return { aulaId: __ENV.AULA_ID, docente, estudiantes: panel.json('estudiantes').map((e) => e.id) };
}

/** La docente abre el panel del aula y luego el detalle de uno de sus estudiantes. */
export function seguirAlAula(datos) {
  const panel = http.get(`${BASE}/aulas/${datos.aulaId}/panel`, { headers: datos.docente, tags: { nombre: 'GET /aulas/{id}/panel' } });
  check(panel, {
    'panel con 40 estudiantes': (r) => r.status === 200 && r.json('estudiantes').length === ESTUDIANTES,
    'panel con alertas y refuerzos': (r) => r.status === 200 && r.json('alertas').length > 0 && r.json('refuerzos').length > 0,
  });
  const estudianteId = datos.estudiantes[Math.floor(Math.random() * datos.estudiantes.length)];
  const detalle = http.get(`${BASE}/aulas/${datos.aulaId}/estudiantes/${estudianteId}/detalle`, {
    headers: datos.docente,
    tags: { nombre: 'GET /aulas/{id}/estudiantes/{id}/detalle' },
  });
  check(detalle, { 'detalle con sus 5 habilidades': (r) => r.status === 200 && r.json('habilidades').length === 5 });
}

/** Mitad PDF, mitad CSV. */
export function descargarReporte(datos) {
  const formato = Math.random() < 0.5 ? 'pdf' : 'csv';
  const res = http.get(`${BASE}/aulas/${datos.aulaId}/reporte?formato=${formato}`, {
    headers: datos.docente,
    responseType: 'binary',
    tags: { nombre: 'GET /aulas/{id}/reporte', formato },
  });
  check(res, {
    'reporte descargado': (r) => r.status === 200 && r.headers['Content-Type'].startsWith(formato === 'pdf' ? 'application/pdf' : 'text/csv'),
    'reporte sin caché': (r) => r.headers['Cache-Control'] === 'no-store',
  });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@seguimiento
Característica: Seguimiento docente por habilidad
  Como docente de un aula de LectoAventura
  Quiero ver cómo lee cada estudiante en cada habilidad y a quién debo acompañar
  Para reforzar a tiempo lo que más le cuesta a mi aula

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @UAT-04 @RF-063 @RF-064 @RNF-003 @camino-feliz @smoke @slow
  Escenario: La docente identifica a quién reforzar en inferencias
    Dado un aula de 3.er grado con 30 estudiantes y actividad en las últimas 2 semanas
    Y 12 estudiantes tienen inferencias en nivel "C"
    Cuando la docente abre el panel del aula
    Entonces ve un mapa de calor de estudiantes por habilidad en menos de 1,5 segundos
    Y puede filtrar a los 12 estudiantes con inferencias en nivel "C"
    Y al abrir a un estudiante ve sus evidencias seleccionadas y las pistas que usó

  @RF-065
  Escenario: El panel avisa a quién acompañar
    Dado un aula donde "Sofía" tiene inferencias y argumentación en inicio y "Teo" no lee hace 8 días
    Cuando la docente abre el panel del aula
    Entonces ve a "Sofía" para acompañar por "2 habilidades en inicio: inferencias, argumentación"
    Y ve a "Teo" para acompañar por "8 días sin actividad"

  @RF-066
  Escenario: Asigna con un clic el refuerzo que necesita parte del aula
    Dado un aula donde 2 de sus 4 estudiantes tienen inferencias en inicio
    Cuando la docente abre el panel del aula
    Y asigna con un clic la lectura sugerida para reforzar inferencias
    Entonces la lectura queda asignada solo a esos 2 estudiantes

  @RF-067 @slow
  Escenario: Descarga el reporte de un aula de 40 estudiantes en CSV y PDF
    Dado un aula de 3.er grado con 40 estudiantes
    Cuando la docente abre el panel del aula
    Entonces descarga el reporte en CSV en menos de 30 segundos con una fila por estudiante
    Y descarga el reporte en PDF en menos de 30 segundos

  @RN-17 @negativo
  Escenario: Otra docente no puede ver el seguimiento de un aula ajena
    Dado un aula de 3.er grado con 5 estudiantes
    Cuando otra docente intenta abrir el seguimiento de esa aula
    Entonces ve "No encontramos esta aula entre las tuyas." y ningún dato de sus estudiantes
```

## 7.2 Automatización (Step Definitions)

```ts
import { readFileSync } from 'node:fs';

import { APIRequestContext, Download, expect, Page } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { abrirAula, AulaPreparada, docenteConAula } from '../support/escuela';
import { cuentaVerificada, ingresarComoAdulto } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { destinatariosDeAsignaciones, refrescarVistas, sembrarMaestria, sembrarMaestrias, sinActividadDesde } from '../support/seguimiento';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del seguimiento docente (RF-063 a RF-067, RN-17, UAT-04). */

const NOMBRES = [
  'Mateo', 'Valeria', 'Thiago', 'Camila', 'Santiago', 'Luciana', 'Sebastián', 'Mía', 'Matías', 'Isabella',
  'Gael', 'Ximena', 'Dylan', 'Antonella', 'Joaquín', 'Renata', 'Adrián', 'Fernanda', 'Liam', 'Abril',
  'Bruno', 'Daniela', 'Emilio', 'Alessia', 'Fabián', 'Romina', 'Iker', 'Zoe', 'Nicolás', 'Kiara',
  'Leonardo', 'Micaela', 'Rodrigo', 'Paola', 'Diego', 'Andrea', 'Gabriel', 'Valentina', 'Samuel', 'Julia',
];
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

/** Un aula de 3.er grado con `n` estudiantes (n ≤ 40), cada uno con un avatar. */
function aulaDe(request: APIRequestContext, n: number): Promise<AulaPreparada> {
  return docenteConAula(request, NOMBRES.slice(0, n).map((alias, i) => ({ alias, avatar: AVATARES[i % AVATARES.length] as string })));
}

const id = (mundo: Mundo, alias: string) => mundo.aula!.estudiantes[alias] as string;
const filas = (page: Page) => page.getByRole('region', { name: 'Mapa de calor por habilidad' }).getByRole('table').getByRole('row');
const alertas = (page: Page) => page.getByRole('list', { name: 'Alertas' }).getByRole('listitem');

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('un aula de 3.er grado con 30 estudiantes y actividad en las últimas 2 semanas', async ({ request, mundo }) => {
  mundo.aula = await aulaDe(request, 30);
  // Mateo lee de verdad: falla la inferencia hasta la explicación y elige su evidencia.
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, mundo.aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
  // Los demás, con la maestría que Progreso midió en sus lecturas: inferencias entre 60 y 88.
  await sembrarMaestrias(NOMBRES.slice(1, 30).map((alias, i) => ({ estudianteId: id(mundo, alias), valores: { INF: 60 + i } })));
  await refrescarVistas();
});

Dado('{int} estudiantes tienen inferencias en nivel {string}', async ({ mundo }, cuantos: number, nivel: string) => {
  expect(nivel).toBe('C');
  // De 14 a 36: en inicio (nivel C es menos de 40).
  await sembrarMaestrias(NOMBRES.slice(1, 1 + cuantos).map((alias, i) => ({ estudianteId: id(mundo, alias), valores: { INF: 36 - i * 2 } })));
  await refrescarVistas();
});

Dado('un aula donde {string} tiene inferencias y argumentación en inicio y {string} no lee hace {int} días', async ({ request, mundo }, enInicio: string, inactivo: string, dias: number) => {
  mundo.aula = await docenteConAula(request, [
    { alias: enInicio, avatar: 'unicornio' },
    { alias: inactivo, avatar: 'panda' },
    { alias: 'Ana', avatar: 'buho' },
  ]);
  await sembrarMaestria(id(mundo, enInicio), { INF: 20, ARG: 30 });
  // Hizo su reto inicial y luego dejó de leer.
  await retoTerminado(request, mundo.aula, inactivo, ['LIT', 'INF', 'VOC', 'CRI', 'ARG']);
  await sembrarMaestria(id(mundo, inactivo), {});
  await sinActividadDesde(id(mundo, inactivo), dias);
  await sembrarMaestria(id(mundo, 'Ana'), { INF: 90, LIT: 88 }, 8);
  await refrescarVistas();
});

Dado('un aula donde 2 de sus 4 estudiantes tienen inferencias en inicio', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [
    { alias: 'Mateo', avatar: 'leon' },
    { alias: 'Sofía', avatar: 'unicornio' },
    { alias: 'Teo', avatar: 'panda' },
    { alias: 'Ana', avatar: 'buho' },
  ]);
  // La lectura de ejemplo trabaja inferencias: es la que el panel puede sugerir.
  mundo.killa = await lecturaKilla(request);
  await sembrarMaestrias([
    { estudianteId: id(mundo, 'Mateo'), valores: { INF: 80 } },
    { estudianteId: id(mundo, 'Sofía'), valores: { INF: 20 } },
    { estudianteId: id(mundo, 'Teo'), valores: { INF: 25 } },
    { estudianteId: id(mundo, 'Ana'), valores: { INF: 90 } },
  ]);
  await refrescarVistas();
});

Dado('un aula de 3.er grado con {int} estudiantes', async ({ request, mundo }, n: number) => {
  mundo.aula = await aulaDe(request, n);
  await sembrarMaestrias(NOMBRES.slice(0, n).map((alias, i) => ({ estudianteId: id(mundo, alias), valores: { LIT: 30 + i, INF: 25 + i, VOC: 50 + i } })));
  await refrescarVistas();
});

// ── Acciones ─────────────────────────────────────────────────────────────────

Cuando('la docente abre el panel del aula', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  const panel = page.waitForResponse((r) => r.url().endsWith(`/api/v1/aulas/${mundo.aula!.aulaId}/panel`));
  await page.getByRole('link', { name: 'Ver seguimiento' }).click();
  const respuesta = await panel;
  expect(respuesta.ok()).toBe(true);
  mundo.panelMs = respuesta.request().timing().responseEnd;
  await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento del aula' })).toBeVisible();
});

Cuando('asigna con un clic la lectura sugerida para reforzar inferencias', async ({ page }) => {
  const refuerzo = page.getByRole('list', { name: 'Refuerzos sugeridos' }).getByRole('listitem').filter({ hasText: 'Inferencias' });
  await expect(refuerzo).toContainText('Inferencias: 50 % del aula en inicio');
  await refuerzo.getByRole('button', { name: /^Asignar «.+» a 2 estudiantes para reforzar inferencias$/ }).click();
  await expect(refuerzo.getByText(/quedó asignada a 2 estudiantes hasta el/)).toBeVisible();
});

Cuando('otra docente intenta abrir el seguimiento de esa aula', async ({ page, request, mundo }) => {
  const otra = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Marta Docente', prefijo: 'otra-docente' });
  await ingresarComoAdulto(page, otra.email, otra.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto(`/docente/aulas/${mundo.aula!.aulaId}/seguimiento`);
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('ve un mapa de calor de estudiantes por habilidad en menos de 1,5 segundos', async ({ page, mundo }) => {
  // RNF-003 / RF-063: el panel del aula responde en menos de 1,5 s.
  expect(mundo.panelMs).toBeLessThan(1500);
  await expect(filas(page)).toHaveCount(31); // cabecera + 30
  await expect(filas(page).first().getByRole('columnheader')).toHaveCount(8); // estudiante, 5 habilidades, última actividad y lecturas de la semana
  await expect(filas(page).filter({ hasText: 'Valeria' }).getByRole('cell', { name: 'Inferencias: En inicio (36)' })).toBeVisible();
});

Entonces('puede filtrar a los {int} estudiantes con inferencias en nivel {string}', async ({ page }, cuantos: number, nivel: string) => {
  await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('INF');
  await page.getByRole('combobox', { name: 'Nivel' }).selectOption(nivel);
  await expect(page.getByText(`${cuantos} de 30 estudiantes, de menor a mayor en inferencias`)).toBeVisible();
  await expect(filas(page)).toHaveCount(cuantos + 1);
  // De menor a mayor: primero quien tiene 14, al final quien tiene 36.
  await expect(filas(page).nth(1).getByRole('cell', { name: 'Inferencias: En inicio (14)' })).toBeVisible();
  await expect(filas(page).nth(cuantos).getByRole('cell', { name: 'Inferencias: En inicio (36)' })).toBeVisible();
});

Entonces('al abrir a un estudiante ve sus evidencias seleccionadas y las pistas que usó', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('');
  await page.getByRole('combobox', { name: 'Nivel' }).selectOption('');
  await filas(page).filter({ hasText: 'Mateo' }).getByRole('link', { name: 'Mateo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
  const sesion = page.getByRole('list', { name: 'Sesiones' }).getByRole('listitem').first();
  await expect(sesion).toContainText('Terminada');
  const respuestas = sesion.getByRole('list', { name: /^Respuestas de / });
  await expect(respuestas).toContainText('Evidencia elegida: «Killa vio que tenía una espina en la pata.»');
  const inferencia = respuestas.getByRole('listitem').filter({ hasText: ENUNCIADOS.seleccion }).first();
  await expect(inferencia.getByRole('list', { name: 'Pistas usadas' })).toContainText('P1: Vuelve a la oración que acabas de leer.');
});

Entonces('ve a {string} para acompañar por {string}', async ({ page }, alias: string, motivo: string) => {
  await expect(alertas(page).filter({ hasText: alias })).toContainText(motivo);
});

Entonces('la lectura queda asignada solo a esos 2 estudiantes', async ({ mundo }) => {
  expect(await destinatariosDeAsignaciones(mundo.aula!.aulaId)).toEqual([id(mundo, 'Sofía'), id(mundo, 'Teo')].sort());
});

/** RF-067: la descarga completa (hasta tener el archivo) en menos de 30 s. */
async function descargar(page: Page, boton: string): Promise<Download> {
  const inicio = Date.now();
  const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: boton }).click()]);
  await descarga.path();
  expect(Date.now() - inicio).toBeLessThan(30_000);
  return descarga;
}

Entonces('descarga el reporte en CSV en menos de 30 segundos con una fila por estudiante', async ({ page, mundo }) => {
  const csv = await descargar(page, 'Descargar CSV');
  expect(csv.suggestedFilename()).toMatch(/^reporte-3-b-\d{4}-\d{2}-\d{2}\.csv$/);
  const lineas = readFileSync((await csv.path()) as string, 'utf8').slice(1).trim().split('\r\n');
  const n = Object.keys(mundo.aula!.estudiantes).length;
  expect(lineas).toHaveLength(n + 1); // cabecera + un estudiante por fila
  for (const alias of Object.keys(mundo.aula!.estudiantes)) expect(lineas.some((l) => l.startsWith(`${alias},`))).toBe(true);
});

Entonces('descarga el reporte en PDF en menos de 30 segundos', async ({ page }) => {
  const pdf = await descargar(page, 'Descargar PDF');
  expect(pdf.suggestedFilename()).toMatch(/^reporte-3-b-.*\.pdf$/);
  expect(readFileSync((await pdf.path()) as string).subarray(0, 5).toString()).toBe('%PDF-');
});

Entonces('ve {string} y ningún dato de sus estudiantes', async ({ page, mundo }, mensaje: string) => {
  await expect(page.getByText(mensaje)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  for (const alias of Object.keys(mundo.aula!.estudiantes).slice(0, 5)) await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
});
```

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
