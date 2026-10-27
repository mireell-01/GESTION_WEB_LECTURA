<!-- Generado con node docs/pruebas/construir.mjs desde 06-lectura-plan-de-pruebas.plantilla.md. No editar a mano. -->
# Plan Maestro de Pruebas — Módulo 6: Lectura interactiva

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/lectura` + la lectura del estudiante (`/estudiante/lecturas/{id}`) y la revisión de respuestas abiertas en el panel docente
> **Requisitos cubiertos:** RF-038 a RF-051, RN-06 (pistas), RN-07 (puntaje del ítem), RN-12 (repetición), RN-14 (versión inmutable), RN-17, RN-19, RF-027 (sesión atada a su versión), RF-032 (avance de misiones), UAT-02, UAT-03, RNF-002, RNF-019, RNF-022, RNF-023 y los eventos `SesionLecturaIniciada`, `ItemRespondido`, `SesionLecturaFinalizada` y `RespuestaAbiertaValorada` del SAD §6
> **Fecha de ejecución:** 22/10/2026 · **Resultado global:** ✅ 655 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 5 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 6 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 375 | 39 | ✅ 375/375 · cobertura 97,4 % líneas / 92,8 % ramas | 68 s |
| 2 · Integración (Supertest + PostgreSQL real) | 120 | 16 | ✅ 120/120 | 135 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 123 | 18 | ✅ 123/123 en una sola corrida completa contra la compilación de producción | 18,1 min |
| 3 · Carga (RF-040, RNF-002) | 6 mediciones | 6 | ✅ 0 % errores · corrección p95 67 ms · reanudar p95 26 ms | 3 s |
| 4 · Aceptación (Gherkin en español) | 37 escenarios | 5 | ✅ 37/37 · informe para el Product Owner | 5,7 min |

**Defectos encontrados por las pruebas y corregidos:** 7 · **Brechas con el SRS cerradas:** 16 · **Decisiones documentadas donde el SRS no decía cómo:** 9 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `lectura` (6 tablas, SRS §7) · migración `20261023000000_lectura_sesiones` |
| Voz | Web Speech API del navegador: síntesis (RF-050) y reconocimiento (RF-049); sin servicios externos ni audio en el servidor |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  SesionesLecturaController (/sesiones-lectura/*; ESTUDIANTE) · RespuestasAbiertasController
           (/aulas/{id}/respuestas-abiertas; DOCENTE) · ValoracionesController (/respuestas/{id}/valoracion; DOCENTE)
   │  usa CasosUsoLectura (token CASOS_USO_LECTURA)
   ▼
application SesionesUseCase (iniciar o reanudar, ver, predecir, responder, pedir pista, decidir, finalizar)
           RevisionUseCase (respuestas abiertas del aula, valorar con la rúbrica)
   │  puertos: SesionRepository, ContenidoLecturas (Contenido), IdentidadEstudiantes (IAM),
   │           EscuelaLectura (Escuela), BusEventos
   ▼
domain     SesionLectura (INICIADA → EN_CURSO → FINALIZADA, ABANDONADA a los 7 días) · Guion (orden de pasos y
           texto visible) · corrección por modalidad · política de pistas (RN-06, RN-07) · filtro de palabras

infrastructure PrismaSesionRepository · ContenidoLecturasContenido (versiones en memoria, RN-14)
               IdentidadEstudiantesIam · EscuelaLecturaEscuela · AvanceLecturasRegistro (shared-kernel)

Otros módulos (solo por su public-api o por el shared-kernel):
  Contenido ───── ContenidoFacade (nueva): la versión publicada con sus claves, solo para el servidor
  IAM ─────────── alias, avatar y rango de edad (IamFacade)
  Escuela ─────── aulas, asignaciones y acceso del docente (EscuelaFacade, RN-17)
  Aventura ────── escucha SesionLecturaIniciada/Finalizada y consulta AVANCE_LECTURAS (RF-032)
  Progreso ────── (Módulo 7) recalculará la maestría con ItemRespondido y RespuestaAbiertaValorada
  Gamificación ── (Módulo 8) otorgará puntos e insignias con los mismos eventos
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `SesionRepository` | Interna (puerto) | `SesionesEnMemoria` (`test/unit/lectura/dobles.ts`): la misma restricción única que la base | **Real**: Prisma + PostgreSQL |
| `ContenidoLecturas` (Contenido) | Anticorrupción | `ContenidoFalso` con una lectura de cada modalidad | **Real**: `ContenidoFacade` con lecturas publicadas por el flujo editora → revisora |
| `IdentidadEstudiantes` (IAM) | Anticorrupción | `IdentidadFalsa` | **Real**: `IamFacade` |
| `EscuelaLectura` (Escuela) | Anticorrupción | `EscuelaFalsa` | **Real**: `EscuelaFacade` (aulas, asignaciones, RN-17) |
| `BusEventos` + Outbox | Interna | `BusEspia` | **Real**: `admin.outbox_evento` |
| Reloj y generador de ids | Inyectados | Controlables (abandono a los 7 días) | Reales (UUID v7) |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | Quedaba el andamiaje de ejemplo del módulo (`POST /lectura/demo`) y un escenario k6 (`tests/load/scenarios/lectura.js`) que lo llamaba | Auditoría del módulo | Eliminados; el escenario nuevo `lectura-respuestas.js` mide la lectura real |
| D-2 | En la lectura, cada oración salía en una caja con una palabra por línea: la clase `.oracion` ya la usaba el editor de oraciones del Módulo 3 | 3 · capturas de Playwright | Las clases de la lectura pasan a `lectura-oracion`; el editor del Módulo 3 no cambia |
| D-3 | El tipo web de "Misión del docente" no tenía `contenidoId`, aunque la API ya lo enviaba | Estático · `tsc` | Se agregó al tipo; el niño abre la lectura asignada desde su inicio |
| D-4 | El doble del repositorio dejaba crear dos sesiones si llegaban dos pedidos a la vez (comprobaba y escribía con un `await` en medio) | 1 · Vitest | Comprueba y escribe sin ceder el turno, como el índice único parcial de la base |
| D-5 | La prueba de arrastrar fallaba solo en el celular: la última tarjeta quedaba bajo la barra inferior | 3 · Playwright (celular) | La prueba desplaza la lista a la vista antes de arrastrar, como haría el niño; la pantalla no cambió |
| D-6 | La prueba de biblioteca del Módulo 3 esperaba el aviso "¡Muy pronto podrás responder sus actividades…!" | 3 · `biblioteca.spec.ts` | Cambio esperado: ahora hay un botón "¡Leer ahora!"; la prueba lo verifica |
| D-7 | Una prueba de integración leía el mensaje de error en `message`, pero la API responde Problem Details (`detail`) | 2 · Supertest | Se lee `detail` |

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-038 | Predicción antes del texto | Portada con título e imagen; el texto no llega hasta registrar la predicción (escrita, dictada o elegida) | U + I + S + UAT |
| B-2 | RF-039 | Preguntas en las oraciones de anclaje | El servidor envía el texto solo hasta la oración de anclaje; no se responde otra pregunta | U + I + S |
| B-3 | RF-040 | Corrección en el servidor | Selección única y **múltiple** (también en el editor del Módulo 3); la clave nunca sale; p95 67 ms | U + I + S + carga |
| B-4 | RF-041 | Escritura libre con filtro | Hasta 500 caracteres, mínimo de palabras del autor y filtro de palabras no apropiadas | U + I + S |
| B-5 | RF-042 | Ordenar imágenes o secuencias | Arrastrar con dedo o ratón (Pointer Events) y botones Subir/Bajar; orden mostrado mezclado | U + I + S |
| B-6 | RF-043 | Encuentra la evidencia | Las oraciones del texto se tocan; correcta con ≥ 1 de la clave y ≤ 1 ajena (UAT-03) | U + I + S + UAT |
| B-7 | RF-044 | Defiende tu respuesta | Paso obligatorio del guion, asociado a la respuesta original | U + I + S |
| B-8 | RF-045, RN-06 | Pistas progresivas | P1 → P2 → P3 → explicación; también a pedido; párrafo resaltado (UAT-02, UAT-03) | U + I + S + UAT |
| B-9 | RN-07 | Puntaje del ítem | 1 · 0,75 · 0,5 · 0,25 · 0 guardado en la respuesta y publicado en `ItemRespondido` | U + I + S + UAT |
| B-10 | RF-046 | Guardado y reanudación | Cada acción se guarda; al volver sigue igual; envío idempotente | U + I + S |
| B-11 | RF-047 | Cierre | Predicción frente al desenlace (o el final elegido) y reflexión | U + I + S + UAT |
| B-12 | RF-048 | Historias ramificadas | Decisiones registradas en `decision_ruta`; definen el nodo siguiente | U + I + S |
| B-13 | RF-049 | Responder por voz | Dictado del navegador; el niño confirma el texto; el audio no se envía | S |
| B-14 | RF-050 | Lectura en voz alta (R1) | Oración por oración con resaltado sincronizado; Despacio 0,75×, Normal, Rápido 1,25× | S |
| B-15 | RF-051, RN-19 | Revisión docente | Respuestas abiertas del aula con rúbrica de 3 niveles; evento para Progreso | U + I + S + UAT |
| B-16 | RF-032, RF-018 | La lectura no se podía abrir | Enlaces desde las misiones del mapa, la biblioteca y la misión del docente; Aventura recibe el avance | I + S + UAT |

**Decisiones de diseño (el SRS no decía cómo):**
- **Guion:** predicción (la primera actividad PREDICCION o, si no hay, "Mira el título y la imagen…") → lo "antes" sin texto → lo "durante" en el orden de sus oraciones de anclaje → la historia ramificada → lo "después" → el cierre.
- **Pistas:** llegan solas con cada error y también se pueden pedir; con menos de 3 pistas escritas, la explicación llega antes. El párrafo se resalta desde P1 en la evidencia (UAT-03) y desde P2 en las demás (RN-06).
- **Idempotencia:** cada envío lleva su clave; repetir el mismo envío devuelve el mismo resultado.
- **Ordenar:** la lista se mezcla de forma estable por sesión e ítem y nunca viene ya ordenada; el niño responde con posiciones, así la página no revela el orden.
- **Defensa:** se asocia a la pregunta anterior que no es una defensa.
- **Abiertas:** quedan ENVIADA; al terminar la lectura pasan a revisión si el niño tiene docente (RN-19).
- **Abandono:** se aplica al volver a la sesión (7 días sin actividad); entonces se puede empezar otra.
- **Voz en el navegador:** el resaltado por oración (RF-050) se logra con síntesis de voz frase por frase; un audio grabado no trae los tiempos de cada oración. Por eso no se agregó `GET /lecturas/{versionId}/audio`.
- **Versiones en memoria:** una versión publicada no cambia (RN-14); se guarda en memoria para corregir rápido.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Dictado sin navegador compatible | Algunos navegadores no reconocen voz | Respaldo en servidor (SRS V1.1, Sprint 13) sin guardar audio; hoy se escribe |
| Puntos, rachas e insignias (RN-11, UAT-02, UAT-03) | El niño aún no ve puntos | Módulo 8 con los eventos `ItemRespondido` y `SesionLecturaFinalizada` — ✅ resuelto: UAT-02 y UAT-03 verifican ahora los 6 puntos y el avance de "Detective de Evidencias" |
| Maestría (RF-053) | El puntaje del ítem se guarda pero aún no mueve el perfil | Módulo 7 con `ItemRespondido` y `RespuestaAbiertaValorada` |
| Caché de versiones por instancia | Con varias instancias cada una tiene su copia (no hay riesgo: no cambian) | Redis compartido cuando se escale horizontalmente |
| Dos toques simultáneos en una misma pregunta | La página deshabilita los botones mientras envía | Bloqueo optimista por versión de la respuesta si hiciera falta |
| Heredadas | Outbox no transaccional; límite de tasa en memoria | Ver informes de los Módulos 1 a 5 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Lectura usa Contenido, IAM y Escuela solo por su `public-api` | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Guion, corrección, filtro, pistas, agregado `SesionLectura` y casos de uso con dobles | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real + lectura publicada por el flujo real + eventos en el outbox | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 (voz simulada con `addInitScript`) | Microsoft Edge (local) / Chromium (CI) | La lectura completa en la web real y la rúbrica docente | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/lectura-respuestas.js`) | Binario k6 | RF-040 al corregir y RF-046 al reanudar | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios Gherkin en español, incluidos UAT-02 y UAT-03 del SRS | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/lectura/
│   │   ├── dobles.ts                                  # Repositorio en memoria y lectura de ejemplo
│   │   ├── dominio/dominio-lectura.spec.ts
│   │   └── aplicacion/lectura-casos-de-uso.spec.ts
│   └── integration/lectura/lectura-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/lectura.ts                         # Lectura de ejemplo, lectura por la API y voz simulada
│   │   ├── specs/lectura/lectura.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts            # + la lectura y la revisión docente
│   │   ├── features/lectura/lectura.feature
│   │   └── steps/lectura.steps.ts
│   └── load/
│       ├── sembrar-lectura.mjs                        # Publica la lectura de ejemplo
│       └── scenarios/lectura-respuestas.js            # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Guion:** la predicción va primero; antes → durante (por oración de anclaje) → después; numeración; qué pregunta defiende cada defensa; consigna general sin ítem de predicción; párrafo de cada pista (RN-06); desenlace.
- **Corrección:** selección única y múltiple, ordenar con la lista mezclada (estable y nunca ordenada), evidencia (UAT-03: ≥ 1 de la clave y ≤ 1 ajena), escritura (500 letras, mínimo de palabras, filtro) y dictado.
- **Filtro de palabras:** tildes, mayúsculas, letras repetidas, plurales y sustituciones; no toca "la zorra", "la perra" ni "una concha".
- **Puntaje (RN-07)** y rúbrica (RF-051).
- **Agregado `SesionLectura`:** predicción obligatoria y única; texto hasta el anclaje; no saltar preguntas; P1 → P2 → P3 → explicación sin revelar la respuesta; 0,75 tras una pista; reenvío idempotente; pedir pistas; defensa obligatoria y asociada; cierre con reflexión; abiertas a revisión con docente (y sin docente, enviadas); valoración única; historia ramificada; abandono a los 7 días; cambios para el repositorio.
- **Casos de uso:** iniciar sin texto y con evento para Aventura; reanudar; claves ocultas; `ItemRespondido` solo al cerrar una pregunta y no al reenviar; pedir pista; cierre con evento y repetición; edad y asignación; sesiones ajenas; versión archivada; abandono; pedidos simultáneos; decisión en la historia; revisión docente con RN-17.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/lectura/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
La cobertura incluye ahora el dominio y la aplicación de Lectura (entre 97,7 % y 100 % de líneas por archivo).

