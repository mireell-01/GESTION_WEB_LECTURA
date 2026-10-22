<!-- Generado con node docs/pruebas/construir.mjs desde 05-diagnostico-plan-de-pruebas.plantilla.md. No editar a mano. -->
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

```ts
import { describe, expect, it } from 'vitest';

import { Diagnostico } from '../../../../src/modules/diagnostico/domain/entities/diagnostico';
import {
  DiagnosticoIncompletoError,
  ItemFueraDeOrdenError,
  RespuestaInvalidaError,
  TransicionDiagnosticoError,
} from '../../../../src/modules/diagnostico/domain/errors/errores-diagnostico';
import { calcularResultado, factorDificultad, maestriasDe } from '../../../../src/modules/diagnostico/domain/services/calculo-nivel';
import { formaDe, ITEMS_POR_RANGO } from '../../../../src/modules/diagnostico/domain/value-objects/plan-diagnostico';
import { generarBanco } from '../dobles';

/** Nivel 1 — Dominio del Diagnóstico (RF-034 a RF-037, RN-07, RN-08). */
const AHORA = new Date('2026-10-21T15:00:00Z');
const despues = (min: number) => new Date(AHORA.getTime() + min * 60_000);

describe('Plan y cálculo del nivel', () => {
  it('RF-034: 15 ítems (R1: 10); RF-037: la reevaluación alterna a la forma equivalente', () => {
    expect(ITEMS_POR_RANGO).toEqual({ R1: 10, R2: 15, R3: 15 });
    expect(formaDe('INICIAL', 1)).toBe('A');
    expect([1, 2, 3].map((s) => formaDe('REEVALUACION', s))).toEqual(['B', 'A', 'B']);
  });

  it('RN-07: cada ítem se pondera por su dificultad (0,8 + 0,1 × dificultad)', () => {
    expect([1, 3, 5].map(factorDificultad)).toEqual([0.9, 1.1, 1.3].map((x) => expect.closeTo(x, 10)));
  });

  it('RF-035: valor 0–100 por habilidad, nivel CNEB inicial y, con menos de 5 ítems, sin nivel declarado (RN-08)', () => {
    const r = calcularResultado([
      { habilidad: 'LIT', nivelDificultad: 1, esCorrecta: false },
      { habilidad: 'LIT', nivelDificultad: 2, esCorrecta: true },
      { habilidad: 'LIT', nivelDificultad: 3, esCorrecta: true },
      { habilidad: 'VOC', nivelDificultad: 4, esCorrecta: true },
      { habilidad: 'VOC', nivelDificultad: 5, esCorrecta: true },
      { habilidad: 'INF', nivelDificultad: 2, esCorrecta: false },
      ...Array.from({ length: 5 }, () => ({ habilidad: 'CRI' as const, nivelDificultad: 1, esCorrecta: true })),
    ]);
    expect(r.LIT).toEqual({ valor: 70, nivel: 'A', items: 3, nivelDeclarado: null }); // (0 + 100 + 110) / 3
    expect(r.VOC).toMatchObject({ valor: 100, nivel: 'AD' }); // (120 + 130) / 2, acotado a 100
    expect(r.INF).toMatchObject({ valor: 0, nivel: 'C' });
    expect(r.CRI).toEqual({ valor: 90, nivel: 'AD', items: 5, nivelDeclarado: 'AD' });
    expect(r.ARG).toEqual({ valor: 0, nivel: 'C', items: 0, nivelDeclarado: null }); // sin ítems
    expect(maestriasDe(r)).toEqual({ LIT: 70, INF: 0, VOC: 100, CRI: 90, ARG: 0 });
  });

  it('redondea a un decimal', () => {
    const r = calcularResultado([
      { habilidad: 'ARG', nivelDificultad: 1, esCorrecta: true },
      { habilidad: 'ARG', nivelDificultad: 1, esCorrecta: false },
      { habilidad: 'ARG', nivelDificultad: 2, esCorrecta: false },
    ]);
    expect(r.ARG.valor).toBe(30); // 90 / 3
    expect(calcularResultado([{ habilidad: 'INF', nivelDificultad: 3, esCorrecta: true }, ...Array.from({ length: 2 }, () => ({ habilidad: 'INF' as const, nivelDificultad: 2, esCorrecta: false }))]).INF.valor).toBe(36.7);
  });
});

describe('Diagnóstico', () => {
  const banco = generarBanco('R2', 'A');
  const nuevo = () => Diagnostico.crearInicial({ id: 'd1', estudianteId: 'nino', rangoEdad: 'R2' });
  const responderTodo = (d: Diagnostico, acierta: (i: number) => boolean = () => true) => {
    for (let i = 0; d.siguiente(banco); i++) {
      const item = d.siguiente(banco)!;
      d.responder(banco, item.id, acierta(i) ? item.indiceCorrecto : 0, despues(i + 1));
    }
  };

  it('RF-034: nace sin empezar, con 15 preguntas para 8–9 años y 10 para 6–7', () => {
    const d = nuevo();
    expect(d.snapshot).toMatchObject({ estado: 'NO_INICIADO', tipo: 'INICIAL', secuencia: 1, totalItems: 15, respuestas: [] });
    expect(Diagnostico.crearInicial({ id: 'x', estudianteId: 'n', rangoEdad: 'R1' }).totalItems).toBe(10);
    expect(() => Diagnostico.crearInicial({ id: 'x', estudianteId: 'n', rangoEdad: 'R7' as never })).toThrow('Rango de edad');
  });

  it('se responde en orden: la pregunta que sigue, con una opción válida', () => {
    const d = nuevo();
    expect(() => d.responder(banco, banco[0]!.id, 1, AHORA)).toThrow(TransicionDiagnosticoError); // aún no empezó
    d.comenzar(AHORA);
    expect(d.siguiente(banco)?.orden).toBe(1);
    expect(() => d.responder(banco, banco[1]!.id, 1, AHORA)).toThrow(ItemFueraDeOrdenError);
    expect(() => d.responder(banco, banco[0]!.id, 3, AHORA)).toThrow(RespuestaInvalidaError);
    expect(() => d.responder(banco, banco[0]!.id, 0.5, AHORA)).toThrow(RespuestaInvalidaError);
    d.responder(banco, banco[0]!.id, 1, AHORA);
    expect(() => d.responder(banco, banco[0]!.id, 1, AHORA)).toThrow(ItemFueraDeOrdenError); // no se responde dos veces
    expect(d.snapshot.respuestas).toEqual([{ itemId: banco[0]!.id, indice: 1, esCorrecta: true, respondidaEn: AHORA }]);
    expect(d.siguiente(banco)?.orden).toBe(2);
  });

  it('RF-036: pausar y reanudar continúa en la pregunta siguiente sin perder lo respondido', () => {
    const d = nuevo();
    d.comenzar(AHORA);
    for (const item of banco.slice(0, 4)) d.responder(banco, item.id, 1, AHORA);
    d.pausar(despues(5));
    expect(d.snapshot).toMatchObject({ estado: 'PAUSADO', pausadoEn: despues(5) });
    expect(() => d.pausar(despues(6))).toThrow('Solo se puede pausar un reto en curso');
    expect(() => d.responder(banco, banco[4]!.id, 1, despues(6))).toThrow('Primero reanuda tu reto');
    d.comenzar(despues(60));
    expect(d.snapshot).toMatchObject({ estado: 'EN_CURSO', iniciadoEn: AHORA, pausadoEn: null });
    expect(d.respondidos).toBe(4);
    expect(d.siguiente(banco)?.orden).toBe(5);
    d.comenzar(despues(61)); // ya en curso: no cambia nada
    expect(d.estado).toBe('EN_CURSO');
  });

  it('RF-035: solo finaliza completo, calcula el nivel y ya no se puede retomar', () => {
    const d = nuevo();
    d.comenzar(AHORA);
    d.responder(banco, banco[0]!.id, 1, AHORA);
    expect(() => d.finalizar(banco, despues(1))).toThrow(DiagnosticoIncompletoError);
    expect(() => d.finalizar(banco, despues(1))).toThrow('Aún faltan 14 preguntas');
    responderTodo(d, (i) => i % 2 === 0);
    expect(d.siguiente(banco)).toBeNull();
    const resultado = d.finalizar(banco, despues(30));
    expect(resultado.total).toBe(15);
    expect(resultado.aciertos).toBe(d.snapshot.respuestas.filter((r) => r.esCorrecta).length);
    expect(Object.keys(resultado.habilidades).sort()).toEqual(['ARG', 'CRI', 'INF', 'LIT', 'VOC']);
    expect(Object.values(resultado.habilidades).every((h) => h.items === 3 && h.valor >= 0 && h.valor <= 100)).toBe(true);
    expect(d.snapshot).toMatchObject({ estado: 'FINALIZADO', finalizadoEn: despues(30) });
    expect(() => d.comenzar(despues(31))).toThrow('Este reto ya terminó');
    expect(() => d.finalizar(banco, despues(31))).toThrow('Primero reanuda tu reto');
  });

  it('con el banco incompleto no avanza (error de configuración, no del niño)', () => {
    const d = nuevo();
    d.comenzar(AHORA);
    expect(() => d.siguiente(banco.slice(0, 14))).toThrow('tiene 14 ítems y se esperan 15');
  });

  it('RF-037: la reevaluación usa la forma B y numera su secuencia', () => {
    const r = Diagnostico.crearReevaluacion({ id: 'r1', estudianteId: 'nino', rangoEdad: 'R3', secuencia: 1, asignadoPor: 'docente' });
    expect(r.snapshot).toMatchObject({ tipo: 'REEVALUACION', secuencia: 1, asignadoPor: 'docente', totalItems: 15 });
    expect(r.forma).toBe('B');
    r.comenzar(AHORA);
    expect(r.siguiente(generarBanco('R3', 'B'))?.forma).toBe('B');
    expect(() => r.siguiente(generarBanco('R3', 'A'))).toThrow('forma B');
    expect(() => Diagnostico.crearReevaluacion({ id: 'r0', estudianteId: 'nino', rangoEdad: 'R3', secuencia: 0, asignadoPor: 'd' })).toThrow('empieza en 1');
  });
});
```

