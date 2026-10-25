<!-- Generado con node docs/pruebas/construir.mjs desde 08-gamificacion-plan-de-pruebas.plantilla.md. No editar a mano. -->
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

**Defectos encontrados por las pruebas y corregidos:** 8 · **Brechas con el SRS cerradas:** 16 · **Decisiones documentadas donde el SRS no decía cómo:** 12 (ver §1.3).

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
| D-8 | En CI (Chromium en Linux) fallaron 10 pruebas del celular, también de módulos anteriores: el clic caía sobre la barra inferior. "Pasaporte", una sola palabra, no se parte en dos líneas como "Mi perfil": la barra de 5 secciones necesitaba 379 px, cabía justo en 390 px con las fuentes de Windows y no con las de Linux, y por debajo de 379 px (el SRS pide desde 360 px, RNF-022) ensanchaba la página. El celular emulado aleja entonces el zoom y los clics caen en otro lugar. La prueba responsiva no lo veía porque comparaba con `innerWidth`, que en ese caso crece con la página | 3 · CI de GitHub (PR) | La etiqueta de la barra se achica en celulares angostos (de 15 a 12 px como mínimo), las secciones pueden encogerse y, si aun así no cupiera, se recorta con "…"; ahora cabe hasta en 340 px. La prueba responsiva compara con `clientWidth` y revisa además la barra a 360 px |

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

```ts
import { describe, expect, it } from 'vitest';

import { CuentaGamificacion, EstadoCuenta } from '../../../../src/modules/gamificacion/domain/entities/cuenta-gamificacion';
import { habilidadDelReto, RetoDiario } from '../../../../src/modules/gamificacion/domain/entities/reto-diario';
import { MonedasInsuficientesError, RecompensaYaCanjeadaError } from '../../../../src/modules/gamificacion/domain/errors/errores-gamificacion';
import { idDeterminista } from '../../../../src/modules/gamificacion/domain/services/id-origen';
import { monedasDisponibles, validarCanje } from '../../../../src/modules/gamificacion/domain/services/monedas';
import { avanceNivel, nivelLector, umbralNivel } from '../../../../src/modules/gamificacion/domain/services/nivel-lector';
import { leerParametros, PARAMETROS_POR_DEFECTO } from '../../../../src/modules/gamificacion/domain/services/parametros';
import { bonoRacha, conRepeticion, dentroDelTope, palabrasMinimas, puntosDeItem } from '../../../../src/modules/gamificacion/domain/services/politica-puntos';
import { comodinDeEstaSemana, RACHA_VACIA, rachaVigente, registrarDia } from '../../../../src/modules/gamificacion/domain/services/racha';
import { alcanzaNivel, leerRegla, metaDe, ordenarCatalogo } from '../../../../src/modules/gamificacion/domain/services/reglas-insignia';
import { CATALOGO } from '../dobles';

/** Nivel 1 — Dominio de Gamificación (RF-056 a RF-062, RN-10 a RN-13, RN-18, RN-19). */
const P = PARAMETROS_POR_DEFECTO;
const AHORA = new Date('2026-10-21T15:00:00Z');
const HOY = '2026-10-21'; // miércoles

function cuenta(e: Partial<EstadoCuenta> = {}) {
  const estado: EstadoCuenta = {
    estudianteId: 'nino',
    hoy: HOY,
    puntosTotales: 0,
    puntosHoy: 0,
    ganadas: new Set(),
    avances: new Map(),
    racha: { ...RACHA_VACIA },
    reto: null,
    ...e,
  };
  return new CuentaGamificacion(estado, CATALOGO, P, AHORA);
}

const reto = (p: Partial<{ fecha: string; habilidad: 'INF' | 'LIT' }> = {}) =>
  RetoDiario.proponer({ id: 'reto-1', estudianteId: 'nino', fecha: p.fecha ?? HOY, habilidad: p.habilidad ?? 'INF', lectura: null });

describe('Parámetros versionados (RF-078)', () => {
  it('la versión 1 sembrada por la migración da los valores del SRS', () => {
    const v1 = leerParametros(1, {
      puntos: { lecturaCompletada: 20, itemCorrecto: 10, correctoTrasPista: 6, subidaNivelCneb: 50, retoDelDia: 15, racha: { '3': 10, '7': 30, '30': 100 } },
      antiFarming: { porcentajeRepeticion: 25, topeDiario: 300 },
      nivelLector: { umbral: '100 * n * (n + 1) / 2' },
      respuestasAbiertas: { palabrasMinimasR2: 5, palabrasMinimasR3: 10 },
    });
    expect(v1).toEqual(P);
  });

  it('un cambio del administrador se toma; lo ausente o inválido vuelve al valor del SRS', () => {
    const v2 = leerParametros(2, { puntos: { itemCorrecto: 12, retoDelDia: -3, racha: { '5': 20, cero: 3 } }, antiFarming: { porcentajeRepeticion: 150, topeDiario: 500 }, nivelLector: { umbral: '50 * n * (n + 1) / 2' } });
    expect(v2).toMatchObject({ version: 2, puntos: { itemCorrecto: 12, retoDelDia: 15, lecturaCompletada: 20, racha: { '5': 20 } }, antiFarming: { porcentajeRepeticion: 25, topeDiario: 500 }, nivelLector: { base: 50 } });
    expect(leerParametros(3, 'basura')).toEqual({ ...P, version: 3 });
    expect(leerParametros(4, { nivelLector: { umbral: 'n ** 2' }, puntos: { racha: {} } })).toMatchObject({ nivelLector: { base: 100 }, puntos: { racha: P.puntos.racha } });
  });
});

describe('Nivel lector (RF-057)', () => {
  it('el nivel n pide 100 × n × (n + 1) / 2 puntos', () => {
    expect([1, 2, 3, 4].map((n) => umbralNivel(n))).toEqual([100, 300, 600, 1000]);
    expect([0, 99, 100, 299, 300, 599, 600, 1000, 1499, 1500].map((p) => nivelLector(p))).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 4, 5]);
    expect(nivelLector(-5)).toBe(0);
    expect(nivelLector(150, 50)).toBe(2); // base del administrador: 50, 150, 300…
  });

  it('el avance muestra desde dónde viene y cuánto falta para el siguiente', () => {
    expect(avanceNivel(0)).toEqual({ actual: 0, desde: 0, hasta: 100, faltan: 100 });
    expect(avanceNivel(105)).toEqual({ actual: 1, desde: 100, hasta: 300, faltan: 195 });
  });
});

describe('Política de puntos (RN-10, RN-11, RN-12, RN-19)', () => {
  it('acertar a la primera vale 10, tras una pista 6; equivocarse no da ni quita (RN-10)', () => {
    expect(puntosDeItem({ esCorrecta: true, pistasUsadas: 0, palabras: null }, P, 'R2')).toEqual({ motivo: 'ITEM_CORRECTO', puntos: 10 });
    expect(puntosDeItem({ esCorrecta: true, pistasUsadas: 1, palabras: null }, P, 'R2')).toEqual({ motivo: 'CORRECTO_TRAS_PISTA', puntos: 6 });
    expect(puntosDeItem({ esCorrecta: false, pistasUsadas: 3, palabras: null }, P, 'R2')).toBeNull();
  });

  it('RN-19: la abierta da puntos de esfuerzo con ≥ 5 palabras en R2 y ≥ 10 en R3 (R1 como R2)', () => {
    const abierta = (palabras: number | null) => ({ esCorrecta: null, pistasUsadas: 0, palabras });
    expect(puntosDeItem(abierta(5), P, 'R2')).toEqual({ motivo: 'RESPUESTA_ABIERTA', puntos: 10 });
    expect(puntosDeItem(abierta(4), P, 'R2')).toBeNull();
    expect(puntosDeItem(abierta(9), P, 'R3')).toBeNull();
    expect(puntosDeItem(abierta(10), P, 'R3')).not.toBeNull();
    expect(puntosDeItem(abierta(null), P, null)).toBeNull();
    expect([palabrasMinimas('R1', P), palabrasMinimas(null, P)]).toEqual([5, 5]);
  });

  it('RN-12: repetir da el 25 % redondeado y el tope diario es 300', () => {
    expect([10, 6, 20].map((x) => conRepeticion(x, true, P))).toEqual([3, 2, 5]);
    expect(conRepeticion(10, false, P)).toBe(10);
    expect([dentroDelTope(10, 0, P), dentroDelTope(10, 295, P), dentroDelTope(10, 300, P), dentroDelTope(10, 320, P)]).toEqual([10, 5, 0, 0]);
  });

  it('RN-11: la racha da bono solo en sus hitos', () => {
    expect([1, 3, 5, 7, 30].map((d) => bonoRacha(d, P))).toEqual([null, 10, null, 30, 100]);
  });
});

describe('Racha con comodín semanal (RF-061)', () => {
  const r = (ultimaFecha: string, dias: number, comodinSemana: string | null = null) => ({ dias, mejor: dias, ultimaFecha, comodinSemana });

  it('empieza en 1, suma un día seguido e ignora un segundo logro el mismo día o uno atrasado', () => {
    expect(registrarDia(RACHA_VACIA, HOY)).toEqual({ racha: { dias: 1, mejor: 1, ultimaFecha: HOY, comodinSemana: null }, cambio: 'REINICIO' });
    expect(registrarDia(r('2026-10-20', 2), HOY)).toMatchObject({ racha: { dias: 3, mejor: 3 }, cambio: 'SUMA' });
    expect(registrarDia(r(HOY, 3), HOY).cambio).toBe('IGUAL');
    expect(registrarDia(r(HOY, 3), '2026-10-19').cambio).toBe('IGUAL');
  });

  it('el comodín cubre un día perdido una vez por semana (lunes a domingo); sin comodín se reinicia', () => {
    // Leyó el lunes 19, no el martes 20: el comodín de esa semana lo cubre.
    expect(registrarDia(r('2026-10-19', 4), HOY)).toMatchObject({ racha: { dias: 5, comodinSemana: '2026-10-19' }, cambio: 'COMODIN' });
    // Ya lo usó esta semana: se reinicia, pero la mejor racha se conserva.
    expect(registrarDia({ dias: 4, mejor: 9, ultimaFecha: '2026-10-19', comodinSemana: '2026-10-19' }, HOY)).toMatchObject({ racha: { dias: 1, mejor: 9 }, cambio: 'REINICIO' });
    // Dos días sin leer: ningún comodín alcanza.
    expect(registrarDia(r('2026-10-18', 4), HOY).cambio).toBe('REINICIO');
    // El día perdido fue el domingo 18: cuenta el comodín de la semana anterior.
    expect(registrarDia(r('2026-10-17', 2, '2026-10-19'), '2026-10-19')).toMatchObject({ racha: { dias: 3, comodinSemana: '2026-10-12' }, cambio: 'COMODIN' });
  });

  it('la racha visible hoy es 0 si ya se cortó; el comodín de esta semana se ve disponible o usado', () => {
    expect(rachaVigente(RACHA_VACIA, HOY)).toBe(0);
    expect(rachaVigente(r(HOY, 4), HOY)).toBe(4);
    expect(rachaVigente(r('2026-10-20', 4), HOY)).toBe(4);
    expect(rachaVigente(r('2026-10-19', 4), HOY)).toBe(4); // aún puede salvarla el comodín
    expect(rachaVigente(r('2026-10-19', 4, '2026-10-19'), HOY)).toBe(0);
    expect(rachaVigente(r('2026-10-18', 4), HOY)).toBe(0);
    expect(comodinDeEstaSemana(r(HOY, 1), HOY)).toBe(true);
    expect(comodinDeEstaSemana(r(HOY, 1, '2026-10-19'), HOY)).toBe(false);
  });
});

describe('Reglas de insignias (RF-058)', () => {
  it('lee las reglas del catálogo y descarta las mal formadas', () => {
    expect(leerRegla({ tipo: 'EVIDENCIAS', meta: 5 })).toEqual({ tipo: 'EVIDENCIAS', meta: 5 });
    expect(leerRegla({ tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' })).toEqual({ tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' });
    expect(leerRegla({ tipo: 'RACHA', dias: 7 })).toEqual({ tipo: 'RACHA', dias: 7 });
    expect(leerRegla({ tipo: 'MUNDO', numero: 3 })).toEqual({ tipo: 'MUNDO', numero: 3 });
    for (const mala of [null, 'x', { tipo: 'LECTURAS', meta: 0 }, { tipo: 'NIVEL_HABILIDAD', habilidad: 'XYZ', nivel: 'AD' }, { tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'Z' }, { tipo: 'RACHA' }, { tipo: 'MUNDO', numero: -1 }, { tipo: 'OTRA' }]) {
      expect(leerRegla(mala)).toBeNull();
    }
  });

  it('meta visible, niveles que incluyen a los menores y orden del pasaporte', () => {
    expect(CATALOGO.map((i) => metaDe(i.regla))).toEqual([1, 5, null, 7, null]);
    expect([alcanzaNivel('AD', 'A'), alcanzaNivel('A', 'AD'), alcanzaNivel('B', 'B')]).toEqual([true, false, true]);
    expect(ordenarCatalogo([...CATALOGO].reverse()).map((i) => i.codigo)).toEqual(CATALOGO.map((i) => i.codigo));
  });
});

describe('Identificador determinista y monedas (RF-062)', () => {
  it('el mismo logro da siempre el mismo UUID v8; otro logro, otro', () => {
    const a = idDeterminista('racha', 'nino', HOY);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idDeterminista('racha', 'nino', HOY)).toBe(a);
    expect(idDeterminista('racha', 'nino', '2026-10-22')).not.toBe(a);
  });

  it('1 moneda por cada 10 puntos; se canjea una vez y solo si alcanza', () => {
    expect(monedasDisponibles({ puntosTotales: 109, gastadas: 3 })).toBe(7);
    expect(monedasDisponibles({ puntosTotales: 10, gastadas: 5 })).toBe(0);
    expect(() => validarCanje({ puntosTotales: 100, gastadas: 0, yaEsTuya: true }, 5)).toThrow(RecompensaYaCanjeadaError);
    expect(() => validarCanje({ puntosTotales: 100, gastadas: 0, yaEsTuya: false }, 11)).toThrow(new MonedasInsuficientesError(1));
    expect(() => validarCanje({ puntosTotales: 100, gastadas: 0, yaEsTuya: false }, 10)).not.toThrow();
    expect(new MonedasInsuficientesError(3).message).toBe('Te faltan 3 monedas para esta recompensa');
  });
});

describe('Reto del día (RF-060, RN-18)', () => {
  it('apunta a la habilidad más débil; empate por el orden del SRS; sin perfil, comprensión literal', () => {
    expect(habilidadDelReto({ LIT: 70, INF: 30, VOC: 60, CRI: 50, ARG: 40 })).toBe('INF');
    expect(habilidadDelReto({ LIT: 70, INF: 0, VOC: 60, CRI: 0, ARG: 0 })).toBe('INF');
    expect(habilidadDelReto({ LIT: 70 })).toBe('INF');
    expect(habilidadDelReto(null)).toBe('LIT');
  });

  it('avanza con aciertos de su habilidad y se completa al llegar a 3; después ya no cambia', () => {
    const r = reto();
    expect(r.registrarAcierto('LIT', AHORA)).toBe('NADA');
    expect([r.registrarAcierto('INF', AHORA), r.registrarAcierto('INF', AHORA), r.registrarAcierto('INF', AHORA)]).toEqual(['AVANZO', 'AVANZO', 'COMPLETADO']);
    expect(r.datos).toMatchObject({ avance: 3, meta: 3, estado: 'COMPLETADO', completadoEn: AHORA });
    expect(r.registrarAcierto('INF', AHORA)).toBe('NADA');
  });
});

describe('Cuenta de gamificación (RF-056, RF-058, RN-12, RN-13)', () => {
  it('cada otorgamiento es un asiento con motivo; el tope diario corta el último y no deja asientos en 0', () => {
    const c = cuenta({ puntosTotales: 1000, puntosHoy: 295 });
    expect(c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-1')).toBe(5);
    expect(c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-2')).toBe(0);
    expect(c.cambios().asientos).toEqual([{ motivo: 'ITEM_CORRECTO', puntos: 5, origenId: 'r-1', fechaLima: HOY }]);
    expect(c.puntosTotales).toBe(1005);
  });

  it('RF-057: al cruzar un umbral publica la subida de nivel lector', () => {
    const c = cuenta({ puntosTotales: 95 });
    c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-1');
    c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-2');
    expect(c.eventosPendientes().map((e) => [e.nombreEvento, e.datos])).toEqual([
      ['gamificacion.NivelLectorSubido', { estudianteId: 'nino', nivelAnterior: 0, nivelNuevo: 1, puntos: 105 }],
    ]);
  });

  it('UAT-03: cada evidencia suma 1; a la quinta otorga "Detective de Evidencias" una sola vez (RN-13)', () => {
    const c = cuenta({ avances: new Map([['i-detective', 3]]) });
    c.contar('EVIDENCIAS', 'r-4');
    expect(c.cambios().avances).toEqual([{ insigniaId: 'i-detective', avance: 4 }]);
    c.contar('EVIDENCIAS', 'r-5');
    c.contar('EVIDENCIAS', 'r-6');
    expect(c.cambios().insignias.map((i) => [i.insignia.codigo, i.origenId])).toEqual([['DETECTIVE_EVIDENCIAS', 'r-5']]);
    expect(c.eventosPendientes().map((e) => e.datos)).toEqual([{ estudianteId: 'nino', insignia: 'DETECTIVE_EVIDENCIAS' }]);
    expect(cuenta({ ganadas: new Set(['i-detective']) }).cambios().insignias).toEqual([]);
  });

  it('RF-061, RN-11: al llegar a 7 días suma +30 y "Lector Perseverante"; el mismo día no suma dos veces', () => {
    const c = cuenta({ racha: { dias: 6, mejor: 6, ultimaFecha: '2026-10-20', comodinSemana: null } });
    c.registrarDiaLector('s-1');
    c.registrarDiaLector('s-2');
    const cambios = c.cambios();
    expect(cambios.racha).toEqual({ dias: 7, mejor: 7, ultimaFecha: HOY, comodinSemana: null });
    expect(cambios.asientos).toEqual([{ motivo: 'RACHA_7', puntos: 30, origenId: idDeterminista('racha', 'nino', HOY), fechaLima: HOY }]);
    expect(cambios.insignias.map((i) => i.insignia.codigo)).toEqual(['LECTOR_PERSEVERANTE']);
    expect(cuenta().cambios().racha).toBeNull();
  });

  it('RF-060: completar el reto da +15, cuenta para la racha y se publica; un reto de otro día no avanza', () => {
    const r = reto();
    r.registrarAcierto('INF', AHORA);
    r.registrarAcierto('INF', AHORA);
    const c = cuenta({ reto: r });
    c.avanzarReto('LIT');
    expect(c.cambios().reto).toBeNull();
    c.avanzarReto('INF');
    const cambios = c.cambios();
    expect(cambios.reto?.datos.estado).toBe('COMPLETADO');
    expect(cambios.asientos.map((a) => `${a.motivo}:${a.puntos}:${a.origenId}`)).toEqual(['RETO_DEL_DIA:15:reto-1']);
    expect(cambios.racha).toMatchObject({ dias: 1, ultimaFecha: HOY });
    expect(c.eventosPendientes().map((e) => e.nombreEvento)).toEqual(['gamificacion.RetoDelDiaCompletado']);

    const ayer = cuenta({ reto: reto({ fecha: '2026-10-20' }) });
    ayer.avanzarReto('INF');
    expect(ayer.cambios().reto).toBeNull();
    cuenta().avanzarReto('INF'); // sin reto no pasa nada
  });

  it('las insignias de nivel de habilidad y de rango se otorgan con su regla', () => {
    const c = cuenta();
    c.alcanzarNivelHabilidad('INF', 'A', 'm-1');
    c.alcanzarNivelHabilidad('LIT', 'AD', 'm-2');
    c.completarMundo(1, 'w-1');
    expect(c.cambios().insignias).toEqual([]);
    c.alcanzarNivelHabilidad('INF', 'AD', 'm-3');
    c.completarMundo(2, 'w-2');
    expect(c.cambios().insignias.map((i) => i.insignia.codigo)).toEqual(['MAESTRO_INFERENCIAS', 'RANGO_DETECTIVE']);
  });
});
```