## 4.4 Código completo del test unitario
`apps/api/test/unit/lectura/dominio/dominio-lectura.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { SesionLectura } from '../../../../src/modules/lectura/domain/entities/sesion-lectura';
import {
  LecturaIncompletaError,
  PasoFueraDeOrdenError,
  RespuestaInvalidaError,
  SinPistasError,
  TransicionSesionError,
  ValoracionInvalidaError,
} from '../../../../src/modules/lectura/domain/errors/errores-lectura';
import { corregir, evidenciaCorrecta, ordenMostrado } from '../../../../src/modules/lectura/domain/services/correccion';
import { filtrarPalabras, palabrasDe } from '../../../../src/modules/lectura/domain/services/filtro-palabras';
import { CONSIGNA_PREDICCION, Guion } from '../../../../src/modules/lectura/domain/services/guion';
import { puntajeDeRubrica, puntajeItem } from '../../../../src/modules/lectura/domain/services/politica-pistas';
import { lecturaDeEjemplo } from '../dobles';

/** Nivel 1 — Dominio de la lectura interactiva (RF-038 a RF-051, RN-06, RN-07). */
const AHORA = new Date('2026-10-22T15:00:00Z');
let n = 0;
const id = () => `gen-${++n}`;

function sesionNueva(g: Guion) {
  return SesionLectura.iniciar({ id: 'ses-1', estudianteId: 'nino', lecturaId: g.contenido.lecturaId, versionLecturaId: g.contenido.versionId, asignacionId: null, esRepeticion: false, ahora: AHORA });
}

const responder = (s: SesionLectura, g: Guion, itemId: string, entrada: object, clave = id()) => s.responder(g, { itemId, entrada, idempotencyKey: clave, ahora: AHORA, generarId: id });

/** Lleva la sesión hasta la pregunta indicada respondiendo bien lo anterior. */
function hasta(s: SesionLectura, g: Guion, itemId: string) {
  if (s.estado === 'INICIADA') s.predecir(g, { texto: 'Creo que la llama se enfermará' }, AHORA);
  const correctas: Record<string, object> = {
    'it-antes': { indice: 0 },
    'it-sel': { indice: 1 },
    'it-evid': { oraciones: ['o4'] },
    'it-ord': { orden: [0, 1, 2].map((k) => ordenMostrado(3, `${s.id}:it-ord`).indexOf(k)) },
    'it-esc': { texto: 'Porque tenía una espina' },
    'it-def': { indice: 0 },
  };
  for (const p of g.pasos) {
    if (p.item.id === itemId) return;
    if (s.pasoEnPantalla(g)?.item.id === p.item.id) responder(s, g, p.item.id, correctas[p.item.id] as object);
  }
}

describe('Guion de la lectura (RF-038, RF-039)', () => {
  const g = new Guion(lecturaDeEjemplo());

  it('la predicción va primero y sale del ítem PREDICCION; el resto sigue antes → durante (por anclaje) → después', () => {
    expect(g.prediccion).toEqual({ itemId: 'it-pred', enunciado: '¿Qué crees que le pasará a la llama?', opciones: [] });
    expect(g.pasos.map((p) => `${p.fase}:${p.item.id}`)).toEqual(['ANTES:it-antes', 'LECTURA:it-sel', 'LECTURA:it-evid', 'DESPUES:it-ord', 'DESPUES:it-esc', 'DESPUES:it-def']);
    expect(g.pasos.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.paso('it-sel')?.hastaOracion).toBe(3);
    expect(g.paso('it-def')?.defiende?.id).toBe('it-esc'); // RF-044: defiende la pregunta anterior
  });

  it('sin ítem de predicción usa la consigna del título y la imagen; con opciones, se elige', () => {
    const sinPrediccion = lecturaDeEjemplo();
    sinPrediccion.actividades = sinPrediccion.actividades.filter((a) => a.tipo !== 'PREDICCION');
    expect(new Guion(sinPrediccion).prediccion).toEqual({ itemId: null, enunciado: CONSIGNA_PREDICCION, opciones: [] });
    expect(new Guion(lecturaDeEjemplo({ prediccionConOpciones: true })).prediccion.opciones).toEqual(['Se enfermará', 'Viajará']);
  });

  it('RN-06: la evidencia resalta su párrafo desde P1; las demás, el del anclaje desde P2; RF-047: el desenlace', () => {
    expect(g.parrafoDePista(g.paso('it-evid')!, 'P1')).toBe(2);
    expect(g.parrafoDePista(g.paso('it-sel')!, 'P1')).toBeNull();
    expect(g.parrafoDePista(g.paso('it-sel')!, 'P2')).toBe(2);
    expect(g.parrafoDePista(g.paso('it-ord')!, 'P2')).toBeNull();
    expect(g.desenlace(null)).toBe('Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.');
    const h = new Guion(lecturaDeEjemplo({ conHistoria: true }));
    expect(h.desenlace('n-rio')).toBe('En el río, Pancho bebió agua fresca.');
  });
});

describe('Corrección en el servidor (RF-040 a RF-043)', () => {
  const g = new Guion(lecturaDeEjemplo());
  const ctx = { claveOrden: 'ses:it-ord', oracionesValidas: new Set(['o1', 'o2', 'o3', 'o4']) };

  it('selección única y múltiple', () => {
    const sel = g.paso('it-sel')!.item;
    expect(corregir(sel, { indice: 1 }, ctx).esCorrecta).toBe(true);
    expect(corregir(sel, { indice: 0 }, ctx).esCorrecta).toBe(false);
    expect(() => corregir(sel, { indice: 7 }, ctx)).toThrow(RespuestaInvalidaError);
    const multiple = { ...sel, multiple: true, indicesCorrectos: [0, 2] };
    expect(corregir(multiple, { indices: [2, 0] }, ctx)).toMatchObject({ esCorrecta: true, contenido: { indices: [0, 2] } });
    expect(corregir(multiple, { indices: [0] }, ctx).esCorrecta).toBe(false);
    expect(() => corregir(multiple, { indices: [] }, ctx)).toThrow('Elige una o más opciones');
  });

  it('RF-042: el orden mostrado es estable, nunca viene ya ordenado y se responde con sus posiciones', () => {
    for (const clave of ['a', 'b', 'c', 'd', 'e']) {
      const mostrado = ordenMostrado(3, clave);
      expect(mostrado).toEqual(ordenMostrado(3, clave));
      expect(mostrado).not.toEqual([0, 1, 2]);
      expect([...mostrado].sort()).toEqual([0, 1, 2]);
    }
    expect(ordenMostrado(1, 'x')).toEqual([0]);
    const ord = g.paso('it-ord')!.item;
    const mostrado = ordenMostrado(3, ctx.claveOrden);
    const bien = [0, 1, 2].map((k) => mostrado.indexOf(k));
    expect(corregir(ord, { orden: bien }, ctx).esCorrecta).toBe(true);
    expect(corregir(ord, { orden: [...bien].reverse() }, ctx).esCorrecta).toBe(false);
    expect(() => corregir(ord, { orden: [0, 0, 1] }, ctx)).toThrow('Ordena todos los elementos');
  });

  it('RF-043 (UAT-03): correcta con ≥ 1 oración de la clave y ≤ 1 ajena', () => {
    expect(evidenciaCorrecta(['o-013'], ['o-012', 'o-013'])).toBe(true);
    expect(evidenciaCorrecta(['o-002', 'o-020'], ['o-012', 'o-013'])).toBe(false);
    expect(evidenciaCorrecta(['o-012', 'o-002'], ['o-012', 'o-013'])).toBe(true);
    expect(evidenciaCorrecta(['o-012', 'o-002', 'o-020'], ['o-012', 'o-013'])).toBe(false);
    const evid = g.paso('it-evid')!.item;
    expect(() => corregir(evid, { oraciones: [] }, ctx)).toThrow(RespuestaInvalidaError);
    expect(() => corregir(evid, { oraciones: ['o6'] }, ctx)).toThrow('Elige oraciones del texto que estás leyendo');
  });

  it('RF-041: escritura de hasta 500 caracteres, con mínimo de palabras y filtro; RF-049: dictada', () => {
    const esc = g.paso('it-esc')!.item;
    expect(corregir(esc, { texto: '  Porque tenía una espina ' }, ctx)).toEqual({ contenido: { texto: 'Porque tenía una espina', porVoz: false }, esCorrecta: null, filtrado: false });
    expect(() => corregir(esc, { texto: 'Espina' }, ctx)).toThrow('al menos 3 palabras');
    expect(() => corregir(esc, { texto: 'a'.repeat(501) }, ctx)).toThrow('hasta 500');
    expect(() => corregir(esc, { texto: '   ' }, ctx)).toThrow('Escribe tu respuesta');
    expect(corregir(esc, { texto: 'eres un idiota pancho', porVoz: true }, ctx)).toMatchObject({ contenido: { texto: 'eres un ****** pancho', porVoz: true }, filtrado: true });
  });
});

describe('Filtro de palabras (RF-041)', () => {
  it('cubre tildes, mayúsculas, letras repetidas, plurales y sustituciones', () => {
    expect(filtrarPalabras('¡Qué ESTÚPIDO!').texto).toBe('¡Qué ********!');
    expect(filtrarPalabras('idiotaaa').filtrado).toBe(true);
    expect(filtrarPalabras('son unos idiotas').texto).toBe('son unos *******');
    expect(filtrarPalabras('1d10t4').filtrado).toBe(true);
  });

  it('no toca palabras de los cuentos ni partes de otras palabras', () => {
    for (const t of ['La zorra engañó al cuy', 'La perra cuidaba a sus cachorros', 'Encontré una concha en la playa', 'Computadora y disputa']) {
      expect(filtrarPalabras(t)).toEqual({ texto: t, filtrado: false });
    }
    expect(palabrasDe('Killa, la niña de Puno.')).toBe(5);
  });
});

describe('Puntaje del ítem (RN-07) y rúbrica (RF-051)', () => {
  it('1 · 0,75 · 0,5 · 0,25 según las pistas; 0 con la explicación', () => {
    expect([0, 1, 2, 3].map((p) => puntajeItem(p, false))).toEqual([1, 0.75, 0.5, 0.25]);
    expect(puntajeItem(3, true)).toBe(0);
    expect([1, 2, 3].map(puntajeDeRubrica)).toEqual([0.33, 0.67, 1]);
  });
});

describe('SesionLectura', () => {
  const g = new Guion(lecturaDeEjemplo());

  it('RF-038: sin predicción no hay texto ni preguntas; al predecir se abre la lectura (una sola vez)', () => {
    const s = sesionNueva(g);
    expect(s.fase(g)).toBe('PREDICCION');
    expect(s.oracionesVisibles(g)).toEqual([]);
    expect(() => responder(s, g, 'it-antes', { indice: 0 })).toThrow(TransicionSesionError);
    expect(() => s.predecir(g, { texto: '  ' }, AHORA)).toThrow(RespuestaInvalidaError);
    s.predecir(g, { texto: 'Se pondrá triste' }, AHORA);
    expect(s.estado).toBe('EN_CURSO');
    expect(s.prediccion).toBe('Se pondrá triste');
    expect(s.fase(g)).toBe('ANTES');
    expect(s.oracionesVisibles(g)).toEqual([]); // lo "antes" sigue sin texto
    expect(() => s.predecir(g, { texto: 'otra' }, AHORA)).toThrow('Ya contaste');
  });

  it('con opciones, la predicción es la opción elegida', () => {
    const h = new Guion(lecturaDeEjemplo({ prediccionConOpciones: true }));
    const s = sesionNueva(h);
    expect(() => s.predecir(h, { indice: 5 }, AHORA)).toThrow('Elige lo que crees que pasará');
    s.predecir(h, { indice: 1 }, AHORA);
    expect(s.prediccion).toBe('Viajará');
  });

  it('RF-039: el texto llega hasta la oración de anclaje y no se salta la pregunta en pantalla', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    expect(s.fase(g)).toBe('LECTURA');
    expect(s.oracionesVisibles(g).map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(() => responder(s, g, 'it-evid', { oraciones: ['o4'] })).toThrow(PasoFueraDeOrdenError);
    expect(() => responder(s, g, 'no-existe', { indice: 0 })).toThrow('no es parte de esta lectura');
    responder(s, g, 'it-sel', { indice: 1 });
    expect(s.oracionesVisibles(g).map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(() => responder(s, g, 'it-sel', { indice: 1 })).toThrow('Ya respondiste esta pregunta');
  });

  it('RF-045 (UAT-02): P1 → P2 → P3 → explicación; la pista nunca trae la respuesta y el puntaje baja (RN-07)', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    const r1 = responder(s, g, 'it-sel', { indice: 0 });
    expect(r1).toMatchObject({ resultado: 'INCORRECTA', pista: { nivel: 'P1', texto: 'P1 de sel', parrafo: null }, explicacion: null, resuelta: false });
    expect(JSON.stringify(r1.pista)).not.toContain('Le dolía algo');
    expect(responder(s, g, 'it-sel', { indice: 2 }).pista).toEqual({ nivel: 'P2', texto: 'P2 de sel', parrafo: 2 });
    expect(responder(s, g, 'it-sel', { indice: 0 }).pista?.nivel).toBe('P3');
    const fin = responder(s, g, 'it-sel', { indice: 0 });
    expect(fin).toMatchObject({ resultado: 'INCORRECTA', pista: null, explicacion: 'Explicación de it-sel: vuelve al texto.', resuelta: true });
    expect(s.respuestaDe('it-sel')).toMatchObject({ pistasUsadas: 3, puntajeItem: 0, esCorrecta: false });
    expect(s.pasoEnPantalla(g)?.item.id).toBe('it-evid'); // tras la explicación puede seguir
  });

  it('acertar tras una pista vale 0,75', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    responder(s, g, 'it-sel', { indice: 0 });
    expect(responder(s, g, 'it-sel', { indice: 1 })).toMatchObject({ resultado: 'CORRECTA', resuelta: true });
    expect(s.respuestaDe('it-sel')?.puntajeItem).toBe(0.75);
  });

  it('RF-046: reenviar el mismo pedido devuelve el mismo resultado sin volver a corregir', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    const primera = responder(s, g, 'it-sel', { indice: 0 }, 'clave-1');
    const repetida = responder(s, g, 'it-sel', { indice: 0 }, 'clave-1');
    expect(repetida).toMatchObject({ repetido: true, resultado: 'INCORRECTA', pista: primera.pista });
    expect(s.respuestaDe('it-sel')?.pistasUsadas).toBe(1);
    responder(s, g, 'it-sel', { indice: 1 }, 'clave-2');
    expect(responder(s, g, 'it-sel', { indice: 1 }, 'clave-2')).toMatchObject({ repetido: true, resultado: 'CORRECTA' });
  });

  it('RF-045: pedir pista antes de responder, hasta agotarlas; sin pistas, la explicación llega al fallar', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-evid');
    expect(s.pedirPista(g, { itemId: 'it-evid', ahora: AHORA, generarId: id })).toEqual({ nivel: 'P1', texto: 'P1 de evid', parrafo: 2 });
    expect(() => s.pedirPista(g, { itemId: 'it-evid', ahora: AHORA, generarId: id })).toThrow(SinPistasError);
    expect(s.pistasRecibidas(g, g.paso('it-evid')!)).toHaveLength(1);
    // UAT-03: oraciones ajenas → incorrecta; como ya usó su única pista, ve la explicación.
    expect(responder(s, g, 'it-evid', { oraciones: ['o1', 'o2'] })).toMatchObject({ resultado: 'INCORRECTA', explicacion: expect.any(String), resuelta: true });
  });

  it('RF-044: la defensa queda asociada a la respuesta original y no se puede omitir', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-def');
    expect(() => s.finalizar(g, { reflexion: 'Me gustó', ahora: AHORA, conDocente: false })).toThrow(LecturaIncompletaError);
    responder(s, g, 'it-def', { indice: 1 }); // mal: aún no se asocia
    expect(s.respuestaDe('it-esc')?.justificacion).toBeNull();
    responder(s, g, 'it-def', { indice: 0 });
    expect(s.respuestaDe('it-esc')?.justificacion).toMatchObject({ modalidad: 'SELECCION', opcionElegida: { indices: [0], texto: 'Porque lo dice el texto' } });
    expect(s.fase(g)).toBe('CIERRE');
  });

  it('RF-047, RF-051: el cierre pide reflexión; con docente, lo abierto pasa a revisión y se valora una vez', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'fin');
    expect(s.pendientes(g)).toBe(0);
    expect(() => s.finalizar(g, { reflexion: '', ahora: AHORA, conDocente: true })).toThrow(RespuestaInvalidaError);
    s.finalizar(g, { reflexion: 'Pensé que se enfermaba y era una espina', ahora: AHORA, conDocente: true });
    expect(s.estado).toBe('FINALIZADA');
    expect(s.fase(g)).toBe('FINALIZADA');
    expect(s.resumen(g)).toEqual({ preguntas: 6, sinAyuda: 5, conPista: 0, conExplicacion: 0, abiertas: 1 });
    const abierta = s.respuestaDe('it-esc')!;
    expect(abierta.estado).toBe('PENDIENTE_REVISION');
    expect(() => responder(s, g, 'it-esc', { texto: 'otra respuesta más' })).toThrow('Esta lectura ya terminó');

    expect(() => s.valorar({ respuestaId: abierta.id, docenteId: 'doc', nivel: 4, ahora: AHORA })).toThrow(RespuestaInvalidaError);
    expect(() => s.valorar({ respuestaId: s.respuestaDe('it-sel')!.id, docenteId: 'doc', nivel: 3, ahora: AHORA })).toThrow('aún no espera revisión');
    const valorada = s.valorar({ respuestaId: abierta.id, docenteId: 'doc', nivel: 2, comentario: ' Buen inicio ', ahora: AHORA });
    expect(valorada).toMatchObject({ estado: 'VALORADA', puntajeItem: 0.67, valoracion: { nivel: 2, comentario: 'Buen inicio' } });
    expect(() => s.valorar({ respuestaId: abierta.id, docenteId: 'doc', nivel: 3, ahora: AHORA })).toThrow(ValoracionInvalidaError);
    expect(() => s.valorar({ respuestaId: 'otra', docenteId: 'doc', nivel: 3, ahora: AHORA })).toThrow('Respuesta no encontrado');
  });

  it('sin docente, lo abierto queda enviado (RN-19)', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'fin');
    s.finalizar(g, { reflexion: 'Me gustó', ahora: AHORA, conDocente: false });
    expect(s.respuestaDe('it-esc')?.estado).toBe('ENVIADA');
  });

  it('RF-048: la historia ramificada va tras el texto y antes de lo "después"; cada decisión define el nodo siguiente', () => {
    const h = new Guion(lecturaDeEjemplo({ conHistoria: true }));
    const s = sesionNueva(h);
    hasta(s, h, 'it-ord');
    expect(s.fase(h)).toBe('HISTORIA');
    expect(s.pasoEnPantalla(h)).toBeNull();
    expect(() => responder(s, h, 'it-ord', { orden: [0, 1, 2] })).toThrow(PasoFueraDeOrdenError);
    expect(() => s.decidir(h, { nodoId: 'n-rio', opcion: 0, ahora: AHORA, generarId: id })).toThrow('Elige en la parte de la historia');
    expect(() => s.decidir(h, { nodoId: 'n-inicio', opcion: 5, ahora: AHORA, generarId: id })).toThrow('Elige uno de los caminos');
    expect(s.decidir(h, { nodoId: 'n-inicio', opcion: 1, ahora: AHORA, generarId: id }).clave).toBe('cerro');
    expect(s.fase(h)).toBe('HISTORIA');
    s.decidir(h, { nodoId: 'n-cerro', opcion: 0, ahora: AHORA, generarId: id });
    expect(s.nodoActual(h)?.esFinal).toBe(true);
    expect(s.fase(h)).toBe('DESPUES');
    expect(s.decisiones.map((d) => `${d.nodoOrigenId}→${d.nodoDestinoId}`)).toEqual(['n-inicio→n-cerro', 'n-cerro→n-casa']);
    expect(s.cambios().decisiones).toHaveLength(2);
    expect(() => s.decidir(h, { nodoId: 'n-casa', opcion: 0, ahora: AHORA, generarId: id })).toThrow('Todavía no es momento');
  });

  it('SRS §3.6: tras 7 días sin actividad queda ABANDONADA y ya no admite respuestas', () => {
    const s = sesionNueva(g);
    s.predecir(g, { texto: 'Algo pasará' }, AHORA);
    expect(s.abandonarSiInactiva(new Date(AHORA.getTime() + 6 * 86_400_000))).toBe(false);
    expect(s.abandonarSiInactiva(new Date(AHORA.getTime() + 7 * 86_400_000))).toBe(true);
    expect(s.fase(g)).toBe('ABANDONADA');
    expect(s.abandonarSiInactiva(new Date(AHORA.getTime() + 8 * 86_400_000))).toBe(false);
    expect(() => responder(s, g, 'it-antes', { indice: 0 })).toThrow('se cerró por falta de actividad');
    expect(() => s.predecir(g, { texto: 'x' }, AHORA)).toThrow(TransicionSesionError);
  });

  it('los cambios se informan al repositorio y se limpian al confirmar', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-evid');
    expect(s.cambios().respuestas.map((r) => r.itemId)).toEqual(['it-antes', 'it-sel']);
    s.confirmarCambios();
    expect(s.cambios()).toEqual({ respuestas: [], decisiones: [] });
    const copia = SesionLectura.desdePersistencia(structuredClone(s.propsSnapshot) as SesionLectura['propsSnapshot']);
    expect(copia.respuestaDe('it-sel')?.esCorrecta).toBe(true);
  });
});
```

