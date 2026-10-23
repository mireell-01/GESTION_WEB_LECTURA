<!-- Generado con node docs/pruebas/construir.mjs desde 07-progreso-plan-de-pruebas.plantilla.md. No editar a mano. -->
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
| +50 por subir de nivel (RN-11) | El evento ya se publica, nadie lo escucha | Gamificación (Módulo 8) |
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

```ts
import { describe, expect, it } from 'vitest';

import { nivelSubio, PerfilLector } from '../../../../src/modules/progreso/domain/entities/perfil-lector';
import { aReforzar, factorDificultad, nivelLectura, puntajeObservado, siguienteMaestria } from '../../../../src/modules/progreso/domain/services/maestria';
import { CandidatosRecomendacion, recomendar } from '../../../../src/modules/progreso/domain/services/recomendador';

/** Nivel 1 — Dominio del perfil lector (RF-052 a RF-055, RN-07, RN-08, RN-20). */
const AHORA = new Date('2026-10-22T15:00:00Z');

describe('Maestría (RN-07) y refuerzo (RF-054)', () => {
  it('el ítem vale su puntaje × (0,8 + 0,1 × dificultad) × 100, acotado a 100', () => {
    expect(factorDificultad(3)).toBeCloseTo(1.1);
    expect(puntajeObservado(1, 1)).toBeCloseTo(90);
    expect(puntajeObservado(0.75, 3)).toBeCloseTo(82.5);
    expect(puntajeObservado(1, 5)).toBe(100);
    expect(puntajeObservado(0, 4)).toBe(0);
  });

  it('EMA α = 0,3; el primer ítem de una habilidad sin historia toma su valor', () => {
    expect(siguienteMaestria(0, 0, 82.5)).toBe(82.5);
    expect(siguienteMaestria(70, 0, 100)).toBe(79); // con valor del reto inicial, aunque no traiga ítems
    expect(siguienteMaestria(50, 3, 100)).toBe(65);
    expect(siguienteMaestria(70, 6, 0)).toBe(49);
    expect(siguienteMaestria(33.333, 2, 33.333)).toBe(33.33);
  });

  it('"a reforzar" con maestría menor a 40 y al menos 5 ítems', () => {
    expect(aReforzar(39.9, 5)).toBe(true);
    expect(aReforzar(39.9, 4)).toBe(false);
    expect(aReforzar(40, 9)).toBe(false);
  });

  it('nivel de lectura: el de su edad, −1 en inicio, +1 logrado, +2 destacado, entre 1 y 5', () => {
    expect([nivelLectura('R2', 50), nivelLectura('R2', 30), nivelLectura('R2', 70), nivelLectura('R2', 90)]).toEqual([2, 1, 3, 4]);
    expect(nivelLectura('R1', 10)).toBe(1);
    expect(nivelLectura('R3', 95)).toBe(5);
  });
});

describe('PerfilLector (RF-052, RF-053)', () => {
  it('nace con las 5 habilidades en 0 y parte del reto inicial una sola vez', () => {
    const p = PerfilLector.nuevo('nino');
    expect(p.todas().map((m) => [m.habilidad, m.valor, m.itemsContados])).toEqual([['LIT', 0, 0], ['INF', 0, 0], ['VOC', 0, 0], ['CRI', 0, 0], ['ARG', 0, 0]]);
    expect(p.tieneHistoria).toBe(false);
    expect(p.iniciarConDiagnostico({ maestrias: { LIT: 110, INF: 45.556, VOC: 70 }, items: { LIT: 3, INF: 3, VOC: 3, CRI: 3, ARG: 3 }, diagnosticoId: 'd1', ahora: AHORA })).toBe(true);
    expect(p.valores()).toEqual({ LIT: 100, INF: 45.56, VOC: 70, CRI: 0, ARG: 0 });
    expect(p.cambios()).toHaveLength(5);
    expect(p.cambios()[0]).toMatchObject({ origen: 'DIAGNOSTICO', origenId: 'd1', nivelAnterior: null, nivelNuevo: null });
    expect(p.iniciarConDiagnostico({ maestrias: { LIT: 0 }, items: { LIT: 3 }, diagnosticoId: 'd2', ahora: AHORA })).toBe(false);
  });

  it('cada ítem mueve su habilidad (EMA) y cuenta un ítem más; el nivel se declara con 5 (RN-08)', () => {
    const p = PerfilLector.desdePersistencia('nino', [{ habilidad: 'INF', valor: 60, itemsContados: 4, actualizadoEn: AHORA, version: 2 }]);
    expect(p.estaPersistido).toBe(true);
    const c = p.registrar({ habilidad: 'INF', puntajeItem: 1, nivelDificultad: 3, origen: 'ITEM', origenId: 'r1', ahora: AHORA });
    expect(c).toMatchObject({ habilidad: 'INF', anterior: 60, nuevo: 72, itemsContados: 5, nivelAnterior: null, nivelNuevo: 'A' });
    expect(nivelSubio(c)).toBe(false); // declararse por primera vez no es "subir"
    const d = p.registrar({ habilidad: 'INF', puntajeItem: 1, nivelDificultad: 5, origen: 'ITEM', origenId: 'r2', ahora: AHORA });
    expect(d).toMatchObject({ nuevo: 80.4, nivelAnterior: 'A', nivelNuevo: 'A' });
    const e = p.registrar({ habilidad: 'INF', puntajeItem: 1, nivelDificultad: 5, origen: 'ITEM', origenId: 'r3', ahora: AHORA });
    expect(e).toMatchObject({ nuevo: 86.28, nivelNuevo: 'AD' });
    expect(nivelSubio(e)).toBe(true);
    expect(p.habilidadesCambiadas()).toEqual(['INF']);
    p.confirmarCambios();
    expect(p.de('INF').version).toBe(3);
    expect(p.cambios()).toEqual([]);
  });

  it('RF-054 y RN-20: las que hay que reforzar y la más débil (a igualdad, la menos practicada)', () => {
    const p = PerfilLector.desdePersistencia('nino', [
      { habilidad: 'LIT', valor: 80, itemsContados: 9, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'INF', valor: 30, itemsContados: 6, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'VOC', valor: 30, itemsContados: 2, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'CRI', valor: 55, itemsContados: 5, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'ARG', valor: 45, itemsContados: 5, actualizadoEn: AHORA, version: 1 },
    ]);
    expect(p.aReforzar()).toEqual(['INF']);
    expect(p.habilidadMasDebil()).toBe('VOC');
    expect(p.promedio()).toBe(48);
    expect(PerfilLector.nuevo('otro').habilidadMasDebil()).toBe('LIT');
  });
});

describe('Recomendaciones (RF-055, RN-20)', () => {
  const base = (p: Partial<CandidatosRecomendacion> = {}): CandidatosRecomendacion => ({
    asignaciones: [],
    mision: null,
    fichas: [
      { id: 'inf-2', nivelDificultad: 2, habilidades: ['INF'] },
      { id: 'inf-4', nivelDificultad: 4, habilidades: ['INF'] },
      { id: 'lit-2', nivelDificultad: 2, habilidades: ['LIT'] },
    ],
    terminadas: new Set(),
    habilidadDebil: 'INF',
    nivel: 3,
    ...p,
  });

  it('la asignación docente va primero, luego la misión en curso y la de la habilidad más débil a su nivel', () => {
    const r = recomendar(base({
      asignaciones: [{ asignacionId: 'a1', tipo: 'LECTURA', contenidoId: 'asignada', titulo: 'La asignada' }],
      mision: { misionId: 'm1', mision: 'Pistas del bosque', lecturaId: 'de-mision' },
    }));
    expect(r.map((x) => [x.tipo, x.lecturaId])).toEqual([['ASIGNACION_DOCENTE', 'asignada'], ['LECTURA_MISION', 'de-mision'], ['LECTURA_HABILIDAD_DEBIL', 'inf-2']]);
    expect(r[1]?.mision).toEqual({ id: 'm1', titulo: 'Pistas del bosque' });
    expect(r[2]).toMatchObject({ habilidad: 'INF', motivo: 'Habilidad por reforzar: INF' });
  });

  it('a igual cercanía a su nivel elige la más fácil; nunca repite ni recomienda lo ya leído', () => {
    expect(recomendar(base({ nivel: 3 }))[0]?.lecturaId).toBe('inf-2');
    expect(recomendar(base({ nivel: 4 }))[0]?.lecturaId).toBe('inf-4');
    expect(recomendar(base({ terminadas: new Set(['inf-2']) }))[0]?.lecturaId).toBe('inf-4');
    const repetida = recomendar(base({ mision: { misionId: 'm1', mision: 'M', lecturaId: 'inf-2' } }));
    expect(repetida.map((x) => x.lecturaId)).toEqual(['inf-2', 'inf-4']);
  });

  it('una asignación ya leída se salta; una de misión se recomienda con su misión', () => {
    const r = recomendar(base({
      asignaciones: [
        { asignacionId: 'a1', tipo: 'LECTURA', contenidoId: 'leida', titulo: 'Leída' },
        { asignacionId: 'a2', tipo: 'MISION', contenidoId: 'mision-x', titulo: 'Misión X' },
      ],
      terminadas: new Set(['leida']),
    }));
    expect(r[0]).toMatchObject({ tipo: 'ASIGNACION_DOCENTE', lecturaId: null, asignacionId: 'a2', mision: { id: 'mision-x', titulo: 'Misión X' } });
  });

  it('a lo sumo 3; sin nada de lo anterior, refuerzo con otra lectura o volviendo a leer (siempre ≥ 1 si hay lecturas)', () => {
    const muchas = recomendar(base({
      asignaciones: [{ asignacionId: 'a1', tipo: 'LECTURA', contenidoId: 'x', titulo: 'X' }],
      mision: { misionId: 'm', mision: 'M', lecturaId: 'y' },
    }));
    expect(muchas).toHaveLength(3);
    const otra = recomendar(base({ habilidadDebil: 'ARG' }));
    expect(otra).toEqual([expect.objectContaining({ tipo: 'REFUERZO', lecturaId: 'inf-2', motivo: 'Para seguir practicando' })]);
    const releer = recomendar(base({ habilidadDebil: 'LIT', terminadas: new Set(['inf-2', 'inf-4', 'lit-2']) }));
    expect(releer).toEqual([expect.objectContaining({ tipo: 'REFUERZO', lecturaId: 'lit-2', motivo: 'Volver a leer para practicar' })]);
    expect(recomendar(base({ fichas: [] }))).toEqual([]);
  });
});
```