`apps/api/test/unit/diagnostico/aplicacion/diagnostico-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { SinRetoPendienteError } from '../../../../src/modules/diagnostico/domain/errors/errores-diagnostico';
import { EVENTOS_DIAGNOSTICO } from '../../../../src/modules/diagnostico/domain/events/eventos-diagnostico';
import { EVENTOS_INTEGRACION, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoDiagnostico, EntornoDiagnostico, generarBanco } from '../dobles';

/** Nivel 1 — Casos de uso del Diagnóstico con dobles (RF-034 a RF-037, RN-05). */
const NINO = 'nino-9';
const DOCENTE = 'docente';

describe('Diagnóstico: reto del estudiante y reevaluación del docente', () => {
  let e: EntornoDiagnostico;

  beforeEach(() => {
    e = crearEntornoDiagnostico();
    e.identidad.agregar(NINO, 'Mateo', 'R2');
  });

  /** Responde todo el reto en curso; `acierta(i)` decide si la pregunta i (0-based) es correcta. */
  const completar = async (estudianteId = NINO, acierta: (i: number) => boolean = () => true) => {
    const { id } = await e.reto.comenzar(estudianteId);
    for (let i = 0; ; i++) {
      const item = await e.reto.siguiente(estudianteId, id as string);
      if (!item) break;
      await e.reto.responder(estudianteId, id as string, item.itemId, acierta(i) ? 1 : 0);
    }
    return { id: id as string, resultado: await e.reto.finalizar(estudianteId, id as string) };
  };

  describe('Reto inicial (RF-034, RF-036, RN-05)', () => {
    it('un niño nuevo tiene su reto inicial por empezar (10 preguntas a los 6–7 años, 15 después)', async () => {
      expect(await e.reto.actual(NINO)).toEqual({ inicialFinalizado: false, pendiente: { id: null, tipo: 'INICIAL', estado: 'NO_INICIADO', respondidos: 0, total: 15 } });
      e.identidad.agregar('pequena', 'Lía', 'R1');
      expect((await e.reto.actual('pequena')).pendiente?.total).toBe(10);
      expect(e.repo.filas.size).toBe(0); // consultar no crea nada
    });

    it('empezar crea el reto una sola vez; volver a entrar lo reanuda', async () => {
      const primero = await e.reto.comenzar(NINO);
      const segundo = await e.reto.comenzar(NINO);
      expect(segundo.id).toBe(primero.id);
      expect(primero).toMatchObject({ tipo: 'INICIAL', estado: 'EN_CURSO', respondidos: 0, total: 15 });
      expect(e.bus.nombres().filter((n) => n === EVENTOS_DIAGNOSTICO.INICIADO)).toHaveLength(1);
      expect((await e.reto.actual(NINO)).pendiente?.id).toBe(primero.id);
    });

    it('dos pedidos simultáneos la primera vez siguen con el mismo reto', async () => {
      const [a, b] = await Promise.all([e.reto.comenzar(NINO), e.reto.comenzar(NINO)]);
      expect(a.id).toBe(b.id);
      expect(e.repo.filas.size).toBe(1);
    });

    it('la pregunta llega sin habilidad ni respuesta, y con su lectura', async () => {
      const { id } = await e.reto.comenzar(NINO);
      const item = await e.reto.siguiente(NINO, id as string);
      expect(item).toEqual({ itemId: generarBanco('R2', 'A')[0]!.id, numero: 1, total: 15, lectura: { titulo: 'Lectura 1', texto: 'Había una vez…' }, enunciado: 'Pregunta 1 (A)', opciones: ['Primera', 'Correcta', 'Tercera'] });
      expect(JSON.stringify(item)).not.toMatch(/indiceCorrecto|habilidad|nivelDificultad/);
    });

    it('RF-036: pausar guarda lo respondido; al volver, sigue en la pregunta siguiente', async () => {
      const { id } = await e.reto.comenzar(NINO);
      for (let i = 0; i < 6; i++) {
        const item = await e.reto.siguiente(NINO, id as string);
        expect(await e.reto.responder(NINO, id as string, item!.itemId, 1)).toEqual({ respondidos: i + 1, total: 15, terminado: false });
      }
      expect(await e.reto.pausar(NINO, id as string)).toMatchObject({ estado: 'PAUSADO', respondidos: 6 });
      await expect(e.reto.responder(NINO, id as string, generarBanco('R2', 'A')[6]!.id, 1)).rejects.toThrow('Primero reanuda tu reto');
      expect(await e.reto.comenzar(NINO)).toMatchObject({ id, estado: 'EN_CURSO', respondidos: 6 });
      expect((await e.reto.siguiente(NINO, id as string))?.numero).toBe(7);
    });

    it('RF-035: al finalizar calcula el nivel por habilidad y publica DiagnosticoFinalizado para Aventura', async () => {
      // LIT y VOC aciertan las dos más difíciles de sus 3 preguntas: (0 + 100 + 110) / 3 = 70 y (0 + 100 + 110) / 3 = 70.
      const { id, resultado } = await completar(NINO, (i) => i >= 5);
      expect(resultado).toMatchObject({ diagnosticoId: id, tipo: 'INICIAL', aciertos: 10, total: 15 });
      expect(resultado.habilidades.find((h) => h.codigo === 'LIT')).toEqual({ codigo: 'LIT', nombre: 'Comprensión literal', valor: 70, nivel: 'A', etiquetaNivel: 'Logrado', nivelDeclarado: null });
      const evento = e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO);
      expect(evento?.datos).toMatchObject({ estudianteId: NINO, diagnosticoId: id, tipo: 'INICIAL', maestrias: { LIT: 70, VOC: 70, INF: 70, CRI: 70, ARG: 70 }, aciertos: 10, total: 15 });
      expect(await e.reto.actual(NINO)).toEqual({ inicialFinalizado: true, pendiente: null });
      expect(await e.reto.resultado(NINO, id)).toEqual(resultado);
    });

    it('RN-05: el inicial no se repite ni se omite; un reto ajeno o sin terminar no se muestra', async () => {
      const { id } = await e.reto.comenzar(NINO);
      await expect(e.reto.resultado(NINO, id as string)).rejects.toThrow('aún no termina');
      e.identidad.agregar('otro', 'Ana');
      await expect(e.reto.siguiente('otro', id as string)).rejects.toThrow(NoEncontradoError);
      await expect(e.reto.finalizar(NINO, id as string)).rejects.toThrow('Aún faltan 15 preguntas');
      await completar(NINO);
      await expect(e.reto.comenzar(NINO)).rejects.toThrow(SinRetoPendienteError);
      await expect(e.reto.siguiente(NINO, id as string)).rejects.toThrow('Este reto ya terminó');
    });

    it('un perfil desactivado no tiene reto', async () => {
      e.identidad.agregar('inactivo', 'Leo', 'R2', false);
      await expect(e.reto.comenzar('inactivo')).rejects.toThrow(NoEncontradoError);
      await expect(e.reto.actual('inactivo')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Reevaluación del docente (RF-037)', () => {
    const AULA = 'aula-4a';
    beforeEach(() => {
      e.identidad.agregar('ana', 'Ana', 'R3');
      e.identidad.agregar('leo', 'Leo', 'R2');
      e.aulas.aulas.set(AULA, { id: AULA, nombre: '4.° A', activa: true, docenteId: DOCENTE, estudiantes: [NINO, 'ana', 'leo'] });
    });

    it('asigna a quien terminó su reto inicial y explica por qué omite a los demás', async () => {
      await completar(NINO);
      await completar('ana');
      await e.reto.comenzar('leo'); // aún en su reto inicial
      const r = await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA });
      expect(r).toEqual({ asignados: 2, omitidos: [{ estudianteId: 'leo', alias: 'Leo', motivo: 'Aún no termina su reto inicial' }] });
      expect(e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_DIAGNOSTICO.REEVALUACION_ASIGNADA)?.datos).toEqual({ actorId: DOCENTE, aulaId: AULA, cantidad: 2 });
      const pendiente = (await e.reto.actual(NINO)).pendiente;
      expect(pendiente).toMatchObject({ tipo: 'REEVALUACION', estado: 'NO_INICIADO', total: 15 });
      // Asignar otra vez: ya tienen una pendiente.
      expect((await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: [NINO] })).omitidos[0]?.motivo).toBe('Ya tiene un reto pendiente');
      e.identidad.agregar('sin-empezar', 'Sol');
      e.aulas.aulas.get(AULA)?.estudiantes.push('sin-empezar');
      expect((await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: ['sin-empezar'] })).omitidos[0]?.motivo).toBe('Aún no termina su reto inicial');
    });

    it('usa la forma equivalente y compara habilidad por habilidad con el inicial', async () => {
      await completar(NINO, (i) => i >= 10); // inicial: solo aciertan las más difíciles
      await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: [NINO] });
      const { id } = await e.reto.comenzar(NINO);
      expect((await e.reto.siguiente(NINO, id as string))?.enunciado).toBe('Pregunta 1 (B)');
      await completar(NINO); // reevaluación: acierta todo
      const [mateo] = (await e.reevaluaciones.resumen(DOCENTE, AULA)).filter((x) => x.estudianteId === NINO);
      expect(mateo?.inicial).toEqual({ estado: 'FINALIZADO', valores: { LIT: 36.7, INF: 36.7, VOC: 36.7, CRI: 36.7, ARG: 36.7 } });
      expect(mateo?.reevaluacion).toMatchObject({ secuencia: 1, estado: 'FINALIZADO', valores: { LIT: 100 } });
      expect(mateo?.cambios).toEqual({ LIT: 63.3, INF: 63.3, VOC: 63.3, CRI: 63.3, ARG: 63.3 });
      // Una segunda reevaluación vuelve a la forma A.
      await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: [NINO] });
      const segunda = await e.reto.comenzar(NINO);
      expect((await e.reto.siguiente(NINO, segunda.id as string))?.enunciado).toBe('Pregunta 1 (A)');
      expect((await e.reevaluaciones.resumen(DOCENTE, AULA)).find((x) => x.estudianteId === NINO)?.reevaluacion).toMatchObject({ secuencia: 2, estado: 'EN_CURSO', valores: null });
    });

    it('el resumen lista a todo el aula por alias, aunque no hayan empezado', async () => {
      const lista = await e.reevaluaciones.resumen(DOCENTE, AULA);
      expect(lista.map((x) => [x.alias, x.inicial.estado, x.reevaluacion, x.cambios])).toEqual([
        ['Ana', 'SIN_EMPEZAR', null, null],
        ['Leo', 'SIN_EMPEZAR', null, null],
        ['Mateo', 'SIN_EMPEZAR', null, null],
      ]);
    });

    it('RN-17: solo en su aula, activa, y con estudiantes de esa aula', async () => {
      await expect(e.reevaluaciones.asignar({ docenteId: 'otra-docente', aulaId: AULA })).rejects.toThrow(NoEncontradoError);
      await expect(e.reevaluaciones.resumen('otra-docente', AULA)).rejects.toThrow(NoEncontradoError);
      await expect(e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: ['de-otra-aula'] })).rejects.toThrow('matriculados en esta aula');
      e.aulas.aulas.set('vacia', { id: 'vacia', nombre: 'Vacía', activa: true, docenteId: DOCENTE, estudiantes: [] });
      await expect(e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: 'vacia' })).rejects.toThrow('matriculados en esta aula');
      e.aulas.aulas.set('archivada', { id: 'archivada', nombre: 'Archivada', activa: false, docenteId: DOCENTE, estudiantes: [NINO] });
      await expect(e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: 'archivada' })).rejects.toThrow('archivada');
    });

    it('omite perfiles desactivados', async () => {
      e.identidad.agregar('leo', 'Leo', 'R2', false);
      expect((await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: ['leo'] })).omitidos[0]?.motivo).toBe('Su perfil está desactivado');
    });
  });
});
```