`apps/api/test/unit/lectura/aplicacion/lectura-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { ordenMostrado } from '../../../../src/modules/lectura/domain/services/correccion';
import { EVENTOS_INTEGRACION, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoLectura, EntornoLectura, lecturaDeEjemplo } from '../dobles';

/** Nivel 1 — Casos de uso de Lectura con dobles (RF-038 a RF-051, RN-17, RN-19). */
const NINO = 'nino-9';
const DOCENTE = 'docente';
const LECTURA = 'lectura-killa';

describe('Lectura interactiva: sesión del estudiante y revisión docente', () => {
  let e: EntornoLectura;

  beforeEach(() => {
    e = crearEntornoLectura();
    e.identidad.agregar(NINO, 'Mateo', 'R2');
    e.contenido.publicar(lecturaDeEjemplo());
  });

  let clave = 0;
  const responder = (sesionId: string, itemId: string, entrada: object) => e.sesiones.responder(NINO, sesionId, { itemId, idempotencyKey: `k-${++clave}`, ...entrada });

  /** Lee toda la lectura respondiendo bien; devuelve la sesión terminada. */
  const leerTodo = async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'La llama se enfermará' });
    const bien: Record<string, object> = {
      'it-antes': { indice: 0 },
      'it-sel': { indice: 1 },
      'it-evid': { oraciones: ['o4'] },
      'it-ord': { orden: [0, 1, 2].map((k) => ordenMostrado(3, `${s.id}:it-ord`).indexOf(k)) },
      'it-esc': { texto: 'Porque tenía una espina en la pata' },
      'it-def': { indice: 0 },
    };
    for (;;) {
      const v = await e.sesiones.ver(NINO, s.id);
      if (!v.pregunta) break;
      await responder(s.id, v.pregunta.itemId, bien[v.pregunta.itemId] as object);
    }
    return e.sesiones.finalizar(NINO, s.id, 'Pensé que se enfermaba, pero era una espina');
  };

  it('RF-038: abre la lectura en la predicción, sin texto, y avisa a Aventura (SesionLecturaIniciada)', async () => {
    const v = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(v).toMatchObject({ fase: 'PREDICCION', estado: 'INICIADA', pregunta: null, texto: { parrafos: [], completo: false } });
    expect(v.lectura).toEqual({ titulo: 'Killa y la llama', rangoEdad: 'R2', imagen: expect.any(Object), leerEnVozAlta: false });
    expect(e.bus.publicados[0]).toMatchObject({ nombreEvento: EVENTOS_INTEGRACION.SESION_LECTURA_INICIADA, datos: { estudianteId: NINO, lecturaId: LECTURA, esRepeticion: false } });
  });

  it('RF-046: al volver reanuda la misma sesión, en la misma pregunta y con sus pistas', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'Algo le pasará' });
    await responder(s.id, 'it-antes', { indice: 0 });
    await responder(s.id, 'it-sel', { indice: 0 });
    const otra = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(otra.id).toBe(s.id);
    expect(otra.pregunta).toMatchObject({ itemId: 'it-sel', numero: 2, total: 6, pistas: [{ nivel: 'P1' }], pistasRestantes: 2 });
    expect(otra.texto.parrafos.flatMap((p) => p.oraciones.map((o) => o.id))).toEqual(['o1', 'o2', 'o3']);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_INTEGRACION.SESION_LECTURA_INICIADA)).toHaveLength(1);
  });

  it('la pregunta nunca lleva su clave; el orden llega mezclado', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    await responder(s.id, 'it-antes', { indice: 0 });
    await responder(s.id, 'it-sel', { indice: 1 });
    const v = await responder(s.id, 'it-evid', { oraciones: ['o3'] });
    const pregunta = v.sesion.pregunta!;
    expect(pregunta.itemId).toBe('it-ord');
    expect(pregunta.elementos).not.toEqual(['No quiso comer', 'Vio la espina', 'Le quitó la espina']);
    expect(JSON.stringify(v.sesion)).not.toMatch(/indicesCorrectos|clavesEvidencia|explicacion/);
  });

  it('RF-053: publica ItemRespondido al cerrar cada pregunta (no tras un error con pista ni al reenviar)', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    await responder(s.id, 'it-antes', { indice: 0 });
    const mal = await responder(s.id, 'it-sel', { indice: 0 });
    expect(mal).toMatchObject({ resultado: 'INCORRECTA', pista: { nivel: 'P1' } });
    const items = () => e.bus.publicados.filter((x) => x.nombreEvento === EVENTOS_INTEGRACION.ITEM_RESPONDIDO);
    expect(items()).toHaveLength(1);
    const k = 'misma-clave';
    await e.sesiones.responder(NINO, s.id, { itemId: 'it-sel', idempotencyKey: k, indice: 1 });
    await e.sesiones.responder(NINO, s.id, { itemId: 'it-sel', idempotencyKey: k, indice: 1 });
    expect(items()).toHaveLength(2);
    expect(items()[1]?.datos).toMatchObject({ itemId: 'it-sel', habilidad: 'INF', nivelDificultad: 3, esCorrecta: true, pistasUsadas: 1, puntajeItem: 0.75, palabras: null });
  });

  it('RF-045: pedir una pista guarda su uso y devuelve la pregunta con la pista', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    const r = await e.sesiones.pedirPista(NINO, s.id, 'it-antes');
    expect(r.pista).toMatchObject({ nivel: 'P1', texto: 'P1 de antes' });
    expect(r.sesion.pregunta).toMatchObject({ pistas: [{ nivel: 'P1' }], pistasRestantes: 0 });
  });

  it('RF-047: al terminar contrasta predicción y desenlace, publica SesionLecturaFinalizada y la próxima es repetición', async () => {
    e.escuela.aulas.set('aula-1', { docenteId: DOCENTE, nombre: '4.° A', estudiantes: [NINO] });
    const fin = await leerTodo();
    expect(fin).toMatchObject({ fase: 'FINALIZADA', estado: 'FINALIZADA', filtrado: false, reflexion: 'Pensé que se enfermaba, pero era una espina' });
    expect(fin.cierre).toEqual({
      prediccion: 'La llama se enfermará',
      desenlace: 'Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.',
      pregunta: expect.stringContaining('Se parece'),
    });
    expect(fin.resumen).toEqual({ preguntas: 6, sinAyuda: 5, conPista: 0, conExplicacion: 0, abiertas: 1 });
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA, datos: { lecturaId: LECTURA, esRepeticion: false, preguntas: 6 } });
    expect(await e.repo.avanceDe(NINO, [LECTURA], new Date(0))).toEqual(new Map([[LECTURA, 'FINALIZADA']]));

    const otra = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(otra.id).not.toBe(fin.id);
    expect(e.bus.publicados.at(-1)?.datos).toMatchObject({ esRepeticion: true });
  });

  it('una lectura de otra edad o no publicada no existe para el niño, salvo que su docente se la asigne', async () => {
    e.contenido.publicar(lecturaDeEjemplo({ lecturaId: 'lectura-r3', versionId: 'v-r3', rangoEdad: 'R3' }));
    await expect(e.sesiones.iniciar(NINO, { lecturaId: 'lectura-r3' })).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.sesiones.iniciar(NINO, { lecturaId: 'lectura-r3', asignacionId: 'asig-otra' })).rejects.toBeInstanceOf(NoEncontradoError);
    e.escuela.asignaciones.push({ estudianteId: NINO, asignacionId: 'asig-1', lecturaId: 'lectura-r3' });
    const v = await e.sesiones.iniciar(NINO, { lecturaId: 'lectura-r3', asignacionId: 'asig-1' });
    expect(e.repo.filas.get(v.id)?.asignacionId).toBe('asig-1');
    await expect(e.sesiones.iniciar(NINO, { lecturaId: 'no-existe' })).rejects.toBeInstanceOf(NoEncontradoError);
    e.identidad.agregar('inactivo', 'Lía', 'R2', false);
    await expect(e.sesiones.iniciar('inactivo', { lecturaId: LECTURA })).rejects.toThrow('Estudiante no encontrado');
  });

  it('la sesión de otro niño responde como si no existiera', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await expect(e.sesiones.ver('otro-nino', s.id)).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.sesiones.ver(NINO, 'no-existe')).rejects.toBeInstanceOf(NoEncontradoError);
  });

  it('RF-027: la sesión sigue con su versión aunque luego se archive la lectura', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    e.contenido.archivar(LECTURA);
    expect((await e.sesiones.predecir(NINO, s.id, { texto: 'x' })).fase).toBe('ANTES');
    e.contenido.versiones.clear();
    await expect(e.sesiones.ver(NINO, s.id)).rejects.toBeInstanceOf(NoEncontradoError);
  });

  it('tras 7 días sin actividad la sesión se abandona y empezar abre una nueva', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    e.reloj.avanzarMin(7 * 24 * 60);
    expect((await e.sesiones.ver(NINO, s.id)).fase).toBe('ABANDONADA');
    expect(e.bus.nombres()).toContain('lectura.SesionLecturaAbandonada');
    const nueva = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(nueva.id).not.toBe(s.id);
    expect(nueva.fase).toBe('PREDICCION');
  });

  it('dos pedidos a la vez abren una sola sesión', async () => {
    const [a, b] = await Promise.all([e.sesiones.iniciar(NINO, { lecturaId: LECTURA }), e.sesiones.iniciar(NINO, { lecturaId: LECTURA })]);
    expect(a.id).toBe(b.id);
    expect(e.repo.filas.size).toBe(1);
  });

  it('RF-048: decidir en la historia devuelve el nodo nuevo y su recorrido', async () => {
    e.contenido.publicar(lecturaDeEjemplo({ lecturaId: 'historia', versionId: 'v-historia', conHistoria: true }));
    const s = await e.sesiones.iniciar(NINO, { lecturaId: 'historia' });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    await responder(s.id, 'it-antes', { indice: 0 });
    await responder(s.id, 'it-sel', { indice: 1 });
    const v = await responder(s.id, 'it-evid', { oraciones: ['o4'] });
    expect(v.sesion).toMatchObject({ fase: 'HISTORIA', pregunta: null, historia: { nodo: { id: 'n-inicio', opciones: ['Ir al río', 'Subir al cerro'] }, recorrido: [] } });
    const tras = await e.sesiones.decidir(NINO, s.id, { nodoId: 'n-inicio', opcion: 0 });
    expect(tras).toMatchObject({ fase: 'DESPUES', historia: { nodo: { id: 'n-rio', esFinal: true }, recorrido: [{ eleccion: 'Ir al río' }] }, pregunta: { itemId: 'it-ord' } });
  });

  describe('RF-051: revisión docente (RN-17)', () => {
    beforeEach(() => {
      e.escuela.aulas.set('aula-1', { docenteId: DOCENTE, nombre: '4.° A', estudiantes: [NINO] });
    });

    it('la docente ve las respuestas abiertas de su aula, con la defensa, y las valora una vez', async () => {
      await leerTodo();
      const pendientes = await e.revision.respuestas(DOCENTE, 'aula-1');
      expect(pendientes).toHaveLength(1);
      const r = pendientes[0]!;
      expect(r).toMatchObject({
        estado: 'PENDIENTE_REVISION',
        estudiante: { id: NINO, alias: 'Mateo' },
        lectura: { id: LECTURA, titulo: 'Killa y la llama' },
        pregunta: { habilidad: 'ARG' },
        respuesta: 'Porque tenía una espina en la pata',
        defiende: null,
        justificacion: 'Porque lo dice el texto',
        valoracion: null,
      });
      const valorada = await e.revision.valorar(DOCENTE, r.respuestaId, { nivel: 3, comentario: '¡Muy bien explicado!' });
      expect(valorada).toMatchObject({ estado: 'VALORADA', valoracion: { nivel: 3, comentario: '¡Muy bien explicado!' } });
      expect(e.bus.publicados.at(-1)).toMatchObject({
        nombreEvento: EVENTOS_INTEGRACION.RESPUESTA_ABIERTA_VALORADA,
        datos: { estudianteId: NINO, habilidad: 'ARG', nivel: 3, puntajeItem: 1, docenteId: DOCENTE },
      });
      expect(await e.revision.respuestas(DOCENTE, 'aula-1')).toEqual([]);
      expect(await e.revision.respuestas(DOCENTE, 'aula-1', 'VALORADA')).toHaveLength(1);
      await expect(e.revision.valorar(DOCENTE, r.respuestaId, { nivel: 2 })).rejects.toThrow('ya fue valorada');
    });

    it('otra docente no ve el aula ni puede valorar sus respuestas', async () => {
      await leerTodo();
      const [r] = await e.revision.respuestas(DOCENTE, 'aula-1');
      await expect(e.revision.respuestas('otra-docente', 'aula-1')).rejects.toThrow('Aula no encontrado');
      await expect(e.revision.valorar('otra-docente', r!.respuestaId, { nivel: 3 })).rejects.toBeInstanceOf(NoEncontradoError);
      await expect(e.revision.valorar(DOCENTE, 'no-existe', { nivel: 3 })).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('un aula sin estudiantes no tiene nada que revisar', async () => {
      e.escuela.aulas.set('aula-vacia', { docenteId: DOCENTE, nombre: 'Vacía', estudiantes: [] });
      expect(await e.revision.respuestas(DOCENTE, 'aula-vacia')).toEqual([]);
    });
  });

  describe('RF-064 (Módulo 9): historial para el detalle docente', () => {
    it('las sesiones más recientes primero, con lo que respondió, sus evidencias y sus pistas', async () => {
      const s1 = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
      await e.sesiones.predecir(NINO, s1.id, { texto: 'La llama se enfermará' });
      await responder(s1.id, 'it-antes', { indice: 0 });
      await responder(s1.id, 'it-sel', { indice: 0 }); // error: P1
      await responder(s1.id, 'it-sel', { indice: 1 });
      await responder(s1.id, 'it-evid', { oraciones: ['o4'] });
      await responder(s1.id, 'it-ord', { orden: [0, 1, 2].map((k) => ordenMostrado(3, `${s1.id}:it-ord`).indexOf(k)) });
      await responder(s1.id, 'it-esc', { texto: 'Porque tenía una espina en la pata' });
      await responder(s1.id, 'it-def', { indice: 0 });
      await e.sesiones.finalizar(NINO, s1.id, 'Era una espina');

      // La repite y, en la inferencia, se equivoca hasta ver la explicación (RF-045).
      e.reloj.avanzarMin(1);
      const s2 = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
      await e.sesiones.predecir(NINO, s2.id, { texto: 'Otra vez' });
      await responder(s2.id, 'it-antes', { indice: 0 });
      for (let i = 0; i < 5; i++) if ((await responder(s2.id, 'it-sel', { indice: 0 })).explicacion) break;

      const h = await e.historial.historialDe(NINO, 20);
      expect(h.map((x) => [x.sesionId, x.estado, x.esRepeticion, x.titulo])).toEqual([[s2.id, 'EN_CURSO', true, 'Killa y la llama'], [s1.id, 'FINALIZADA', false, 'Killa y la llama']]);
      expect(h[1]!.respuestas.map((r) => [r.itemId, r.esCorrecta, r.pistasUsadas, r.respuesta])).toEqual([
        ['it-antes', true, 0, 'Un animal'],
        ['it-sel', true, 1, 'Le dolía algo'],
        ['it-evid', true, 0, 'Killa vio que tenía una espina en la pata.'],
        ['it-ord', true, 0, 'No quiso comer → Vio la espina → Le quitó la espina'],
        ['it-esc', null, 0, 'Porque tenía una espina en la pata'],
        ['it-def', true, 0, 'Porque lo dice el texto'],
      ]);
      expect(h[1]!.respuestas[1]!.pistas).toEqual([{ nivel: 'P1', texto: 'P1 de sel' }]);
      expect(h[1]!.respuestas[2]!.evidencias).toEqual(['Killa vio que tenía una espina en la pata.']);
      expect(h[0]!.respuestas.find((r) => r.itemId === 'it-sel')!.pistas.at(-1)).toEqual({ nivel: 'EXPLICACION', texto: 'Explicación de it-sel: vuelve al texto.' });
      expect(JSON.stringify(h)).not.toMatch(/indicesCorrectos|clavesEvidencia/);
      expect(await e.historial.historialDe(NINO, 1)).toHaveLength(1);
      expect(await e.historial.historialDe('otro-nino', 20)).toEqual([]);
    });
  });
});
```