`apps/api/test/unit/gamificacion/aplicacion/gamificacion-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { MonedasInsuficientesError, RecompensaYaCanjeadaError } from '../../../../src/modules/gamificacion/domain/errors/errores-gamificacion';
import { idDeterminista } from '../../../../src/modules/gamificacion/domain/services/id-origen';
import { DatosItemRespondido, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoGamificacion, EntornoGamificacion } from '../dobles';

/** Nivel 1 — Casos de uso de Gamificación con dobles (RF-056 a RF-062, RN-10 a RN-13, RN-18, RN-19). */
const NINO = 'nino-9';
const HOY = '2026-10-21';

const item = (p: Partial<DatosItemRespondido> = {}): DatosItemRespondido => ({
  estudianteId: NINO,
  respuestaId: 'r-1',
  sesionId: 's-1',
  lecturaId: 'l-1',
  itemId: 'i-1',
  habilidad: 'INF',
  nivelDificultad: 3,
  esCorrecta: true,
  pistasUsadas: 0,
  puntajeItem: 1,
  esRepeticion: false,
  palabras: null,
  modalidad: 'SELECCION',
  ...p,
});

describe('Gamificación: logros, pasaporte, reto del día y recompensas', () => {
  let e: EntornoGamificacion;

  beforeEach(() => {
    e = crearEntornoGamificacion();
    e.identidad.perfiles.set(NINO, { alias: 'Mateo', avatar: 'zorro', rangoEdad: 'R2' });
    e.maestria.valores.set(NINO, { LIT: 80, INF: 20, VOC: 60, CRI: 40, ARG: 30 });
  });

  describe('Puntos por lo que el niño logra (RF-056, RN-11)', () => {
    it('acierto, corrección tras pista y abierta con esfuerzo; el error no suma ni resta (RN-10)', async () => {
      await e.logros.alItem(item({ respuestaId: 'r-1', pistasUsadas: 1 }));
      await e.logros.alItem(item({ respuestaId: 'r-2', habilidad: 'LIT', modalidad: 'EVIDENCIA' }));
      await e.logros.alItem(item({ respuestaId: 'r-3', esCorrecta: false, pistasUsadas: 3 }));
      await e.logros.alItem(item({ respuestaId: 'r-4', habilidad: 'ARG', esCorrecta: null, puntajeItem: null, palabras: 6, modalidad: 'ESCRITURA' }));
      expect(e.repo.motivos(NINO)).toEqual(['CORRECTO_TRAS_PISTA:6', 'ITEM_CORRECTO:10', 'RESPUESTA_ABIERTA:10']);
      expect(e.repo.aplicados.has('ITEM:r-3')).toBe(false);
    });

    it('RN-19: en R3 la abierta pide 10 palabras; sin el esfuerzo no hay puntos', async () => {
      e.identidad.perfiles.set(NINO, { alias: 'Mateo', avatar: 'zorro', rangoEdad: 'R3' });
      await e.logros.alItem(item({ respuestaId: 'r-1', esCorrecta: null, puntajeItem: null, palabras: 8 }));
      await e.logros.alItem(item({ respuestaId: 'r-2', esCorrecta: null, puntajeItem: null, palabras: 12 }));
      expect(e.repo.motivos(NINO)).toEqual(['RESPUESTA_ABIERTA:10']);
    });

    it('un evento reentregado no suma dos veces', async () => {
      await e.logros.alItem(item());
      await e.logros.alItem(item());
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      expect(e.repo.motivos(NINO)).toEqual(['ITEM_CORRECTO:10', 'LECTURA_COMPLETADA:20']);
    });

    it('terminar una lectura: +20, primer día de racha y "Primera lectura"; sin sesión no hace nada', async () => {
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1' });
      expect(e.repo.asientos).toHaveLength(0);
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      expect(e.repo.motivos(NINO)).toEqual(['LECTURA_COMPLETADA:20']);
      expect(e.repo.rachas.get(NINO)).toMatchObject({ dias: 1, ultimaFecha: HOY });
      expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toEqual(['i-primera']);
      expect(e.bus.nombres()).toEqual(['gamificacion.InsigniaOtorgada']);
    });

    it('RN-12: repetir da el 25 % y no cuenta para las insignias de lecturas ni de evidencias', async () => {
      await e.logros.alItem(item({ esRepeticion: true, modalidad: 'EVIDENCIA' }));
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1', esRepeticion: true });
      expect(e.repo.motivos(NINO)).toEqual(['ITEM_CORRECTO:3', 'LECTURA_COMPLETADA:5']);
      expect(e.repo.avances.get(NINO)?.size ?? 0).toBe(0);
      expect(e.repo.rachas.get(NINO)?.dias).toBe(1); // repetir también es leer
    });

    it('RN-11: +50 la primera vez que una habilidad llega a un nivel CNEB', async () => {
      const subida = { estudianteId: NINO, habilidad: 'INF', nivelAnterior: 'B', nivelNuevo: 'A' };
      await e.logros.alNivelSubido(subida);
      await e.logros.alNivelSubido(subida);
      await e.logros.alNivelSubido({ ...subida, habilidad: 'XYZ' });
      expect(e.repo.motivos(NINO)).toEqual(['SUBIDA_NIVEL_CNEB:50']);
      expect(e.repo.asientos[0]!.origenId).toBe(idDeterminista('nivel', NINO, 'INF', 'A'));
    });
  });

  describe('Insignias por eventos (RF-058)', () => {
    it('"Maestro de las Inferencias" con el nivel Destacado declarado (RN-08: ≥ 5 ítems)', async () => {
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 90, itemsContados: 4 });
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 70, itemsContados: 9 });
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'LIT', valorNuevo: 95, itemsContados: 9 }); // sin regla para LIT
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF' });
      expect(e.repo.ganadas.get(NINO)).toBeUndefined();
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 88, itemsContados: 6 });
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 91, itemsContados: 7 });
      expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toEqual(['i-maestro']);
    });

    it('completar el mundo Detective otorga su rango; un dato inválido se ignora', async () => {
      await e.logros.alMundo({ estudianteId: NINO, mundoCompletado: Number.NaN });
      await e.logros.alMundo({ estudianteId: NINO, mundoCompletado: 2 });
      await e.logros.alMundo({ estudianteId: NINO, mundoCompletado: 2 });
      expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toEqual(['i-detective-rango']);
      expect(e.bus.nombres()).toEqual(['gamificacion.InsigniaOtorgada']);
    });
  });

  describe('Reto del día (RF-060, RN-18)', () => {
    beforeEach(() => {
      e.fichas.lista.push(
        { id: 'l-dificil', titulo: 'El cóndor', rangoEdad: 'R2', nivelDificultad: 3, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
        { id: 'l-leida', titulo: 'Ya la leyó', rangoEdad: 'R2', nivelDificultad: 1, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
        { id: 'l-facil', titulo: 'Pistas en el bosque', rangoEdad: 'R2', nivelDificultad: 1, tematica: 'Bosque', habilidadesObjetivo: ['INF', 'LIT'] },
        { id: 'l-otra', titulo: 'Solo literal', rangoEdad: 'R2', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['LIT'] },
        { id: 'l-r3', titulo: 'Para grandes', rangoEdad: 'R3', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['INF'] },
      );
      e.avance.estados.set('l-leida', 'FINALIZADA');
    });

    it('uno por día, para la habilidad más débil, con la lectura más sencilla aún no terminada', async () => {
      const a = await e.pasaporte.retoDelDia(NINO);
      const b = await e.pasaporte.retoDelDia(NINO);
      expect(a).toEqual(b);
      expect(a).toEqual({ id: 'id-1', fecha: HOY, habilidad: 'INF', meta: 3, avance: 0, estado: 'PROPUESTO', minutos: 5, puntos: 15, completadoEn: null, lectura: { id: 'l-facil', titulo: 'Pistas en el bosque' } });
    });

    it('sin lectura que trabaje esa habilidad, el reto va sin sugerencia; sin perfil activo responde 404', async () => {
      e.maestria.valores.set(NINO, { LIT: 0, INF: 90, VOC: 90, CRI: 90, ARG: 90 });
      e.fichas.lista.splice(0);
      expect((await e.pasaporte.retoDelDia(NINO)).lectura).toBeNull();
      await expect(e.pasaporte.retoDelDia('otro')).rejects.toThrow(NoEncontradoError);
      expect(await e.logros.retoDeHoy('otro', HOY)).toMatchObject({ datos: { habilidad: 'LIT', lectura: null } });
    });

    it('tres aciertos de esa habilidad lo completan: +15, racha y evento', async () => {
      for (const id of ['r-1', 'r-2']) await e.logros.alItem(item({ respuestaId: id }));
      await e.logros.alItem(item({ respuestaId: 'r-x', habilidad: 'LIT' }));
      expect((await e.pasaporte.retoDelDia(NINO)).avance).toBe(2);
      await e.logros.alItem(item({ respuestaId: 'r-3', pistasUsadas: 1 }));
      expect(await e.pasaporte.retoDelDia(NINO)).toMatchObject({ avance: 3, estado: 'COMPLETADO', completadoEn: '2026-10-21T15:00:00.000Z' });
      expect(e.repo.motivos(NINO)).toEqual(['ITEM_CORRECTO:10', 'ITEM_CORRECTO:10', 'ITEM_CORRECTO:10', 'CORRECTO_TRAS_PISTA:6', 'RETO_DEL_DIA:15']);
      expect(e.repo.rachas.get(NINO)?.dias).toBe(1);
      expect(e.bus.nombres()).toContain('gamificacion.RetoDelDiaCompletado');
    });
  });

  describe('Pasaporte del Lector (RF-059)', () => {
    it('reúne puntos, nivel, monedas, racha, insignias con su avance, mundos y lecturas', async () => {
      e.fichas.lista.push({ id: 'l-1', titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales' });
      e.lecturas.lista.push({ lecturaId: 'l-1', finalizadaEn: new Date('2026-10-21T14:00:00Z') }, { lecturaId: 'l-archivada', finalizadaEn: new Date('2026-10-20T14:00:00Z') });
      e.mundos.lista.push({ numero: 1, nombre: 'Explorador', completadoEn: null });
      await e.logros.alItem(item({ respuestaId: 'r-1', modalidad: 'EVIDENCIA', habilidad: 'LIT' }));
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      await e.logros.alNivelSubido({ estudianteId: NINO, habilidad: 'LIT', nivelAnterior: 'A', nivelNuevo: 'AD' });
      e.repo.rachas.set(NINO, { dias: 3, mejor: 5, ultimaFecha: HOY, comodinSemana: '2026-10-19' });

      const v = await e.pasaporte.pasaporte(NINO);
      expect(v).toMatchObject({
        alias: 'Mateo',
        avatar: 'zorro',
        puntos: { total: 80, hoy: 80, topeDiario: 300 },
        nivel: { actual: 0, desde: 0, hasta: 100, faltan: 20 },
        monedas: 8,
        racha: { dias: 3, mejor: 5, leyoHoy: true, comodinDisponible: false },
        mundos: [{ numero: 1, nombre: 'Explorador', completadoEn: null }],
        lecturas: { total: 2, recientes: [{ id: 'l-1', titulo: 'Killa y la llama', finalizadaEn: '2026-10-21T14:00:00.000Z' }] },
      });
      expect(v.insignias.map((i) => [i.codigo, i.ganada, i.avance, i.meta])).toEqual([
        ['PRIMERA_LECTURA', true, 1, 1],
        ['DETECTIVE_EVIDENCIAS', false, 1, 5],
        ['MAESTRO_INFERENCIAS', false, null, null],
        ['LECTOR_PERSEVERANTE', false, 3, 7],
        ['RANGO_DETECTIVE', false, null, null],
      ]);
      expect(v.ultimosPuntos.map((u) => u.motivo)).toEqual(['SUBIDA_NIVEL_CNEB', 'LECTURA_COMPLETADA', 'ITEM_CORRECTO']);
      expect(v.recompensas).toEqual([
        { id: 'r-lupa', codigo: 'LUPA', nombre: 'Lupa de detective', tipo: 'ACCESORIO', costo: 5, tuya: false },
        { id: 'r-llama', codigo: 'LLAMA', nombre: 'Llama', tipo: 'PERSONAJE', costo: 20, tuya: false },
      ]);
    });

    it('sin perfil activo responde 404', async () => {
      await expect(e.pasaporte.pasaporte('otro')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Recompensas (RF-062)', () => {
    it('canjea con monedas, publica el canje y no toca los puntos', async () => {
      for (let i = 0; i < 6; i++) await e.logros.alItem(item({ respuestaId: `r-${i}`, habilidad: 'LIT' })); // 60 puntos = 6 monedas
      expect(await e.pasaporte.canjear(NINO, 'r-lupa')).toEqual({ recompensa: 'LUPA', monedas: 1 });
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: 'gamificacion.RecompensaCanjeada', datos: { estudianteId: NINO, recompensa: 'LUPA', monedas: 5 } });
      expect((await e.pasaporte.pasaporte(NINO)).puntos.total).toBe(60);
      await expect(e.pasaporte.canjear(NINO, 'r-lupa')).rejects.toThrow(RecompensaYaCanjeadaError);
      await expect(e.pasaporte.canjear(NINO, 'r-llama')).rejects.toThrow(MonedasInsuficientesError);
      await expect(e.pasaporte.canjear(NINO, 'no-existe')).rejects.toThrow(NoEncontradoError);
    });
  });
});
```