`apps/api/test/unit/progreso/aplicacion/progreso-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { MaestriaDesactualizadaError } from '../../../../src/modules/progreso/domain/errors/errores-progreso';
import { DatosItemRespondido, EVENTOS_INTEGRACION, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoProgreso, EntornoProgreso } from '../dobles';

/** Nivel 1 — Casos de uso de Progreso con dobles (RF-052 a RF-055, RN-07, RN-19, RN-20). */
const NINO = 'nino-9';
const TRES = { LIT: 3, INF: 3, VOC: 3, CRI: 3, ARG: 3 };

const item = (p: Partial<DatosItemRespondido> = {}): DatosItemRespondido => ({
  estudianteId: NINO,
  respuestaId: 'r-1',
  sesionId: 's-1',
  lecturaId: 'l-1',
  itemId: 'i-1',
  habilidad: 'INF',
  nivelDificultad: 3,
  esCorrecta: true,
  pistasUsadas: 1,
  puntajeItem: 0.75,
  esRepeticion: false,
  palabras: null,
  ...p,
});

describe('Progreso: perfil lector, maestría y recomendaciones', () => {
  let e: EntornoProgreso;

  beforeEach(() => {
    e = crearEntornoProgreso();
    e.identidad.rangos.set(NINO, 'R2');
  });

  describe('Maestría (RF-053)', () => {
    it('el reto inicial crea el perfil una sola vez; la reevaluación no lo toca', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', tipo: 'INICIAL', maestrias: { LIT: 80, INF: 40, VOC: 66, CRI: 20, ARG: 0 }, items: TRES });
      expect(e.repo.filas.get(NINO)?.map((m) => [m.habilidad, m.valor, m.itemsContados])).toEqual([['LIT', 80, 3], ['INF', 40, 3], ['VOC', 66, 3], ['CRI', 20, 3], ['ARG', 0, 3]]);
      expect(e.bus.nombres()).toEqual(['progreso.PerfilLectorIniciado']);
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', tipo: 'INICIAL', maestrias: { LIT: 0 }, items: TRES });
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-2', tipo: 'REEVALUACION', maestrias: { LIT: 0 }, items: TRES });
      expect(e.repo.filas.get(NINO)?.[0]?.valor).toBe(80);
      expect(e.repo.historial).toHaveLength(5);
    });

    it('cada ítem cerrado mueve su habilidad (EMA) y avisa a Aventura; reintentar el evento no cuenta doble', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { INF: 40 }, items: TRES });
      e.bus.publicados.length = 0;
      await e.perfil.alItem(item());
      // 0,75 × 1,1 × 100 = 82,5 · 0,3 × 82,5 + 0,7 × 40 = 52,75
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')).toMatchObject({ valor: 52.75, itemsContados: 4, version: 2 });
      expect(e.bus.publicados[0]).toMatchObject({ nombreEvento: EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, datos: { estudianteId: NINO, habilidad: 'INF', valorAnterior: 40, valorNuevo: 52.75, itemsContados: 4 } });
      await e.perfil.alItem(item());
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')?.itemsContados).toBe(4);
    });

    it('las respuestas abiertas sin valorar no cuentan; la valoración docente sí (RN-19)', async () => {
      await e.perfil.alItem(item({ habilidad: 'ARG', puntajeItem: null, esCorrecta: null }));
      await e.perfil.alItem(item({ habilidad: 'XYZ' }));
      expect(e.repo.filas.size).toBe(0);
      await e.perfil.alValoracion({ estudianteId: NINO, respuestaId: 'r-9', itemId: 'i-9', habilidad: 'ARG', nivelDificultad: 2, nivel: 3, puntajeItem: 1 });
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'ARG')).toMatchObject({ valor: 100, itemsContados: 1 });
      expect(e.repo.historial.at(-1)).toMatchObject({ origen: 'VALORACION', origenId: 'r-9' });
      await e.perfil.alValoracion({ estudianteId: NINO, respuestaId: 'r-9', itemId: 'i-9', habilidad: 'ARG', nivelDificultad: 2, nivel: 3, puntajeItem: 1 });
      await e.perfil.alValoracion({ estudianteId: NINO, respuestaId: 'r-10', itemId: 'i-9', habilidad: 'OTRA', nivelDificultad: 2, nivel: 3, puntajeItem: 1 });
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'ARG')?.itemsContados).toBe(1);
    });

    it('sin perfil guardado, parte del reto inicial que ya hizo (niños de antes del Módulo 7)', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { INF: 40 }, items: TRES, diagnosticoId: 'd-viejo' });
      await e.perfil.alItem(item());
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')).toMatchObject({ valor: 52.75, itemsContados: 4 });
      expect(e.repo.historial.filter((h) => h.origen === 'DIAGNOSTICO')).toHaveLength(5);
    });

    it('RN-11: avisa cuando sube el nivel CNEB declarado de una habilidad', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { INF: 60 }, items: { INF: 5 } });
      await e.perfil.alItem(item({ puntajeItem: 1, nivelDificultad: 5 })); // 0,3 × 100 + 0,7 × 60 = 72: de B a A
      expect(e.bus.publicados.find((x) => x.nombreEvento === EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO)).toMatchObject({ datos: { habilidad: 'INF', nivelAnterior: 'B', nivelNuevo: 'A' } });
    });

    it('si otro guardado llega primero se vuelve a calcular (bloqueo optimista); tras 3 intentos se rinde', async () => {
      await Promise.all([e.perfil.alItem(item({ respuestaId: 'a' })), e.perfil.alItem(item({ respuestaId: 'b' }))]);
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')?.itemsContados).toBe(2);
      e.repo.conflictosPendientes = 1;
      await e.perfil.alItem(item({ respuestaId: 'c' }));
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')?.itemsContados).toBe(3);
      e.repo.conflictosPendientes = 3;
      await expect(e.perfil.alItem(item({ respuestaId: 'd' }))).rejects.toBeInstanceOf(MaestriaDesactualizadaError);
    });
  });

  describe('Para Aventura y la biblioteca', () => {
    it('la maestría es la del perfil, o la del reto inicial, o ninguna', async () => {
      expect(await e.perfil.maestriasDe(NINO)).toBeNull();
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 70 } });
      expect(await e.perfil.maestriasDe(NINO)).toEqual({ LIT: 70 });
      await e.perfil.alItem(item({ habilidad: 'LIT', puntajeItem: 1, nivelDificultad: 2 }));
      expect((await e.perfil.maestriasDe(NINO))?.LIT).toBe(79);
    });

    it('el nivel de lectura sale de la maestría promedio y su edad; sin datos, ninguno', async () => {
      expect(await e.perfil.nivelDe(NINO)).toBeNull();
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { LIT: 90, INF: 90, VOC: 90, CRI: 90, ARG: 90 }, items: TRES });
      expect(await e.perfil.nivelDe(NINO)).toBe(4);
      e.identidad.rangos.delete(NINO);
      expect(await e.perfil.nivelDe(NINO)).toBeNull();
    });
  });

  describe('Perfil lector (RF-052, RF-054)', () => {
    it('muestra las 5 habilidades con su etiqueta, "Aún descubriendo" con menos de 5 ítems, y las que hay que reforzar', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { LIT: 88, INF: 30, VOC: 50.4, CRI: 70, ARG: 10 }, items: { LIT: 5, INF: 6, VOC: 5, CRI: 5, ARG: 2 } });
      const v = await e.perfil.perfil(NINO);
      expect(v.habilidades.map((h) => [h.codigo, h.valor, h.etiqueta, h.aReforzar])).toEqual([
        ['LIT', 88, 'Destacado', false],
        ['INF', 30, 'En inicio', true],
        ['VOC', 50, 'En proceso', false],
        ['CRI', 70, 'Logrado', false],
        ['ARG', 10, 'Aún descubriendo', false],
      ]);
      expect(v).toMatchObject({ conDatos: true, nivelLectura: 2, actualizadoEn: e.reloj.actual.toISOString() });
    });

    it('un niño sin reto todavía ve todo por descubrir; el de otro rango o inexistente no existe', async () => {
      const v = await e.perfil.perfil(NINO);
      expect(v).toMatchObject({ conDatos: false, nivelLectura: null, actualizadoEn: null });
      expect(v.habilidades.every((h) => h.etiqueta === 'Aún descubriendo' && h.valor === 0)).toBe(true);
      await expect(e.perfil.perfil('nadie')).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('al abrir el perfil por primera vez se guarda el que parte del reto inicial', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 70 }, items: TRES, diagnosticoId: 'd-1' });
      await e.perfil.perfil(NINO);
      expect(e.repo.filas.get(NINO)?.[0]).toMatchObject({ habilidad: 'LIT', valor: 70 });
      await e.perfil.perfil(NINO);
      expect(e.repo.historial).toHaveLength(5);
    });
  });

  describe('Recomendaciones (RF-055, RN-20)', () => {
    beforeEach(async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { LIT: 70, INF: 30, VOC: 60, CRI: 50, ARG: 50 }, items: TRES });
      e.fichas.publicar('inf-2', { habilidades: ['INF'], nivelDificultad: 2 });
      e.fichas.publicar('inf-5', { habilidades: ['INF'], nivelDificultad: 5 });
      e.fichas.publicar('lit-2', { habilidades: ['LIT'], nivelDificultad: 2 });
      e.fichas.publicar('de-mision', { habilidades: ['LIT'], nivelDificultad: 2 });
      e.fichas.publicar('r3', { rangoEdad: 'R3', habilidades: ['ARG'], nivelDificultad: 3 });
    });

    it('asignación, misión en curso y habilidad más débil, con sus títulos; se guardan como vigentes', async () => {
      e.asignaciones.lista.push({ estudianteId: NINO, asignacionId: 'a-1', tipo: 'LECTURA', contenidoId: 'r3', titulo: 'Lectura r3' });
      e.mision.porEstudiante.set(NINO, { misionId: 'm-1', mision: 'Pistas del bosque', lecturaId: 'de-mision', enCurso: true });
      e.avance.marcar(NINO, 'de-mision', 'EN_CURSO');
      const r = await e.recomendaciones.recomendaciones(NINO);
      expect(r).toEqual([
        { tipo: 'ASIGNACION_DOCENTE', prioridad: 1, lectura: { id: 'r3', titulo: 'Lectura r3', nivelDificultad: 3 }, habilidad: null, mision: null, asignacionId: 'a-1', enCurso: false },
        { tipo: 'LECTURA_MISION', prioridad: 2, lectura: { id: 'de-mision', titulo: 'Lectura de-mision', nivelDificultad: 2 }, habilidad: null, mision: { id: 'm-1', titulo: 'Pistas del bosque' }, asignacionId: null, enCurso: true },
        { tipo: 'LECTURA_HABILIDAD_DEBIL', prioridad: 3, lectura: { id: 'inf-2', titulo: 'Lectura inf-2', nivelDificultad: 2 }, habilidad: 'INF', mision: null, asignacionId: null, enCurso: false },
      ]);
      expect(await e.recomendacionesRepo.vigentes(NINO)).toHaveLength(3);
      await e.recomendaciones.recomendaciones(NINO);
      expect(e.recomendacionesRepo.reemplazos).toBe(1); // iguales: no se reescriben
    });

    it('al terminar la recomendada, la siguiente vez cambia (y se reemplazan las vigentes)', async () => {
      expect((await e.recomendaciones.recomendaciones(NINO)).map((x) => x.lectura?.id)).toEqual(['inf-2']);
      e.avance.marcar(NINO, 'inf-2', 'FINALIZADA');
      expect((await e.recomendaciones.recomendaciones(NINO)).map((x) => x.lectura?.id)).toEqual(['inf-5']);
      expect(e.recomendacionesRepo.reemplazos).toBe(2);
      expect(e.recomendacionesRepo.guardadas.filter((g) => g.vigente)).toHaveLength(1);
    });

    it('sin nada pendiente de su habilidad débil, refuerzo; sin lecturas de su edad, ninguna; estudiante inexistente, 404', async () => {
      for (const id of ['inf-2', 'inf-5']) e.avance.marcar(NINO, id, 'FINALIZADA');
      expect(await e.recomendaciones.recomendaciones(NINO)).toEqual([expect.objectContaining({ tipo: 'REFUERZO', lectura: expect.objectContaining({ id: 'lit-2' }) })]);
      e.fichas.lista.length = 0;
      expect(await e.recomendaciones.recomendaciones(NINO)).toEqual([]);
      await expect(e.recomendaciones.recomendaciones('nadie')).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('una asignación cuya lectura ya no está publicada no se muestra', async () => {
      e.asignaciones.lista.push({ estudianteId: NINO, asignacionId: 'a-1', tipo: 'LECTURA', contenidoId: 'archivada', titulo: 'Archivada' });
      expect((await e.recomendaciones.recomendaciones(NINO)).map((x) => x.tipo)).toEqual(['LECTURA_HABILIDAD_DEBIL']);
    });
  });
});
```