`apps/api/test/unit/lectura/dobles.ts`:

```ts
/**
 * Dobles de prueba de Lectura: repositorio en memoria con la misma restricción única que la base
 * (una sesión sin terminar por estudiante y lectura), una lectura de ejemplo con todas las
 * modalidades (antes, durante con anclajes, después, defensa e historia ramificada) e IAM, Escuela y
 * Contenido simulados.
 */
import type { RangoEdad } from '../../../src/modules/shared-kernel/public-api';
import type { ContenidoLecturas, EscuelaLectura, IdentidadEstudiantes, SesionRepository } from '../../../src/modules/lectura/application/ports/lectura.ports';
import { HistorialUseCase } from '../../../src/modules/lectura/application/use-cases/historial.use-case';
import { RevisionUseCase } from '../../../src/modules/lectura/application/use-cases/revision.use-case';
import { SesionesUseCase } from '../../../src/modules/lectura/application/use-cases/sesiones.use-case';
import { EstadoRespuesta, SesionLectura } from '../../../src/modules/lectura/domain/entities/sesion-lectura';
import type { ActividadLectura, ContenidoLectura, ItemLectura, NodoLectura } from '../../../src/modules/lectura/domain/value-objects/contenido-lectura';
import { BusEspia, Reloj } from '../iam/dobles';

const copiar = (s: SesionLectura) => SesionLectura.desdePersistencia(structuredClone(s.propsSnapshot) as SesionLectura['propsSnapshot']);

export class SesionesEnMemoria implements SesionRepository {
  readonly filas = new Map<string, SesionLectura>();
  guardados = 0;

  async buscar(id: string) {
    const s = this.filas.get(id);
    return s ? copiar(s) : null;
  }
  async buscarPorRespuesta(respuestaId: string) {
    const s = [...this.filas.values()].find((x) => x.respuestas.some((r) => r.id === respuestaId));
    return s ? copiar(s) : null;
  }
  private activa(estudianteId: string, lecturaId: string) {
    return [...this.filas.values()].find((x) => x.estudianteId === estudianteId && x.lecturaId === lecturaId && (x.estado === 'INICIADA' || x.estado === 'EN_CURSO'));
  }
  async activaDe(estudianteId: string, lecturaId: string) {
    const s = this.activa(estudianteId, lecturaId);
    return s ? copiar(s) : null;
  }
  /** Comprobar y escribir sin ceder el turno, como el índice único parcial de la base. */
  async crear(s: SesionLectura) {
    if (this.activa(s.estudianteId, s.lecturaId)) return false;
    this.filas.set(s.id, copiar(s));
    return true;
  }
  async guardar(s: SesionLectura) {
    if (!this.filas.has(s.id)) throw new Error('No existe');
    this.guardados += 1;
    s.confirmarCambios();
    this.filas.set(s.id, copiar(s));
  }
  async tieneFinalizada(estudianteId: string, lecturaId: string) {
    return [...this.filas.values()].some((x) => x.estudianteId === estudianteId && x.lecturaId === lecturaId && x.estado === 'FINALIZADA');
  }
  async avanceDe(estudianteId: string, lecturaIds: string[], activaDesde: Date) {
    const avance = new Map<string, 'EN_CURSO' | 'FINALIZADA'>();
    for (const s of this.filas.values()) {
      if (s.estudianteId !== estudianteId || !lecturaIds.includes(s.lecturaId)) continue;
      if (s.estado === 'FINALIZADA') avance.set(s.lecturaId, 'FINALIZADA');
      else if ((s.estado === 'INICIADA' || s.estado === 'EN_CURSO') && s.ultimaActividadEn >= activaDesde && !avance.has(s.lecturaId)) avance.set(s.lecturaId, 'EN_CURSO');
    }
    return avance;
  }
  /** RF-064 (Módulo 9): las últimas sesiones del estudiante, de la más reciente a la más antigua. */
  async ultimasDe(estudianteId: string, limite: number) {
    return [...this.filas.values()]
      .filter((s) => s.estudianteId === estudianteId)
      .sort((a, b) => b.propsSnapshot.iniciadaEn.getTime() - a.propsSnapshot.iniciadaEn.getTime())
      .slice(0, limite)
      .map(copiar);
  }
  async conRespuestasAbiertas(estudianteIds: string[], estado: EstadoRespuesta) {
    return [...this.filas.values()].filter((s) => estudianteIds.includes(s.estudianteId) && s.respuestas.some((r) => r.estado === estado)).map(copiar);
  }
}

const item = (p: Partial<ItemLectura> & Pick<ItemLectura, 'id' | 'modalidad' | 'habilidad'>): ItemLectura => ({
  orden: 1,
  nivelDificultad: 2,
  esCerrado: p.modalidad === 'SELECCION' || p.modalidad === 'ORDENAMIENTO' || p.modalidad === 'EVIDENCIA',
  enunciado: `Pregunta ${p.id}`,
  opciones: [],
  indicesCorrectos: [],
  multiple: false,
  elementos: [],
  minPalabras: null,
  explicacionModelada: `Explicación de ${p.id}: vuelve al texto.`,
  pistas: [],
  clavesEvidencia: [],
  ...p,
});

const pistas = (n: number, id: string) => (['P1', 'P2', 'P3'] as const).slice(0, n).map((nivel) => ({ nivel, texto: `${nivel} de ${id}` }));

/** "Killa y la llama": 3 párrafos, 6 oraciones; o1–o2 · o3–o4 · o5–o6. */
export const ORACIONES = [
  { id: 'o1', orden: 1, parrafo: 1, texto: 'Killa vivía en Puno.' },
  { id: 'o2', orden: 2, parrafo: 1, texto: 'Cada mañana cuidaba a su llama Pancho.' },
  { id: 'o3', orden: 3, parrafo: 2, texto: 'Un día Pancho no quiso comer.' },
  { id: 'o4', orden: 4, parrafo: 2, texto: 'Killa vio que tenía una espina en la pata.' },
  { id: 'o5', orden: 5, parrafo: 3, texto: 'Con cuidado le quitó la espina.' },
  { id: 'o6', orden: 6, parrafo: 3, texto: 'Pancho comió feliz y Killa sonrió.' },
];

/**
 * La lectura de ejemplo. Orden del guion: predicción (escrita) → [antes] elegir → [durante, en o3]
 * selección con 3 pistas → [durante, en o4] evidencia → [después] ordenar → [después] escribir (ARG) →
 * [después] defender lo escrito eligiendo la mejor justificación.
 */
export function lecturaDeEjemplo(p: { lecturaId?: string; versionId?: string; rangoEdad?: RangoEdad; conHistoria?: boolean; prediccionConOpciones?: boolean } = {}): ContenidoLectura {
  const actividades: ActividadLectura[] = [
    {
      id: 'a-pred', momento: 'ANTES', tipo: 'PREDICCION', orden: 1, oracionAnclajeId: null,
      items: [p.prediccionConOpciones
        ? item({ id: 'it-pred', modalidad: 'SELECCION', habilidad: 'INF', enunciado: '¿Qué crees que le pasará a la llama?', opciones: ['Se enfermará', 'Viajará'], indicesCorrectos: [0], pistas: pistas(1, 'pred') })
        : item({ id: 'it-pred', modalidad: 'ESCRITURA', habilidad: 'INF', enunciado: '¿Qué crees que le pasará a la llama?' })],
    },
    { id: 'a-antes', momento: 'ANTES', tipo: 'SELECCION', orden: 2, oracionAnclajeId: null, items: [item({ id: 'it-antes', modalidad: 'SELECCION', habilidad: 'VOC', opciones: ['Un animal', 'Una planta'], indicesCorrectos: [0], pistas: pistas(1, 'antes') })] },
    // Durante, a propósito fuera de orden: el guion las ordena por la oración de anclaje.
    { id: 'a-evid', momento: 'DURANTE', tipo: 'EVIDENCIA', orden: 4, oracionAnclajeId: 'o4', items: [item({ id: 'it-evid', modalidad: 'EVIDENCIA', habilidad: 'LIT', clavesEvidencia: ['o3', 'o4'], pistas: pistas(1, 'evid') })] },
    { id: 'a-sel', momento: 'DURANTE', tipo: 'SELECCION', orden: 3, oracionAnclajeId: 'o3', items: [item({ id: 'it-sel', modalidad: 'SELECCION', habilidad: 'INF', nivelDificultad: 3, opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indicesCorrectos: [1], pistas: pistas(3, 'sel') })] },
    { id: 'a-ord', momento: 'DESPUES', tipo: 'ORDENAMIENTO', orden: 5, oracionAnclajeId: null, items: [item({ id: 'it-ord', modalidad: 'ORDENAMIENTO', habilidad: 'LIT', elementos: ['No quiso comer', 'Vio la espina', 'Le quitó la espina'], pistas: pistas(2, 'ord') })] },
    { id: 'a-esc', momento: 'DESPUES', tipo: 'ESCRITURA', orden: 6, oracionAnclajeId: null, items: [item({ id: 'it-esc', modalidad: 'ESCRITURA', habilidad: 'ARG', minPalabras: 3 })] },
    { id: 'a-def', momento: 'DESPUES', tipo: 'DEFIENDE', orden: 7, oracionAnclajeId: null, items: [item({ id: 'it-def', modalidad: 'SELECCION', habilidad: 'ARG', opciones: ['Porque lo dice el texto', 'Porque sí'], indicesCorrectos: [0], pistas: pistas(1, 'def') })] },
  ];
  const nodos: NodoLectura[] = p.conHistoria
    ? [
        { id: 'n-inicio', clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, esFinal: false, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
        { id: 'n-rio', clave: 'rio', contenido: 'En el río, Pancho bebió agua fresca.', esInicio: false, esFinal: true, opciones: [] },
        { id: 'n-cerro', clave: 'cerro', contenido: 'En el cerro vieron un cóndor.', esInicio: false, esFinal: false, opciones: [{ texto: 'Volver a casa', destino: 'casa' }] },
        { id: 'n-casa', clave: 'casa', contenido: 'Volvieron a casa al atardecer.', esInicio: false, esFinal: true, opciones: [] },
      ]
    : [];
  return {
    lecturaId: p.lecturaId ?? 'lectura-killa',
    versionId: p.versionId ?? 'version-killa-1',
    titulo: 'Killa y la llama',
    rangoEdad: p.rangoEdad ?? 'R2',
    nivelDificultad: 2,
    imagen: { url: '/api/v1/biblioteca/recursos/img', textoAlternativo: 'Una niña con su llama' },
    oraciones: ORACIONES,
    actividades,
    nodos,
  };
}

export class ContenidoFalso implements ContenidoLecturas {
  readonly versiones = new Map<string, ContenidoLectura>();
  readonly publicadas = new Map<string, string>();

  publicar(c: ContenidoLectura) {
    this.versiones.set(c.versionId, c);
    this.publicadas.set(c.lecturaId, c.versionId);
  }
  archivar(lecturaId: string) {
    this.publicadas.delete(lecturaId);
  }
  async publicada(lecturaId: string) {
    const id = this.publicadas.get(lecturaId);
    return id ? (this.versiones.get(id) ?? null) : null;
  }
  async version(versionId: string) {
    return this.versiones.get(versionId) ?? null;
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean }>();
  agregar(id: string, alias: string, rangoEdad: RangoEdad, activo = true) {
    this.perfilesPorId.set(id, { id, alias, avatar: 'zorro', rangoEdad, activo });
  }
  async perfiles(ids: string[]) {
    return ids.map((id) => this.perfilesPorId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }
}

/** Un aula por docente; `asignaciones`: lo que la docente dejó a cada niño (RF-018). */
export class EscuelaFalsa implements EscuelaLectura {
  readonly aulas = new Map<string, { docenteId: string; nombre: string; estudiantes: string[] }>();
  readonly asignaciones: { estudianteId: string; asignacionId: string; lecturaId: string }[] = [];

  async tieneDocente(estudianteId: string) {
    return [...this.aulas.values()].some((a) => a.estudiantes.includes(estudianteId));
  }
  async asignacionDeLectura(estudianteId: string, asignacionId: string, lecturaId: string) {
    return this.asignaciones.some((x) => x.estudianteId === estudianteId && x.asignacionId === asignacionId && x.lecturaId === lecturaId);
  }
  async aulaDelDocente(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? { id: aulaId, nombre: a.nombre } : null;
  }
  async estudiantes(aulaId: string) {
    return this.aulas.get(aulaId)?.estudiantes ?? [];
  }
  async docenteAccedeAEstudiante(docenteId: string, estudianteId: string) {
    return [...this.aulas.values()].some((a) => a.docenteId === docenteId && a.estudiantes.includes(estudianteId));
  }
}

export function crearEntornoLectura() {
  let secuencia = 0;
  const reloj = new Reloj();
  const generarId = () => `id-${++secuencia}`;
  const repo = new SesionesEnMemoria();
  const contenido = new ContenidoFalso();
  const identidad = new IdentidadFalsa();
  const escuela = new EscuelaFalsa();
  const bus = new BusEspia();
  return {
    reloj,
    repo,
    contenido,
    identidad,
    escuela,
    bus,
    sesiones: new SesionesUseCase(repo, contenido, identidad, escuela, bus, generarId, reloj.ahora),
    revision: new RevisionUseCase(repo, contenido, identidad, escuela, bus, reloj.ahora),
    historial: new HistorialUseCase(repo, contenido),
  };
}

export type EntornoLectura = ReturnType<typeof crearEntornoLectura>;
```

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **Una lectura publicada por el flujo real** (editora → revisora) con una actividad de cada tipo, selección múltiple y una historia ramificada.
- **RF-038, RF-039:** empieza sin texto; no se responde antes de predecir (409); al predecir llega el texto hasta el anclaje; la predicción no se cambia.
- **RF-040, RF-045, RF-046:** P1 sin la clave en el JSON; reenviar con la misma clave no suma pistas; acertar guarda 0,75 (RN-07) y publica `ItemRespondido`.
- **RF-043, RF-048, RF-042, RF-041, RF-044:** evidencia (también una oración aún no leída, 400); decisión en la historia (`decision_ruta`); ordenar; selección múltiple; escritura de 501 letras (400), con pocas palabras (400) y con el filtro en la base; defensa en `justificacion`.
- **RF-047:** cierre con el final elegido; reflexión vacía (400); resumen; respuesta abierta a revisión; `SesionLecturaFinalizada`; avance para Aventura; no se responde después (409).
- **RF-046, RF-027:** se publica una versión nueva y la sesión de Lía sigue con la suya; RF-050 marcado para 6–7 años.
- **Acceso:** edad distinta (404), asignación de la docente (se guarda), sesión ajena (404), formato (400), rol (403) y sin sesión (401).
- **RF-051:** la docente ve la respuesta con su defensa; nivel inválido (400); valora (puntaje 1,00, evento); no se valora dos veces (409); otra docente no ve el aula (404) ni valora (404); el niño no accede (403).

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/lectura/lectura-http.int-spec.ts`:

```ts
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { ordenMostrado } from '../../../src/modules/lectura/domain/services/correccion';
import { AVANCE_LECTURAS, RegistroAvanceLecturas, uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Lectura interactiva integrada (RF-038 a RF-051) contra PostgreSQL real: una lectura
 * publicada por el flujo real de Contenido, leída por un niño en la API (predicción, preguntas con
 * anclaje, pistas, evidencia, historia ramificada, ordenar, selección múltiple, escritura con filtro,
 * defensa y cierre), reanudación con versión nueva y la revisión docente con rúbrica.
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
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' },
  });
  await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, codigoMfa: authenticator.generate(secreto) }).expect(200);
  return login.body.accessToken as string;
}

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** Las actividades de "Killa y la llama": una de cada modalidad (RF-024). */
function actividadesKilla(o: string[]) {
  return [
    { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿Qué crees que le pasará a la llama?', explicacionModelada: 'Al leer comprobarás tu idea.' }] },
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
      items: [{
        habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1,
        explicacionModelada: 'Más adelante el texto dice que tenía una espina en la pata: le dolía.',
        pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no quiere comer?')],
      }],
    },
    {
      momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina lo dice.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'ORDENAMIENTO',
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: 'Ordena lo que pasó.', elementos: ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'], explicacionModelada: 'Primero no comió, luego Killa miró y al final lo curó.', pistas: [pista('P1', 'Piensa qué pasó primero.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'SELECCION',
      items: [{ habilidad: 'CRI', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué hizo bien Killa? Marca todas.', opciones: ['Miró con atención', 'Se fue a jugar', 'Lo ayudó con cuidado'], indicesCorrectos: [0, 2], explicacionModelada: 'Killa miró la pata y quitó la espina con cuidado.', pistas: [pista('P1', 'Recuerda lo que hizo cuando Pancho no comía.')] }],
    },
    { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 3, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', minPalabras: 3, explicacionModelada: 'Sí: así encontró la espina.' }] },
    {
      momento: 'DESPUES', tipo: 'DEFIENDE',
      items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué razón defiende mejor tu respuesta?', opciones: ['El texto dice que tenía una espina', 'A las llamas no les gusta comer'], indiceCorrecto: 0, explicacionModelada: 'La razón está en el texto.', pistas: [pista('P1', 'Busca la razón en lo que leíste.')] }],
    },
  ];
}

const NODOS = [
  { clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
  { clave: 'rio', contenido: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', esFinal: true },
  { clave: 'cerro', contenido: 'En el cerro vieron un cóndor volar.', esFinal: true },
];

/** Lectura publicada por el flujo real de Contenido (editora → revisora). */
async function publicar(p: { titulo: string; rangoEdad: 'R1' | 'R2' | 'R3'; completa?: boolean }) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo: p.titulo, rangoEdad: p.rangoEdad, nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const o = oraciones.map((x) => x.id);
  const actividades = p.completa
    ? actividadesKilla(o)
    : [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: 'LIT', nivelDificultad: 1, modalidad: 'SELECCION', enunciado: '¿Dónde vivía Killa?', opciones: ['En Puno', 'En Lima'], indiceCorrecto: 0, explicacionModelada: 'La primera oración lo dice.', pistas: [pista('P1', 'Mira la primera oración.')] }] }];
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
  if (p.completa) await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/grafo`).set(bearer(editora)).send({ nodos: NODOS }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
  return { lecturaId, o };
}

let editora: string;
let revisora: string;
let tokenDocente: string;
let aulaId: string;
const ninos = {} as Record<'mateo' | 'lia', { id: string; token: string }>;
let killa: { lecturaId: string; o: string[] };
let toby: { lecturaId: string; o: string[] };
let sesion: string;

const outbox = (tipo: string) => t.prisma.outboxEvento.count({ where: { tipo } });
/** Una respuesta nueva (cada envío con su propia clave de idempotencia). */
const responder = (cuerpo: Record<string, unknown>) =>
  t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ idempotencyKey: uuidV7(), ...cuerpo });

describe('Preparación', () => {
  it('editora y revisora publican; una docente con Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisora = await backoffice('REVISOR');
    killa = await publicar({ titulo: 'Killa y la llama', rangoEdad: 'R2', completa: true });
    toby = await publicar({ titulo: 'Toby en Puno', rangoEdad: 'R1' });
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '4.° A', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const anio = new Date().getFullYear();
    for (const [clave, alias, edad] of [['mateo', 'Mateo', 9], ['lia', 'Lía', 6]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      ninos[clave] = { id: m.estudianteId, token: (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken };
    }
  });
});

describe('La lectura de Mateo de punta a punta', () => {
  it('RF-038: empieza en la predicción, sin texto ni preguntas; antes de predecir no se responde', async () => {
    const v = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: killa.lecturaId }).expect(201)).body;
    sesion = v.id;
    expect(v).toMatchObject({ fase: 'PREDICCION', estado: 'INICIADA', pregunta: null, texto: { parrafos: [], completo: false }, prediccion: { enunciado: '¿Qué crees que le pasará a la llama?', respuesta: null } });
    expect(v.lectura).toMatchObject({ titulo: 'Killa y la llama', rangoEdad: 'R2', leerEnVozAlta: false });
    expect(await outbox('lectura.SesionLecturaIniciada')).toBe(1);
    await responder({ itemId: uuidV7(), indice: 0 }).expect(409);
  });

  it('RF-038, RF-039: al predecir se abre el texto hasta la oración de anclaje, con su pregunta', async () => {
    const v = (await t.http().put(`${API}/sesiones-lectura/${sesion}/prediccion`).set(bearer(ninos.mateo.token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200)).body;
    expect(v).toMatchObject({ fase: 'LECTURA', estado: 'EN_CURSO', prediccion: { respuesta: 'Creo que la llama se enfermará' }, progreso: { hechas: 0, total: 6 } });
    expect(v.texto.parrafos.flatMap((p: { oraciones: { id: string }[] }) => p.oraciones.map((x) => x.id))).toEqual(killa.o.slice(0, 3));
    expect(v.pregunta).toMatchObject({ numero: 1, total: 6, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', anclajeOracionId: killa.o[2], pistas: [], pistasRestantes: 3 });
    await t.http().put(`${API}/sesiones-lectura/${sesion}/prediccion`).set(bearer(ninos.mateo.token)).send({ texto: 'Otra' }).expect(409);
  });

  it('RF-040, RF-045, RF-046: corrige en el servidor, da P1 sin la respuesta, y reenviar no vuelve a corregir', async () => {
    const pregunta = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body.pregunta;
    const clave = uuidV7();
    const mal = await t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: pregunta.itemId, idempotencyKey: clave, indice: 0 }).expect(200);
    expect(mal.body).toMatchObject({ resultado: 'INCORRECTA', pista: { nivel: 'P1', texto: 'Vuelve a la oración que acabas de leer.', parrafo: null }, explicacion: null, filtrado: false });
    expect(JSON.stringify(mal.body)).not.toMatch(/indiceCorrecto|respuestaCorrecta|indicesCorrectos|clavesEvidencia|explicacionModelada/);
    const otraVez = await t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: pregunta.itemId, idempotencyKey: clave, indice: 0 }).expect(200);
    expect(otraVez.body.pista).toEqual(mal.body.pista);
    expect(await t.prisma.usoPista.count()).toBe(1);

    const bien = (await responder({ itemId: pregunta.itemId, indice: 1 }).expect(200)).body;
    expect(bien).toMatchObject({ resultado: 'CORRECTA', pista: null, sesion: { pregunta: { modalidad: 'EVIDENCIA' } } });
    const fila = await t.prisma.respuesta.findFirstOrThrow({ where: { itemId: pregunta.itemId } });
    expect(fila).toMatchObject({ esCorrecta: true, pistasUsadas: 1, estado: 'ENVIADA' });
    expect(Number(fila.puntajeItem)).toBe(0.75); // RN-07
    const evento = await t.prisma.outboxEvento.findFirstOrThrow({ where: { tipo: 'lectura.ItemRespondido' } });
    expect(evento.payload).toMatchObject({ estudianteId: ninos.mateo.id, lecturaId: killa.lecturaId, habilidad: 'INF', nivelDificultad: 3, puntajeItem: 0.75 });
  });

  it('RF-039: no se responde lo que aún no está en pantalla', async () => {
    await responder({ itemId: uuidV7(), indice: 0 }).expect(409);
  });

  it('RF-043: la evidencia es correcta con una oración de la clave y como mucho una ajena', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.texto.parrafos.flatMap((p: { oraciones: unknown[] }) => p.oraciones)).toHaveLength(4);
    await responder({ itemId: v.pregunta.itemId, oraciones: [killa.o[5]] }).expect(400); // aún no la leyó
    const r = (await responder({ itemId: v.pregunta.itemId, oraciones: [killa.o[3], killa.o[0]] }).expect(200)).body;
    expect(r.resultado).toBe('CORRECTA');
    expect(r.sesion).toMatchObject({ fase: 'HISTORIA', pregunta: null, texto: { completo: true }, historia: { nodo: { opciones: ['Ir al río', 'Subir al cerro'], esFinal: false } } });
  });

  it('RF-048: la decisión se registra y lleva al nodo siguiente', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    await t.http().post(`${API}/sesiones-lectura/${sesion}/decisiones`).set(bearer(ninos.mateo.token)).send({ nodoId: uuidV7(), opcion: 0 }).expect(409);
    const tras = (await t.http().post(`${API}/sesiones-lectura/${sesion}/decisiones`).set(bearer(ninos.mateo.token)).send({ nodoId: v.historia.nodo.id, opcion: 0 }).expect(200)).body;
    expect(tras).toMatchObject({ fase: 'DESPUES', historia: { nodo: { contenido: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', esFinal: true }, recorrido: [{ eleccion: 'Ir al río' }] }, pregunta: { modalidad: 'ORDENAMIENTO' } });
    expect(await t.prisma.decisionRuta.count({ where: { sesionId: sesion } })).toBe(1);
  });

  it('RF-042, RF-040: ordenar (con los elementos mezclados) y selección múltiple', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.pregunta.elementos).not.toEqual(['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina']);
    const mostrado = ordenMostrado(3, `${sesion}:${v.pregunta.itemId}`);
    const r = (await responder({ itemId: v.pregunta.itemId, orden: [0, 1, 2].map((k) => mostrado.indexOf(k)) }).expect(200)).body;
    expect(r.resultado).toBe('CORRECTA');
    expect(r.sesion.pregunta).toMatchObject({ modalidad: 'SELECCION', multiple: true });
    expect((await responder({ itemId: r.sesion.pregunta.itemId, indices: [2, 0] }).expect(200)).body.resultado).toBe('CORRECTA');
  });

  it('RF-041: la escritura admite hasta 500 caracteres, pide el mínimo de palabras y filtra lo no apropiado', async () => {
    const itemId = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body.pregunta.itemId;
    await responder({ itemId, texto: 'a'.repeat(501) }).expect(400);
    expect((await responder({ itemId, texto: 'Sí, idiota' }).expect(400)).body.detail).toMatch(/al menos 3 palabras/);
    const r = (await responder({ itemId, texto: 'Sí, porque le dolía mucho, idiota' }).expect(200)).body;
    expect(r).toMatchObject({ resultado: 'ENVIADA', filtrado: true });
    expect((await t.prisma.respuesta.findFirstOrThrow({ where: { itemId } })).contenido).toEqual({ texto: 'Sí, porque le dolía mucho, ******', porVoz: false });
  });

  it('RF-044: defiende su respuesta y la defensa queda asociada a la original', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.pregunta).toMatchObject({ tipo: 'DEFIENDE', defiende: { enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', respuesta: 'Sí, porque le dolía mucho, ******' } });
    await t.http().post(`${API}/sesiones-lectura/${sesion}/finalizar`).set(bearer(ninos.mateo.token)).send({ reflexion: 'Aún no' }).expect(409);
    expect((await responder({ itemId: v.pregunta.itemId, indice: 0 }).expect(200)).body.sesion.fase).toBe('CIERRE');
    const j = await t.prisma.justificacion.findFirstOrThrow();
    expect(j).toMatchObject({ modalidad: 'SELECCION', opcionElegida: { indices: [0], texto: 'El texto dice que tenía una espina' } });
  });

  it('RF-047: el cierre contrasta predicción y desenlace; al terminar, lo abierto pasa a revisión y Aventura sabe que terminó', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.cierre).toEqual({ prediccion: 'Creo que la llama se enfermará', desenlace: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', pregunta: expect.stringContaining('Se parece') });
    await t.http().post(`${API}/sesiones-lectura/${sesion}/finalizar`).set(bearer(ninos.mateo.token)).send({ reflexion: '   ' }).expect(400);
    const fin = (await t.http().post(`${API}/sesiones-lectura/${sesion}/finalizar`).set(bearer(ninos.mateo.token)).send({ reflexion: 'Pensé que se enfermaba, pero tenía una espina' }).expect(200)).body;
    expect(fin).toMatchObject({ fase: 'FINALIZADA', resumen: { preguntas: 6, sinAyuda: 4, conPista: 1, conExplicacion: 0, abiertas: 1 } });
    expect(await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: sesion } })).toMatchObject({ estado: 'FINALIZADA', reflexion: 'Pensé que se enfermaba, pero tenía una espina' });
    expect(await t.prisma.respuesta.count({ where: { sesionId: sesion, estado: 'PENDIENTE_REVISION' } })).toBe(1);
    expect(await outbox('lectura.SesionLecturaFinalizada')).toBe(1);
    expect(await t.app.get<RegistroAvanceLecturas>(AVANCE_LECTURAS).avanceDe(ninos.mateo.id, [killa.lecturaId])).toEqual(new Map([[killa.lecturaId, 'FINALIZADA']]));
    await responder({ itemId: uuidV7(), indice: 0 }).expect(409);
  });
});

describe('Reanudar, acceso y lectura en voz alta', () => {
  it('RF-046, RF-027: al volver sigue la misma sesión con su versión, aunque se publique otra', async () => {
    const leer = () => t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.lia.token)).send({ lecturaId: toby.lecturaId }).expect(201);
    const v = (await leer()).body;
    expect(v.lectura.leerEnVozAlta).toBe(true); // RF-050: R1
    await t.http().put(`${API}/sesiones-lectura/${v.id}/prediccion`).set(bearer(ninos.lia.token)).send({ texto: 'Un perro en Puno' }).expect(200);
    const version1 = (await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: v.id } })).versionLecturaId;

    await t.http().post(`${API}/backoffice/lecturas/${toby.lecturaId}/nueva-version`).set(bearer(editora)).expect(201);
    await t.http().post(`${API}/backoffice/lecturas/${toby.lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
    await t.http().post(`${API}/backoffice/lecturas/${toby.lecturaId}/aprobar`).set(bearer(revisora)).expect(200);

    const otra = (await leer()).body;
    expect(otra).toMatchObject({ id: v.id, fase: 'DESPUES', pregunta: { enunciado: '¿Dónde vivía Killa?' } });
    expect((await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: v.id } })).versionLecturaId).toBe(version1);
  });

  it('cada niño lee lo de su edad (o lo que su docente le asignó) y nunca la sesión de otro', async () => {
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.lia.token)).send({ lecturaId: killa.lecturaId }).expect(404);
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: toby.lecturaId }).expect(404);
    await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.lia.token)).expect(404);

    const hoy = new Date();
    const limite = new Date(hoy.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(tokenDocente)).send({ tipo: 'LECTURA', contenidoId: toby.lecturaId, fechaLimite: limite }).expect(201);
    const [asignacion] = (await t.http().get(`${API}/yo/asignaciones`).set(bearer(ninos.mateo.token)).expect(200)).body;
    const v = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: toby.lecturaId, asignacionId: asignacion.id }).expect(201)).body;
    expect((await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: v.id } })).asignacionId).toBe(asignacion.id);
  });

  it('valida la forma de las peticiones y que sean del rol correcto', async () => {
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: 'no-es-uuid' }).expect(400);
    await t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: uuidV7(), indice: 0 }).expect(400); // sin idempotencyKey
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(tokenDocente)).send({ lecturaId: killa.lecturaId }).expect(403);
    await t.http().post(`${API}/sesiones-lectura`).send({ lecturaId: killa.lecturaId }).expect(401);
  });
});