`apps/api/test/unit/gamificacion/dobles.ts`:

```ts
/**
 * Dobles de prueba de Gamificación: repositorio en memoria con las mismas barreras que la base (cada
 * evento se aplica una vez, asiento único por origen y motivo, un reto por día, un canje por recompensa)
 * y las fuentes del shared-kernel (IAM, maestría, fichas, avance, lecturas y mundos) simuladas.
 */
import type {
  AvanceLectura,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  LecturaRealizada,
  Maestrias,
  MundoCompletado,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorLecturasRealizadas,
  ResolutorMaestria,
  ResolutorMundosCompletados,
} from '../../../src/modules/shared-kernel/public-api';
import type {
  ClaveEvento,
  GamificacionRepository,
  IdentidadEstudiantes,
  RecompensaCatalogo,
  ResumenCuenta,
} from '../../../src/modules/gamificacion/application/ports/gamificacion.ports';
import { LogrosUseCase } from '../../../src/modules/gamificacion/application/use-cases/logros.use-case';
import { PasaporteUseCase } from '../../../src/modules/gamificacion/application/use-cases/pasaporte.use-case';
import { CuentaGamificacion, EstadoCuenta } from '../../../src/modules/gamificacion/domain/entities/cuenta-gamificacion';
import { RetoDiario } from '../../../src/modules/gamificacion/domain/entities/reto-diario';
import { SaldoMonedas } from '../../../src/modules/gamificacion/domain/services/monedas';
import { PARAMETROS_POR_DEFECTO, ParametrosGamificacion } from '../../../src/modules/gamificacion/domain/services/parametros';
import { MotivoPuntos } from '../../../src/modules/gamificacion/domain/services/politica-puntos';
import { EstadoRacha, RACHA_VACIA } from '../../../src/modules/gamificacion/domain/services/racha';
import { InsigniaCatalogo } from '../../../src/modules/gamificacion/domain/services/reglas-insignia';
import { BusEspia, Reloj } from '../iam/dobles';

/** El catálogo que siembra la migración (subconjunto suficiente para las reglas). */
export const CATALOGO: InsigniaCatalogo[] = [
  { id: 'i-primera', codigo: 'PRIMERA_LECTURA', nombre: 'Primera lectura', descripcion: '', regla: { tipo: 'LECTURAS', meta: 1 } },
  { id: 'i-detective', codigo: 'DETECTIVE_EVIDENCIAS', nombre: 'Detective de Evidencias', descripcion: '', regla: { tipo: 'EVIDENCIAS', meta: 5 } },
  { id: 'i-maestro', codigo: 'MAESTRO_INFERENCIAS', nombre: 'Maestro de las Inferencias', descripcion: '', regla: { tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' } },
  { id: 'i-perseverante', codigo: 'LECTOR_PERSEVERANTE', nombre: 'Lector Perseverante', descripcion: '', regla: { tipo: 'RACHA', dias: 7 } },
  { id: 'i-detective-rango', codigo: 'RANGO_DETECTIVE', nombre: 'Rango Detective', descripcion: '', regla: { tipo: 'MUNDO', numero: 2 } },
];

export const RECOMPENSAS: RecompensaCatalogo[] = [
  { id: 'r-lupa', codigo: 'LUPA', nombre: 'Lupa de detective', tipo: 'ACCESORIO', costo: 5 },
  { id: 'r-llama', codigo: 'LLAMA', nombre: 'Llama', tipo: 'PERSONAJE', costo: 20 },
];

interface Asiento {
  estudianteId: string;
  motivo: MotivoPuntos;
  puntos: number;
  origenId: string;
  fechaLima: string;
  creadoEn: Date;
}

export class GamificacionEnMemoria implements GamificacionRepository {
  readonly aplicados = new Set<string>();
  readonly asientos: Asiento[] = [];
  readonly ganadas = new Map<string, Map<string, Date>>();
  readonly avances = new Map<string, Map<string, number>>();
  readonly rachas = new Map<string, EstadoRacha>();
  readonly retos = new Map<string, RetoDiario>();
  readonly canjes: { estudianteId: string; recompensaId: string; monedas: number }[] = [];
  p: ParametrosGamificacion = PARAMETROS_POR_DEFECTO;
  catalogo: InsigniaCatalogo[] = CATALOGO;

  async parametros() {
    return this.p;
  }

  async insignias() {
    return this.catalogo;
  }

  async recompensas() {
    return RECOMPENSAS;
  }

  /** Comprueba y escribe sin ceder el turno, como la transacción con candado de la base. */
  async aplicar(estudianteId: string, clave: ClaveEvento, hoy: string, operar: (estado: EstadoCuenta) => CuentaGamificacion) {
    const llave = `${clave.tipo}:${clave.origenId}`;
    if (this.aplicados.has(llave)) return null;
    this.aplicados.add(llave);
    const reto = this.retos.get(`${estudianteId}:${hoy}`);
    const cuenta = operar({
      estudianteId,
      hoy,
      puntosTotales: this.total(estudianteId),
      puntosHoy: this.total(estudianteId, hoy),
      ganadas: new Set(this.ganadas.get(estudianteId)?.keys() ?? []),
      avances: new Map(this.avances.get(estudianteId) ?? []),
      racha: { ...(this.rachas.get(estudianteId) ?? RACHA_VACIA) },
      reto: reto ? RetoDiario.desdePersistencia({ ...reto.datos }) : null,
    });
    const c = cuenta.cambios();
    for (const a of c.asientos) {
      if (this.asientos.some((x) => x.origenId === a.origenId && x.motivo === a.motivo)) continue; // UNIQUE (evento_origen, motivo)
      this.asientos.push({ estudianteId, ...a, creadoEn: new Date() });
    }
    const ganadas = this.ganadas.get(estudianteId) ?? new Map<string, Date>();
    for (const i of c.insignias) if (!ganadas.has(i.insignia.id)) ganadas.set(i.insignia.id, i.otorgadaEn);
    this.ganadas.set(estudianteId, ganadas);
    const avances = this.avances.get(estudianteId) ?? new Map<string, number>();
    for (const a of c.avances) avances.set(a.insigniaId, a.avance);
    this.avances.set(estudianteId, avances);
    if (c.racha) this.rachas.set(estudianteId, c.racha);
    if (c.reto) this.retos.set(`${estudianteId}:${c.reto.datos.fecha}`, c.reto);
    return cuenta;
  }

  async resumen(estudianteId: string, hoy: string): Promise<ResumenCuenta> {
    const canjes = this.canjes.filter((c) => c.estudianteId === estudianteId);
    return {
      puntosTotales: this.total(estudianteId),
      puntosHoy: this.total(estudianteId, hoy),
      ganadas: new Map(this.ganadas.get(estudianteId) ?? []),
      avances: new Map(this.avances.get(estudianteId) ?? []),
      racha: { ...(this.rachas.get(estudianteId) ?? RACHA_VACIA) },
      monedasGastadas: canjes.reduce((s, c) => s + c.monedas, 0),
      canjeadas: new Set(canjes.map((c) => c.recompensaId)),
      ultimos: this.asientos.filter((a) => a.estudianteId === estudianteId).slice(-5).reverse(),
    };
  }

  async retoDe(estudianteId: string, fecha: string) {
    return this.retos.get(`${estudianteId}:${fecha}`) ?? null;
  }

  async proponerReto(reto: RetoDiario) {
    const llave = `${reto.datos.estudianteId}:${reto.datos.fecha}`;
    if (!this.retos.has(llave)) this.retos.set(llave, reto);
    return this.retos.get(llave) as RetoDiario;
  }

  async canjear(estudianteId: string, recompensa: RecompensaCatalogo, _canje: { id: string; ahora: Date }, validar: (s: SaldoMonedas & { yaEsTuya: boolean }) => void) {
    const propias = this.canjes.filter((c) => c.estudianteId === estudianteId);
    const saldo = { puntosTotales: this.total(estudianteId), gastadas: propias.reduce((s, c) => s + c.monedas, 0) };
    validar({ ...saldo, yaEsTuya: propias.some((c) => c.recompensaId === recompensa.id) });
    this.canjes.push({ estudianteId, recompensaId: recompensa.id, monedas: recompensa.costo });
    return Math.floor(saldo.puntosTotales / 10) - saldo.gastadas - recompensa.costo;
  }

  total(estudianteId: string, fecha?: string) {
    return this.asientos.filter((a) => a.estudianteId === estudianteId && (!fecha || a.fechaLima === fecha)).reduce((s, a) => s + a.puntos, 0);
  }

  motivos(estudianteId: string) {
    return this.asientos.filter((a) => a.estudianteId === estudianteId).map((a) => `${a.motivo}:${a.puntos}`);
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfiles = new Map<string, { alias: string; avatar: string; rangoEdad: RangoEdad }>();
  async perfil(id: string) {
    return this.perfiles.get(id) ?? null;
  }
}

export class MaestriaFalsa implements ResolutorMaestria {
  readonly valores = new Map<string, Maestrias>();
  async maestriasDe(id: string) {
    return this.valores.get(id) ?? null;
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly lista: FichaLecturaPublicada[] = [];
  async fichas(ids: string[]) {
    return this.lista.filter((f) => ids.includes(f.id));
  }
  async publicadas(rango: RangoEdad) {
    return this.lista.filter((f) => f.rangoEdad === rango);
  }
}

export class AvanceFalso implements ResolutorAvanceLecturas {
  readonly estados = new Map<string, AvanceLectura>();
  async avanceDe(_id: string, ids: string[]) {
    return new Map([...this.estados].filter(([k]) => ids.includes(k)));
  }
}

export class LecturasFalsas implements ResolutorLecturasRealizadas {
  readonly lista: LecturaRealizada[] = [];
  async realizadasDe() {
    return this.lista;
  }
}

export class MundosFalsos implements ResolutorMundosCompletados {
  readonly lista: MundoCompletado[] = [];
  async completadosDe() {
    return this.lista;
  }
}

/** Ensambla los casos de uso con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoGamificacion() {
  let secuencia = 0;
  const reloj = new Reloj(new Date('2026-10-21T15:00:00Z')); // miércoles 21, 10:00 en Lima
  const generarId = () => `id-${++secuencia}`;
  const repo = new GamificacionEnMemoria();
  const identidad = new IdentidadFalsa();
  const maestria = new MaestriaFalsa();
  const fichas = new FichasFalsas();
  const avance = new AvanceFalso();
  const lecturas = new LecturasFalsas();
  const mundos = new MundosFalsos();
  const bus = new BusEspia();
  const logros = new LogrosUseCase(repo, identidad, maestria, fichas, avance, bus, generarId, reloj.ahora);
  const pasaporte = new PasaporteUseCase(repo, identidad, lecturas, mundos, fichas, logros, bus, generarId, reloj.ahora);
  return { reloj, repo, identidad, maestria, fichas, avance, lecturas, mundos, bus, logros, pasaporte };
}

export type EntornoGamificacion = ReturnType<typeof crearEntornoGamificacion>;
```

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