`apps/api/test/unit/progreso/dobles.ts`:

```ts
/**
 * Dobles de prueba de Progreso: repositorio en memoria con las mismas barreras que la base (versión
 * por habilidad, perfil creado una sola vez, un origen por habilidad en el historial) y las fuentes
 * del shared-kernel (diagnóstico, fichas, avance, misión en curso) simuladas.
 */
import type {
  AvanceLectura,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  Habilidad,
  LecturaDeMision,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMisionEnCurso,
  ResultadoDiagnosticoInicial,
} from '../../../src/modules/shared-kernel/public-api';
import type { AsignacionesEstudiante, IdentidadEstudiantes, PerfilRepository, RecomendacionRepository } from '../../../src/modules/progreso/application/ports/progreso.ports';
import { PerfilLectorUseCase } from '../../../src/modules/progreso/application/use-cases/perfil-lector.use-case';
import { RecomendacionesUseCase } from '../../../src/modules/progreso/application/use-cases/recomendaciones.use-case';
import { MaestriaDeHabilidad, OrigenCambio, PerfilLector } from '../../../src/modules/progreso/domain/entities/perfil-lector';
import { MaestriaDesactualizadaError } from '../../../src/modules/progreso/domain/errors/errores-progreso';
import { Recomendacion } from '../../../src/modules/progreso/domain/services/recomendador';
import { BusEspia, Reloj } from '../iam/dobles';

export class PerfilesEnMemoria implements PerfilRepository {
  readonly filas = new Map<string, MaestriaDeHabilidad[]>();
  readonly historial: { estudianteId: string; habilidad: Habilidad; anterior: number; nuevo: number; origen: OrigenCambio; origenId: string | null }[] = [];
  /** Para simular que otro pedido guardó justo antes. */
  conflictosPendientes = 0;

  async buscar(estudianteId: string) {
    const f = this.filas.get(estudianteId);
    return f ? PerfilLector.desdePersistencia(estudianteId, structuredClone(f)) : null;
  }

  /** Comprueba y escribe sin ceder el turno, como la transacción de la base. */
  async guardar(perfil: PerfilLector) {
    if (this.conflictosPendientes > 0) {
      this.conflictosPendientes -= 1;
      throw new MaestriaDesactualizadaError();
    }
    const guardadas = this.filas.get(perfil.estudianteId);
    const cambiadas = new Set(perfil.habilidadesCambiadas());
    if (!perfil.estaPersistido && guardadas) throw new MaestriaDesactualizadaError();
    if (perfil.estaPersistido) {
      for (const h of cambiadas) if (guardadas?.find((g) => g.habilidad === h)?.version !== perfil.de(h).version) throw new MaestriaDesactualizadaError();
    }
    for (const c of perfil.cambios()) {
      if (c.origenId && this.historial.some((x) => x.origen === c.origen && x.origenId === c.origenId && x.habilidad === c.habilidad)) throw new MaestriaDesactualizadaError();
    }
    this.filas.set(
      perfil.estudianteId,
      perfil.todas().map((m) => ({ ...m, version: m.version + (cambiadas.has(m.habilidad) ? 1 : 0) })),
    );
    for (const c of perfil.cambios()) this.historial.push({ estudianteId: perfil.estudianteId, habilidad: c.habilidad, anterior: c.anterior, nuevo: c.nuevo, origen: c.origen, origenId: c.origenId });
    perfil.confirmarCambios();
  }

  async yaAplicado(origen: OrigenCambio, origenId: string) {
    return this.historial.some((x) => x.origen === origen && x.origenId === origenId);
  }
}

export class RecomendacionesEnMemoria implements RecomendacionRepository {
  readonly guardadas: { estudianteId: string; vigente: boolean; prioridad: number; r: Recomendacion }[] = [];
  reemplazos = 0;

  async vigentes(estudianteId: string) {
    return this.guardadas.filter((g) => g.estudianteId === estudianteId && g.vigente).sort((a, b) => a.prioridad - b.prioridad).map((g) => g.r);
  }

  async reemplazar(estudianteId: string, recomendaciones: Recomendacion[]) {
    this.reemplazos += 1;
    for (const g of this.guardadas) if (g.estudianteId === estudianteId) g.vigente = false;
    recomendaciones.forEach((r, i) => this.guardadas.push({ estudianteId, vigente: true, prioridad: i + 1, r }));
  }
}

export class DiagnosticoFalso implements ResolutorDiagnosticoInicial {
  readonly resultados = new Map<string, ResultadoDiagnosticoInicial>();
  async resultadoDe(id: string) {
    return this.resultados.get(id) ?? { estado: 'PENDIENTE' as const };
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly rangos = new Map<string, RangoEdad>();
  async rangoDe(id: string) {
    return this.rangos.get(id) ?? null;
  }
}

export class AsignacionesFalsas implements AsignacionesEstudiante {
  readonly lista: { estudianteId: string; asignacionId: string; tipo: 'LECTURA' | 'MISION'; contenidoId: string; titulo: string }[] = [];
  async vigentes(id: string) {
    return this.lista.filter((a) => a.estudianteId === id);
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly lista: FichaLecturaPublicada[] = [];
  publicar(id: string, p: { rangoEdad?: RangoEdad; nivelDificultad?: number; habilidades?: Habilidad[] } = {}) {
    this.lista.push({ id, titulo: `Lectura ${id}`, rangoEdad: p.rangoEdad ?? 'R2', nivelDificultad: p.nivelDificultad ?? 2, tematica: 'Animales', habilidadesObjetivo: p.habilidades ?? ['LIT'] });
  }
  async fichas(ids: string[]) {
    return this.lista.filter((f) => ids.includes(f.id));
  }
  async publicadas(rango: RangoEdad) {
    return this.lista.filter((f) => f.rangoEdad === rango);
  }
}

export class AvanceFalso implements ResolutorAvanceLecturas {
  readonly avance = new Map<string, Map<string, AvanceLectura>>();
  marcar(estudianteId: string, lecturaId: string, estado: AvanceLectura) {
    const suyo = this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
    suyo.set(lecturaId, estado);
    this.avance.set(estudianteId, suyo);
  }
  async avanceDe(estudianteId: string, ids: string[]) {
    return new Map([...(this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>())].filter(([id]) => ids.includes(id)));
  }
}

export class MisionFalsa implements ResolutorMisionEnCurso {
  readonly porEstudiante = new Map<string, LecturaDeMision>();
  async lecturaSiguiente(id: string) {
    return this.porEstudiante.get(id) ?? null;
  }
}

export function crearEntornoProgreso() {
  const reloj = new Reloj();
  const repo = new PerfilesEnMemoria();
  const recomendacionesRepo = new RecomendacionesEnMemoria();
  const diagnostico = new DiagnosticoFalso();
  const identidad = new IdentidadFalsa();
  const asignaciones = new AsignacionesFalsas();
  const fichas = new FichasFalsas();
  const avance = new AvanceFalso();
  const mision = new MisionFalsa();
  const bus = new BusEspia();
  const perfil = new PerfilLectorUseCase(repo, diagnostico, identidad, bus, reloj.ahora);
  return {
    reloj,
    repo,
    recomendacionesRepo,
    diagnostico,
    identidad,
    asignaciones,
    fichas,
    avance,
    mision,
    bus,
    perfil,
    recomendaciones: new RecomendacionesUseCase(recomendacionesRepo, perfil, identidad, asignaciones, fichas, avance, mision, reloj.ahora),
  };
}

export type EntornoProgreso = ReturnType<typeof crearEntornoProgreso>;
```

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