`apps/api/test/unit/diagnostico/dobles.ts`:

```ts
/**
 * Dobles de prueba del Diagnóstico: repositorio en memoria con las mismas restricciones únicas que
 * la base (un reto sin terminar por estudiante; único por estudiante, tipo y secuencia), un banco
 * con la estructura del real (una pregunta por habilidad en cada lectura, dificultad creciente) e
 * IAM y Escuela simulados.
 */
import type { RangoEdad } from '../../../src/modules/shared-kernel/public-api';
import { uuidV7 } from '../../../src/modules/shared-kernel/infrastructure/uuid';
import type { AulasDocente, BancoItems, DiagnosticoRepository, IdentidadEstudiantes } from '../../../src/modules/diagnostico/application/ports/diagnostico.ports';
import { ReevaluacionesUseCase } from '../../../src/modules/diagnostico/application/use-cases/reevaluaciones.use-case';
import { RetoUseCase } from '../../../src/modules/diagnostico/application/use-cases/reto.use-case';
import { Diagnostico } from '../../../src/modules/diagnostico/domain/entities/diagnostico';
import type { ItemDiagnostico } from '../../../src/modules/diagnostico/domain/entities/item-diagnostico';
import { Forma, ITEMS_POR_RANGO, ORDEN_HABILIDADES, TipoDiagnostico } from '../../../src/modules/diagnostico/domain/value-objects/plan-diagnostico';
import { BusEspia, Reloj } from '../iam/dobles';

const copiar = (d: Diagnostico) => Diagnostico.desdePersistencia(structuredClone(d.snapshot) as Diagnostico['snapshot']);

export class DiagnosticosEnMemoria implements DiagnosticoRepository {
  readonly filas = new Map<string, Diagnostico>();

  async buscar(id: string) {
    const d = this.filas.get(id);
    return d ? copiar(d) : null;
  }
  async crear(d: Diagnostico) {
    const todos = [...this.filas.values()];
    const repetido = todos.some((x) => x.estudianteId === d.estudianteId && x.tipo === d.tipo && x.secuencia === d.secuencia);
    const otroPendiente = d.estado !== 'FINALIZADO' && todos.some((x) => x.estudianteId === d.estudianteId && x.estado !== 'FINALIZADO');
    if (repetido || otroPendiente) return false;
    this.filas.set(d.id, copiar(d));
    return true;
  }
  async guardar(d: Diagnostico) {
    if (!this.filas.has(d.id)) throw new Error('No existe');
    this.filas.set(d.id, copiar(d));
  }
  async pendienteDe(estudianteId: string) {
    const d = [...this.filas.values()].find((x) => x.estudianteId === estudianteId && x.estado !== 'FINALIZADO');
    return d ? copiar(d) : null;
  }
  async inicialDe(estudianteId: string) {
    const d = [...this.filas.values()].find((x) => x.estudianteId === estudianteId && x.tipo === 'INICIAL');
    return d ? copiar(d) : null;
  }
  async ultimaSecuencia(estudianteId: string, tipo: TipoDiagnostico) {
    return Math.max(0, ...[...this.filas.values()].filter((x) => x.estudianteId === estudianteId && x.tipo === tipo).map((x) => x.secuencia));
  }
  async deEstudiantes(ids: string[]) {
    return [...this.filas.values()].filter((x) => ids.includes(x.estudianteId)).map(copiar);
  }
}

/**
 * Banco con la forma del real: lecturas de 5 preguntas (LIT, VOC, INF, CRI, ARG); la dificultad de
 * cada habilidad sube de una lectura a la siguiente (1, 2, 3 …). La opción correcta es la 1.
 */
export class BancoFalso implements BancoItems {
  pedidos = 0;
  async items(rangoEdad: RangoEdad, forma: Forma) {
    this.pedidos += 1;
    return generarBanco(rangoEdad, forma);
  }
}

const BANCO = new Map<string, ItemDiagnostico[]>();
export function generarBanco(rangoEdad: RangoEdad, forma: Forma): ItemDiagnostico[] {
  const clave = `${rangoEdad}|${forma}`;
  if (!BANCO.has(clave)) {
    BANCO.set(
      clave,
      Array.from({ length: ITEMS_POR_RANGO[rangoEdad] }, (_, i) => ({
        id: uuidV7(),
        rangoEdad,
        forma,
        orden: i + 1,
        habilidad: ORDEN_HABILIDADES[i % 5] as ItemDiagnostico['habilidad'],
        nivelDificultad: Math.floor(i / 5) + 1,
        enunciado: `Pregunta ${i + 1} (${forma})`,
        lectura: { clave: `${rangoEdad}-${forma}-${Math.floor(i / 5) + 1}`, titulo: `Lectura ${Math.floor(i / 5) + 1}`, texto: 'Había una vez…' },
        opciones: ['Primera', 'Correcta', 'Tercera'],
        indiceCorrecto: 1,
      })),
    );
  }
  return BANCO.get(clave) as ItemDiagnostico[];
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean }>();
  agregar(id: string, alias: string, rangoEdad: RangoEdad = 'R2', activo = true) {
    this.perfilesPorId.set(id, { id, alias, avatar: 'zorro', rangoEdad, activo });
  }
  async perfiles(ids: string[]) {
    return ids.map((id) => this.perfilesPorId.get(id)).filter((p) => p !== undefined);
  }
}

export class AulasFalsas implements AulasDocente {
  readonly aulas = new Map<string, { id: string; nombre: string; activa: boolean; docenteId: string; estudiantes: string[] }>();
  async aulaDelDocente(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? { id: a.id, nombre: a.nombre, activa: a.activa } : null;
  }
  async estudiantes(aulaId: string) {
    return [...(this.aulas.get(aulaId)?.estudiantes ?? [])];
  }
}

/** Ensambla los dobles y los casos de uso reales; cada prueba crea su propio entorno. */
export function crearEntornoDiagnostico() {
  const reloj = new Reloj();
  const bus = new BusEspia();
  const repo = new DiagnosticosEnMemoria();
  const banco = new BancoFalso();
  const identidad = new IdentidadFalsa();
  const aulas = new AulasFalsas();
  return {
    reloj, bus, repo, banco, identidad, aulas,
    reto: new RetoUseCase(repo, banco, identidad, bus, () => uuidV7(), reloj.ahora),
    reevaluaciones: new ReevaluacionesUseCase(repo, aulas, identidad, bus, () => uuidV7(), reloj.ahora),
  };
}

export type EntornoDiagnostico = ReturnType<typeof crearEntornoDiagnostico>;
```

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

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Diagnóstico integrado (RF-034 a RF-037, RN-05) contra PostgreSQL real: el reto con el
 * banco cargado por la migración, pausa y reanudación, el nivel por habilidad, la posición inicial
 * en el mapa de Aventura (RF-033) por el evento real, y la reevaluación del docente.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';