```ts
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import {
  BUS_EVENTOS,
  BusEventos,
  crearEvento,
  EVENTOS_INTEGRACION,
  fechaLocalLima,
  lunesDeLaSemana,
  uuidV7,
} from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Gamificación integrada (RF-056 a RF-062) contra PostgreSQL real: una lectura real deja en el
 * libro de puntos un asiento por motivo (RN-11, RN-19, UAT-02), suma a "Detective de Evidencias"
 * (UAT-03), a la racha y al reto del día; reentregar los eventos no suma dos veces; repetir da el 25 % y
 * el tope diario de 300 se respeta aunque lleguen muchos logros a la vez (RN-12); las insignias son
 * irrevocables (RN-13) y canjear recompensas descuenta monedas, nunca puntos (RF-062).
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';

let t: AppDePrueba;
let bus: BusEventos;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoy = () => fechaLocalLima(new Date());
const diaAntes = (dias: number) => new Date(Date.parse(`${hoy()}T00:00:00Z`) - dias * 86_400_000);

beforeAll(async () => {
  t = await crearApp();
  bus = t.app.get<BusEventos>(BUS_EVENTOS);
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

/** Lectura de 8–9 años publicada por el flujo real; `killa`: inferencia con pistas, evidencia y una abierta. */
async function publicar(titulo: string, killa: boolean) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo, rangoEdad: 'R2', nivelDificultad: killa ? 2 : 1, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: killa ? ['INF', 'ARG'] : ['INF'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const o = oraciones.map((x) => x.id);
  const actividades = killa
    ? [
        { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿Qué crees que le pasará a la llama?', explicacionModelada: 'Al leer lo sabrás.' }] },
        {
          momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
          items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no come?')] }],
        },
        {
          momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
          items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
        },
        { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', explicacionModelada: 'Sí: así encontró la espina.' }] },
      ]
    : [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'SELECCION', enunciado: '¿Por qué sonrió Killa?', opciones: ['Pancho comió feliz', 'Llovió mucho'], indiceCorrecto: 0, explicacionModelada: 'Pancho ya estaba bien.', pistas: [pista('P1', 'Mira la última oración.')] }] }];
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
  return { lecturaId, o };
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
}

/** Lee la lectura completa por la API; `fallarInferencia`: primero se equivoca y corrige tras la pista P1. */
async function leer(token: string, l: { lecturaId: string; o: string[] }, fallarInferencia = false) {
  const inicio = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(token)).send({ lecturaId: l.lecturaId }).expect(201)).body;
  const id = inicio.id as string;
  if (inicio.fase === 'PREDICCION') await t.http().put(`${API}/sesiones-lectura/${id}/prediccion`).set(bearer(token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200);
  let primerIntento = true;
  for (let paso = 0; paso < 12; paso++) {
    const s = (await t.http().get(`${API}/sesiones-lectura/${id}`).set(bearer(token)).expect(200)).body;
    const p = s.pregunta as { itemId: string; enunciado: string; opciones: string[] } | null;
    if (!p) break;
    let cuerpo: Record<string, unknown>;
    if (p.enunciado === '¿Por qué Pancho no quiso comer?') {
      cuerpo = { indice: p.opciones.indexOf(fallarInferencia && primerIntento ? 'Estaba feliz' : 'Le dolía algo') };
      primerIntento = false;
    } else if (p.enunciado.startsWith('Toca la oración')) cuerpo = { oraciones: [l.o[3]] };
    else if (p.enunciado.startsWith('¿Fue buena idea')) cuerpo = { texto: 'Sí, porque así encontró la espina y lo curó' };
    else cuerpo = { indice: p.opciones.indexOf('Pancho comió feliz') };
    await t.http().post(`${API}/sesiones-lectura/${id}/respuestas`).set(bearer(token)).send({ itemId: p.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
  }
  await t.http().post(`${API}/sesiones-lectura/${id}/finalizar`).set(bearer(token)).send({ reflexion: 'Pensé que se enfermaba y era una espina' }).expect(200);
  return id;
}

/** Un ItemRespondido sin puntaje de maestría (Progreso lo ignora): solo mueve la gamificación. */
function itemSintetico(estudianteId: string, extra: Record<string, unknown> = {}) {
  const respuestaId = uuidV7();
  return crearEvento(EVENTOS_INTEGRACION.ITEM_RESPONDIDO, uuidV7(), {
    estudianteId, respuestaId, sesionId: uuidV7(), lecturaId: uuidV7(), itemId: uuidV7(), habilidad: 'LIT', nivelDificultad: 1,
    esCorrecta: true, pistasUsadas: 0, puntajeItem: null, esRepeticion: false, palabras: null, modalidad: 'SELECCION', ...extra,
  });
}

let editora: string;
let revisora: string;
let tokenDocente: string;
let mateo: { id: string; token: string };
let lia: { id: string; token: string };
let killa: { lecturaId: string; o: string[] };
let bosque: { lecturaId: string; o: string[] };

const pasaporte = (token = mateo.token) => t.http().get(`${API}/yo/pasaporte`).set(bearer(token));
const asientos = (estudianteId = mateo.id) => t.prisma.asientoPuntos.findMany({ where: { estudianteId }, orderBy: { id: 'asc' } });
const insignia = (v: { insignias: { codigo: string }[] }, codigo: string) => v.insignias.find((i) => i.codigo === codigo);
const total = async (estudianteId = mateo.id) => (await asientos(estudianteId)).reduce((s, a) => s + a.puntos, 0);

describe('Preparación', () => {
  it('lecturas publicadas y una docente con Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisora = await backoffice('REVISOR');
    killa = await publicar('Killa y la llama', true);
    bosque = await publicar('Pistas en el bosque', false);
    tokenDocente = await docente();
    const aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
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

describe('Pasaporte del Lector y reto del día (RF-059, RF-060)', () => {
  it('RF-059: sin logros, el pasaporte muestra el catálogo por ganar, nivel 0 y ninguna moneda', async () => {
    const v = (await pasaporte().expect(200)).body;
    expect(v).toMatchObject({
      alias: 'Mateo', avatar: 'zorro', puntos: { total: 0, hoy: 0, topeDiario: 300 }, nivel: { actual: 0, desde: 0, hasta: 100, faltan: 100 },
      monedas: 0, racha: { dias: 0, mejor: 0, leyoHoy: false, comodinDisponible: true }, mundos: [], lecturas: { total: 0, recientes: [] }, ultimosPuntos: [],
    });
    expect(v.insignias.map((i: { codigo: string }) => i.codigo)).toEqual([
      'PRIMERA_LECTURA', 'DETECTIVE_EVIDENCIAS', 'MAESTRO_INFERENCIAS', 'LECTOR_PERSEVERANTE', 'RANGO_EXPLORADOR', 'RANGO_DETECTIVE', 'RANGO_INVESTIGADOR', 'RANGO_CRITICO', 'MAESTRO_LECTURA',
    ]);
    expect(v.insignias.every((i: { ganada: boolean }) => !i.ganada)).toBe(true);
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')).toMatchObject({ avance: 0, meta: 5 });
    expect(insignia(v, 'MAESTRO_INFERENCIAS')).toMatchObject({ avance: null, meta: null });
    expect(v.recompensas).toHaveLength(10);
    expect(v.recompensas[0]).toMatchObject({ codigo: 'LUPA', tipo: 'ACCESORIO', costo: 5, tuya: false });
  });

  it('RF-060, RN-18: un reto por día, orientado a la habilidad más débil y con una lectura para lograrlo', async () => {
    await retoInicial(mateo.token, ['LIT', 'VOC']); // INF, CRI y ARG quedan en 0: gana INF por el orden del SRS
    const a = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body;
    const b = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body;
    expect(a).toEqual(b);
    expect(a).toMatchObject({ fecha: hoy(), habilidad: 'INF', meta: 3, avance: 0, estado: 'PROPUESTO', minutos: 5, puntos: 15, lectura: { id: bosque.lecturaId, titulo: 'Pistas en el bosque' } });
    expect(await t.prisma.retoDiario.count({ where: { estudianteId: mateo.id } })).toBe(1);
  });

  it('RN-18: el reto de un día anterior sin completar queda vencido', async () => {
    const ayer = await t.prisma.retoDiario.create({ data: { estudianteId: lia.id, fechaLima: diaAntes(1), habilidad: 'LIT', contenido: { meta: 3, avance: 1 } } });
    const v = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(lia.token)).expect(200)).body;
    expect(v.fecha).toBe(hoy());
    expect((await t.prisma.retoDiario.findUniqueOrThrow({ where: { id: ayer.id } })).estado).toBe('VENCIDO');
  });
});

describe('Libro de puntos (RF-056, RN-10, RN-11, RN-19)', () => {
  let sesion: string;

  it('UAT-02, UAT-03: una lectura real deja un asiento por motivo y suma a la evidencia, la racha y el reto', async () => {
    sesion = await leer(mateo.token, killa, true);
    expect((await asientos()).map((a) => `${a.motivo}:${a.puntos}`)).toEqual([
      'CORRECTO_TRAS_PISTA:6', // UAT-02: corrige tras la pista P1 (el error no resta, RN-10)
      'ITEM_CORRECTO:10', // la evidencia a la primera
      'RESPUESTA_ABIERTA:10', // RN-19: 9 palabras (≥ 5 en R2) al enviarla
      'LECTURA_COMPLETADA:20',
    ]);
    const a = await asientos();
    expect(a.every((x) => x.fechaLima.toISOString().slice(0, 10) === hoy())).toBe(true);
    expect(a.at(-1)!.eventoOrigen).toBe(sesion);

    const v = (await pasaporte().expect(200)).body;
    expect(v).toMatchObject({ puntos: { total: 46, hoy: 46 }, nivel: { actual: 0, faltan: 54 }, monedas: 4, racha: { dias: 1, mejor: 1, leyoHoy: true } });
    expect(insignia(v, 'PRIMERA_LECTURA')).toMatchObject({ ganada: true, avance: 1, meta: 1 });
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')).toMatchObject({ ganada: false, avance: 1, meta: 5 }); // UAT-03: aumenta en 1
    expect(v.lecturas).toMatchObject({ total: 1, recientes: [{ id: killa.lecturaId, titulo: 'Killa y la llama' }] });
    expect(v.ultimosPuntos[0]).toMatchObject({ motivo: 'LECTURA_COMPLETADA', puntos: 20 });
    expect((await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body).toMatchObject({ habilidad: 'INF', avance: 1, estado: 'PROPUESTO' });
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.InsigniaOtorgada', agregadoId: mateo.id } })).toBe(1);
  });

  it('reentregar los eventos de la lectura desde el outbox no suma dos veces', async () => {
    const eventos = await t.prisma.outboxEvento.findMany({
      where: { agregadoId: sesion, tipo: { in: [EVENTOS_INTEGRACION.ITEM_RESPONDIDO, EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA] } },
    });
    expect(eventos.length).toBeGreaterThanOrEqual(4);
    await bus.publicar(eventos.map((e) => crearEvento(e.tipo, e.agregadoId, e.payload as object, e.ocurrioEn)));
    expect(await total()).toBe(46);
    expect((await t.prisma.avanceInsignia.findMany({ where: { estudianteId: mateo.id } })).map((x) => x.avance)).toEqual([1, 1]); // Primera lectura y Detective
    expect((await t.prisma.racha.findUniqueOrThrow({ where: { estudianteId: mateo.id } })).diasActuales).toBe(1);
  });

  it('RN-12: repetir una lectura ya terminada otorga el 25 % y no suma a las insignias', async () => {
    await leer(mateo.token, killa);
    expect((await asientos()).slice(4).map((a) => `${a.motivo}:${a.puntos}`)).toEqual(['ITEM_CORRECTO:3', 'ITEM_CORRECTO:3', 'RESPUESTA_ABIERTA:3', 'LECTURA_COMPLETADA:5']);
    const v = (await pasaporte().expect(200)).body;
    expect(v.puntos.total).toBe(60);
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')!.avance).toBe(1);
    expect(v.lecturas.total).toBe(1);
    expect(v.racha.dias).toBe(1); // el mismo día no suma otra vez
  });

  it('RF-060, RF-057: completar el reto del día suma +15 y, con 100 puntos, sube al nivel lector 1', async () => {
    await leer(mateo.token, bosque);
    const reto = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body;
    expect(reto).toMatchObject({ avance: 3, estado: 'COMPLETADO' });
    expect(reto.completadoEn).not.toBeNull();
    expect((await asientos()).slice(8).map((a) => `${a.motivo}:${a.puntos}`)).toEqual(['ITEM_CORRECTO:10', 'RETO_DEL_DIA:15', 'LECTURA_COMPLETADA:20']);
    const v = (await pasaporte().expect(200)).body;
    expect(v).toMatchObject({ puntos: { total: 105 }, nivel: { actual: 1, desde: 100, hasta: 300, faltan: 195 }, monedas: 10 });
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.NivelLectorSubido', agregadoId: mateo.id } })).toBe(1);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.RetoDelDiaCompletado', agregadoId: mateo.id } })).toBe(1);
  });

  it('RN-11: subir de nivel CNEB en una habilidad da +50 una sola vez por nivel', async () => {
    const subida = crearEvento(EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO, mateo.id, { estudianteId: mateo.id, habilidad: 'LIT', nivelAnterior: 'B', nivelNuevo: 'A' });
    await bus.publicar([subida]);
    await bus.publicar([crearEvento(EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO, mateo.id, { estudianteId: mateo.id, habilidad: 'LIT', nivelAnterior: 'B', nivelNuevo: 'A' })]);
    expect((await asientos()).filter((a) => a.motivo === 'SUBIDA_NIVEL_CNEB').map((a) => a.puntos)).toEqual([50]);
  });
});

describe('Insignias (RF-058, RN-13) y racha (RF-061)', () => {
  it('UAT-03: la quinta evidencia correcta otorga "Detective de Evidencias", una sola vez', async () => {
    for (let i = 0; i < 5; i++) await bus.publicar([itemSintetico(mateo.id, { modalidad: 'EVIDENCIA' })]);
    const v = (await pasaporte().expect(200)).body;
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')).toMatchObject({ ganada: true, avance: 5, meta: 5 });
    expect(await t.prisma.insigniaOtorgada.count({ where: { estudianteId: mateo.id, insignia: { codigo: 'DETECTIVE_EVIDENCIAS' } } })).toBe(1);
  });

  it('"Maestro de las Inferencias" pide el nivel Destacado declarado (RN-08: con 5 ítems o más)', async () => {
    const maestria = (valorNuevo: number, itemsContados: number) =>
      crearEvento(EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, mateo.id, { estudianteId: mateo.id, habilidad: 'INF', valorAnterior: 80, valorNuevo, itemsContados });
    await bus.publicar([maestria(90, 4)]);
    expect(insignia((await pasaporte()).body, 'MAESTRO_INFERENCIAS')!.ganada).toBe(false);
    await bus.publicar([maestria(90, 6), maestria(92, 7)]);
    expect(insignia((await pasaporte()).body, 'MAESTRO_INFERENCIAS')!.ganada).toBe(true);
    expect(await t.prisma.insigniaOtorgada.count({ where: { estudianteId: mateo.id, insignia: { codigo: 'MAESTRO_INFERENCIAS' } } })).toBe(1);
  });

  it('SAD §6: completar un mundo del mapa otorga su insignia de rango', async () => {
    await bus.publicar([crearEvento('aventura.MundoDesbloqueado', mateo.id, { estudianteId: mateo.id, mundoCompletado: 2, mundoDesbloqueado: 3 })]);
    const v = (await pasaporte()).body;
    expect(insignia(v, 'RANGO_DETECTIVE')!.ganada).toBe(true);
    expect(insignia(v, 'RANGO_EXPLORADOR')!.ganada).toBe(false);
  });

  it('RF-061: el comodín semanal cubre un día sin leer; a los 7 días suma +30 y "Lector Perseverante"', async () => {
    // Llevaba 6 días hasta anteayer; ayer no leyó.
    await t.prisma.racha.update({ where: { estudianteId: mateo.id }, data: { diasActuales: 6, mejorRacha: 6, ultimaFechaLima: diaAntes(2), comodinUsadoSemana: null } });
    expect((await pasaporte()).body.racha).toMatchObject({ dias: 6, leyoHoy: false });
    await leer(mateo.token, bosque); // repetición: también es un día con lectura
    const fila = await t.prisma.racha.findUniqueOrThrow({ where: { estudianteId: mateo.id } });
    expect(fila).toMatchObject({ diasActuales: 7, mejorRacha: 7 });
    const ayer = diaAntes(1).toISOString().slice(0, 10);
    expect(fila.comodinUsadoSemana?.toISOString().slice(0, 10)).toBe(lunesDeLaSemana(ayer));
    expect((await asientos()).filter((a) => a.motivo === 'RACHA_7').map((a) => a.puntos)).toEqual([30]);
    const v = (await pasaporte()).body;
    expect(v.racha).toMatchObject({ dias: 7, mejor: 7, leyoHoy: true, comodinDisponible: lunesDeLaSemana(ayer) !== lunesDeLaSemana(hoy()) });
    expect(insignia(v, 'LECTOR_PERSEVERANTE')).toMatchObject({ ganada: true, avance: 7, meta: 7 });
  });

  it('RF-061: sin comodín, pasar un día sin leer reinicia la racha', async () => {
    await t.prisma.racha.update({ where: { estudianteId: mateo.id }, data: { diasActuales: 7, ultimaFechaLima: diaAntes(3) } });
    expect((await pasaporte()).body.racha.dias).toBe(0);
    await leer(mateo.token, killa);
    expect(await t.prisma.racha.findUniqueOrThrow({ where: { estudianteId: mateo.id } })).toMatchObject({ diasActuales: 1, mejorRacha: 7 });
  });

  it('RN-13: el libro de puntos, las insignias otorgadas y los canjes solo admiten agregar', async () => {
    const [primero] = await asientos();
    await expect(t.prisma.asientoPuntos.update({ where: { id: primero!.id }, data: { puntos: 999 } })).rejects.toThrow(/solo admite agregar/);
    await expect(t.prisma.insigniaOtorgada.deleteMany({ where: { estudianteId: mateo.id } })).rejects.toThrow(/solo admite agregar/);
    await expect(t.prisma.$executeRaw`INSERT INTO gamificacion.asiento_puntos (estudiante_id, puntos, motivo, evento_origen, fecha_lima) VALUES (${mateo.id}::uuid, -5, 'ITEM_CORRECTO', ${uuidV7()}::uuid, CURRENT_DATE)`).rejects.toThrow(/ck_asiento_puntos/);
    await expect(t.prisma.$executeRaw`INSERT INTO gamificacion.asiento_puntos (estudiante_id, puntos, motivo, evento_origen, fecha_lima) VALUES (${mateo.id}::uuid, 5, 'REGALO', ${uuidV7()}::uuid, CURRENT_DATE)`).rejects.toThrow(/ck_asiento_motivo/);
  });
});

describe('Tope diario (RN-12)', () => {
  it('aunque lleguen 40 aciertos a la vez, Lía no pasa de 300 puntos en el día', async () => {
    await Promise.all(Array.from({ length: 40 }, () => bus.publicar([itemSintetico(lia.id)])));
    expect(await total(lia.id)).toBe(300);
    expect(await t.prisma.asientoPuntos.count({ where: { estudianteId: lia.id } })).toBe(30);
    await bus.publicar([itemSintetico(lia.id)]);
    expect(await total(lia.id)).toBe(300);
    expect((await pasaporte(lia.token)).body).toMatchObject({ puntos: { total: 300, hoy: 300 }, nivel: { actual: 2, desde: 300, hasta: 600 }, monedas: 30 });
  });
});

describe('Recompensas (RF-062)', () => {
  const recompensa = async (codigo: string) => (await t.prisma.recompensa.findUniqueOrThrow({ where: { codigo } })).id;
  const canjear = (id: string, token = lia.token) => t.http().post(`${API}/yo/recompensas/${id}/canje`).set(bearer(token));

  it('canjear descuenta monedas, nunca puntos de nivel; cada recompensa se canjea una vez', async () => {
    const r = (await canjear(await recompensa('LLAMA')).expect(201)).body;
    expect(r).toEqual({ recompensa: 'LLAMA', monedas: 10 });
    const v = (await pasaporte(lia.token)).body;
    expect(v).toMatchObject({ puntos: { total: 300 }, nivel: { actual: 2 }, monedas: 10 });
    expect(v.recompensas.find((x: { codigo: string }) => x.codigo === 'LLAMA')).toMatchObject({ tuya: true });
    expect((await canjear(await recompensa('LLAMA')).expect(409)).body.detail).toBe('Esta recompensa ya es tuya');
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.RecompensaCanjeada', agregadoId: lia.id } })).toBe(1);
  });

  it('sin monedas suficientes no se canjea, y dos canjes a la vez no gastan de más', async () => {
    expect((await canjear(await recompensa('DRAGON')).expect(409)).body.detail).toBe('Te faltan 50 monedas para esta recompensa');
    const [a, b] = await Promise.all([canjear(await recompensa('CORONA')), canjear(await recompensa('CAPA'))]); // 25 y 15 con 10 monedas
    expect([a.status, b.status]).toEqual([409, 409]);
    const otras = await Promise.all([canjear(await recompensa('LUPA')), canjear(await recompensa('GORRA'))]); // 5 + 8 > 10
    expect(otras.map((x) => x.status).sort()).toEqual([201, 409]);
    const gastadas = (await t.prisma.canjeRecompensa.findMany({ where: { estudianteId: lia.id } })).reduce((s, c) => s + c.monedas, 0);
    expect(gastadas).toBeLessThanOrEqual(30);
    await expect(t.prisma.canjeRecompensa.deleteMany({ where: { estudianteId: lia.id } })).rejects.toThrow(/solo admite agregar/);
  });

  it('una recompensa que no existe responde 404', async () => {
    await canjear('no-es-un-id').expect(404);
    await canjear(uuidV7()).expect(404);
  });
});

describe('Acceso (RNF-012)', () => {
  it('solo el estudiante ve su pasaporte, su reto y canjea', async () => {
    await t.http().get(`${API}/yo/pasaporte`).expect(401);
    await t.http().get(`${API}/yo/pasaporte`).set(bearer(tokenDocente)).expect(403);
    await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(editora)).expect(403);
    await t.http().post(`${API}/yo/recompensas/${uuidV7()}/canje`).set(bearer(tokenDocente)).expect(403);
  });
});
```

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **Logros al terminar (RF-056, RF-058):** el niño termina en la tablet la lectura que respondía y ve "¡Ganaste N puntos!" (N = lo que el libro sumó en esa visita) y "Nueva insignia: Primera lectura".
- **Pasaporte (RF-059):** 9 insignias (ganada, "1 de 5", "1 de 7", "Por ganar"), la lectura terminada, el mundo Explorador completado, sus puntos y sus últimos puntos.
- **Inicio (RF-057, RF-060, RF-061):** marcador con nivel, "1 día seguido" y sus monedas; el reto del día para "descubrir lo que no se dice" en "1 de 3".
- **Tienda (RF-062):** el dragón deshabilitado por monedas; la lupa canjeada ("¡Es tuya!"), 5 monedas menos y los mismos puntos.
- **Diseño responsivo (RNF-022, RNF-023):** el Pasaporte en 1280, 820 y 390 px, sin desbordes y con objetivos de 48 px; la barra del estudiante también a 360 px. El desborde se mide ahora contra el ancho real del documento (en un celular emulado, `innerWidth` crece con la página).

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