```ts
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { nivelLectura } from '../../../src/modules/progreso/domain/services/maestria';
import { BUS_EVENTOS, BusEventos, crearEvento, EVENTOS_INTEGRACION, uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Progreso integrado (RF-052 a RF-055) contra PostgreSQL real: el reto inicial real crea el
 * perfil, una lectura real mueve la maestría (y reintentar su evento no cuenta doble), la valoración
 * docente mueve ARG, y las recomendaciones juntan la asignación, la misión del mapa y la habilidad más
 * débil. Aventura (RN-09) y la biblioteca (RF-028) reciben la maestría y el nivel por el shared-kernel.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';

let t: AppDePrueba;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

async function backoffice(rol: 'EDITOR' | 'REVISOR') {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  const secreto = authenticator.generateSecret();
  const cuenta = await t.prisma.cuenta.create({ data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' } });
  await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, codigoMfa: authenticator.generate(secreto) }).expect(200)).body.accessToken as string;
}

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** Una lectura de 8–9 años publicada por el flujo real; `completa`: con una pregunta de inferencia y una abierta. */
async function publicar(titulo: string, habilidades: string[], nivelDificultad: number, completa = false) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo, rangoEdad: 'R2', nivelDificultad, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: habilidades, licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const actividades = completa
    ? [
        {
          momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: oraciones[2]!.id,
          items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.')] }],
        },
        { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata?', explicacionModelada: 'Sí.' }] },
      ]
    : [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: habilidades[0], nivelDificultad: 1, modalidad: 'SELECCION', enunciado: '¿Dónde vivía Killa?', opciones: ['En Puno', 'En Lima'], indiceCorrecto: 0, explicacionModelada: 'Lo dice el texto.', pistas: [pista('P1', 'Mira la primera oración.')] }] }];
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
  return lecturaId;
}

/** El reto inicial por la API, acertando solo en las habilidades indicadas (Módulo 5). */
async function retoInicial(token: string, acertar: string[]) {
  const { id } = (await t.http().post(`${API}/diagnosticos`).set(bearer(token)).expect(201)).body;
  for (;;) {
    const { item } = (await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(token)).expect(200)).body;
    if (!item) break;
    const fila = await t.prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: item.itemId } });
    const correcta = (fila.respuestaCorrecta as { indice: number }).indice;
    const indice = acertar.includes(fila.habilidad) ? correcta : (correcta + 1) % (fila.contenido as { opciones: string[] }).opciones.length;
    await t.http().post(`${API}/diagnosticos/${id}/respuestas`).set(bearer(token)).send({ itemId: item.itemId, indice }).expect(200);
  }
  await t.http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(token)).expect(200);
  return id as string;
}

let editora: string;
let revisora: string;
let tokenDocente: string;
let aulaId: string;
let mateo: { id: string; token: string };
let lia: { id: string; token: string };
const lecturas = {} as Record<'killa' | 'inf' | 'lit' | 'asignada' | 'mision', string>;

const perfil = (token = mateo.token) => t.http().get(`${API}/yo/perfil-lector`).set(bearer(token));
const maestria = (habilidad: string) => t.prisma.maestriaHabilidad.findUniqueOrThrow({ where: { estudianteId_habilidad: { estudianteId: mateo.id, habilidad } } });

describe('Preparación', () => {
  it('lecturas publicadas y una docente con Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisora = await backoffice('REVISOR');
    lecturas.killa = await publicar('Killa y la llama', ['INF', 'ARG'], 2, true);
    lecturas.inf = await publicar('Pistas en el bosque', ['INF'], 1);
    lecturas.lit = await publicar('El mercado de Puno', ['LIT'], 1);
    lecturas.asignada = await publicar('La lectura de la profe', ['CRI'], 3);
    lecturas.mision = await publicar('La misión del cóndor', ['VOC'], 2);
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '4.° A', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const anio = new Date().getFullYear();
    const ninos: { id: string; token: string }[] = [];
    for (const [alias, edad] of [['Mateo', 9], ['Lía', 6]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      ninos.push({ id: m.estudianteId, token: (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken });
    }
    [mateo, lia] = ninos as [typeof mateo, typeof lia];
  });
});

describe('Perfil lector (RF-052, RF-053, RF-054)', () => {
  it('sin reto inicial, las 5 habilidades están por descubrir y no hay nada guardado', async () => {
    const v = (await perfil().expect(200)).body;
    expect(v).toMatchObject({ conDatos: false, nivelLectura: null, actualizadoEn: null });
    expect(v.habilidades.map((h: { codigo: string; etiqueta: string }) => `${h.codigo}:${h.etiqueta}`)).toEqual(['LIT:Aún descubriendo', 'INF:Aún descubriendo', 'VOC:Aún descubriendo', 'CRI:Aún descubriendo', 'ARG:Aún descubriendo']);
    expect(await t.prisma.maestriaHabilidad.count({ where: { estudianteId: mateo.id } })).toBe(0);
  });

  it('el reto inicial real crea el perfil con su nivel por habilidad (SAD §6: DiagnosticoFinalizado)', async () => {
    const id = await retoInicial(mateo.token, ['LIT', 'VOC']);
    const resultado = (await t.prisma.diagnostico.findUniqueOrThrow({ where: { id } })).resultado as { habilidades: Record<string, { valor: number; items: number }> };
    const filas = await t.prisma.maestriaHabilidad.findMany({ where: { estudianteId: mateo.id } });
    expect(filas).toHaveLength(5);
    for (const f of filas) expect({ h: f.habilidad, valor: Number(f.valor), items: f.itemsContados }).toEqual({ h: f.habilidad, valor: resultado.habilidades[f.habilidad]!.valor, items: resultado.habilidades[f.habilidad]!.items });
    expect(await t.prisma.historialMaestria.count({ where: { estudianteId: mateo.id, origen: 'DIAGNOSTICO', origenId: id } })).toBe(5);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'progreso.PerfilLectorIniciado', agregadoId: mateo.id } })).toBe(1);
    const v = (await perfil().expect(200)).body;
    expect(v.conDatos).toBe(true);
    expect(v.habilidades.find((h: { codigo: string }) => h.codigo === 'LIT').valor).toBeGreaterThanOrEqual(65);
  });

  it('RF-053: un ítem cerrado en la lectura mueve la maestría con RN-07; reintentar el evento no cuenta doble', async () => {
    const antes = await maestria('INF');
    const s = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(mateo.token)).send({ lecturaId: lecturas.killa }).expect(201)).body;
    const v = (await t.http().put(`${API}/sesiones-lectura/${s.id}/prediccion`).set(bearer(mateo.token)).send({ texto: 'Se enfermará' }).expect(200)).body;
    const responder = (cuerpo: object) => t.http().post(`${API}/sesiones-lectura/${s.id}/respuestas`).set(bearer(mateo.token)).send({ itemId: v.pregunta.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
    await responder({ indice: 0 }); // con P1
    expect(Number((await maestria('INF')).valor)).toBe(Number(antes.valor)); // aún no se cierra
    await responder({ indice: 1 });
    const despues = await maestria('INF');
    // 0,75 × (0,8 + 0,1 × 3) × 100 = 82,5 · EMA α = 0,3
    expect(Number(despues.valor)).toBeCloseTo(Math.round((0.3 * 82.5 + 0.7 * Number(antes.valor)) * 100) / 100, 2);
    expect(despues).toMatchObject({ itemsContados: antes.itemsContados + 1, version: antes.version + 1 });
    const evento = await t.prisma.outboxEvento.findFirstOrThrow({ where: { tipo: 'lectura.ItemRespondido', agregadoId: s.id } });
    expect(await t.prisma.historialMaestria.count({ where: { origen: 'ITEM', origenId: (evento.payload as { respuestaId: string }).respuestaId } })).toBe(1);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'progreso.MaestriaActualizada', agregadoId: mateo.id } })).toBe(1);

    // El outbox reintenta el mismo evento: Progreso ya lo aplicó.
    await t.app.get<BusEventos>(BUS_EVENTOS).publicar([crearEvento(EVENTOS_INTEGRACION.ITEM_RESPONDIDO, s.id, evento.payload as object)]);
    expect(await maestria('INF')).toMatchObject({ itemsContados: despues.itemsContados, version: despues.version });

    // Termina la lectura con su respuesta abierta (aún no cuenta: RN-19).
    const arg = await maestria('ARG');
    const s2 = (await t.http().get(`${API}/sesiones-lectura/${s.id}`).set(bearer(mateo.token)).expect(200)).body;
    await t.http().post(`${API}/sesiones-lectura/${s.id}/respuestas`).set(bearer(mateo.token)).send({ itemId: s2.pregunta.itemId, idempotencyKey: uuidV7(), texto: 'Sí, porque encontró la espina' }).expect(200);
    await t.http().post(`${API}/sesiones-lectura/${s.id}/finalizar`).set(bearer(mateo.token)).send({ reflexion: 'Pensé otra cosa' }).expect(200);
    expect(await maestria('ARG')).toMatchObject({ itemsContados: arg.itemsContados });
  });

  it('RN-19: la valoración docente de la respuesta abierta mueve ARG', async () => {
    const antes = await maestria('ARG');
    const [r] = (await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(tokenDocente)).expect(200)).body;
    await t.http().post(`${API}/respuestas/${r.respuestaId}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 3 }).expect(200);
    const despues = await maestria('ARG');
    // 1 × (0,8 + 0,1 × 2) × 100 = 100
    expect(Number(despues.valor)).toBeCloseTo(Math.round((0.3 * 100 + 0.7 * Number(antes.valor)) * 100) / 100, 2);
    expect(despues.itemsContados).toBe(antes.itemsContados + 1);
    expect(await t.prisma.historialMaestria.count({ where: { origen: 'VALORACION', origenId: r.respuestaId } })).toBe(1);
  });

  it('el perfil muestra el nivel CNEB solo con 5 ítems (RN-08) y su nivel de lectura', async () => {
    const v = (await perfil().expect(200)).body;
    const inf = v.habilidades.find((h: { codigo: string }) => h.codigo === 'INF');
    expect(inf).toMatchObject({ itemsContados: 4, nivel: null, etiqueta: 'Aún descubriendo' });
    const filas = await t.prisma.maestriaHabilidad.findMany({ where: { estudianteId: mateo.id } });
    const promedio = filas.reduce((s, f) => s + Number(f.valor), 0) / 5;
    expect(v.nivelLectura).toBe(nivelLectura('R2', promedio));
  });
});