describe('RF-051: revisión docente con rúbrica (RN-17)', () => {
  it('la docente ve la respuesta abierta de Mateo con su defensa y la valora una vez', async () => {
    const pendientes = (await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(tokenDocente)).expect(200)).body;
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({
      estado: 'PENDIENTE_REVISION',
      estudiante: { id: ninos.mateo.id, alias: 'Mateo' },
      lectura: { id: killa.lecturaId, titulo: 'Killa y la llama' },
      pregunta: { enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', habilidad: 'ARG' },
      respuesta: 'Sí, porque le dolía mucho, ******',
      justificacion: 'El texto dice que tenía una espina',
      valoracion: null,
    });
    const id = pendientes[0].respuestaId;
    await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 4 }).expect(400);
    const valorada = (await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 3, comentario: '¡Bien explicado con el texto!' }).expect(200)).body;
    expect(valorada).toMatchObject({ estado: 'VALORADA', valoracion: { nivel: 3, comentario: '¡Bien explicado con el texto!' } });
    await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 2 }).expect(409);
    expect(Number((await t.prisma.respuesta.findUniqueOrThrow({ where: { id } })).puntajeItem)).toBe(1);
    expect(await t.prisma.valoracionRubrica.count()).toBe(1);
    expect(await outbox('lectura.RespuestaAbiertaValorada')).toBe(1);
    expect((await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(tokenDocente)).expect(200)).body).toEqual([]);
    expect((await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas?estado=VALORADA`).set(bearer(tokenDocente)).expect(200)).body).toHaveLength(1);
    await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas?estado=OTRO`).set(bearer(tokenDocente)).expect(400);
  });

  it('otra docente no ve el aula ni valora; el niño no tiene acceso', async () => {
    const otra = await docente();
    const id = (await t.prisma.respuesta.findFirstOrThrow({ where: { estado: 'VALORADA' } })).id;
    await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(otra)).expect(404);
    await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(otra)).send({ nivel: 1 }).expect(404);
    await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(ninos.mateo.token)).expect(403);
  });
});
```

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **La lectura completa en la web real:** desde su biblioteca, predice, lee hasta el anclaje, falla y recibe P1, acierta, toca la evidencia, cierra la página y vuelve donde quedó, elige el río, ordena con los botones, marca varias opciones, escribe (con el filtro), defiende lo escrito, contrasta su predicción con el final y termina.
- **RF-045:** tras P1, P2 y P3 ve "Mira por qué" con la explicación y puede seguir (puntaje 0).
- **RF-042:** ordenar arrastrando las tarjetas.
- **RF-049, RF-050:** con 6 años, dicta su predicción (la revisa antes de enviarla) y escucha la lectura despacio, con la oración resaltada.
- **RF-018, RF-051:** abre la lectura desde la misión de su docente; la docente la valora con la rúbrica.
- **Diseño responsivo (RNF-022, RNF-023):** la lectura y la revisión en 1280, 820 y 390 px, sin desbordes y con objetivos de 48 px (cada oración de la evidencia también).

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI); la voz del navegador se simula en la prueba · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:lectura --workspace @lectoaventura/tests-load
```
En local, la suite se corre contra la compilación de producción (`api-compilada` y `web-compilada` de `.claude/launch.json`), como en CI.