```ts
import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { puntosGuardados } from '../../support/gamificacion';
import { escribirPin, esperarAreaEstudiante, ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Gamificación de punta a punta (RF-056 a RF-062) en escritorio, tablet y celular: al terminar
 * una lectura el niño ve lo que ganó y su Pasaporte del Lector lo refleja al instante; el inicio muestra
 * su marcador y el reto del día; en la tienda canjea con monedas sin perder puntos.
 */
test.describe('Gamificación: pasaporte, reto del día y recompensas (RF-056 a RF-062)', () => {
  test.setTimeout(150_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  const numeros = (page: Page) => page.getByRole('list', { name: 'Tus números' });

  test('al terminar una lectura ve lo que ganó y su pasaporte lo refleja al instante (RF-058, RF-059)', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { hasta: ENUNCIADOS.defiende });
    const id = aula.estudiantes['Mateo'] as string;

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');
    const pasaporteInicial = page.waitForResponse((r) => r.url().endsWith('/api/v1/yo/pasaporte') && r.ok());
    await page.goto(`/estudiante/lecturas/${killa.lecturaId}`);
    await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.defiende })).toBeVisible();
    await pasaporteInicial; // lo que tenía al abrir la lectura
    const antes = await puntosGuardados(id);

    await page.getByRole('button', { name: 'Opción A: El texto dice que tenía una espina' }).click();
    await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
    await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
    await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();

    // RF-056, RF-058: los puntos de esta visita (defensa + lectura completada) y la insignia nueva, al instante.
    const despues = await puntosGuardados(id);
    expect(despues - antes).toBeGreaterThanOrEqual(30);
    const logros = page.getByRole('region', { name: `¡Ganaste ${despues - antes} puntos!` });
    await expect(logros).toBeVisible();
    await expect(logros.getByRole('list', { name: 'Insignias nuevas' })).toContainText('Nueva insignia: Primera lectura');

    // RF-059: el pasaporte refleja el estado real (insignias, avance, lecturas y puntos).
    await logros.getByRole('link', { name: 'Ver mi pasaporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
    const insignias = page.getByRole('list', { name: 'Insignias' }).getByRole('listitem');
    await expect(insignias).toHaveCount(9);
    await expect(insignias.filter({ hasText: 'Primera lectura' })).toContainText('Ganada el');
    await expect(insignias.filter({ hasText: 'Detective de Evidencias' })).toContainText('1 de 5'); // UAT-03
    await expect(insignias.filter({ hasText: 'Lector Perseverante' })).toContainText('1 de 7');
    await expect(insignias.filter({ hasText: 'Rango Explorador' })).toContainText('Por ganar');
    await expect(page.getByRole('list', { name: 'Lecturas terminadas' })).toContainText(killa.titulo);
    await expect(page.getByRole('list', { name: 'Mundos completados' })).toContainText('Explorador'); // RF-033: el reto inicial lo ubicó en el Detective
    await expect(numeros(page)).toContainText(`${despues} puntos`);
    await expect(page.getByRole('list', { name: 'Últimos puntos' }).getByRole('listitem').first()).toContainText('Lectura terminada');
  });

  test('el inicio muestra su marcador y el reto del día; en la tienda canjea con monedas sin perder puntos (RF-060, RF-062)', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Sami', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Sami', ['LIT', 'VOC']);
    const nino = await sesionDelNino(request, aula, 'Sami');
    // RF-060: con 0 en inferencias tras su reto inicial, el reto del día es para esa habilidad.
    const reto = await (await request.get('/api/v1/yo/reto-del-dia', { headers: nino })).json();
    expect(reto).toMatchObject({ habilidad: 'INF', meta: 3, avance: 0, estado: 'PROPUESTO' });
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Sami', killa.lecturaId, { nino, terminar: true });
    const id = aula.estudiantes['Sami'] as string;
    const puntos = await puntosGuardados(id);
    const monedas = Math.floor(puntos / 10);
    expect(monedas).toBeGreaterThanOrEqual(5);

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Sami');
    const marcador = page.getByRole('list', { name: 'Tu marcador' });
    await expect(marcador).toContainText('Nivel 0');
    await expect(marcador).toContainText('1 día seguido');
    await expect(marcador).toContainText(`${monedas} monedas`);
    const retoDelDia = page.getByRole('region', { name: 'Reto del día' });
    await expect(retoDelDia).toContainText('Responde bien 3 preguntas para descubrir lo que no se dice');
    await expect(retoDelDia).toContainText('1 de 3'); // la pregunta de inferencia de la lectura
    await expect(retoDelDia.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');

    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pasaporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
    const tienda = page.getByRole('list', { name: 'Recompensas' });
    await expect(tienda.getByRole('listitem')).toHaveCount(10);
    await expect(tienda.getByRole('button', { name: 'Canjear Dragón lector por 60 monedas' })).toBeDisabled();
    await tienda.getByRole('button', { name: 'Canjear Lupa de detective por 5 monedas' }).click();
    await expect(page.getByText('¡Lupa de detective: ya es tuya!')).toBeVisible();
    await expect(tienda.getByRole('listitem').filter({ hasText: 'Lupa de detective' })).toContainText('¡Es tuya!');
    // RF-062: descuenta monedas, nunca puntos de nivel.
    await expect(numeros(page)).toContainText(`🪙 ${monedas - 5}`);
    await expect(numeros(page)).toContainText(`${puntos} puntos`);
    expect(await puntosGuardados(id)).toBe(puntos);
  });
});
```