describe('El resto de la plataforma recibe la maestría y el nivel', () => {
  it('RF-028: la biblioteca muestra su nivel ± 1 (antes partía del típico de su edad)', async () => {
    const nivel = (await perfil().expect(200)).body.nivelLectura as number;
    const { alcance } = (await t.http().get(`${API}/biblioteca`).set(bearer(mateo.token)).expect(200)).body;
    expect(alcance).toEqual({ rangoEdad: 'R2', niveles: [nivel - 1, nivel, nivel + 1].filter((n) => n >= 1 && n <= 5) });
  });

  it('RN-09: el mapa de Aventura ve la maestría real de las habilidades foco', async () => {
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(mateo.token)).expect(200)).body;
    const detective = mapa.mundos.find((m: { numero: number }) => m.numero === 2);
    const voc = Number((await maestria('VOC')).valor);
    expect(detective.habilidadesFoco.find((h: { codigo: string }) => h.codigo === 'VOC').maestria).toBe(voc);
    expect(mapa.mundoActual).toBe(2);
  });
});

describe('Recomendaciones (RF-055, RN-20)', () => {
  it('sin asignación ni misión, recomienda para su habilidad más débil; nunca más de 3', async () => {
    const r = (await t.http().get(`${API}/yo/recomendaciones`).set(bearer(mateo.token)).expect(200)).body;
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0]).toMatchObject({ prioridad: 1, lectura: { id: expect.any(String) } });
    expect(r.some((x: { lectura: { id: string } | null }) => x.lectura?.id === lecturas.killa)).toBe(false); // ya la terminó
  });

  it('con asignación de la docente y misión en curso, van en ese orden y quedan vigentes', async () => {
    const limite = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(tokenDocente)).send({ tipo: 'LECTURA', contenidoId: lecturas.asignada, fechaLimite: limite }).expect(201);
    const mundo2 = await t.prisma.mundo.findUniqueOrThrow({ where: { numero: 2 } });
    await t.http().post(`${API}/backoffice/mundos/${mundo2.id}/misiones`).set(bearer(editora)).send({ rangoEdad: 'R2', titulo: 'El vuelo del cóndor', lecturaIds: [lecturas.mision] }).expect(201);

    const r = (await t.http().get(`${API}/yo/recomendaciones`).set(bearer(mateo.token)).expect(200)).body;
    expect(r.slice(0, 2)).toEqual([
      expect.objectContaining({ tipo: 'ASIGNACION_DOCENTE', prioridad: 1, lectura: expect.objectContaining({ id: lecturas.asignada, titulo: 'La lectura de la profe' }) }),
      expect.objectContaining({ tipo: 'LECTURA_MISION', prioridad: 2, lectura: expect.objectContaining({ id: lecturas.mision }), mision: expect.objectContaining({ titulo: 'El vuelo del cóndor' }) }),
    ]);
    const vigentes = await t.prisma.recomendacion.findMany({ where: { estudianteId: mateo.id, vigente: true }, orderBy: { prioridad: 'asc' } });
    expect(vigentes.map((v) => [v.prioridad, v.tipo])).toEqual(r.map((x: { prioridad: number; tipo: string }) => [x.prioridad, x.tipo]));
    expect(await t.prisma.recomendacion.count({ where: { estudianteId: mateo.id, vigente: false } })).toBeGreaterThanOrEqual(1);

    // Pedirlas de nuevo sin cambios no las reescribe.
    const total = await t.prisma.recomendacion.count({ where: { estudianteId: mateo.id } });
    await t.http().get(`${API}/yo/recomendaciones`).set(bearer(mateo.token)).expect(200);
    expect(await t.prisma.recomendacion.count({ where: { estudianteId: mateo.id } })).toBe(total);
  });

  it('cada niño ve lo de su edad; lo que la docente asignó al aula va aunque sea de otra edad (Lía, 6 años)', async () => {
    const r = (await t.http().get(`${API}/yo/recomendaciones`).set(bearer(lia.token)).expect(200)).body;
    expect(r).toEqual([expect.objectContaining({ tipo: 'ASIGNACION_DOCENTE', lectura: expect.objectContaining({ id: lecturas.asignada }) })]);
  });

  it('solo el propio estudiante: la docente 403 y sin sesión 401', async () => {
    await perfil(tokenDocente).expect(403);
    await t.http().get(`${API}/yo/recomendaciones`).set(bearer(tokenDocente)).expect(403);
    await t.http().get(`${API}/yo/perfil-lector`).expect(401);
  });
});
```

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

```ts
import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { diaLima, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi, publicadores } from '../../support/lectura';
import { maestriaGuardada } from '../../support/progreso';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Perfil lector y recomendaciones de punta a punta (RF-052 a RF-055) en escritorio, tablet
 * y celular: el reto inicial y las lecturas reales mueven la maestría; el niño la ve en su lenguaje,
 * con lo que conviene practicar y sus próximas lecturas (la de su profe primero).
 */