**Resultado de carga obtenido el 22/10/2026** (un aula de 40 niños de 9 años lee "Killa y la llama" completa, de a 10 en paralelo, con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `POST /api/v1/sesiones-lectura/{id}/respuestas` (corregir y dar la pista) | 280 | 0,00 % | 55 ms | 67 ms | 77 ms | p95 < 300 ms (RF-040, RNF-002) | ✅ |
| `GET /api/v1/sesiones-lectura/{id}` (reanudar) | 360 | 0,00 % | 20 ms | 26 ms | 31 ms | p95 < 300 ms (RF-046) | ✅ |
| `POST /api/v1/sesiones-lectura` (abrir la lectura) | 40 | 0,00 % | 60 ms | 252 ms | 276 ms | sin meta en el SRS | ✅ |
| `PUT /api/v1/sesiones-lectura/{id}/prediccion` | 40 | 0,00 % | 33 ms | 49 ms | 52 ms | sin meta en el SRS | ✅ |
| `POST /api/v1/sesiones-lectura/{id}/decisiones` | 40 | 0,00 % | 43 ms | 50 ms | 52 ms | sin meta en el SRS | ✅ |
| `POST /api/v1/sesiones-lectura/{id}/finalizar` | 40 | 0,00 % | 70 ms | 84 ms | 91 ms | sin meta en el SRS | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/lectura/lectura.spec.ts`:

```ts
import { expect, Page, test as base } from '@playwright/test';

import { filtrarPorTema } from '../../support/contenido';
import { abrirAula, diaLima, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada, salirDelPanel } from '../../support/iam';
import { arrastrar, DESENLACE_RIO, ENUNCIADOS, lecturaKilla, leerPorApi, ORDEN_CORRECTO, ordenarConBotones, PREDICCION, respuestaGuardada, vozSimulada } from '../../support/lectura';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Lectura interactiva de punta a punta (RF-038 a RF-051) en escritorio, tablet y celular:
 * el niño predice, lee con preguntas en sus oraciones de anclaje, recibe pistas, busca evidencias,
 * elige su camino, ordena, escribe, defiende su respuesta y cierra; la docente valora con la rúbrica.
 */
test.describe('Lectura interactiva (RF-038 a RF-051)', () => {
  test.setTimeout(150_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  /** Desde su biblioteca (Módulo 3) abre la lectura con "¡Leer ahora!". */
  async function abrirDesdeBiblioteca(page: Page, lectura: { titulo: string; tematica: string }) {
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Biblioteca' }).click();
    await filtrarPorTema(page, lectura.tematica);
    await page.getByRole('link', { name: `Abrir ${lectura.titulo}` }).click();
    await page.getByRole('link', { name: '¡Leer ahora!' }).click();
    await expect(page.getByRole('heading', { level: 1, name: lectura.titulo })).toBeVisible();
  }

  const pregunta = (page: Page, enunciado: string) => expect(page.getByRole('heading', { level: 2, name: enunciado, exact: true })).toBeVisible();
  const texto = (page: Page) => page.getByRole('article', { name: 'El texto' });

  test('el niño predice, lee con preguntas en sus anclajes, usa una pista, elige su camino y cierra su lectura', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');
    await abrirDesdeBiblioteca(page, lectura);

    // RF-038: primero la predicción con el título y la imagen; el texto aún no se ve.
    await pregunta(page, PREDICCION);
    await expect(texto(page)).toHaveCount(0);
    await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();

    // RF-039: el texto llega hasta la oración de anclaje y la pregunta no deja avanzar.
    await expect(texto(page)).toContainText('Un día Pancho no quiso comer.');
    await expect(texto(page)).not.toContainText('espina');
    await pregunta(page, ENUNCIADOS.seleccion);
    // RF-045: si falla, la pista P1 (sin la respuesta); luego acierta.
    await page.getByRole('button', { name: 'Opción A: Estaba feliz' }).click();
    await expect(page.getByRole('list', { name: 'Tus pistas' })).toContainText('Pista 1: Vuelve a la oración que acabas de leer.');
    await expect(page.getByText('Mira por qué')).toHaveCount(0);
    await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
    await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();

    // RF-043: toca en el texto las oraciones que lo demuestran.
    await pregunta(page, ENUNCIADOS.evidencia);
    await texto(page).getByRole('button', { name: 'Killa vio que tenía una espina en la pata.' }).click();
    await expect(page.getByText('Elegiste 1 oración.')).toBeVisible();
    await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();

    // RF-046: si cierra y vuelve, sigue donde quedó (la historia ramificada).
    await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
    await expect(page.getByText('Pensaste: «Creo que la llama se enfermará»')).toBeVisible();

    // RF-048: su decisión define cómo sigue la historia.
    await page.getByRole('button', { name: 'Ir al río' }).click();
    await expect(page.getByText('Elegiste: Ir al río')).toBeVisible();
    await expect(page.getByText(DESENLACE_RIO)).toBeVisible();

    // RF-042: ordena con los botones (la alternativa accesible al arrastre).
    await pregunta(page, ENUNCIADOS.ordenar);
    await ordenarConBotones(page, ORDEN_CORRECTO);
    await page.getByRole('button', { name: 'Listo, este es el orden' }).click();
    await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();

    // RF-040: selección múltiple.
    await pregunta(page, ENUNCIADOS.multiple);
    await page.getByRole('button', { name: 'Opción A: Miró con atención' }).click();
    await page.getByRole('button', { name: 'Opción C: Lo ayudó con cuidado' }).click();
    await expect(page.getByRole('button', { name: 'Opción C: Lo ayudó con cuidado' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Responder', exact: true }).click();

    // RF-041: escribe (hasta 500 letras) y el filtro cambia lo no apropiado.
    await pregunta(page, ENUNCIADOS.escritura);
    await page.getByLabel('Tu respuesta').fill('Sí, porque le dolía, idiota');
    await page.getByRole('button', { name: 'Enviar mi respuesta' }).click();
    await expect(page.getByText('Guardamos tu respuesta. Cambiamos algunas palabras por ***.')).toBeVisible();

    // RF-044: defiende lo que escribió.
    await pregunta(page, ENUNCIADOS.defiende);
    await expect(page.getByText('Tu respuesta: Sí, porque le dolía, ******')).toBeVisible();
    await page.getByRole('button', { name: 'Opción A: El texto dice que tenía una espina' }).click();

    // RF-047: el cierre contrasta su predicción con lo que pasó y pide una reflexión.
    await expect(page.getByRole('heading', { name: '¿Acertaste?' })).toBeVisible();
    const cierre = page.getByRole('region', { name: '¿Acertaste?' });
    await expect(cierre).toContainText('Creo que la llama se enfermará');
    await expect(cierre).toContainText(DESENLACE_RIO);
    await cierre.getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
    await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
    await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
    await expect(page.getByText('Hiciste 6 actividades.')).toBeVisible();
    await expect(page.getByText('1 con ayuda de una pista.')).toBeVisible();
    await expect(page.getByText('Tu profe leerá lo que escribiste.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver mis mundos' })).toBeVisible();

    // RN-07: acertar tras P1 vale 0,75.
    const guardada = await respuestaGuardada(aula.estudiantes['Mateo'] as string, ENUNCIADOS.seleccion);
    expect(Number(guardada.puntajeItem)).toBe(0.75);
  });

  test('RF-045: tras agotar las pistas ve la explicación modelada y puede seguir leyendo', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Teo');
    await abrirDesdeBiblioteca(page, lectura);
    await page.getByLabel('Lo que creo que pasará').fill('Se irá de viaje');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();

    for (const [opcion, pistas] of [['Opción A: Estaba feliz', 1], ['Opción C: Tenía sueño', 2], ['Opción A: Estaba feliz', 3]] as const) {
      await page.getByRole('button', { name: opcion }).click();
      await expect(page.getByRole('list', { name: 'Tus pistas' }).getByRole('listitem')).toHaveCount(pistas);
    }
    await page.getByRole('button', { name: 'Opción C: Tenía sueño' }).click();
    await expect(page.getByRole('heading', { name: 'Mira por qué' })).toBeVisible();
    await expect(page.getByText('Más adelante el texto dice que tenía una espina en la pata: le dolía.')).toBeVisible();
    await page.getByRole('button', { name: 'Seguir' }).click();
    await pregunta(page, ENUNCIADOS.evidencia);
    expect(Number((await respuestaGuardada(aula.estudiantes['Teo'] as string, ENUNCIADOS.seleccion)).puntajeItem)).toBe(0);
  });

  test('RF-042: también se ordena arrastrando las tarjetas', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await leerPorApi(request, aula, 'Ana', lectura.lecturaId, { hasta: ENUNCIADOS.ordenar });
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Ana');
    await abrirDesdeBiblioteca(page, lectura);
    await pregunta(page, ENUNCIADOS.ordenar);

    for (let k = 0; k < ORDEN_CORRECTO.length; k++) {
      const filas = page.locator('.ordenar__asa');
      const textos = await page.locator('.ordenar__texto').allTextContents();
      const desde = textos.indexOf(ORDEN_CORRECTO[k] as string);
      if (desde !== k) await arrastrar(page, filas.nth(desde), filas.nth(k));
    }
    await expect(page.locator('.ordenar__texto')).toHaveText(ORDEN_CORRECTO);
    await page.getByRole('button', { name: 'Listo, este es el orden' }).click();
    await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
  });

  test('RF-049, RF-050: con 6 años escucha la lectura con la oración resaltada y responde dictando', async ({ page, request }) => {
    const lectura = await lecturaKilla(request, { rangoEdad: 'R1' });
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala', anioNacimiento: new Date().getFullYear() - 6 }]);
    await vozSimulada(page, 'Creo que Pancho se enfermará');
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Lía');
    await abrirDesdeBiblioteca(page, lectura);

    // RF-049: lo dictado aparece para revisarlo antes de enviarlo; el audio no sale del dispositivo.
    await page.getByRole('button', { name: 'Decirlo con mi voz' }).click();
    await expect(page.getByLabel('Lo que creo que pasará')).toHaveValue('Creo que Pancho se enfermará');
    await expect(page.getByText('Revisa lo que dijiste')).toBeVisible();
    await page.getByRole('button', { name: 'Empezar a leer' }).click();

    // RF-050: lectura en voz alta, despacio, resaltando la oración que suena.
    const lector = page.getByRole('group', { name: 'Escuchar la lectura' });
    await lector.getByRole('radio', { name: /Despacio/ }).click();
    await expect(lector.getByRole('radio', { name: /Despacio/ })).toHaveAttribute('aria-checked', 'true');
    await lector.getByRole('button', { name: 'Escuchar la lectura' }).click();
    await expect(texto(page).locator('.lectura-oracion--leyendo')).toHaveText('Killa vivía en Puno.');
    await expect(texto(page).locator('.lectura-oracion--leyendo')).toHaveText('Cada mañana cuidaba a su llama Pancho.');
    expect(await page.evaluate(() => (window as unknown as { __frases: { velocidad: number }[] }).__frases[0]?.velocidad)).toBe(0.75);
    await expect(page.getByRole('button', { name: 'Escuchar la pregunta' })).toBeVisible();
  });

  test('RF-018, RF-051: llega a la lectura desde la misión de su docente, y la docente valora lo que escribió', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    const docente = await sesionApi(request, aula.docente);
    const asignada = await request.post(`/api/v1/aulas/${aula.aulaId}/asignaciones`, { headers: docente, data: { tipo: 'LECTURA', contenidoId: lectura.lecturaId, fechaLimite: diaLima(7) } });
    expect(asignada.status(), await asignada.text()).toBe(201);

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');
    await page.getByRole('link', { name: `Leer ${lectura.titulo}` }).click();
    await pregunta(page, PREDICCION);
    await page.getByRole('link', { name: /Salir/ }).click();
    await esperarAreaEstudiante(page, 'Mateo');
    await leerPorApi(request, aula, 'Mateo', lectura.lecturaId, { terminar: true });
    await salirDelPanel(page);

    // RF-051: la docente revisa con la rúbrica de 3 niveles.
    await abrirAula(page, aula);
    const revision = page.getByRole('region', { name: 'Respuestas por revisar' });
    const fila = revision.getByRole('listitem', { name: 'Respuesta de Mateo' });
    await expect(fila).toContainText(ENUNCIADOS.escritura);
    await expect(fila).toContainText('Sí, porque así encontró la espina');
    await expect(fila).toContainText('Su defensa: El texto dice que tenía una espina');
    await fila.getByLabel(/3 · Logrado/).check();
    await fila.getByLabel('Comentario para el estudiante (opcional)').fill('¡Bien explicado con el texto!');
    await fila.getByRole('button', { name: 'Guardar valoración' }).click();
    await expect(revision.getByText('Valoración guardada para Mateo.')).toBeVisible();
    await expect(revision.getByText('No hay respuestas por revisar.')).toBeVisible();
    await revision.getByRole('button', { name: 'Valoradas' }).click();
    await expect(revision.getByRole('listitem', { name: 'Respuesta de Mateo' })).toContainText('Nivel 3: Logrado');
  });
});
```

`tests/e2e/support/lectura.ts`:

```ts
import { resolve } from 'node:path';