`tests/e2e/support/gamificacion.ts`:

```ts
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { diaLima } from './escuela';

/** Ayudantes del Módulo 8 (gamificación): leer el libro de puntos, las insignias y la racha en la base. */

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

/** RF-056: los asientos del libro de puntos del niño, en orden. */
export function asientosDe(estudianteId: string): Promise<{ motivo: string; puntos: number }[]> {
  return conBase((p) => p.asientoPuntos.findMany({ where: { estudianteId }, orderBy: { id: 'asc' }, select: { motivo: true, puntos: true } }));
}

/** Saldo de puntos = suma del libro (SRS §6, CuentaGamificacion). */
export async function puntosGuardados(estudianteId: string): Promise<number> {
  return (await asientosDe(estudianteId)).reduce((s, a) => s + a.puntos, 0);
}

/** UAT-03: el avance guardado hacia una insignia que se gana contando. */
export function avanceInsignia(estudianteId: string, codigo: string): Promise<number> {
  return conBase(async (p) => (await p.avanceInsignia.findFirst({ where: { estudianteId, insignia: { codigo } } }))?.avance ?? 0);
}

/** RF-061: simula que el niño leyó `dias` días seguidos hasta hace `hastaHaceDias` días (sin usar el comodín). */
export function fijarRacha(estudianteId: string, dias: number, hastaHaceDias: number): Promise<unknown> {
  const datos = { diasActuales: dias, mejorRacha: dias, ultimaFechaLima: new Date(`${diaLima(-hastaHaceDias)}T00:00:00Z`), comodinUsadoSemana: null };
  return conBase((p) => p.racha.upsert({ where: { estudianteId }, create: { estudianteId, ...datos }, update: datos }));
}

export function rachaGuardada(estudianteId: string) {
  return conBase((p) => p.racha.findUnique({ where: { estudianteId } }));
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
@gamificacion
Característica: Puntos, insignias, racha, reto del día y recompensas
  Como estudiante de LectoAventura
  Quiero ver lo que gano con cada lectura y tener retos y recompensas
  Para que leer sea una aventura que me den ganas de seguir

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-056 @RF-058 @RF-059 @camino-feliz @smoke
  Escenario: Al terminar una lectura ve lo que ganó y su pasaporte lo refleja
    Dado un niño de 9 años que respondió su lectura hasta la última pregunta
    Cuando responde la última pregunta y termina su lectura
    Entonces ve cuántos puntos ganó y su nueva insignia "Primera lectura"
    Y su Pasaporte del Lector muestra la insignia ganada y la lectura terminada

  @RF-060 @RN-18
  Escenario: El reto del día apunta a su habilidad más débil
    Dado un niño de 9 años que hizo su reto inicial bien en literal y vocabulario
    Cuando abre su inicio
    Entonces ve el reto del día para "descubrir lo que no se dice"
    Y el reto es el mismo cada vez que lo abre ese día

  @RF-061 @RN-11
  Escenario: El comodín semanal salva su racha y a los 7 días gana "Lector Perseverante"
    Dado un niño que leyó 6 días seguidos hasta anteayer
    Cuando termina una lectura hoy
    Entonces su racha llega a 7 días usando el comodín de la semana
    Y gana 30 puntos de racha y la insignia "Lector Perseverante"

  @RN-12 @negativo
  Escenario: Repetir una lectura ya terminada da solo el 25 % de los puntos
    Dado un niño que ya terminó una lectura
    Cuando la vuelve a leer completa
    Entonces cada logro de la repetición vale el 25 % y no suma a las insignias

  @RF-062
  Escenario: Canjea una recompensa con monedas sin perder puntos
    Dado un niño que ganó puntos leyendo
    Cuando canjea la "Lupa de detective" en su pasaporte
    Entonces la "Lupa de detective" es suya
    Y sus monedas bajan en 5 y sus puntos siguen iguales
```