let t: AppDePrueba;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

/** Respuesta correcta de un ítem según el banco (para elegir aciertos a propósito). */
async function correcta(itemId: string) {
  const fila = await t.prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: itemId } });
  return { indice: (fila.respuestaCorrecta as { indice: number }).indice, habilidad: fila.habilidad, opciones: (fila.contenido as { opciones: string[] }).opciones.length };
}

/** Responde todo lo que falta; acierta solo en las habilidades indicadas. */
async function responderTodo(token: string, id: string, acertar: string[]) {
  for (;;) {
    const { item } = (await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(token)).expect(200)).body;
    if (!item) return;
    const c = await correcta(item.itemId);
    const indice = acertar.includes(c.habilidad) ? c.indice : (c.indice + 1) % c.opciones;
    await t.http().post(`${API}/diagnosticos/${id}/respuestas`).set(bearer(token)).send({ itemId: item.itemId, indice }).expect(200);
  }
}

let tokenDocente: string;
let aulaId: string;
const ninos = {} as Record<'mateo' | 'lia', { id: string; token: string }>;
let retoMateo: string;

describe('Preparación', () => {
  it('una docente con un aula, Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '3.° B', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const anio = new Date().getFullYear();
    for (const [clave, alias, edad] of [['mateo', 'Mateo', 9], ['lia', 'Lía', 6]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      const token = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken;
      ninos[clave] = { id: m.estudianteId, token };
    }
    expect(await t.prisma.bancoItemDiagnostico.count()).toBe(80);
  });
});