import { APIRequestContext, expect, Locator, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { CuentaBackoffice, cuentaBackoffice, sesionBackoffice } from './contenido';
import { sesionDelNino } from './diagnostico';
import { AulaPreparada } from './escuela';

/** Ayudantes del Módulo 6 (lectura interactiva): la lectura de ejemplo y cómo avanzarla por la API. */

export const TEXTO_KILLA = [
  'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.',
  'Un día Pancho no quiso comer. Killa vio que tenía una espina en la pata.',
  'Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.',
].join('\n');

export const PREDICCION = '¿Qué crees que le pasará a la llama?';
export const ENUNCIADOS = {
  seleccion: '¿Por qué Pancho no quiso comer?',
  evidencia: 'Toca las oraciones que cuentan qué le pasaba a Pancho.',
  ordenar: 'Ordena lo que pasó.',
  multiple: '¿Qué hizo bien Killa? Marca todas.',
  escritura: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?',
  defiende: '¿Qué razón defiende mejor tu respuesta?',
};
/** RF-042: el orden correcto (al niño se le muestran mezclados). */
export const ORDEN_CORRECTO = ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'];
export const DESENLACE_RIO = 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!';

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** Una actividad de cada tipo: predicción, 2 durante (con anclaje) y 4 después, con su defensa. */
function actividades(o: string[]) {
  return [
    { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: PREDICCION, explicacionModelada: 'Al leer comprobarás tu idea.' }] },
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
      items: [{
        habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: ENUNCIADOS.seleccion, opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1,
        explicacionModelada: 'Más adelante el texto dice que tenía una espina en la pata: le dolía.',
        pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no quiere comer?')],
      }],
    },
    {
      momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: ENUNCIADOS.evidencia, clavesEvidencia: [o[2], o[3]], explicacionModelada: 'El segundo párrafo cuenta que no comía y que tenía una espina.', pistas: [pista('P1', 'Busca en el párrafo que acabas de leer.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'ORDENAMIENTO',
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: ENUNCIADOS.ordenar, elementos: ORDEN_CORRECTO, explicacionModelada: 'Primero no comió, luego Killa miró y al final lo curó.', pistas: [pista('P1', 'Piensa qué pasó primero.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'SELECCION',
      items: [{ habilidad: 'CRI', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: ENUNCIADOS.multiple, opciones: ['Miró con atención', 'Se fue a jugar', 'Lo ayudó con cuidado'], indicesCorrectos: [0, 2], explicacionModelada: 'Killa miró la pata y quitó la espina con cuidado.', pistas: [pista('P1', 'Recuerda lo que hizo cuando Pancho no comía.')] }],
    },
    { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 3, modalidad: 'ESCRITURA', enunciado: ENUNCIADOS.escritura, minPalabras: 3, explicacionModelada: 'Sí: así encontró la espina.' }] },
    {
      momento: 'DESPUES', tipo: 'DEFIENDE',
      items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: ENUNCIADOS.defiende, opciones: ['El texto dice que tenía una espina', 'A las llamas no les gusta comer'], indiceCorrecto: 0, explicacionModelada: 'La razón está en el texto.', pistas: [pista('P1', 'Busca la razón en lo que leíste.')] }],
    },
  ];
}