test.describe('Perfil lector y recomendaciones (RF-052 a RF-055)', () => {
  test.setTimeout(150_000);

  async function abrirPerfil(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Progreso' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu perfil lector' })).toBeVisible();
  }

  const habilidad = (page: Page, nombre: string) => page.getByRole('list', { name: 'Tus habilidades' }).getByRole('listitem').filter({ hasText: nombre });

  test('ve sus 5 habilidades en su lenguaje, lo que debe practicar y una lectura para eso', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']); // bien en literal y vocabulario
    // Dos lecturas: acierta todo, salvo la pregunta de inferencia, donde agota las pistas (RF-045).
    const quienes = await publicadores(request);
    const nino = await sesionDelNino(request, aula, 'Mateo');
    for (let i = 0; i < 2; i++) {
      const killa = await lecturaKilla(request, {}, quienes);
      await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino, terminar: true, fallar: [ENUNCIADOS.seleccion] });
    }
    await lecturaKilla(request, {}, quienes); // una más, sin leer, para practicar inferencias
    const inf = await maestriaGuardada(aula.estudiantes['Mateo'] as string, 'INF');
    expect(inf).toMatchObject({ valor: 0, itemsContados: 5 }); // 3 del reto + 2 con explicación (puntaje 0, RN-07)

    await tabletDelAulaActivada(page, request, aula);
    await abrirPerfil(page, 'Mateo');
    await expect(page.getByRole('list', { name: 'Tus habilidades' }).getByRole('listitem')).toHaveCount(5);
    // RF-052, RN-08: con 5 ítems se declara el nivel; con menos, "Aún descubriendo".
    await expect(habilidad(page, 'Encontrar lo que dice el texto')).toContainText('Destacado');
    await expect(habilidad(page, 'Entender palabras nuevas')).toContainText('Aún descubriendo');
    await expect(habilidad(page, 'Opinar sobre lo que lees')).toContainText('En proceso');
    // RF-054: menos de 40 con al menos 5 ítems → a reforzar.
    const debil = habilidad(page, 'Descubrir lo que no se dice');
    await expect(debil).toContainText('En inicio');
    await expect(debil).toContainText('¡A practicar!');
    await expect(debil.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('Lees en el nivel 2')).toBeVisible();

    // RF-055: una lectura para practicar la habilidad más débil, que se abre desde aquí.
    const recomendadas = page.getByRole('list', { name: 'Lecturas recomendadas' }).getByRole('listitem');
    const paraPracticar = recomendadas.filter({ hasText: 'Para practicar: descubrir lo que no se dice' });
    await expect(paraPracticar).toHaveCount(1);
    expect(await recomendadas.count()).toBeLessThanOrEqual(3);
    await paraPracticar.getByRole('link', { name: /^Leer: / }).click();
    await expect(page).toHaveURL(/\/estudiante\/lecturas\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('RF-055, RN-20: lo que le dejó su profe aparece primero y se abre con la asignación', async ({ page, request }) => {
    const killa = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Teo');
    const r = await request.post(`/api/v1/aulas/${aula.aulaId}/asignaciones`, { headers: await sesionApi(request, aula.docente), data: { tipo: 'LECTURA', contenidoId: killa.lecturaId, fechaLimite: diaLima(5) } });
    expect(r.status(), await r.text()).toBe(201);

    await tabletDelAulaActivada(page, request, aula);
    await abrirPerfil(page, 'Teo');
    const primera = page.getByRole('list', { name: 'Lecturas recomendadas' }).getByRole('listitem').first();
    await expect(primera).toContainText('Misión de tu profe');
    await expect(primera).toContainText(killa.titulo);
    await primera.getByRole('link', { name: `Leer: ${killa.titulo}` }).click();
    await expect(page).toHaveURL(/asignacion=/);
    await expect(page.getByRole('heading', { level: 2, name: '¿Qué crees que le pasará a la llama?' })).toBeVisible();
  });

  test('sin reto inicial todavía, todo está por descubrir', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala' }]);
    await tabletDelAulaActivada(page, request, aula);
    await abrirPerfil(page, 'Lía');
    await expect(page.getByText('Cuando hagas tu reto inicial y tus lecturas, aquí verás cuánto vas creciendo.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tus habilidades' }).getByText('Aún descubriendo')).toHaveCount(5);
  });
});
```

`tests/e2e/support/progreso.ts`:

```ts
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