describe('Reto inicial (RF-034, RF-036, RN-05)', () => {
  it('RN-05: sin el reto inicial, el mapa no se habilita', async () => {
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(mapa.diagnosticoPendiente).toBe(true);
    expect(await t.prisma.progresoMundo.count({ where: { estudianteId: ninos.mateo.id } })).toBe(0);
    const actual = (await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(actual).toEqual({ inicialFinalizado: false, pendiente: { id: null, tipo: 'INICIAL', estado: 'NO_INICIADO', respondidos: 0, total: 15 } });
    await t.http().get(`${API}/diagnosticos/actual`).set(bearer(tokenDocente)).expect(403);
    await t.http().post(`${API}/diagnostico/demo`).set(bearer(ninos.mateo.token)).send({}).expect(404); // el esqueleto de ejemplo ya no existe
  });

  it('empieza el reto: 15 preguntas de su edad, en orden, sin la respuesta correcta', async () => {
    const r = (await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body;
    retoMateo = r.id;
    expect(r).toMatchObject({ tipo: 'INICIAL', estado: 'EN_CURSO', respondidos: 0, total: 15 });
    expect((await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body.id).toBe(retoMateo); // vuelve a entrar: el mismo
    const { item } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(item).toMatchObject({ numero: 1, total: 15, lectura: { titulo: 'Killa y el cóndor' }, enunciado: '¿Qué comía Killa cada mañana?' });
    expect(item.opciones).toHaveLength(4);
    expect(JSON.stringify(item)).not.toMatch(/indice|correcta|habilidad|dificultad/i);
  });

  it('valida la respuesta: la pregunta en pantalla, una opción que exista', async () => {
    const { item } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body;
    const otro = await t.prisma.bancoItemDiagnostico.findFirstOrThrow({ where: { rangoEdad: 'R2', forma: 'A', id: { not: item.itemId } } });
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: otro.id, indice: 0 }).expect(409);
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: item.itemId, indice: 9 }).expect(400);
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: 'no-es-un-id', indice: 0 }).expect(400);
    // El reto de otro niño responde como si no existiera.
    await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.lia.token)).expect(404);
  });

  it('RF-036: pausa a mitad de camino y, al volver, sigue en la pregunta siguiente', async () => {
    for (let i = 0; i < 6; i++) {
      const { item } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body;
      const c = await correcta(item.itemId);
      await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: item.itemId, indice: ['LIT', 'VOC'].includes(c.habilidad) ? c.indice : (c.indice + 1) % c.opciones }).expect(200);
    }
    const pausado = (await t.http().post(`${API}/diagnosticos/${retoMateo}/pausar`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(pausado).toMatchObject({ estado: 'PAUSADO', respondidos: 6 });
    expect(await t.prisma.respuestaDiagnostico.count({ where: { diagnosticoId: retoMateo } })).toBe(6);
    expect((await t.prisma.diagnostico.findUniqueOrThrow({ where: { id: retoMateo } })).pausadoEn).not.toBeNull();
    expect((await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token))).body.pendiente).toMatchObject({ id: retoMateo, estado: 'PAUSADO', respondidos: 6 });
    const { item: pendiente } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body;
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: pendiente.itemId, indice: 0 }).expect(409);
    expect((await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body).toMatchObject({ id: retoMateo, estado: 'EN_CURSO', respondidos: 6 });
    expect((await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body.item.numero).toBe(7);
  });

  it('la base no admite dos retos sin terminar para el mismo niño (segunda barrera)', async () => {
    await expect(t.prisma.diagnostico.create({ data: { estudianteId: ninos.mateo.id, tipo: 'REEVALUACION', secuencia: 1, estado: 'NO_INICIADO', rangoEdad: 'R2', totalItems: 15 } })).rejects.toThrow(/Unique constraint|diagnostico_un_pendiente_por_estudiante/);
  });
});

describe('Nivel inicial y posición en el mapa (RF-035, RF-033)', () => {
  it('Mateo acierta en LIT y VOC: nivel por habilidad y empieza en el Detective con el Explorador completado (UAT-01)', async () => {
    await t.http().post(`${API}/diagnosticos/${retoMateo}/finalizar`).set(bearer(ninos.mateo.token)).expect(409); // aún faltan
    await responderTodo(ninos.mateo.token, retoMateo, ['LIT', 'VOC']);
    const resultado = (await t.http().post(`${API}/diagnosticos/${retoMateo}/finalizar`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(resultado).toMatchObject({ tipo: 'INICIAL', aciertos: 6, total: 15 });
    const lit = resultado.habilidades.find((h: { codigo: string }) => h.codigo === 'LIT');
    expect(lit).toMatchObject({ valor: 100, nivel: 'AD', etiquetaNivel: 'Destacado', nivelDeclarado: null });
    expect(resultado.habilidades.find((h: { codigo: string }) => h.codigo === 'INF')).toMatchObject({ valor: 0, nivel: 'C' });

    const fila = await t.prisma.diagnostico.findUniqueOrThrow({ where: { id: retoMateo } });
    expect(fila).toMatchObject({ estado: 'FINALIZADO' });
    expect((fila.resultado as { habilidades: Record<string, { valor: number }> }).habilidades.VOC?.valor).toBe(100);
    const evento = await t.prisma.outboxEvento.findFirstOrThrow({ where: { tipo: 'diagnostico.DiagnosticoFinalizado', agregadoId: retoMateo } });
    expect(evento.payload).toMatchObject({ estudianteId: ninos.mateo.id, maestrias: { LIT: 100, VOC: 100, INF: 0, CRI: 0, ARG: 0 } });
    expect(evento.publicadoEn).not.toBeNull();

    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(mapa.diagnosticoPendiente).toBe(false);
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token)).then((r) => r.body)).toEqual({ inicialFinalizado: true, pendiente: null });
    expect((await t.http().get(`${API}/diagnosticos/${retoMateo}/resultado`).set(bearer(ninos.mateo.token)).expect(200)).body).toEqual(resultado);
    await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(409); // el inicial no se repite
  });

  it('Lía (6 años) tiene 10 preguntas de su edad; sin LIT ni VOC empieza en el Explorador', async () => {
    const { id } = (await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.lia.token)).expect(201)).body;
    expect((await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(ninos.lia.token))).body.item).toMatchObject({ total: 10, lectura: { titulo: 'Toby en el parque' } });
    await responderTodo(ninos.lia.token, id, ['INF', 'CRI', 'ARG']);
    expect((await t.http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(ninos.lia.token)).expect(200)).body).toMatchObject({ aciertos: 6, total: 10 });
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.lia.token)).expect(200)).body;
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
  });
});