En `tests/e2e/features/lectura/lectura.feature` (Módulo 6) se completaron los dos escenarios del SRS que esperaban a este módulo: UAT-02 ahora verifica "recibe 6 puntos por corregir tras pista" y UAT-03 "el progreso hacia la insignia Detective de Evidencias aumenta en 1".

## 7.2 Automatización (Step Definitions)

```ts
import { expect, Page } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { diaLima, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { asientosDe, avanceInsignia, fijarRacha, puntosGuardados, rachaGuardada } from '../support/gamificacion';
import { escribirPin, esperarAreaEstudiante } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de gamificación (RF-056 a RF-062, RN-11, RN-12, RN-18, UAT-02, UAT-03). */

const CODIGO_INSIGNIA: Record<string, string> = {
  'Primera lectura': 'PRIMERA_LECTURA',
  'Detective de Evidencias': 'DETECTIVE_EVIDENCIAS',
  'Lector Perseverante': 'LECTOR_PERSEVERANTE',
};

async function entrarComoMateo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

const mateo = (mundo: Mundo) => mundo.aula!.estudiantes['Mateo'] as string;
const insignias = (page: Page) => page.getByRole('list', { name: 'Insignias' }).getByRole('listitem');
const numeros = (page: Page) => page.getByRole('list', { name: 'Tus números' });
const retoDelDia = (page: Page) => page.getByRole('region', { name: 'Reto del día' });

async function abrirPasaporte(page: Page) {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pasaporte' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
}

/** Mateo, de 9 años, con su reto inicial bien en literal y vocabulario (RF-033: empieza en el Detective). */
async function prepararMateo(request: Parameters<typeof docenteConAula>[0], mundo: Mundo) {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
}

// ── UAT-02 y UAT-03 (lectura.feature): lo que Gamificación otorga por cada pregunta ──

Entonces('recibe {int} puntos por corregir tras pista', async ({ mundo }, puntos: number) => {
  expect(await asientosDe(mateo(mundo))).toContainEqual({ motivo: 'CORRECTO_TRAS_PISTA', puntos });
});

Entonces('el progreso hacia la insignia {string} aumenta en {int}', async ({ page, mundo }, nombre: string, n: number) => {
  expect(await avanceInsignia(mateo(mundo), CODIGO_INSIGNIA[nombre] as string)).toBe(n);
  // RF-059: el pasaporte lo muestra al instante.
  await page.goto('/estudiante/pasaporte');
  await expect(insignias(page).filter({ hasText: nombre })).toContainText(new RegExp(`${n} de \\d+`));
});

// ── RF-056, RF-058, RF-059: lo que ganó al terminar y su pasaporte ───────

Dado('un niño de 9 años que respondió su lectura hasta la última pregunta', async ({ page, request, mundo }) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa.lecturaId, { hasta: ENUNCIADOS.defiende });
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await entrarComoMateo(page);
  const pasaporteInicial = page.waitForResponse((r) => r.url().endsWith('/api/v1/yo/pasaporte') && r.ok());
  await page.goto(`/estudiante/lecturas/${mundo.killa.lecturaId}`);
  await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.defiende })).toBeVisible();
  await pasaporteInicial;
  mundo.puntos = await puntosGuardados(mateo(mundo));
});

Cuando('responde la última pregunta y termina su lectura', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción A: El texto dice que tenía una espina' }).click();
  await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
  await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
  await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
});

Entonces('ve cuántos puntos ganó y su nueva insignia {string}', async ({ page, mundo }, nombre: string) => {
  const ganados = (await puntosGuardados(mateo(mundo))) - (mundo.puntos ?? 0);
  const logros = page.getByRole('region', { name: `¡Ganaste ${ganados} puntos!` });
  await expect(logros).toBeVisible();
  await expect(logros.getByRole('list', { name: 'Insignias nuevas' })).toContainText(`Nueva insignia: ${nombre}`);
});

Entonces('su Pasaporte del Lector muestra la insignia ganada y la lectura terminada', async ({ page, mundo }) => {
  await page.getByRole('link', { name: 'Ver mi pasaporte' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
  await expect(insignias(page).filter({ hasText: 'Primera lectura' })).toContainText('Ganada el');
  await expect(page.getByRole('list', { name: 'Lecturas terminadas' })).toContainText(mundo.killa!.titulo);
  await expect(numeros(page)).toContainText(`${await puntosGuardados(mateo(mundo))} puntos`);
});

// ── RF-060, RN-18: el reto del día ──────────────────────────────────────

Dado('un niño de 9 años que hizo su reto inicial bien en literal y vocabulario', async ({ page, request, mundo }) => {
  await prepararMateo(request, mundo);
  await tabletDelAulaActivada(page, request, mundo.aula!);
});

Cuando('abre su inicio', async ({ page }) => {
  await entrarComoMateo(page);
});

Entonces('ve el reto del día para {string}', async ({ page }, habilidad: string) => {
  await expect(retoDelDia(page)).toContainText(`Responde bien 3 preguntas para ${habilidad}`);
  await expect(retoDelDia(page)).toContainText('0 de 3');
});

Entonces('el reto es el mismo cada vez que lo abre ese día', async ({ page, request, mundo }) => {
  const nino = await sesionDelNino(request, mundo.aula!, 'Mateo');
  const primero = await (await request.get('/api/v1/yo/reto-del-dia', { headers: nino })).json();
  await page.reload();
  await expect(retoDelDia(page)).toContainText('descubrir lo que no se dice');
  const segundo = await (await request.get('/api/v1/yo/reto-del-dia', { headers: nino })).json();
  expect(segundo.id).toBe(primero.id);
  expect(primero).toMatchObject({ fecha: diaLima(), habilidad: 'INF' });
});

// ── RF-061: racha con comodín ───────────────────────────────────────────

Dado('un niño que leyó {int} días seguidos hasta anteayer', async ({ request, mundo }, dias: number) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  await fijarRacha(mateo(mundo), dias, 2);
});

Cuando('termina una lectura hoy', async ({ request, mundo }) => {
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa!.lecturaId, { terminar: true });
});

Entonces('su racha llega a {int} días usando el comodín de la semana', async ({ mundo }, dias: number) => {
  const racha = await rachaGuardada(mateo(mundo));
  expect(racha).toMatchObject({ diasActuales: dias, mejorRacha: dias });
  expect(racha?.comodinUsadoSemana).not.toBeNull();
});

Entonces('gana {int} puntos de racha y la insignia {string}', async ({ page, request, mundo }, puntos: number, nombre: string) => {
  expect((await asientosDe(mateo(mundo))).filter((a) => a.motivo.startsWith('RACHA_'))).toEqual([{ motivo: 'RACHA_7', puntos }]);
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await entrarComoMateo(page);
  await abrirPasaporte(page);
  await expect(insignias(page).filter({ hasText: nombre })).toContainText('Ganada el');
  await expect(numeros(page)).toContainText('🔥 7');
});

// ── RN-12: repetir una lectura ──────────────────────────────────────────

Dado('un niño que ya terminó una lectura', async ({ request, mundo }) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  mundo.nino = await sesionDelNino(request, mundo.aula!, 'Mateo');
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa.lecturaId, { nino: mundo.nino, terminar: true });
  mundo.asientos = (await asientosDe(mateo(mundo))).length;
});

Cuando('la vuelve a leer completa', async ({ request, mundo }) => {
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa!.lecturaId, { nino: mundo.nino, terminar: true });
});

Entonces('cada logro de la repetición vale el 25 % y no suma a las insignias', async ({ mundo }) => {
  const todos = await asientosDe(mateo(mundo));
  const [primera, repeticion] = [todos.slice(0, mundo.asientos), todos.slice(mundo.asientos)];
  const BASE: Record<string, number> = { ITEM_CORRECTO: 10, RESPUESTA_ABIERTA: 10, LECTURA_COMPLETADA: 20 };
  for (const motivo of Object.keys(BASE)) {
    const antes = primera.filter((a) => a.motivo === motivo);
    const ahora = repeticion.filter((a) => a.motivo === motivo);
    expect(antes.every((a) => a.puntos === BASE[motivo])).toBe(true);
    expect(ahora.map((a) => a.puntos)).toEqual(antes.map(() => Math.round((BASE[motivo] as number) * 0.25)));
  }
  expect(await avanceInsignia(mateo(mundo), 'DETECTIVE_EVIDENCIAS')).toBe(1);
});

// ── RF-062: recompensas ─────────────────────────────────────────────────

Dado('un niño que ganó puntos leyendo', async ({ page, request, mundo }) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa.lecturaId, { terminar: true });
  mundo.puntos = await puntosGuardados(mateo(mundo));
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await entrarComoMateo(page);
  await abrirPasaporte(page);
});

Cuando('canjea la {string} en su pasaporte', async ({ page }, nombre: string) => {
  await page.getByRole('list', { name: 'Recompensas' }).getByRole('button', { name: new RegExp(`^Canjear ${nombre} por \\d+ monedas$`) }).click();
});

Entonces('la {string} es suya', async ({ page }, nombre: string) => {
  await expect(page.getByText(`¡${nombre}: ya es tuya!`)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recompensas' }).getByRole('listitem').filter({ hasText: nombre })).toContainText('¡Es tuya!');
});

Entonces('sus monedas bajan en {int} y sus puntos siguen iguales', async ({ page, mundo }, costo: number) => {
  await expect(numeros(page)).toContainText(`🪙 ${Math.floor((mundo.puntos ?? 0) / 10) - costo}`);
  await expect(numeros(page)).toContainText(`${mundo.puntos} puntos`);
  expect(await puntosGuardados(mateo(mundo))).toBe(mundo.puntos);
});
```

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