/** Ayudantes del Módulo 7 (perfil lector): leer la maestría y su historial en la base. */

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RF-053: la maestría guardada de una habilidad y sus cambios, del más antiguo al más reciente. */
export async function maestriaGuardada(estudianteId: string, habilidad: string) {
  const prisma = db();
  try {
    const [fila, historial] = await Promise.all([
      prisma.maestriaHabilidad.findUnique({ where: { estudianteId_habilidad: { estudianteId, habilidad } } }),
      prisma.historialMaestria.findMany({ where: { estudianteId, habilidad }, orderBy: { id: 'asc' } }),
    ]);
    return {
      valor: fila ? Number(fila.valor) : null,
      itemsContados: fila?.itemsContados ?? 0,
      cambios: historial.map((h) => ({ origen: h.origen, anterior: Number(h.valorAnterior), nuevo: Number(h.valorNuevo) })),
    };
  } finally {
    await prisma.$disconnect();
  }
}
```

`tests/load/scenarios/lectura-respuestas.js`:

```js
import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de la lectura interactiva (k6): un aula de 40 niños de 9 años lee "Killa y
 * la llama" a la vez, de a 10 en paralelo, con todas sus actividades (una con error y pista).
 *   RF-040: corrección en el servidor → p95 < 300 ms.
 *   RF-046: reanudar la sesión (GET) → p95 < 300 ms.
 *   RF-047: cerrar la lectura sin errores.
 *   RF-052, RF-055 (Módulo 7): al terminar ve su perfil lector y sus próximas lecturas → p95 < 300 ms
 *   (RNF-001), con la maestría ya movida por cada respuesta (RF-053).
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa) y la lectura publicada:
 *   LECTURA=$(node tests/load/sembrar-lectura.mjs)
 *   k6 run -e LECTURA_ID=$LECTURA tests/load/scenarios/lectura-respuestas.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const LECTURA = __ENV.LECTURA_ID;
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NINOS = 40;
const POR_TABLET = 20;
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