describe('Reevaluación periódica del docente (RF-037)', () => {
  it('la docente la asigna a su aula; otra docente no puede', async () => {
    const otra = await docente();
    await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(otra)).send({}).expect(404);
    await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(ninos.mateo.token)).send({}).expect(403);
    await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).send({ estudianteIds: ['no-es-un-id'] }).expect(400);
    const r = (await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).send({ estudianteIds: [ninos.mateo.id] }).expect(201)).body;
    expect(r).toEqual({ asignados: 1, omitidos: [] });
    expect(await t.prisma.diagnostico.findFirst({ where: { estudianteId: ninos.mateo.id, tipo: 'REEVALUACION' } })).toMatchObject({ secuencia: 1, estado: 'NO_INICIADO' });
    const otraVez = (await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).send({}).expect(201)).body;
    expect(otraVez.omitidos).toEqual([{ estudianteId: ninos.mateo.id, alias: 'Mateo', motivo: 'Ya tiene un reto pendiente' }]);
    expect(otraVez.asignados).toBe(1); // Lía
  });

  it('Mateo la hace con la forma equivalente y la docente compara habilidad por habilidad', async () => {
    const pendiente = (await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token))).body.pendiente;
    expect(pendiente).toMatchObject({ tipo: 'REEVALUACION', estado: 'NO_INICIADO', total: 15 });
    const { id } = (await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body;
    expect((await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(ninos.mateo.token))).body.item.lectura.titulo).toBe('El bufeo colorado'); // forma B
    await responderTodo(ninos.mateo.token, id, ['LIT', 'VOC', 'INF']);
    await t.http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(ninos.mateo.token)).expect(200);
    // El mapa no cambia: la posición inicial se decide una sola vez.
    expect((await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token))).body.mundoActual).toBe(2);

    const resumen = (await t.http().get(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).expect(200)).body;
    expect(resumen.map((x: { alias: string }) => x.alias)).toEqual(['Lía', 'Mateo']);
    const mateo = resumen.find((x: { alias: string }) => x.alias === 'Mateo');
    expect(mateo.inicial).toEqual({ estado: 'FINALIZADO', valores: { LIT: 100, INF: 0, VOC: 100, CRI: 0, ARG: 0 } });
    expect(mateo.reevaluacion).toMatchObject({ secuencia: 1, estado: 'FINALIZADO', valores: { LIT: 100, INF: 100, VOC: 100 } });
    expect(mateo.cambios).toEqual({ LIT: 0, INF: 100, VOC: 0, CRI: 0, ARG: 0 });
    expect(resumen.find((x: { alias: string }) => x.alias === 'Lía').reevaluacion).toMatchObject({ estado: 'NO_INICIADO', valores: null });
  });
});
```

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

```ts
import { expect, Page, test as base } from '@playwright/test';

import { claveDelEnunciado, retoTerminado } from '../../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Diagnóstico de punta a punta (RF-034 a RF-037, RN-05) en escritorio, tablet y celular:
 * el niño hace su reto inicial en la web real, lo pausa y lo retoma, y queda ubicado en su mundo; la
 * docente le asigna un reto de repaso y compara el avance por habilidad.
 */
test.describe('Diagnóstico: reto inicial y de repaso (RF-034 a RF-037)', () => {
  test.setTimeout(150_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  /** Responde la pregunta en pantalla: la correcta en las habilidades indicadas y otra en las demás. */
  async function responder(page: Page, acertar: string[]) {
    const enunciado = page.getByRole('heading', { level: 3 });
    const texto = (await enunciado.textContent()) as string;
    const clave = await claveDelEnunciado(texto);
    const opcion = acertar.includes(clave.habilidad) ? clave.correcta : clave.incorrecta;
    await page.getByRole('button').filter({ has: page.getByText(opcion, { exact: true }) }).click();
    await expect(page.getByRole('heading', { level: 3, name: texto, exact: true })).toHaveCount(0); // llegó otra pregunta o el resultado
  }

  test('el niño hace su reto, lo pausa, sigue donde quedó y con buen LIT y VOC empieza en el Detective', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017: 8–9 años
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');

    // RN-05: el mapa espera al reto inicial.
    const reto = page.getByRole('region', { name: '¡Tu reto inicial te espera!' });
    await expect(reto).toContainText('Son 15 preguntas cortas');
    await expect(page.getByRole('region', { name: 'Tus mundos' })).toContainText('Primero, tu reto inicial');
    await reto.getByRole('link', { name: '¡Empezar mi reto!' }).click();

    // RF-034: una pregunta a la vez, con su lectura a la vista y sin decir si acertó.
    await expect(page.getByText('Pregunta 1 de 15')).toBeVisible();
    await expect(page.getByRole('article')).toContainText('Killa');
    for (let i = 0; i < 4; i++) await responder(page, ['LIT', 'VOC']);
    await expect(page.getByText('Pregunta 5 de 15')).toBeVisible();

    // RF-036: pausa y vuelve donde se quedó.
    await page.getByRole('button', { name: 'Pausar y seguir después' }).click();
    await expect(page.getByRole('region', { name: '¡Tu reto inicial te espera!' })).toContainText('Vas en la pregunta 5 de 15');
    await page.getByRole('link', { name: 'Continuar mi reto' }).click();
    await expect(page.getByText('Pregunta 5 de 15')).toBeVisible();
    while (await page.getByRole('heading', { level: 3 }).count()) await responder(page, ['LIT', 'VOC']);

    // RF-035: lo que ya sabe hacer, en estrellas (sin notas).
    await expect(page.getByRole('heading', { level: 1, name: '¡Reto completado!' })).toBeVisible();
    const habilidades = page.getByRole('list', { name: 'Lo que ya sabes hacer' });
    await expect(habilidades.getByRole('listitem')).toHaveCount(5);
    await expect(habilidades.getByRole('listitem').filter({ hasText: 'Encontrar lo que dice el texto' }).getByRole('img', { name: '3 de 3 estrellas' })).toBeVisible();
    await expect(habilidades.getByRole('listitem').filter({ hasText: 'Descubrir lo que no se dice' }).getByRole('img', { name: '0 de 3 estrellas' })).toBeVisible();

    // RF-033: con LIT y VOC ≥ 65 empieza en el Detective y el Explorador queda completado.
    await page.getByRole('link', { name: 'Ver mi mapa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar al mundo 2: Detective' })).toContainText('¡Estás aquí!');
    await expect(page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toContainText('¡Mundo completado!');
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Inicio' }).click();
    await expect(page.getByRole('region', { name: '¡Tu reto inicial te espera!' })).toHaveCount(0);
  });

  test('RN-05: sin el reto inicial el mapa no se abre, y desde el mapa se llega al reto', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Lía');
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    await expect(page.getByText('Primero, tu reto inicial')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Entrar al mundo/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Ir a mi reto' }).click();
    await expect(page.getByText('Pregunta 1 de 15')).toBeVisible();
  });

  test('RF-037: la docente asigna un reto de repaso y ve cuánto avanzó cada habilidad', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Teo'); // inicial: falla todo

    await abrirAula(page, aula);
    const repaso = page.getByRole('region', { name: 'Reto de repaso' });
    await expect(repaso.getByRole('listitem').filter({ hasText: 'Teo' })).toContainText('Inicial: Terminado');
    await repaso.getByRole('button', { name: 'Asignar reto de repaso a toda el aula' }).click();
    await expect(repaso.getByText('Reto de repaso asignado a 1 estudiante.')).toBeVisible();
    await expect(repaso.getByRole('listitem').filter({ hasText: 'Teo' })).toContainText('Repaso: Por empezar');
    await salirDelPanel(page);

    // El niño ve su reto de repaso en el inicio.
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Teo');
    await expect(page.getByRole('region', { name: 'Tu docente te dejó un reto de repaso' })).toBeVisible();
    await salirDelPanel(page);

    await retoTerminado(request, aula, 'Teo', ['LIT', 'VOC', 'INF', 'CRI', 'ARG']); // repaso: acierta todo
    await abrirAula(page, aula);
    const fila = page.getByRole('region', { name: 'Reto de repaso' }).getByRole('listitem').filter({ hasText: 'Teo' });
    await expect(fila).toContainText('Repaso: Terminado');
    await expect(fila.getByLabel('Cambios de Teo desde el reto inicial')).toContainText('Literal +100');
  });
});
```

`tests/e2e/support/diagnostico.ts`:

```ts
import { resolve } from 'node:path';