const NODOS = [
  { clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
  { clave: 'rio', contenido: DESENLACE_RIO, esFinal: true },
  { clave: 'cerro', contenido: 'En el cerro vieron un cóndor volar.', esFinal: true },
];

/** La editora y el revisor que publican; se reutilizan para no superar el límite de ingresos por IP (RNF-019). */
export interface Publicadores {
  editoraCuenta: CuentaBackoffice;
  editora: Record<string, string>;
  revisor: Record<string, string>;
}

export async function publicadores(request: APIRequestContext): Promise<Publicadores> {
  const editoraCuenta = await cuentaBackoffice('EDITOR');
  return { editoraCuenta, editora: await sesionBackoffice(request, editoraCuenta), revisor: await sesionBackoffice(request, await cuentaBackoffice('REVISOR')) };
}

/** "Killa y la llama" publicada por la API (editora escribe, revisor aprueba), con historia ramificada. */
export async function lecturaKilla(
  request: APIRequestContext,
  p: { rangoEdad?: 'R1' | 'R2'; tematica?: string } = {},
  quienes?: Publicadores,
): Promise<{ lecturaId: string; titulo: string; tematica: string; editora: CuentaBackoffice; editoraSesion: Record<string, string> }> {
  const { editoraCuenta, editora, revisor } = quienes ?? (await publicadores(request));
  const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const titulo = `Killa y la llama ${sufijo}`;
  const tematica = p.tematica ?? `Llamas ${sufijo}`;
  const creada = await request.post('/api/v1/backoffice/lecturas', {
    headers: editora,
    data: { metadatos: { titulo, rangoEdad: p.rangoEdad ?? 'R2', nivelDificultad: 2, tematica, tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' }, texto: TEXTO_KILLA },
  });
  expect(creada.status(), await creada.text()).toBe(201);
  const { lecturaId, oraciones } = await creada.json();
  const o = (oraciones as { id: string }[]).map((x) => x.id);
  for (const [ruta, data] of [['actividades', { actividades: actividades(o) }], ['grafo', { nodos: NODOS }]] as const) {
    const r = await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/${ruta}`, { headers: editora, data });
    expect(r.status(), await r.text()).toBe(200);
  }
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/enviar-revision`, { headers: editora })).status()).toBe(200);
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/aprobar`, { headers: revisor })).status()).toBe(200);
  return { lecturaId, titulo, tematica, editora: editoraCuenta, editoraSesion: editora };
}

interface PreguntaApi {
  itemId: string;
  enunciado: string;
  opciones: string[];
  elementos: string[];
}

interface SesionApi {
  id: string;
  fase: string;
  pregunta: PreguntaApi | null;
  historia: { nodo: { id: string } } | null;
  texto: { parrafos: { oraciones: { id: string; texto: string }[] }[] };
}

/** La respuesta correcta de cada pregunta de la lectura de ejemplo (la clave no llega a la web). */
function respuestaCorrecta(s: SesionApi, p: PreguntaApi): Record<string, unknown> {
  const oracion = (texto: string) => s.texto.parrafos.flatMap((x) => x.oraciones).find((x) => x.texto === texto)?.id;
  switch (p.enunciado) {
    case ENUNCIADOS.seleccion:
      return { indice: p.opciones.indexOf('Le dolía algo') };
    case ENUNCIADOS.evidencia:
      return { oraciones: [oracion('Killa vio que tenía una espina en la pata.')] };
    case ENUNCIADOS.ordenar:
      return { orden: ORDEN_CORRECTO.map((t) => p.elementos.indexOf(t)) };
    case ENUNCIADOS.multiple:
      return { indices: ['Miró con atención', 'Lo ayudó con cuidado'].map((t) => p.opciones.indexOf(t)) };
    case ENUNCIADOS.escritura:
      return { texto: 'Sí, porque así encontró la espina' };
    default:
      return { indice: p.opciones.indexOf('El texto dice que tenía una espina') };
  }
}

/**
 * Lee la lectura por la API como lo haría el niño (predice, responde bien y elige el río) hasta la
 * pregunta `hasta` (sin responderla) o, con `terminar`, hasta cerrarla con su reflexión.
 */
export async function leerPorApi(
  request: APIRequestContext,
  preparada: AulaPreparada,
  alias: string,
  lecturaId: string,
  p: { hasta?: string; terminar?: boolean; prediccion?: string; fallar?: string[]; nino?: Record<string, string> } = {},
): Promise<string> {
  // `nino`: una sesión ya abierta (cada sesión nueva cuesta un ingreso de la docente, RNF-019).
  const nino = p.nino ?? (await sesionDelNino(request, preparada, alias));
  const llamar = async (metodo: 'post' | 'put', ruta: string, data: object = {}) => {
    const r = await request[metodo](`/api/v1${ruta}`, { headers: nino, data });
    expect(r.status(), await r.text()).toBeLessThan(300);
    return r.json();
  };
  let s = (await llamar('post', '/sesiones-lectura', { lecturaId })) as SesionApi;
  if (s.fase === 'PREDICCION') s = await llamar('put', `/sesiones-lectura/${s.id}/prediccion`, { texto: p.prediccion ?? 'Creo que la llama se enfermará' });
  for (;;) {
    if (s.fase === 'HISTORIA') {
      s = await llamar('post', `/sesiones-lectura/${s.id}/decisiones`, { nodoId: s.historia?.nodo.id, opcion: 0 });
    } else if (s.pregunta) {
      if (s.pregunta.enunciado === p.hasta) return s.id;
      // `fallar`: se equivoca en esa pregunta de selección hasta ver la explicación (RF-045).
      const entrada = p.fallar?.includes(s.pregunta.enunciado) ? { indice: s.pregunta.opciones.indexOf('Estaba feliz') } : respuestaCorrecta(s, s.pregunta);
      const r = await llamar('post', `/sesiones-lectura/${s.id}/respuestas`, { itemId: s.pregunta.itemId, idempotencyKey: crypto.randomUUID(), ...entrada });
      s = r.sesion;
    } else break;
  }
  if (p.terminar) await llamar('post', `/sesiones-lectura/${s.id}/finalizar`, { reflexion: 'Pensé que se enfermaba y era una espina' });
  return s.id;
}

/** RF-042: ordena con los botones Subir (la alternativa accesible al arrastre). */
export async function ordenarConBotones(page: Page, orden: string[]): Promise<void> {
  for (let k = 0; k < orden.length; k++) {
    const textos = await page.locator('.ordenar__texto').allTextContents();
    for (let i = textos.indexOf(orden[k] as string); i > k; i--) {
      await page.getByRole('button', { name: `Subir «${orden[k]}»` }).click();
    }
  }
  await expect(page.locator('.ordenar__texto')).toHaveText(orden);
}

/** RF-042: arrastra una tarjeta hasta ponerla sobre otra (ratón o dedo, por Pointer Events). */
export async function arrastrar(page: Page, origen: Locator, destino: Locator): Promise<void> {
  // Como haría el niño: primero desplaza la lista a la vista (en el celular la barra inferior tapa lo de abajo).
  await origen.evaluate((el) => el.closest('ol')?.scrollIntoView({ block: 'center' }));
  const a = (await origen.boundingBox())!;
  const b = (await destino.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 12 });
  await page.mouse.up();
}

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RN-07: lo que quedó guardado de la respuesta del niño a una pregunta (por su enunciado). */
export async function respuestaGuardada(estudianteId: string, enunciado: string) {
  const prisma = db();
  try {
    const items = (await prisma.item.findMany({ where: { enunciado }, select: { id: true } })).map((i) => i.id);
    const sesiones = (await prisma.sesionLectura.findMany({ where: { estudianteId }, select: { id: true } })).map((s) => s.id);
    return await prisma.respuesta.findFirstOrThrow({ where: { sesionId: { in: sesiones }, itemId: { in: items } }, include: { usosPista: true } });
  } finally {
    await prisma.$disconnect();
  }
}

/** El ítem de la lectura por su enunciado, con sus pistas y las oraciones de su clave de evidencia. */
export async function itemDeLectura(lecturaId: string, enunciado: string) {
  const prisma = db();
  try {
    return await prisma.item.findFirstOrThrow({
      where: { enunciado, actividad: { versionLectura: { lecturaId } } },
      include: { pistas: true, claves: { include: { oracion: true } } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** RF-053: los ItemRespondido que Lectura publicó para Progreso y Gamificación. */
export async function itemsRespondidos(estudianteId: string): Promise<Record<string, unknown>[]> {
  const prisma = db();
  try {
    const filas = await prisma.outboxEvento.findMany({ where: { tipo: 'lectura.ItemRespondido', payload: { path: ['estudianteId'], equals: estudianteId } } });
    return filas.map((f) => f.payload as Record<string, unknown>);
  } finally {
    await prisma.$disconnect();
  }
}

/** Voz simulada en el navegador (RF-049, RF-050): la síntesis avisa cada frase y el dictado "escucha" `dicho`. */
export async function vozSimulada(page: Page, dicho: string): Promise<void> {
  await page.addInitScript((texto) => {
    const w = window as unknown as Record<string, unknown>;
    const frases: { texto: string; velocidad: number }[] = [];
    w.__frases = frases;
    class FraseFalsa {
      lang = '';
      rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    w.SpeechSynthesisUtterance = FraseFalsa;
    let vigente = 0;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => {
          vigente += 1;
        },
        speak: (f: FraseFalsa) => {
          const turno = vigente;
          frases.push({ texto: f.text, velocidad: f.rate });
          setTimeout(() => {
            if (turno !== vigente) return;
            f.onstart?.();
            setTimeout(() => turno === vigente && f.onend?.(), 600);
          }, 20);
        },
      },
    });
    class ReconocimientoFalso {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: texto }]] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    w.SpeechRecognition = ReconocimientoFalso;
    w.webkitSpeechRecognition = ReconocimientoFalso;
  }, dicho);
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
 *   RF-056 a RF-062 (Módulo 8): cada respuesta suma puntos bajo el candado de su cuenta; al terminar ve
 *   su Pasaporte del Lector y su reto del día → p95 < 300 ms, y canjea una recompensa → p95 < 500 ms.
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
    'http_req_duration{nombre:GET /yo/pasaporte}': ['p(95)<300'],
    'http_req_duration{nombre:GET /yo/reto-del-dia}': ['p(95)<300'],
    'http_req_duration{nombre:POST /yo/recompensas/{id}/canje}': ['p(95)<500'],
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

  // Módulo 8: los puntos ya están en el libro al responder (RF-056) y la insignia, al terminar (RF-058).
  const pasaporte = http.get(`${BASE}/yo/pasaporte`, { headers: yo, tags: { nombre: 'GET /yo/pasaporte' } });
  check(pasaporte, {
    'pasaporte con puntos y «Primera lectura»': (r) => r.status === 200 && r.json('puntos.total') > 0 && r.json('insignias').some((i) => i.codigo === 'PRIMERA_LECTURA' && i.ganada),
  });
  const reto = http.get(`${BASE}/yo/reto-del-dia`, { headers: yo, tags: { nombre: 'GET /yo/reto-del-dia' } });
  check(reto, { 'un reto del día': (r) => r.status === 200 && r.json('meta') === 3 });
  const lupa = pasaporte.status === 200 ? pasaporte.json('recompensas').find((x) => x.codigo === 'LUPA') : null;
  if (lupa && pasaporte.json('monedas') >= lupa.costo) {
    const canje = http.post(`${BASE}/yo/recompensas/${lupa.id}/canje`, null, { headers: yo, tags: { nombre: 'POST /yo/recompensas/{id}/canje' } });
    check(canje, { 'canje con monedas (RF-062)': (r) => r.status === 201 && r.json('recompensa') === 'LUPA' });
  }
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@lectura
Característica: Lectura interactiva con actividades antes, durante y después
  Como estudiante de LectoAventura
  Quiero leer con preguntas, pistas y decisiones
  Para comprender mejor lo que leo y aprender de mis errores

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  # Progreso recalcula la maestría (Módulo 7) y Gamificación otorga los puntos (Módulo 8, RN-11) con el
  # mismo evento ItemRespondido.
  @RF-045 @RN-06 @RN-07 @RN-11 @UAT-02 @camino-feliz @smoke
  Escenario: El estudiante corrige su respuesta después de una pista
    Dado un estudiante en una lectura del mundo "Detective"
    Y un ítem de inferencia con dificultad 3 y tres pistas definidas
    Cuando responde incorrectamente
    Entonces ve la pista P1 que le indica a qué parte del texto volver
    Y no se muestra la respuesta correcta
    Cuando responde correctamente en el segundo intento
    Entonces recibe 6 puntos por corregir tras pista
    Y su maestría en INF se actualiza con un puntaje de ítem de 0,75

  # El avance hacia la insignia "Detective de Evidencias" lo lleva Gamificación (Módulo 8, RF-058).
  @RF-043 @RF-058 @UAT-03
  Escenario: El estudiante respalda su respuesta con la oración correcta
    Dado un ítem "Encuentra la evidencia" cuya clave son las oraciones "Un día Pancho no quiso comer." y "Killa vio que tenía una espina en la pata."
    Cuando el estudiante selecciona la oración "Killa vio que tenía una espina en la pata."
    Entonces la evidencia se considera correcta
    Y el progreso hacia la insignia "Detective de Evidencias" aumenta en 1

  @RF-043 @RN-06 @UAT-03 @negativo
  Escenario: El estudiante selecciona oraciones no relacionadas
    Dado un ítem "Encuentra la evidencia" cuya clave son las oraciones "Un día Pancho no quiso comer." y "Killa vio que tenía una espina en la pata."
    Cuando el estudiante selecciona las oraciones "Killa vivía en Puno." y "Cada mañana cuidaba a su llama Pancho."
    Entonces la evidencia se considera incorrecta
    Y recibe la pista P1 resaltando el párrafo donde buscar

  @RF-038 @RF-047
  Escenario: El estudiante contrasta su predicción con el final y reflexiona
    Dado un estudiante que predijo "Creo que la llama se enfermará" y terminó las actividades de su lectura
    Cuando llega al cierre
    Entonces ve lo que predijo junto a lo que pasó
    Y al escribir su reflexión la lectura queda terminada

  @RF-051
  Escenario: La docente valora una respuesta abierta con la rúbrica
    Dado un estudiante que escribió una respuesta abierta en su lectura
    Cuando su docente la valora como "Logrado"
    Entonces la respuesta queda valorada con el nivel 3
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect, Page } from '@playwright/test';

import { idMundo, tituloMision } from '../support/aventura';
import { sesionBackoffice } from '../support/contenido';
import { retoTerminado } from '../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, salirDelPanel } from '../support/iam';
import { DESENLACE_RIO, ENUNCIADOS, itemDeLectura, itemsRespondidos, lecturaKilla, leerPorApi, respuestaGuardada } from '../support/lectura';
import { maestriaGuardada } from '../support/progreso';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de la lectura interactiva (RF-038 a RF-051, UAT-02, UAT-03). */

const NUMERO_MUNDO: Record<string, number> = { Explorador: 1, Detective: 2, Constructor: 3, Juez: 4, Narrador: 5 };

async function entrarComoMateo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

const pregunta = (page: Page, enunciado: string) => expect(page.getByRole('heading', { level: 2, name: enunciado, exact: true })).toBeVisible();

// ── UAT-02: pistas progresivas (RF-045, RN-06, RN-07) ─────────────────────

Dado('un estudiante en una lectura del mundo {string}', async ({ page, request, mundo }, nombre: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  // RF-033: con buen LIT y VOC en su reto inicial empieza en el Detective.
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  mundo.killa = killa;
  const mision = await request.post(`/api/v1/backoffice/mundos/${await idMundo(NUMERO_MUNDO[nombre] as number)}/misiones`, {
    headers: await sesionBackoffice(request, killa.editora),
    data: { rangoEdad: 'R2', titulo: tituloMision('La llama de Killa'), lecturaIds: [killa.lecturaId] },
  });
  expect(mision.status(), await mision.text()).toBe(201);

  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
  await page.getByRole('link', { name: `Entrar al mundo ${NUMERO_MUNDO[nombre]}: ${nombre}` }).click();
  await page.getByRole('link', { name: `Leer: ${killa.titulo}` }).click();
  await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
  await page.getByRole('button', { name: 'Empezar a leer' }).click();
});

Dado('un ítem de inferencia con dificultad {int} y tres pistas definidas', async ({ page, mundo }, dificultad: number) => {
  await pregunta(page, ENUNCIADOS.seleccion);
  const item = await itemDeLectura(mundo.killa!.lecturaId, ENUNCIADOS.seleccion);
  expect(item).toMatchObject({ habilidad: 'INF', nivelDificultad: dificultad });
  expect(item.pistas.map((p) => p.nivel).sort()).toEqual(['P1', 'P2', 'P3']);
});

Cuando('responde incorrectamente', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción A: Estaba feliz' }).click();
});

Entonces('ve la pista P1 que le indica a qué parte del texto volver', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Tus pistas' })).toContainText('Pista 1: Vuelve a la oración que acabas de leer.');
});

Entonces('no se muestra la respuesta correcta', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mira por qué' })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('Más adelante el texto dice que tenía una espina');
  await expect(page.getByRole('main')).not.toContainText('espina'); // el texto aún no llega a la respuesta
});

Cuando('responde correctamente en el segundo intento', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
  await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
});

Entonces('su maestría en {word} se actualiza con un puntaje de ítem de {word}', async ({ mundo }, habilidad: string, puntaje: string) => {
  const estudianteId = mundo.aula!.estudiantes['Mateo'] as string;
  const valor = Number(puntaje.replace(',', '.'));
  const guardada = await respuestaGuardada(estudianteId, ENUNCIADOS.seleccion);
  expect(guardada).toMatchObject({ habilidad, esCorrecta: true, pistasUsadas: 1 });
  expect(Number(guardada.puntajeItem)).toBe(valor);
  expect(await itemsRespondidos(estudianteId)).toContainEqual(expect.objectContaining({ habilidad, puntajeItem: valor, pistasUsadas: 1 }));
  // Módulo 7: Progreso la recalcula con RN-07: EMA (α = 0,3) de 0,75 × (0,8 + 0,1 × 3) × 100 = 82,5.
  const m = await maestriaGuardada(estudianteId, habilidad);
  const ultimo = m.cambios.at(-1)!;
  expect(ultimo.origen).toBe('ITEM');
  expect(m.valor).toBeCloseTo(Math.round((0.3 * 82.5 + 0.7 * ultimo.anterior) * 100) / 100, 2);
});

// ── UAT-03: encuentra la evidencia (RF-043) ───────────────────────────────

Dado('un ítem {string} cuya clave son las oraciones {string} y {string}', async ({ page, request, mundo }, _tipo: string, a: string, b: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  mundo.killa = await lecturaKilla(request);
  const item = await itemDeLectura(mundo.killa.lecturaId, ENUNCIADOS.evidencia);
  expect(item.claves.map((c) => c.oracion.texto).sort()).toEqual([a, b].sort());
  await leerPorApi(request, mundo.aula, 'Mateo', mundo.killa.lecturaId, { hasta: ENUNCIADOS.evidencia });
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
  await page.goto(`/estudiante/lecturas/${mundo.killa.lecturaId}`);
  await pregunta(page, ENUNCIADOS.evidencia);
});

const texto = (page: Page) => page.getByRole('article', { name: 'El texto' });

Cuando('el estudiante selecciona la oración {string}', async ({ page }, oracion: string) => {
  await texto(page).getByRole('button', { name: oracion }).click();
  await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();
});

Cuando('el estudiante selecciona las oraciones {string} y {string}', async ({ page }, a: string, b: string) => {
  await texto(page).getByRole('button', { name: a }).click();
  await texto(page).getByRole('button', { name: b }).click();
  await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();
});

Entonces('la evidencia se considera correcta', async ({ page }) => {
  await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
});

Entonces('la evidencia se considera incorrecta', async ({ page }) => {
  await expect(page.getByText('Casi. Lee la pista y vuelve a intentarlo.')).toBeVisible();
  await pregunta(page, ENUNCIADOS.evidencia);
});

Entonces('recibe la pista P1 resaltando el párrafo donde buscar', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Tus pistas' })).toContainText('Pista 1: Busca en el párrafo que acabas de leer.');
  await expect(texto(page).locator('.texto-lectura__parrafo--pista')).toContainText('Un día Pancho no quiso comer.');
});

// ── RF-038, RF-047: predicción y cierre ───────────────────────────────────

Dado('un estudiante que predijo {string} y terminó las actividades de su lectura', async ({ page, request, mundo }, prediccion: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula, 'Mateo', mundo.killa.lecturaId, { prediccion });
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Cuando('llega al cierre', async ({ page, mundo }) => {
  await page.goto(`/estudiante/lecturas/${mundo.killa!.lecturaId}`);
  await expect(page.getByRole('heading', { name: '¿Acertaste?' })).toBeVisible();
});

Entonces('ve lo que predijo junto a lo que pasó', async ({ page }) => {
  const cierre = page.getByRole('region', { name: '¿Acertaste?' });
  await expect(cierre).toContainText('Lo que pensaste');
  await expect(cierre).toContainText('Creo que la llama se enfermará');
  await expect(cierre).toContainText('Lo que pasó');
  await expect(cierre).toContainText(DESENLACE_RIO);
});

Entonces('al escribir su reflexión la lectura queda terminada', async ({ page }) => {
  await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
  await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
  await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
});

// ── RF-051: rúbrica docente ───────────────────────────────────────────────

Dado('un estudiante que escribió una respuesta abierta en su lectura', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula, 'Mateo', mundo.killa.lecturaId, { terminar: true });
});

Cuando('su docente la valora como {string}', async ({ page, mundo }, nivel: string) => {
  await abrirAula(page, mundo.aula!);
  const fila = page.getByRole('region', { name: 'Respuestas por revisar' }).getByRole('listitem', { name: 'Respuesta de Mateo' });
  await expect(fila).toContainText(ENUNCIADOS.escritura);
  await fila.getByLabel(new RegExp(`· ${nivel}`)).check();
  await fila.getByRole('button', { name: 'Guardar valoración' }).click();
  await expect(page.getByText('Valoración guardada para Mateo.')).toBeVisible();
});

Entonces('la respuesta queda valorada con el nivel {int}', async ({ page }, nivel: number) => {
  const revision = page.getByRole('region', { name: 'Respuestas por revisar' });
  await revision.getByRole('button', { name: 'Valoradas' }).click();
  await expect(revision.getByRole('listitem', { name: 'Respuesta de Mateo' })).toContainText(`Nivel ${nivel}:`);
  await salirDelPanel(page);
});
```

**Checklist manual para el Product Owner / líder pedagógico:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Abrir una lectura desde la biblioteca, una misión o la misión del docente | Primero pide la predicción; el texto aún no se ve |
| ☐ | Responder mal una pregunta "durante" | Aparece la pista 1, nunca la respuesta; con P2 se resalta el párrafo |
| ☐ | Equivocarse tras las 3 pistas | "Mira por qué" con la explicación y "Seguir" |
| ☐ | "Encuentra la evidencia" | Las oraciones se tocan; elegir la de la clave da "¡Muy bien!" |
| ☐ | Cerrar el navegador a mitad de la lectura y volver | Sigue en la misma pregunta |
| ☐ | Historia ramificada | La elección cambia el final que se ve en el cierre |
| ☐ | Ordenar en una tablet, arrastrando con el dedo | Las tarjetas se mueven; también con Subir y Bajar |
| ☐ | Escribir una palabra no apropiada | Se reemplaza por *** y se avisa |
| ☐ | Con un niño de 6–7 años, "Escuchar la lectura" (Despacio, Normal, Rápido) | Se oye oración por oración y se resalta la que suena |
| ☐ | "Decirlo con mi voz" | El texto dictado aparece para revisarlo antes de enviarlo |
| ☐ | Cierre | Muestra "Lo que pensaste" y "Lo que pasó" y pide la reflexión |
| ☐ | Como docente, "Respuestas por revisar" en el aula | Se valora con la rúbrica de 3 niveles y pasa a "Valoradas" |
| ☐ | Revisar todo en celular, tablet y computadora | Botones grandes, texto legible, sin desplazarse a los lados |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `lectura.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo lectura`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `lectura.respuesta` (pistas y puntajes) y los eventos `lectura.*` del outbox.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga de la lectura:

```yaml
          LECTURA_ID=$(node tests/load/sembrar-lectura.mjs)
          k6 run -e LECTURA_ID="$LECTURA_ID" tests/load/scenarios/lectura-respuestas.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LEC-U-01 | Guion (RF-038, RF-039, RF-044, RF-047) | Unit | Borde | Orden de pasos, defensa asociada, consigna general, párrafo de la pista, desenlace | `npm run test:unit` |
| LEC-U-02 | Corrección (RF-040 a RF-043) | Unit | Pos./Neg. | Única, múltiple, ordenar mezclado, evidencia (UAT-03), escritura y dictado | `npm run test:unit` |
| LEC-U-03 | Filtro de palabras (RF-041) | Unit | Borde | Variantes filtradas; palabras de los cuentos intactas | `npm run test:unit` |
| LEC-U-04 | Puntaje (RN-07) y rúbrica (RF-051) | Unit | Borde | 1 · 0,75 · 0,5 · 0,25 · 0; 0,33 · 0,67 · 1 | `npm run test:unit` |
| LEC-U-05 | Pistas (RF-045, RN-06, UAT-02) | Unit | Pos./Neg. | P1 → P2 → P3 → explicación; a pedido; sin la respuesta | `npm run test:unit` |
| LEC-U-06 | Agregado `SesionLectura` (RF-046 a RF-048) | Unit | Pos./Neg. | Idempotencia, defensa, cierre, historia, abandono, valoración única | `npm run test:unit` |
| LEC-U-07 | `SesionesUseCase` y `RevisionUseCase` (RN-17) | Unit | Pos./Neg. | Eventos, acceso por edad y asignación, simultáneos, revisión docente | `npm run test:unit` |
| LEC-I-01 | Predicción y anclaje (RF-038, RF-039) | Int | Pos./Neg. | Sin texto antes; 409 fuera de orden | `npm run test:int` |
| LEC-I-02 | Corrección, pistas e idempotencia (RF-040, RF-045, RF-046) | Int | Positivo | Sin clave; 0,75; `ItemRespondido` | `npm run test:int` |
| LEC-I-03 | Evidencia, historia, ordenar, múltiple, escritura, defensa | Int | Pos./Neg. | 400 y 409 en los casos inválidos | `npm run test:int` |
| LEC-I-04 | Cierre (RF-047) | Int | Positivo | Resumen; a revisión; evento; avance para Aventura | `npm run test:int` |
| LEC-I-05 | Versión nueva y reanudación (RF-027, RF-046) | Int | Positivo | Misma sesión y misma versión | `npm run test:int` |
| LEC-I-06 | Acceso y validación | Int | Negativo | 404, 400, 403, 401 | `npm run test:int` |
| LEC-I-07 | Revisión docente (RF-051, RN-17) | Int | Pos./Neg. | Valoración única; 404 y 403 | `npm run test:int` |
| LEC-S-01 | Lectura completa en la web (RF-038 a RF-048) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| LEC-S-02 | Explicación tras las pistas (RF-045) | Sys | Negativo | "Mira por qué" y "Seguir" | `npm run test:e2e` |
| LEC-S-03 | Ordenar arrastrando (RF-042) | Sys | Positivo | Las tarjetas quedan en orden | `npm run test:e2e` |
| LEC-S-04 | Voz (RF-049, RF-050) | Sys | Positivo | Dictado revisable; lectura despacio con resaltado | `npm run test:e2e` |
| LEC-S-05 | Misión del docente y rúbrica (RF-018, RF-051) | Sys | Positivo | "Nivel 3: Logrado" | `npm run test:e2e` |
| LEC-S-06 | Diseño responsivo (RNF-022, RNF-023) | Sys | Borde | Sin desbordes; objetivos de 48 px | `npm run test:e2e` |
| LEC-S-07 | Carga RF-040 / RF-046 | Sys | Rendimiento | Ver §6.3 | `npm run test:lectura --workspace @lectoaventura/tests-load` |
| LEC-A-01..05 | 5 escenarios Gherkin (UAT-02, UAT-03 ×2, RF-047, RF-051) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — reglas puras (guion, corrección, pistas, filtro) y casos de uso con puertos; reloj e ids inyectados.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de Lectura entre 97,7 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — Contenido, IAM y Escuela por anticorrupción; Aventura, Progreso y Gamificación por eventos.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; humo de carga de la lectura en CI.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — reenvíos, pedidos simultáneos, saltos de pregunta, versiones nuevas, abandono y accesos ajenos cubiertos; pendiente el dictado en servidor (V1.1).

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