export const options = {
  scenarios: {
    lectura: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: NINOS,
      maxDuration: '5m',
      exec: 'leer',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:POST /sesiones-lectura/{id}/respuestas}': ['p(95)<300'],
    'http_req_duration{nombre:GET /sesiones-lectura/{id}}': ['p(95)<300'],
    'http_req_duration{nombre:POST /sesiones-lectura/{id}/finalizar}': ['p(95)<800'],
    'http_req_duration{nombre:GET /yo/perfil-lector}': ['p(95)<300'],
    'http_req_duration{nombre:GET /yo/recomendaciones}': ['p(95)<300'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** RF-046: cada envío lleva su clave de idempotencia (UUID v4). */
function clave() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Docente con un aula de 40 niños de 9 años, cada uno con su sesión en una de las tablets del aula. */
export function setup() {
  if (!LECTURA) fail('Falta -e LECTURA_ID (node tests/load/sembrar-lectura.mjs)');
  const email = `carga.lectura.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Lectura', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${AVATARES[i % AVATARES.length]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  // RNF-019: hasta 30 ingresos por minuto en cada tablet, como en un aula real con varias tablets.
  const tablets = Array.from({ length: Math.ceil(NINOS / POR_TABLET) }, (_, i) =>
    http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: `Tablet carga ${i + 1}` }), { headers: docente }).json('tokenDispositivo'),
  );
  return {
    ninos: matriculados.map((m, i) => {
      http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
      const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo: tablets[Math.floor(i / POR_TABLET)], perfilId: m.estudianteId, pin: '4826' }), { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } }).json();
      if (!ingreso.accessToken) fail(`Un niño de carga no pudo ingresar: ${JSON.stringify(ingreso)}`);
      return { ...JSON_HEADERS, Authorization: `Bearer ${ingreso.accessToken}` };
    }),
  };
}

/** Lo que responde el niño en cada pregunta de la lectura de ejemplo (ver sembrar-lectura.mjs). */
function respuesta(sesion, p, primerIntento) {
  const oracion = (texto) => sesion.texto.parrafos.flatMap((x) => x.oraciones).find((x) => x.texto === texto).id;
  switch (p.enunciado) {
    case '¿Por qué Pancho no quiso comer?':
      return { indice: p.opciones.indexOf(primerIntento ? 'Estaba feliz' : 'Le dolía algo') }; // primero se equivoca: P1
    case 'Toca la oración que dice qué tenía Pancho.':
      return { oraciones: [oracion('Killa vio que tenía una espina en la pata.')] };
    case 'Ordena lo que pasó.':
      return { orden: ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'].map((t) => p.elementos.indexOf(t)) };
    case '¿Qué hizo bien Killa? Marca todas.':
      return { indices: [p.opciones.indexOf('Miró con atención'), p.opciones.indexOf('Lo ayudó con cuidado')] };
    case '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?':
      return { texto: 'Sí, porque así encontró la espina y lo curó' };
    default:
      return { indice: 0 };
  }
}

/** Cada iteración es un niño distinto leyendo la lectura completa. */
export function leer(datos) {
  const yo = datos.ninos[exec.scenario.iterationInTest];
  const inicio = http.post(`${BASE}/sesiones-lectura`, JSON.stringify({ lecturaId: LECTURA }), { headers: yo, tags: { nombre: 'POST /sesiones-lectura' } });
  check(inicio, { 'lectura abierta': (r) => r.status === 201 });
  const id = inicio.json('id');
  http.put(`${BASE}/sesiones-lectura/${id}/prediccion`, JSON.stringify({ texto: 'Creo que la llama se enfermará' }), { headers: yo, tags: { nombre: 'PUT /sesiones-lectura/{id}/prediccion' } });

  const vistos = {};
  for (let paso = 0; paso < 20; paso++) {
    const ver = http.get(`${BASE}/sesiones-lectura/${id}`, { headers: yo, tags: { nombre: 'GET /sesiones-lectura/{id}' } });
    check(ver, { 'sesión sin claves': (r) => r.status === 200 && !r.body.includes('indicesCorrectos') && !r.body.includes('explicacionModelada') });
    const sesion = ver.json();
    if (sesion.fase === 'HISTORIA') {
      http.post(`${BASE}/sesiones-lectura/${id}/decisiones`, JSON.stringify({ nodoId: sesion.historia.nodo.id, opcion: 0 }), { headers: yo, tags: { nombre: 'POST /sesiones-lectura/{id}/decisiones' } });
      continue;
    }
    if (!sesion.pregunta) break;
    const p = sesion.pregunta;
    const cuerpo = { itemId: p.itemId, idempotencyKey: clave(), ...respuesta(sesion, p, !vistos[p.itemId]) };
    vistos[p.itemId] = true;
    const r = http.post(`${BASE}/sesiones-lectura/${id}/respuestas`, JSON.stringify(cuerpo), { headers: yo, tags: { nombre: 'POST /sesiones-lectura/{id}/respuestas' } });
    check(r, { 'respuesta corregida': (x) => x.status === 200 && ['CORRECTA', 'INCORRECTA', 'ENVIADA'].includes(x.json('resultado')) });
  }
  const fin = http.post(`${BASE}/sesiones-lectura/${id}/finalizar`, JSON.stringify({ reflexion: 'Pensé que se enfermaba y era una espina' }), { headers: yo, tags: { nombre: 'POST /sesiones-lectura/{id}/finalizar' } });
  check(fin, { 'lectura terminada': (r) => r.status === 200 && r.json('fase') === 'FINALIZADA' });

  const perfil = http.get(`${BASE}/yo/perfil-lector`, { headers: yo, tags: { nombre: 'GET /yo/perfil-lector' } });
  check(perfil, { 'perfil con 5 habilidades medidas': (r) => r.status === 200 && r.json('habilidades').length === 5 && r.json('conDatos') === true });
  const recomendaciones = http.get(`${BASE}/yo/recomendaciones`, { headers: yo, tags: { nombre: 'GET /yo/recomendaciones' } });
  check(recomendaciones, { 'entre 0 y 3 recomendaciones': (r) => r.status === 200 && r.json().length <= 3 });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@progreso
Característica: Perfil lector y recomendaciones
  Como estudiante de LectoAventura
  Quiero ver cómo voy en cada habilidad y qué leer después
  Para seguir creciendo como lector

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-052 @RF-054 @RF-055 @UAT-01 @camino-feliz @smoke
  Escenario: El perfil lector muestra el nivel de cada habilidad y qué practicar
    Dado un niño de 9 años que hizo su reto inicial y leyó dos lecturas, fallando en las inferencias
    Cuando abre su perfil lector
    Entonces su perfil lector muestra el nivel de cada una de las 5 habilidades
    Y "Descubrir lo que no se dice" aparece para reforzar
    Y le recomienda una lectura para practicarla

  @RF-053 @RN-07
  Escenario: Cada respuesta mueve la maestría de su habilidad
    Dado un niño de 9 años que hizo su reto inicial y está leyendo
    Cuando responde bien la pregunta de inferencia sin pistas
    Entonces su maestría en inferencias sube con el promedio móvil de RN-07

  @RN-09 @RF-031 @camino-feliz
  Escenario: Con sus lecturas, la maestría abre el mundo siguiente
    Dado un niño en el mundo "Detective" con 3 misiones de una lectura cada una
    Cuando termina las 3 lecturas respondiendo bien las inferencias
    Entonces su maestría en inferencias llega a 65
    Cuando vuelve a su mapa
    Entonces ve la celebración "¡Desbloqueaste el mundo Investigador!"

  @RF-055 @RN-20
  Escenario: Lo que deja su docente va primero en sus próximas lecturas
    Dado un niño de 9 años con una lectura asignada por su docente
    Cuando abre su perfil lector
    Entonces la primera recomendación es "Misión de tu profe"
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect, Page } from '@playwright/test';

import { idMundo, tituloMision } from '../support/aventura';
import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { diaLima, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi, publicadores } from '../support/lectura';
import { maestriaGuardada } from '../support/progreso';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del perfil lector (RF-052 a RF-055, RN-07, RN-09, RN-20). */

const NUMERO_MUNDO: Record<string, number> = { Explorador: 1, Detective: 2, Investigador: 3, Crítico: 4 };

async function entrarComoMateo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

const habilidades = (page: Page) => page.getByRole('list', { name: 'Tus habilidades' }).getByRole('listitem');
const recomendadas = (page: Page) => page.getByRole('list', { name: 'Lecturas recomendadas' }).getByRole('listitem');

// ── RF-052, RF-054, RF-055 (UAT-01) ───────────────────────────────────────

Dado('un niño de 9 años que hizo su reto inicial y leyó dos lecturas, fallando en las inferencias', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const quienes = await publicadores(request);
  const nino = await sesionDelNino(request, mundo.aula, 'Mateo');
  for (let i = 0; i < 2; i++) {
    const killa = await lecturaKilla(request, {}, quienes);
    await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { nino, terminar: true, fallar: [ENUNCIADOS.seleccion] });
  }
  await lecturaKilla(request, {}, quienes); // otra de inferencias, aún sin leer
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Cuando('abre su perfil lector', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Progreso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu perfil lector' })).toBeVisible();
});

Entonces('su perfil lector muestra el nivel de cada una de las 5 habilidades', async ({ page }) => {
  await expect(habilidades(page)).toHaveCount(5);
  for (const [nombre, etiqueta] of [
    ['Encontrar lo que dice el texto', 'Destacado'],
    ['Descubrir lo que no se dice', 'En inicio'],
    ['Opinar sobre lo que lees', 'En proceso'],
    ['Dar buenas razones', 'En proceso'],
    ['Entender palabras nuevas', 'Aún descubriendo'], // RN-08: aún con menos de 5 preguntas
  ]) {
    await expect(habilidades(page).filter({ hasText: nombre })).toContainText(etiqueta as string);
  }
});

Entonces('{string} aparece para reforzar', async ({ page }, nombre: string) => {
  await expect(habilidades(page).filter({ hasText: nombre })).toContainText('¡A practicar!');
  await expect(habilidades(page).filter({ hasText: '¡A practicar!' })).toHaveCount(1);
});

Entonces('le recomienda una lectura para practicarla', async ({ page }) => {
  await expect(recomendadas(page).filter({ hasText: 'Para practicar: descubrir lo que no se dice' })).toHaveCount(1);
});

// ── RF-053, RN-07 ─────────────────────────────────────────────────────────

Dado('un niño de 9 años que hizo su reto inicial y está leyendo', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  mundo.killa = killa;
  await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { hasta: ENUNCIADOS.seleccion });
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
  await page.goto(`/estudiante/lecturas/${killa.lecturaId}`);
  await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.seleccion })).toBeVisible();
});

Cuando('responde bien la pregunta de inferencia sin pistas', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
  await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
});

Entonces('su maestría en inferencias sube con el promedio móvil de RN-07', async ({ mundo }) => {
  const m = await maestriaGuardada(mundo.aula!.estudiantes['Mateo'] as string, 'INF');
  const ultimo = m.cambios.at(-1)!;
  // Sin pistas vale 1; dificultad 3: 1 × 1,1 × 100 = 110, acotado a 100. EMA α = 0,3.
  expect(ultimo).toMatchObject({ origen: 'ITEM', nuevo: Math.round((0.3 * 100 + 0.7 * ultimo.anterior) * 100) / 100 });
  expect(m.valor).toBe(ultimo.nuevo);
  expect(ultimo.nuevo).toBeGreaterThan(ultimo.anterior);
});

// ── RN-09: desbloqueo real por maestría y misiones ────────────────────────

Dado('un niño en el mundo {string} con 3 misiones de una lectura cada una', async ({ page, request, mundo }, nombre: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']); // RF-033: empieza en el Detective
  mundo.lecturas = [];
  const quienes = await publicadores(request);
  for (let i = 0; i < 3; i++) {
    const killa = await lecturaKilla(request, {}, quienes);
    const r = await request.post(`/api/v1/backoffice/mundos/${await idMundo(NUMERO_MUNDO[nombre] as number)}/misiones`, {
      headers: quienes.editora,
      data: { rangoEdad: 'R2', titulo: tituloMision(`Misión ${i + 1}`), lecturaIds: [killa.lecturaId] },
    });
    expect(r.status(), await r.text()).toBe(201);
    mundo.lecturas.push(killa.lecturaId);
  }
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Cuando('termina las 3 lecturas respondiendo bien las inferencias', async ({ request, mundo }) => {
  const nino = await sesionDelNino(request, mundo.aula!, 'Mateo');
  for (const lecturaId of mundo.lecturas!) await leerPorApi(request, mundo.aula!, 'Mateo', lecturaId, { nino, terminar: true });
});

Entonces('su maestría en inferencias llega a {int}', async ({ mundo }, minimo: number) => {
  // 0 del reto → 30 → 51 → 65,7 (RN-07), y las 3 misiones completadas (RN-09).
  expect((await maestriaGuardada(mundo.aula!.estudiantes['Mateo'] as string, 'INF')).valor).toBeGreaterThanOrEqual(minimo);
});

// ── RF-055, RN-20 ─────────────────────────────────────────────────────────

Dado('un niño de 9 años con una lectura asignada por su docente', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo');
  mundo.killa = await lecturaKilla(request);
  const r = await request.post(`/api/v1/aulas/${mundo.aula.aulaId}/asignaciones`, {
    headers: await sesionApi(request, mundo.aula.docente),
    data: { tipo: 'LECTURA', contenidoId: mundo.killa.lecturaId, fechaLimite: diaLima(5) },
  });
  expect(r.status(), await r.text()).toBe(201);
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Entonces('la primera recomendación es {string}', async ({ page, mundo }, motivo: string) => {
  const primera = recomendadas(page).first();
  await expect(primera).toContainText(motivo);
  await expect(primera).toContainText(mundo.killa!.titulo);
});
```

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