import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { AulaPreparada, PIN_PRUEBA, sesionApi } from './escuela';

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** La respuesta correcta y la habilidad de un ítem del banco (para acertar o fallar a propósito). */
export async function claveDelItem(itemId: string): Promise<{ indice: number; habilidad: string; opciones: string[] }> {
  const prisma = db();
  try {
    const item = await prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: itemId } });
    return { indice: (item.respuestaCorrecta as { indice: number }).indice, habilidad: item.habilidad, opciones: (item.contenido as { opciones: string[] }).opciones };
  } finally {
    await prisma.$disconnect();
  }
}

/** Igual que claveDelItem, pero buscando la pregunta por su enunciado (lo que el niño ve en pantalla). */
export async function claveDelEnunciado(enunciado: string, rangoEdad = 'R2'): Promise<{ correcta: string; incorrecta: string; habilidad: string }> {
  const prisma = db();
  try {
    const item = await prisma.bancoItemDiagnostico.findFirstOrThrow({ where: { enunciado, rangoEdad } });
    const opciones = (item.contenido as { opciones: string[] }).opciones;
    const indice = (item.respuestaCorrecta as { indice: number }).indice;
    return { correcta: opciones[indice] as string, incorrecta: opciones[(indice + 1) % opciones.length] as string, habilidad: item.habilidad };
  } finally {
    await prisma.$disconnect();
  }
}

/** Sesión del niño por la API, con otra tablet del aula (registrar una tablet no invalida las demás). */
export async function sesionDelNino(request: APIRequestContext, preparada: AulaPreparada, alias: string): Promise<Record<string, string>> {
  const headers = await sesionApi(request, preparada.docente);
  const tablet = await request.post(`/api/v1/aulas/${preparada.aulaId}/dispositivos`, { headers, data: { nombre: 'Tablet de prueba' } });
  expect(tablet.status(), await tablet.text()).toBe(201);
  const login = await request.post('/api/v1/acceso-estudiante/login', {
    data: { tokenDispositivo: (await tablet.json()).tokenDispositivo, perfilId: preparada.estudiantes[alias], pin: PIN_PRUEBA },
  });
  expect(login.status(), await login.text()).toBe(200);
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

/**
 * RN-05: un niño nuevo hace su reto antes de ver el mapa. Lo completa por la API acertando solo en
 * las habilidades indicadas (por defecto ninguna: empieza en el mundo 1, RF-033). Sirve igual para
 * el reto inicial y para un reto de repaso pendiente.
 */
export async function retoTerminado(request: APIRequestContext, preparada: AulaPreparada, alias: string, acertar: string[] = []): Promise<void> {
  const nino = await sesionDelNino(request, preparada, alias);
  const comenzar = await request.post('/api/v1/diagnosticos', { headers: nino });
  expect(comenzar.status(), await comenzar.text()).toBe(201);
  const { id } = await comenzar.json();
  for (;;) {
    const { item } = await (await request.get(`/api/v1/diagnosticos/${id}/siguiente-item`, { headers: nino })).json();
    if (!item) break;
    const clave = await claveDelItem(item.itemId);
    const indice = acertar.includes(clave.habilidad) ? clave.indice : (clave.indice + 1) % clave.opciones.length;
    expect((await request.post(`/api/v1/diagnosticos/${id}/respuestas`, { headers: nino, data: { itemId: item.itemId, indice } })).status()).toBe(200);
  }
  expect((await request.post(`/api/v1/diagnosticos/${id}/finalizar`, { headers: nino })).status()).toBe(200);
}
```

`tests/load/scenarios/diagnostico-reto.js`:

```js
import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del reto inicial (k6): un aula de 40 niños de 9 años lo hace a la vez, de
 * a 10 en paralelo, con sus 15 preguntas cada uno.
 *   RNF-002: enviar y corregir una respuesta → p95 < 300 ms.
 *   RNF-001: pedir la pregunta siguiente → p95 < 300 ms y p99 < 800 ms.
 *   RF-035: finalizar (calcula el nivel y ubica al niño en su mundo) sin errores.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa). El banco de ítems lo carga la migración.
 * Ejecutar:   k6 run tests/load/scenarios/diagnostico-reto.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NINOS = 40;
const POR_TABLET = 20;
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

export const options = {
  scenarios: {
    reto: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: NINOS,
      maxDuration: '5m',
      exec: 'hacerReto',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:POST /diagnosticos/{id}/respuestas}': ['p(95)<300'],
    'http_req_duration{nombre:GET /diagnosticos/{id}/siguiente-item}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:POST /diagnosticos/{id}/finalizar}': ['p(95)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Docente con un aula de 40 niños de 9 años, cada uno con su sesión en la tablet del aula. */
export function setup() {
  const email = `carga.reto.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Reto', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${AVATARES[i % AVATARES.length]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  // Como en un aula real, varias tablets: RNF-019 limita a 30 ingresos por minuto en cada una.
  const tablets = Array.from({ length: Math.ceil(NINOS / POR_TABLET) }, (_, i) =>
    http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: `Tablet carga ${i + 1}` }), { headers: docente }).json('tokenDispositivo'),
  );
  return {
    ninos: matriculados.map((m, i) => {
      http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
      const tokenDispositivo = tablets[Math.floor(i / POR_TABLET)];
      const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: m.estudianteId, pin: '4826' }), { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } }).json();
      if (!ingreso.accessToken) fail(`Un niño de carga no pudo ingresar: ${JSON.stringify(ingreso)}`);
      return { ...JSON_HEADERS, Authorization: `Bearer ${ingreso.accessToken}` };
    }),
  };
}

/** Cada iteración es un niño distinto haciendo su reto completo. */
export function hacerReto(datos) {
  const yo = datos.ninos[exec.scenario.iterationInTest];
  const reto = http.post(`${BASE}/diagnosticos`, null, { headers: yo, tags: { nombre: 'POST /diagnosticos' } });
  check(reto, { 'reto empezado': (r) => r.status === 201 });
  const id = reto.json('id');
  for (let i = 0; i < 20; i++) {
    const siguiente = http.get(`${BASE}/diagnosticos/${id}/siguiente-item`, { headers: yo, tags: { nombre: 'GET /diagnosticos/{id}/siguiente-item' } });
    check(siguiente, { 'pregunta sin respuesta correcta': (r) => r.status === 200 && !r.body.includes('indiceCorrecto') });
    const item = siguiente.json('item');
    if (!item) break;
    const respuesta = http.post(`${BASE}/diagnosticos/${id}/respuestas`, JSON.stringify({ itemId: item.itemId, indice: i % item.opciones.length }), {
      headers: yo,
      tags: { nombre: 'POST /diagnosticos/{id}/respuestas' },
    });
    check(respuesta, { 'respuesta guardada': (r) => r.status === 200 });
  }
  const fin = http.post(`${BASE}/diagnosticos/${id}/finalizar`, null, { headers: yo, tags: { nombre: 'POST /diagnosticos/{id}/finalizar' } });
  check(fin, { 'nivel por habilidad': (r) => r.status === 200 && r.json('habilidades').length === 5 });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@diagnostico
Característica: Diagnóstico inicial gamificado
  Como estudiante de LectoAventura
  Quiero resolver un reto inicial corto
  Para empezar mi aventura en el mundo que me corresponde

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-034 @RF-035 @RF-033 @UAT-01 @camino-feliz @smoke
  Escenario: Un estudiante nuevo completa su reto inicial y es ubicado en su mundo
    Dado un niño de 9 años sin reto inicial, con la tablet del aula activada
    Y entró con su avatar y su PIN
    Cuando completa las 15 preguntas de su reto acertando en comprensión literal y vocabulario
    Entonces ve lo que ya sabe hacer en cada una de las 5 habilidades
    Y el mapa de aventuras lo ubica en el mundo "Detective"
    Y el mundo "Explorador" aparece como completado

  @RN-05 @negativo
  Escenario: Sin el reto inicial no se abre el mapa
    Dado un niño de 9 años sin reto inicial, con la tablet del aula activada
    Y entró con su avatar y su PIN
    Cuando abre sus mundos
    Entonces le pide primero su reto inicial y no le deja entrar a ningún mundo

  @RF-036
  Escenario: El niño pausa su reto y sigue donde se quedó
    Dado un niño de 9 años sin reto inicial, con la tablet del aula activada
    Y entró con su avatar y su PIN
    Cuando responde 3 preguntas de su reto y lo pausa
    Entonces su inicio le dice que va en la pregunta 4 de 15
    Y al continuar, el reto sigue en la pregunta 4

  @RF-037
  Escenario: La docente asigna un reto de repaso y compara el avance
    Dado un niño de 9 años que terminó su reto inicial sin acertar
    Cuando su docente le asigna un reto de repaso
    Y el niño lo termina acertando todo
    Entonces la docente ve que avanzó en comprensión literal
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect, Page } from '@playwright/test';

import { claveDelEnunciado, retoTerminado } from '../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del Diagnóstico (RF-034 a RF-037, RN-05). */

/** Responde la pregunta en pantalla: la correcta en las habilidades indicadas y otra en las demás. */
async function responder(page: Page, acertar: string[]) {
  const enunciado = page.getByRole('heading', { level: 3 });
  const texto = (await enunciado.textContent()) as string;
  const clave = await claveDelEnunciado(texto);
  await page.getByRole('button').filter({ has: page.getByText(acertar.includes(clave.habilidad) ? clave.correcta : clave.incorrecta, { exact: true }) }).click();
  await expect(page.getByRole('heading', { level: 3, name: texto, exact: true })).toHaveCount(0); // llegó otra pregunta o el resultado
}

async function empezarReto(page: Page) {
  await page.getByRole('region', { name: '¡Tu reto inicial te espera!' }).getByRole('link').click();
  await expect(page.getByText(/^Pregunta \d+ de 15$/)).toBeVisible();
}

Dado('un niño de 9 años sin reto inicial, con la tablet del aula activada', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017
  await tabletDelAulaActivada(page, request, mundo.aula);
});

Dado('entró con su avatar y su PIN', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
});

// ── RF-034, RF-035, RF-033 (UAT-01) ───────────────────────────────────────

Cuando('completa las 15 preguntas de su reto acertando en comprensión literal y vocabulario', async ({ page }) => {
  await empezarReto(page);
  while (await page.getByRole('heading', { level: 3 }).count()) await responder(page, ['LIT', 'VOC']);
  await expect(page.getByRole('heading', { level: 1, name: '¡Reto completado!' })).toBeVisible();
});

Entonces('ve lo que ya sabe hacer en cada una de las 5 habilidades', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Lo que ya sabes hacer' }).getByRole('listitem')).toHaveCount(5);
});

Entonces('el mapa de aventuras lo ubica en el mundo {string}', async ({ page }, nombre: string) => {
  await page.getByRole('link', { name: 'Ver mi mapa' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`: ${nombre}$`) })).toContainText('¡Estás aquí!');
});

Entonces('el mundo {string} aparece como completado', async ({ page }, nombre: string) => {
  await expect(page.getByRole('link', { name: new RegExp(`: ${nombre}$`) })).toContainText('¡Mundo completado!');
});

// ── RN-05 ─────────────────────────────────────────────────────────────────

Cuando('abre sus mundos', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
});

Entonces('le pide primero su reto inicial y no le deja entrar a ningún mundo', async ({ page }) => {
  await expect(page.getByText('Primero, tu reto inicial')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Entrar al mundo/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ir a mi reto' })).toBeVisible();
});

// ── RF-036 ────────────────────────────────────────────────────────────────

Cuando('responde 3 preguntas de su reto y lo pausa', async ({ page }) => {
  await empezarReto(page);
  for (let i = 0; i < 3; i++) await responder(page, []);
  await page.getByRole('button', { name: 'Pausar y seguir después' }).click();
});

Entonces('su inicio le dice que va en la pregunta 4 de 15', async ({ page }) => {
  await expect(page.getByRole('region', { name: '¡Tu reto inicial te espera!' })).toContainText('Vas en la pregunta 4 de 15');
});

Entonces('al continuar, el reto sigue en la pregunta 4', async ({ page }) => {
  await page.getByRole('link', { name: 'Continuar mi reto' }).click();
  await expect(page.getByText('Pregunta 4 de 15')).toBeVisible();
});

// ── RF-037 ────────────────────────────────────────────────────────────────

Dado('un niño de 9 años que terminó su reto inicial sin acertar', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo');
});

Cuando('su docente le asigna un reto de repaso', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  const repaso = page.getByRole('region', { name: 'Reto de repaso' });
  await repaso.getByRole('button', { name: 'Asignar reto de repaso a toda el aula' }).click();
  await expect(repaso.getByText('Reto de repaso asignado a 1 estudiante.')).toBeVisible();
  await salirDelPanel(page);
});

Cuando('el niño lo termina acertando todo', async ({ request, mundo }) => {
  await retoTerminado(request, mundo.aula!, 'Mateo', ['LIT', 'VOC', 'INF', 'CRI', 'ARG']);
});

Entonces('la docente ve que avanzó en comprensión literal', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  const fila = page.getByRole('region', { name: 'Reto de repaso' }).getByRole('listitem').filter({ hasText: 'Mateo' });
  await expect(fila).toContainText('Repaso: Terminado');
  await expect(fila.getByLabel('Cambios de Mateo desde el reto inicial')).toContainText('Literal +100');
});
```

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
