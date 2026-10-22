<!-- Generado con node docs/pruebas/construir.mjs desde 04-aventura-plan-de-pruebas.plantilla.md. No editar a mano. -->
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

```ts
import { describe, expect, it } from 'vitest';

import { MAX_LECTURAS_POR_MISION, Mision } from '../../../../src/modules/aventura/domain/entities/mision';
import { EstadoDeMundo, ProgresoAventura } from '../../../../src/modules/aventura/domain/entities/progreso-aventura';
import { DatoMisionInvalidoError } from '../../../../src/modules/aventura/domain/errors/errores-aventura';
import {
  avanzarEstado,
  estadoSegunAvance,
  evaluarUmbral,
  mundoInicial,
} from '../../../../src/modules/aventura/domain/services/politica-progresion';
import { uuidV7 } from '../../../../src/modules/shared-kernel/infrastructure/uuid';
import { MUNDOS } from '../dobles';

/** Nivel 1 — Dominio de Aventura: progresión (RF-031, RF-033, RN-09), progreso y misiones (RF-032). */
const AHORA = new Date('2026-10-17T15:00:00Z');
const estados = (p: ProgresoAventura) => p.mundos.map((m) => m.estado);

describe('Política de progresión', () => {
  it('RF-033: con LIT y VOC ≥ 65 empieza en el mundo 2; si no, en el 1 (nunca más allá del 2)', () => {
    expect(mundoInicial({ LIT: 70, VOC: 68, INF: 10 })).toBe(2); // escenario UAT-01 del SRS
    expect(mundoInicial({ LIT: 65, VOC: 65 })).toBe(2); // el umbral es inclusivo
    expect(mundoInicial({ LIT: 64.9, VOC: 99 })).toBe(1);
    expect(mundoInicial({ LIT: 100, VOC: 100, INF: 100, CRI: 100, ARG: 100 })).toBe(2);
    expect(mundoInicial({ VOC: 90 })).toBe(1);
    expect(mundoInicial(null)).toBe(1);
  });

  it('RN-09: todas las habilidades foco ≥ 65 y al menos 3 misiones completadas', () => {
    expect(evaluarUmbral(['LIT', 'VOC'], { LIT: 70, VOC: 65 }, 3)).toEqual({ cumple: true, habilidadesPendientes: [], misionesFaltantes: 0 });
    expect(evaluarUmbral(['LIT', 'VOC'], { LIT: 70, VOC: 65 }, 2)).toEqual({ cumple: false, habilidadesPendientes: [], misionesFaltantes: 1 });
    expect(evaluarUmbral(['LIT', 'VOC'], { LIT: 70, VOC: 64 }, 5)).toEqual({ cumple: false, habilidadesPendientes: ['VOC'], misionesFaltantes: 0 });
    // Sin perfil lector (Módulo 7) la maestría no se conoce: nunca se desbloquea por adivinar.
    expect(evaluarUmbral(['LIT', 'VOC'], null, 10).cumple).toBe(false);
  });

  it('RF-032: la misión se completa cuando todas sus lecturas terminaron; en curso si alguna empezó', () => {
    const avance = new Map([['a', 'FINALIZADA' as const], ['b', 'EN_CURSO' as const]]);
    expect(estadoSegunAvance(['a'], avance)).toBe('COMPLETADA');
    expect(estadoSegunAvance(['a', 'b'], avance)).toBe('EN_CURSO');
    expect(estadoSegunAvance(['c'], avance)).toBe('PENDIENTE');
    expect(estadoSegunAvance([], avance)).toBe('PENDIENTE');
  });

  it('lo logrado no se pierde: el estado de una misión nunca retrocede', () => {
    expect(avanzarEstado('PENDIENTE', 'EN_CURSO')).toBe('EN_CURSO');
    expect(avanzarEstado('EN_CURSO', 'COMPLETADA')).toBe('COMPLETADA');
    expect(avanzarEstado('COMPLETADA', 'EN_CURSO')).toBe('COMPLETADA');
    expect(avanzarEstado('EN_CURSO', 'PENDIENTE')).toBe('EN_CURSO');
  });
});

describe('ProgresoAventura', () => {
  it('RF-033: en el mundo 1, el resto bloqueado y sin celebración para el mundo inicial', () => {
    const p = ProgresoAventura.posicionar('nino', MUNDOS, 1, AHORA);
    expect(estados(p)).toEqual(['DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(p.actual?.numero).toBe(1);
    expect(p.porCelebrar()).toEqual([]);
  });

  it('RF-033: empezar en el mundo 2 deja el Explorador como completado', () => {
    const p = ProgresoAventura.posicionar('nino', [...MUNDOS].reverse(), 2, AHORA);
    expect(estados(p)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(p.mundos[0]).toMatchObject({ completadoEn: AHORA, desbloqueadoEn: AHORA });
    expect(() => ProgresoAventura.posicionar('nino', MUNDOS, 7, AHORA)).toThrow('No existe el mundo 7');
  });

  it('RF-031: completar el mundo actual abre el siguiente, que se celebra una sola vez', () => {
    const p = ProgresoAventura.posicionar('nino', MUNDOS, 1, AHORA);
    const despues = new Date(AHORA.getTime() + 60_000);
    const { completado, desbloqueado } = p.completarActual(despues);
    expect(completado).toMatchObject({ numero: 1, estado: 'COMPLETADO', completadoEn: despues });
    expect(desbloqueado).toMatchObject({ numero: 2, estado: 'DISPONIBLE', desbloqueadoEn: despues, celebradoEn: null });
    expect(p.porCelebrar().map((m) => m.numero)).toEqual([2]);
    expect(p.marcarCelebrado('mundo-2', despues)).toBe(true);
    expect(p.marcarCelebrado('mundo-2', despues)).toBe(false);
    expect(p.marcarCelebrado('mundo-4', despues)).toBe(false); // bloqueado: nada que celebrar
    expect(p.porCelebrar()).toEqual([]);
  });

  it('al completar el último mundo no queda ninguno disponible', () => {
    const p = ProgresoAventura.posicionar('nino', MUNDOS, 2, AHORA);
    for (let i = 0; i < 3; i++) p.completarActual(AHORA);
    expect(p.completarActual(AHORA).desbloqueado).toBeNull();
    expect(estados(p)).toEqual(['COMPLETADO', 'COMPLETADO', 'COMPLETADO', 'COMPLETADO', 'COMPLETADO']);
    expect(p.actual).toBeNull();
    expect(() => p.completarActual(AHORA)).toThrow('No hay un mundo disponible');
  });

  it('SRS §6: rechaza progresos imposibles (completado tras un bloqueado, dos disponibles, fechas o mundos que faltan)', () => {
    const base = ProgresoAventura.posicionar('nino', MUNDOS, 2, AHORA).mundos;
    const con = (cambios: Partial<EstadoDeMundo>[]) => base.map((m, i) => ({ ...m, ...cambios[i] }));
    const bloqueado = { estado: 'BLOQUEADO' as const, desbloqueadoEn: null, completadoEn: null };
    expect(() => ProgresoAventura.desdePersistencia('nino', con([bloqueado, { estado: 'COMPLETADO', completadoEn: AHORA }]))).toThrow('Progreso inválido');
    expect(() => ProgresoAventura.desdePersistencia('nino', con([{ estado: 'DISPONIBLE', completadoEn: null }]))).toThrow('Progreso inválido');
    expect(() => ProgresoAventura.desdePersistencia('nino', con([{}, { desbloqueadoEn: null }]))).toThrow('fechas del mundo 2');
    expect(() => ProgresoAventura.desdePersistencia('nino', base.filter((m) => m.numero !== 3))).toThrow('sin saltos');
    expect(() => ProgresoAventura.desdePersistencia('nino', [])).toThrow('necesita los mundos');
    // Uno completado de más, sin ninguno disponible, deja al niño trabado: tampoco vale.
    expect(() => ProgresoAventura.desdePersistencia('nino', con([{}, { estado: 'COMPLETADO', completadoEn: AHORA }]))).toThrow('Progreso inválido');
    expect(ProgresoAventura.desdePersistencia('nino', [...base].reverse()).actual?.numero).toBe(2);
  });
});

describe('Misión', () => {
  const lecturas = (n: number) => Array.from({ length: n }, () => uuidV7());
  const crear = (datos: Partial<{ titulo: string; descripcion: string; lecturaIds: string[] }> = {}, orden = 1) =>
    Mision.crear({
      id: 'mision',
      mundoId: 'mundo-1',
      rangoEdad: 'R2',
      orden,
      datos: { titulo: 'La cueva de las letras', descripcion: '', lecturaIds: lecturas(2), ...datos },
    });

  it('normaliza el título y conserva el orden de las lecturas', () => {
    const ids = lecturas(3);
    const m = crear({ titulo: '  La   cueva  ', descripcion: '  Sigue el mapa.  ', lecturaIds: ids });
    expect(m.titulo).toBe('La cueva');
    expect(m.descripcion).toBe('Sigue el mapa.');
    expect(m.lecturaIds).toEqual(ids);
    m.lecturaIds.push('otra'); // es una copia
    expect(m.lecturaIds).toHaveLength(3);
  });

  it('valida título, descripción, lecturas, posición y edad', () => {
    const repetida = uuidV7();
    expect(() => crear({ titulo: 'Ab' })).toThrow(DatoMisionInvalidoError);
    expect(() => crear({ titulo: 'x'.repeat(81) })).toThrow('entre 3 y 80');
    expect(() => crear({ descripcion: 'x'.repeat(301) })).toThrow('hasta 300');
    expect(() => crear({ lecturaIds: [] })).toThrow('al menos una lectura');
    expect(() => crear({ lecturaIds: lecturas(MAX_LECTURAS_POR_MISION + 1) })).toThrow('hasta 10 lecturas');
    expect(() => crear({ lecturaIds: [repetida, repetida] })).toThrow('aparece dos veces');
    expect(() => crear({ lecturaIds: ['no-es-un-id'] })).toThrow('no existe');
    expect(() => crear({}, 0)).toThrow('de 1 a 20');
    expect(() => crear({}, 21)).toThrow('de 1 a 20');
    expect(() => Mision.crear({ id: 'x', mundoId: 'm', rangoEdad: 'R9' as never, orden: 1, datos: { titulo: 'Bien', descripcion: '', lecturaIds: lecturas(1) } })).toThrow('edad');
  });

  it('se actualiza y cambia de posición con las mismas reglas', () => {
    const m = crear();
    m.actualizar({ titulo: 'Nuevo título', descripcion: 'Otra', lecturaIds: lecturas(1) });
    expect(m.titulo).toBe('Nuevo título');
    m.moverA(5);
    expect(m.orden).toBe(5);
    expect(() => m.moverA(1.5)).toThrow('de 1 a 20');
    expect(() => m.actualizar({ titulo: 'Bien', descripcion: '', lecturaIds: [] })).toThrow('al menos una lectura');
  });
});
```

`apps/api/test/unit/aventura/aplicacion/aventura-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DatoMisionInvalidoError,
  DiagnosticoPendienteError,
  LimiteMisionesError,
  MundoBloqueadoError,
} from '../../../../src/modules/aventura/domain/errors/errores-aventura';
import { EVENTOS_AVENTURA } from '../../../../src/modules/aventura/domain/events/eventos-aventura';
import { NoEncontradoError, RangoEdad } from '../../../../src/modules/shared-kernel/public-api';
import { uuidV7 } from '../../../../src/modules/shared-kernel/infrastructure/uuid';
import { crearEntornoAventura, EntornoAventura } from '../dobles';

/** Nivel 1 — Casos de uso de Aventura con dobles (RF-030 a RF-033, RN-05, RN-09). */
const NINO = 'nino-9-anios';
const EDITORA = 'editora';

describe('Aventura: mapa, misiones, progreso y backoffice', () => {
  let e: EntornoAventura;

  beforeEach(() => {
    e = crearEntornoAventura();
    e.identidad.rangos.set(NINO, 'R2');
  });

  /** Una misión de la edad indicada con lecturas nuevas publicadas; devuelve sus ids. */
  const mision = async (mundo: number, lecturas = 1, rangoEdad: RangoEdad = 'R2', titulo = `Misión ${mundo}.${Math.random().toString(36).slice(2, 6)}`) => {
    const lecturaIds = Array.from({ length: lecturas }, (_, i) => e.fichas.publicar(`${titulo} · lectura ${i + 1}`, rangoEdad));
    const m = await e.misiones.crear({ editorId: EDITORA, mundoId: `mundo-${mundo}`, rangoEdad, titulo, descripcion: '', lecturaIds });
    return { misionId: m.id, lecturaIds };
  };
  const terminar = async (lecturaId: string) => {
    e.avance.marcar(NINO, lecturaId, 'FINALIZADA');
    await e.progreso.registrarAvance(NINO, lecturaId);
  };
  const estadosDelMapa = async () => (await e.mapa.mapa(NINO)).mundos.map((m) => m.estado);

  describe('Mapa (RF-030, RF-033, RN-05)', () => {
    it('sin el Módulo 5 todavía, el niño empieza en el Explorador con el resto bloqueado; se posiciona una sola vez', async () => {
      const mapa = await e.mapa.mapa(NINO);
      expect(mapa.diagnosticoPendiente).toBe(false);
      expect(mapa.mundoActual).toBe(1);
      expect(mapa.mundos.map((m) => [m.numero, m.estado])).toEqual([[1, 'DISPONIBLE'], [2, 'BLOQUEADO'], [3, 'BLOQUEADO'], [4, 'BLOQUEADO'], [5, 'BLOQUEADO']]);
      expect(mapa.mundos.some((m) => m.celebrar)).toBe(false);
      await e.mapa.mapa(NINO);
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.ESTUDIANTE_POSICIONADO)).toHaveLength(1);
      expect(e.bus.publicados[0]?.datos).toEqual({ estudianteId: NINO, mundoInicial: 1, origen: 'SIN_DIAGNOSTICO' });
    });

    it('RN-05: con el diagnóstico pendiente no hay mapa ni misiones, y no se guarda nada', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'PENDIENTE' });
      const mapa = await e.mapa.mapa(NINO);
      expect(mapa.diagnosticoPendiente).toBe(true);
      expect(mapa.mundoActual).toBeNull();
      expect(new Set(mapa.mundos.map((m) => m.estado))).toEqual(new Set(['BLOQUEADO']));
      await expect(e.mapa.misiones(NINO, 'mundo-1')).rejects.toThrow(DiagnosticoPendienteError);
      expect(e.repo.progresos.size).toBe(0);
    });

    it('RF-033: con LIT 70 y VOC 68 en el diagnóstico empieza en el Detective y el Explorador aparece completado', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 70, VOC: 68, INF: 40, CRI: 30, ARG: 20 } });
      expect(await estadosDelMapa()).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
      expect(e.bus.publicados[0]?.datos).toMatchObject({ mundoInicial: 2, origen: 'DIAGNOSTICO' });
    });

    it('muestra la maestría de las habilidades foco cuando el perfil lector la conoce, y las misiones de su edad', async () => {
      await mision(1);
      await mision(1);
      await mision(1, 1, 'R3'); // de otra edad: no cuenta para este niño
      e.maestria.valores.set(NINO, { LIT: 72.5, INF: 50 });
      const [explorador] = (await e.mapa.mapa(NINO)).mundos;
      expect(explorador?.habilidadesFoco).toEqual([
        { codigo: 'LIT', nombre: 'Comprensión literal', maestria: 72.5 },
        { codigo: 'VOC', nombre: 'Vocabulario', maestria: null },
      ]);
      expect(explorador?.misiones).toEqual({ completadas: 0, total: 2, necesarias: 3 });
    });

    it('dos pedidos simultáneos la primera vez ven el mismo mapa y se posiciona una sola vez', async () => {
      const [a, b] = await Promise.all([e.mapa.mapa(NINO), e.mapa.mapa(NINO)]);
      expect(a.mundos.map((m) => m.estado)).toEqual(b.mundos.map((m) => m.estado));
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.ESTUDIANTE_POSICIONADO)).toHaveLength(1);
    });

    it('un perfil inexistente o desactivado no tiene mapa', async () => {
      await expect(e.mapa.mapa('otro')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Misiones de un mundo (RF-032)', () => {
    it('lista las misiones de su edad en orden, con sus lecturas publicadas y el avance de cada una', async () => {
      const primera = await mision(1, 2, 'R2', 'La cueva');
      await mision(1, 1, 'R2', 'El río');
      await mision(1, 1, 'R1', 'Para los pequeños');
      e.avance.marcar(NINO, primera.lecturaIds[0] as string, 'EN_CURSO');
      e.fichas.archivar(primera.lecturaIds[1] as string); // retirada: el niño ya no la ve
      const { mundo, misiones } = await e.mapa.misiones(NINO, 'mundo-1');
      expect(mundo).toMatchObject({ numero: 1, estado: 'DISPONIBLE' });
      expect(misiones.map((m) => [m.orden, m.titulo, m.estado])).toEqual([[1, 'La cueva', 'PENDIENTE'], [2, 'El río', 'PENDIENTE']]);
      expect(misiones[0]?.lecturas).toEqual([{ id: primera.lecturaIds[0], titulo: 'La cueva · lectura 1', nivelDificultad: 2, avance: 'EN_CURSO' }]);
    });

    it('RF-030: un mundo bloqueado no se abre; uno que no existe da 404', async () => {
      await expect(e.mapa.misiones(NINO, 'mundo-2')).rejects.toThrow(MundoBloqueadoError);
      await expect(e.mapa.misiones(NINO, 'mundo-9')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Progreso por eventos (RF-031, RF-032, RF-033)', () => {
    it('RF-033: el diagnóstico posiciona una sola vez (si ya tenía mapa, no cambia)', async () => {
      await e.progreso.posicionarTrasDiagnostico(NINO, { LIT: 80, VOC: 80 });
      await e.progreso.posicionarTrasDiagnostico(NINO, { LIT: 10, VOC: 10 });
      expect(await estadosDelMapa()).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    });

    it('RF-032: la misión pasa a en curso y luego a completada cuando terminó todas sus lecturas; nunca retrocede', async () => {
      await e.mapa.mapa(NINO);
      const { misionId, lecturaIds } = await mision(1, 2);
      e.avance.marcar(NINO, lecturaIds[0] as string, 'EN_CURSO');
      await e.progreso.registrarAvance(NINO, lecturaIds[0] as string);
      expect((await e.repo.estadosMision(NINO, [misionId])).get(misionId)).toBe('EN_CURSO');
      await terminar(lecturaIds[0] as string);
      await terminar(lecturaIds[1] as string);
      expect((await e.repo.estadosMision(NINO, [misionId])).get(misionId)).toBe('COMPLETADA');
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.MISION_COMPLETADA)).toHaveLength(1);
      // Agregar una lectura nueva a una misión ya completada no le quita lo logrado.
      const otra = e.fichas.publicar('Una más');
      await e.misiones.actualizar({ editorId: EDITORA, misionId, titulo: 'Misión ampliada', descripcion: '', lecturaIds: [...lecturaIds, otra] });
      await e.progreso.registrarAvance(NINO, lecturaIds[0] as string);
      expect((await e.repo.estadosMision(NINO, [misionId])).get(misionId)).toBe('COMPLETADA');
    });

    it('sin mapa (RN-05) o en un mundo bloqueado, leer no avanza misiones', async () => {
      const bloqueada = await mision(3);
      await terminar(bloqueada.lecturaIds[0] as string); // aún sin mapa
      expect(e.repo.estados.size).toBe(0);
      await e.mapa.mapa(NINO);
      await terminar(bloqueada.lecturaIds[0] as string); // mundo 3 bloqueado
      expect(e.repo.estados.size).toBe(0);
    });

    it('RF-031, RN-09: con LIT y VOC ≥ 65 y 3 misiones completadas se abre el Detective, con celebración', async () => {
      await e.mapa.mapa(NINO);
      const misiones = [await mision(1), await mision(1), await mision(1)];
      for (const m of misiones.slice(0, 2)) await terminar(m.lecturaIds[0] as string);
      e.maestria.valores.set(NINO, { LIT: 70, VOC: 66 });
      await e.progreso.evaluarDesbloqueo(NINO);
      expect((await estadosDelMapa())[1]).toBe('BLOQUEADO'); // faltaba una misión
      await terminar(misiones[2]?.lecturaIds[0] as string);
      const mapa = await e.mapa.mapa(NINO);
      expect(mapa.mundos.map((m) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
      expect(mapa.mundos[1]?.celebrar).toBe(true);
      expect(e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO)?.datos).toEqual({
        estudianteId: NINO, mundoCompletado: 1, mundoDesbloqueado: 2,
      });
      await e.mapa.marcarCelebrado(NINO, 'mundo-2');
      expect((await e.mapa.mapa(NINO)).mundos[1]?.celebrar).toBe(false);
    });

    it('RN-09: sin maestría conocida (Módulo 7 aún no) o con una habilidad foco bajo 65, no se desbloquea', async () => {
      await e.mapa.mapa(NINO);
      for (let i = 0; i < 3; i++) await terminar((await mision(1)).lecturaIds[0] as string);
      await e.progreso.evaluarDesbloqueo(NINO);
      e.maestria.valores.set(NINO, { LIT: 90, VOC: 64 });
      await e.progreso.evaluarDesbloqueo(NINO);
      expect((await estadosDelMapa())[1]).toBe('BLOQUEADO');
      expect(e.bus.nombres()).not.toContain(EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO);
    });

    it('lo ya leído cuenta al abrir el mundo nuevo: puede abrir dos mundos seguidos', async () => {
      await e.mapa.mapa(NINO);
      const delDos = [await mision(2), await mision(2), await mision(2)];
      for (const m of delDos) e.avance.marcar(NINO, m.lecturaIds[0] as string, 'FINALIZADA'); // leídas antes, p. ej. asignadas por la docente
      for (let i = 0; i < 3; i++) await terminar((await mision(1)).lecturaIds[0] as string);
      e.maestria.valores.set(NINO, { LIT: 70, VOC: 70, INF: 70 });
      await e.progreso.evaluarDesbloqueo(NINO);
      expect(await estadosDelMapa()).toEqual(['COMPLETADO', 'COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO']);
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO)).toHaveLength(2);
    });

    it('completar el último mundo no abre otro; un evento simultáneo no desbloquea dos veces', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 99, VOC: 99 } });
      await e.mapa.mapa(NINO);
      e.maestria.valores.set(NINO, { LIT: 99, VOC: 99, INF: 99, CRI: 99, ARG: 99 });
      const delDetective: string[] = [];
      for (const numero of [2, 3, 4, 5]) {
        for (let i = 0; i < 3; i++) {
          const lectura = (await mision(numero)).lecturaIds[0] as string;
          e.avance.marcar(NINO, lectura, 'FINALIZADA');
          if (numero === 2) delDetective.push(lectura);
        }
      }
      // Otro evento del mismo niño completa el mundo al mismo tiempo: este no desbloquea otra vez.
      e.repo.otroEventoGanaElAvance = true;
      for (const lectura of delDetective) await e.progreso.registrarAvance(NINO, lectura);
      expect(e.bus.nombres()).not.toContain(EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO);
      expect((await estadosDelMapa())[1]).toBe('DISPONIBLE');
      e.repo.otroEventoGanaElAvance = false;
      await e.progreso.evaluarDesbloqueo(NINO);
      expect(new Set(await estadosDelMapa())).toEqual(new Set(['COMPLETADO']));
      const desbloqueos = e.bus.publicados.filter((p) => p.nombreEvento === EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO);
      expect(desbloqueos).toHaveLength(4);
      expect(desbloqueos.at(-1)?.datos).toMatchObject({ mundoCompletado: 5, mundoDesbloqueado: null });
      expect((await e.mapa.mapa(NINO)).mundoActual).toBeNull();
    });
  });

  describe('Backoffice de misiones', () => {
    it('crea misiones en orden por mundo y edad, auditadas con quién las hizo', async () => {
      const a = await mision(1, 1, 'R2', 'Primera');
      const b = await mision(1, 1, 'R2', 'Segunda');
      await mision(1, 1, 'R1', 'De otra edad');
      expect((await e.misiones.misiones('mundo-1', 'R2')).map((m) => [m.orden, m.id])).toEqual([[1, a.misionId], [2, b.misionId]]);
      expect(e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_AVENTURA.MISION_CREADA)?.datos).toMatchObject({ actorId: EDITORA, mundoId: 'mundo-1', rangoEdad: 'R2' });
      const mundos = await e.misiones.mundos();
      expect(mundos[0]?.misionesPorEdad).toEqual({ R1: 1, R2: 2, R3: 0 });
      expect(mundos.map((m) => m.numero)).toEqual([1, 2, 3, 4, 5]);
    });

    it('solo admite lecturas publicadas de la misma edad que la misión', async () => {
      const deOtraEdad = e.fichas.publicar('El volcán', 'R3');
      await expect(e.misiones.crear({ editorId: EDITORA, mundoId: 'mundo-1', rangoEdad: 'R2', titulo: 'Volcanes', descripcion: '', lecturaIds: [deOtraEdad] })).rejects.toThrow(
        '"El volcán" es para 10–12 años y la misión es para 8–9 años',
      );
      await expect(e.misiones.crear({ editorId: EDITORA, mundoId: 'mundo-1', rangoEdad: 'R2', titulo: 'Fantasma', descripcion: '', lecturaIds: [uuidV7()] })).rejects.toThrow('no están publicadas');
      await expect(e.misiones.crear({ editorId: EDITORA, mundoId: 'mundo-9', rangoEdad: 'R2', titulo: 'Sin mundo', descripcion: '', lecturaIds: [deOtraEdad] })).rejects.toThrow(NoEncontradoError);
      expect(e.repo.misionesGuardadas.size).toBe(0);
    });

    it('SRS §7: hasta 20 misiones por mundo y edad', async () => {
      for (let i = 0; i < 20; i++) await mision(4, 1, 'R1');
      await expect(mision(4, 1, 'R1')).rejects.toThrow(LimiteMisionesError);
      await expect(mision(4, 1, 'R2')).resolves.toBeDefined();
    });

    it('actualiza una misión y marca las lecturas que se retiraron de la biblioteca', async () => {
      const { misionId, lecturaIds } = await mision(1, 2);
      e.fichas.archivar(lecturaIds[1] as string);
      const [vista] = await e.misiones.misiones('mundo-1', 'R2');
      expect(vista?.lecturas[1]).toEqual({ id: lecturaIds[1], titulo: 'Lectura retirada de la biblioteca', nivelDificultad: null, publicada: false });
      await expect(e.misiones.actualizar({ editorId: EDITORA, misionId, titulo: 'Igual', descripcion: '', lecturaIds })).rejects.toThrow('no están publicadas');
      const actualizada = await e.misiones.actualizar({ editorId: EDITORA, misionId, titulo: 'Solo la primera', descripcion: 'Corta', lecturaIds: [lecturaIds[0] as string] });
      expect(actualizada).toMatchObject({ titulo: 'Solo la primera', descripcion: 'Corta', lecturas: [{ id: lecturaIds[0], publicada: true }] });
      await expect(e.misiones.actualizar({ editorId: EDITORA, misionId: 'no-existe', titulo: 'X y Z', descripcion: '', lecturaIds })).rejects.toThrow(NoEncontradoError);
      expect(e.bus.nombres()).toContain(EVENTOS_AVENTURA.MISION_ACTUALIZADA);
    });

    it('reordena con todas las misiones del mundo y edad, una vez cada una', async () => {
      const [a, b, c] = [await mision(2), await mision(2), await mision(2)];
      const nuevo = [c?.misionId, a?.misionId, b?.misionId] as string[];
      const vista = await e.misiones.reordenar({ editorId: EDITORA, mundoId: 'mundo-2', rangoEdad: 'R2', misionIds: nuevo });
      expect(vista.map((m) => m.id)).toEqual(nuevo);
      expect(vista.map((m) => m.orden)).toEqual([1, 2, 3]);
      await expect(e.misiones.reordenar({ editorId: EDITORA, mundoId: 'mundo-2', rangoEdad: 'R2', misionIds: nuevo.slice(0, 2) })).rejects.toThrow(DatoMisionInvalidoError);
      await expect(e.misiones.reordenar({ editorId: EDITORA, mundoId: 'mundo-2', rangoEdad: 'R2', misionIds: [nuevo[0], nuevo[0], nuevo[1]] as string[] })).rejects.toThrow('una vez cada una');
      expect(e.bus.nombres()).toContain(EVENTOS_AVENTURA.MISIONES_REORDENADAS);
    });

    it('las lecturas disponibles son las publicadas de esa edad, por título', async () => {
      e.fichas.publicar('Zorro', 'R1');
      e.fichas.publicar('Abeja', 'R1');
      e.fichas.publicar('Volcán', 'R3');
      expect((await e.misiones.lecturasDisponibles('R1')).map((f) => f.titulo)).toEqual(['Abeja', 'Zorro']);
    });
  });
});
```

`apps/api/test/unit/aventura/dobles.ts`:

```ts
/**
 * Dobles de prueba de Aventura: repositorio en memoria que se comporta como la base (copias, avance
 * de mundo condicional, orden único por mundo y edad) y registros simulados de lo que aportarán
 * Contenido y los Módulos 5, 6 y 7 (fichas, diagnóstico, maestría y avance de lectura).
 */
import type {
  AvanceLectura,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  Maestrias,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMaestria,
  ResultadoDiagnosticoInicial,
} from '../../../src/modules/shared-kernel/public-api';
import { uuidV7 } from '../../../src/modules/shared-kernel/infrastructure/uuid';
import type { AventuraRepository, MundoCatalogo } from '../../../src/modules/aventura/application/ports/aventura.repository';
import type { IdentidadEstudiantes } from '../../../src/modules/aventura/application/ports/identidad-estudiantes';
import { Posicionamiento } from '../../../src/modules/aventura/application/services/posicionamiento';
import { MapaUseCase } from '../../../src/modules/aventura/application/use-cases/mapa.use-case';
import { MisionesBackofficeUseCase } from '../../../src/modules/aventura/application/use-cases/misiones-backoffice.use-case';
import { ProgresoUseCase } from '../../../src/modules/aventura/application/use-cases/progreso.use-case';
import { Mision } from '../../../src/modules/aventura/domain/entities/mision';
import { EstadoDeMundo, ProgresoAventura } from '../../../src/modules/aventura/domain/entities/progreso-aventura';
import type { EstadoMision } from '../../../src/modules/aventura/domain/services/politica-progresion';
import { BusEspia, Reloj } from '../iam/dobles';

/** Los 5 mundos del SRS, como los carga la migración. */
export const MUNDOS: MundoCatalogo[] = [
  { id: 'mundo-1', numero: 1, nombre: 'Explorador', descripcion: 'Literal y vocabulario', habilidadesFoco: ['LIT', 'VOC'] },
  { id: 'mundo-2', numero: 2, nombre: 'Detective', descripcion: 'Inferencias', habilidadesFoco: ['INF', 'VOC'] },
  { id: 'mundo-3', numero: 3, nombre: 'Investigador', descripcion: 'Literal e inferencial', habilidadesFoco: ['LIT', 'INF'] },
  { id: 'mundo-4', numero: 4, nombre: 'Crítico', descripcion: 'Crítica y argumentación', habilidadesFoco: ['CRI', 'ARG'] },
  { id: 'mundo-5', numero: 5, nombre: 'Maestro de la Lectura', descripcion: 'Las cinco', habilidadesFoco: ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] },
];

const copiarMision = (m: Mision) =>
  Mision.desdePersistencia({ id: m.id, mundoId: m.mundoId, rangoEdad: m.rangoEdad, orden: m.orden, datos: { titulo: m.titulo, descripcion: m.descripcion, lecturaIds: m.lecturaIds } });

export class AventuraEnMemoria implements AventuraRepository {
  readonly progresos = new Map<string, EstadoDeMundo[]>();
  readonly misionesGuardadas = new Map<string, Mision>();
  readonly estados = new Map<string, EstadoMision>();
  /** Simula que otro evento simultáneo ya completó el mundo. */
  otroEventoGanaElAvance = false;

  async mundos() { return MUNDOS.map((m) => ({ ...m, habilidadesFoco: [...m.habilidadesFoco] })); }

  async progreso(estudianteId: string) {
    const filas = this.progresos.get(estudianteId);
    return filas ? ProgresoAventura.desdePersistencia(estudianteId, filas.map((f) => ({ ...f }))) : null;
  }
  async crearProgreso(p: ProgresoAventura) {
    if (this.progresos.has(p.estudianteId)) return false;
    this.progresos.set(p.estudianteId, p.mundos);
    return true;
  }
  async avanzarMundo(estudianteId: string, completado: { mundoId: string; completadoEn: Date }, desbloqueado: { mundoId: string; desbloqueadoEn: Date } | null) {
    const filas = this.progresos.get(estudianteId) ?? [];
    const actual = filas.find((f) => f.mundoId === completado.mundoId);
    if (this.otroEventoGanaElAvance || actual?.estado !== 'DISPONIBLE') return false;
    actual.estado = 'COMPLETADO';
    actual.completadoEn = completado.completadoEn;
    const siguiente = filas.find((f) => f.mundoId === desbloqueado?.mundoId);
    if (desbloqueado && siguiente) {
      siguiente.estado = 'DISPONIBLE';
      siguiente.desbloqueadoEn = desbloqueado.desbloqueadoEn;
    }
    ProgresoAventura.desdePersistencia(estudianteId, filas.map((f) => ({ ...f }))); // como el CHECK de la base
    return true;
  }
  async marcarCelebrado(estudianteId: string, mundoId: string, ahora: Date) {
    const f = this.progresos.get(estudianteId)?.find((x) => x.mundoId === mundoId);
    if (f && f.desbloqueadoEn && !f.celebradoEn) f.celebradoEn = ahora;
  }

  async misiones(mundoId: string, rangoEdad: RangoEdad) {
    return [...this.misionesGuardadas.values()]
      .filter((m) => m.mundoId === mundoId && m.rangoEdad === rangoEdad)
      .sort((a, b) => a.orden - b.orden)
      .map(copiarMision);
  }
  async mision(id: string) {
    const m = this.misionesGuardadas.get(id);
    return m ? copiarMision(m) : null;
  }
  async misionesConLectura(lecturaId: string, rangoEdad: RangoEdad) {
    return [...this.misionesGuardadas.values()].filter((m) => m.rangoEdad === rangoEdad && m.lecturaIds.includes(lecturaId)).map(copiarMision);
  }
  async contarMisiones(rangoEdad: RangoEdad) {
    const conteo = new Map<string, number>();
    for (const m of this.misionesGuardadas.values()) if (m.rangoEdad === rangoEdad) conteo.set(m.mundoId, (conteo.get(m.mundoId) ?? 0) + 1);
    return conteo;
  }
  async guardarMision(m: Mision) {
    this.misionesGuardadas.set(m.id, copiarMision(m));
    this.verificarOrdenUnico();
  }
  async reordenar(misiones: Mision[]) {
    for (const m of misiones) this.misionesGuardadas.set(m.id, copiarMision(m));
    this.verificarOrdenUnico();
  }
  async estadosMision(estudianteId: string, misionIds: string[]) {
    return new Map(misionIds.filter((id) => this.estados.has(`${estudianteId}|${id}`)).map((id) => [id, this.estados.get(`${estudianteId}|${id}`) as EstadoMision]));
  }
  async guardarEstadoMision(estudianteId: string, misionId: string, estado: EstadoMision) {
    this.estados.set(`${estudianteId}|${misionId}`, estado);
  }
  async completadasPorMundo(estudianteId: string, rangoEdad: RangoEdad) {
    const conteo = new Map<string, number>();
    for (const [clave, estado] of this.estados) {
      const [est, misionId] = clave.split('|');
      const m = this.misionesGuardadas.get(misionId as string);
      if (est === estudianteId && estado === 'COMPLETADA' && m?.rangoEdad === rangoEdad) conteo.set(m.mundoId, (conteo.get(m.mundoId) ?? 0) + 1);
    }
    return conteo;
  }

  /** Como la restricción única (mundo, edad, orden) de la base. */
  private verificarOrdenUnico() {
    const claves = [...this.misionesGuardadas.values()].map((m) => `${m.mundoId}|${m.rangoEdad}|${m.orden}`);
    if (new Set(claves).size !== claves.length) throw new Error('mision_mundo_id_rango_edad_orden_key');
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly rangos = new Map<string, RangoEdad | null>();
  async rangoEdad(estudianteId: string) { return this.rangos.get(estudianteId) ?? null; }
}

export class DiagnosticoFalso implements ResolutorDiagnosticoInicial {
  readonly resultados = new Map<string, ResultadoDiagnosticoInicial>();
  async resultadoDe(estudianteId: string): Promise<ResultadoDiagnosticoInicial> {
    return this.resultados.get(estudianteId) ?? { estado: 'SIN_MODULO' };
  }
}

export class MaestriaFalsa implements ResolutorMaestria {
  readonly valores = new Map<string, Maestrias>();
  async maestriasDe(estudianteId: string) { return this.valores.get(estudianteId) ?? null; }
}

export class AvanceFalso implements ResolutorAvanceLecturas {
  readonly avance = new Map<string, Map<string, AvanceLectura>>();
  marcar(estudianteId: string, lecturaId: string, estado: AvanceLectura) {
    const m = this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
    m.set(lecturaId, estado);
    this.avance.set(estudianteId, m);
  }
  async avanceDe(estudianteId: string, lecturaIds: string[]) {
    const m = this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
    return new Map(lecturaIds.filter((id) => m.has(id)).map((id) => [id, m.get(id) as AvanceLectura]));
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly publicadasPorId = new Map<string, FichaLecturaPublicada>();
  publicar(titulo: string, rangoEdad: RangoEdad = 'R2', nivelDificultad = 2): string {
    const id = uuidV7();
    this.publicadasPorId.set(id, { id, titulo, rangoEdad, nivelDificultad, tematica: 'Animales' });
    return id;
  }
  archivar(id: string) { this.publicadasPorId.delete(id); }
  async fichas(ids: string[]) { return ids.map((id) => this.publicadasPorId.get(id)).filter((f) => f !== undefined); }
  async publicadas(rangoEdad: RangoEdad) {
    return [...this.publicadasPorId.values()].filter((f) => f.rangoEdad === rangoEdad).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  }
}

/** Ensambla los dobles y los casos de uso reales; cada prueba crea su propio entorno. */
export function crearEntornoAventura() {
  const reloj = new Reloj();
  const bus = new BusEspia();
  const repo = new AventuraEnMemoria();
  const identidad = new IdentidadFalsa();
  const diagnostico = new DiagnosticoFalso();
  const maestria = new MaestriaFalsa();
  const avance = new AvanceFalso();
  const fichas = new FichasFalsas();
  const posicionamiento = new Posicionamiento(repo, diagnostico, bus, reloj.ahora);
  return {
    reloj, bus, repo, identidad, diagnostico, maestria, avance, fichas,
    mapa: new MapaUseCase(repo, identidad, posicionamiento, maestria, avance, fichas, reloj.ahora),
    progreso: new ProgresoUseCase(repo, identidad, posicionamiento, maestria, avance, fichas, bus, reloj.ahora),
    misiones: new MisionesBackofficeUseCase(repo, fichas, bus, () => uuidV7(), reloj.ahora),
  };
}

export type EntornoAventura = ReturnType<typeof crearEntornoAventura>;
```

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

```ts
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import {
  AVANCE_LECTURAS,
  AvanceLectura,
  BUS_EVENTOS,
  BusEventos,
  crearEvento,
  DIAGNOSTICO_INICIAL,
  EVENTOS_INTEGRACION,
  MAESTRIA_LECTOR,
  Maestrias,
  RegistroAvanceLecturas,
  RegistroDiagnosticoInicial,
  RegistroMaestria,
  ResultadoDiagnosticoInicial,
  uuidV7,
} from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Aventura integrada (RF-030 a RF-033) contra PostgreSQL real: backoffice de misiones con
 * MFA y auditoría, mapa del estudiante y su avance movido por los eventos que publicarán los
 * Módulos 5, 6 y 7 (aquí se publican en el bus real y sus puertos se registran como lo harán ellos).
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Había una vez un zorro que miraba la luna. Quería tocarla.\nUna tarde subió al cerro. Pero la luna seguía lejos.';

let t: AppDePrueba;
let bus: BusEventos;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Lo que aportarán los Módulos 5 (diagnóstico), 6 (sesiones de lectura) y 7 (perfil lector).
const diagnosticos = new Map<string, ResultadoDiagnosticoInicial>();
const maestrias = new Map<string, Maestrias>();
const avance = new Map<string, Map<string, AvanceLectura>>();

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
  bus = t.app.get<BusEventos>(BUS_EVENTOS);
  t.app.get<RegistroDiagnosticoInicial>(DIAGNOSTICO_INICIAL).registrar({ resultadoDe: async (id) => diagnosticos.get(id) ?? { estado: 'SIN_MODULO' } });
  t.app.get<RegistroMaestria>(MAESTRIA_LECTOR).registrar({ maestriasDe: async (id) => maestrias.get(id) ?? null });
  t.app.get<RegistroAvanceLecturas>(AVANCE_LECTURAS).registrar({
    avanceDe: async (id, lecturaIds) => new Map(lecturaIds.filter((l) => avance.get(id)?.has(l)).map((l) => [l, avance.get(id)?.get(l) as AvanceLectura])),
  });
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
  return { id: cuenta.id, token: login.body.accessToken as string };
}

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

/** Lectura publicada por el flujo real de Contenido (editora → revisor). */
async function publicar(titulo: string, rangoEdad: 'R1' | 'R2' | 'R3') {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({
      metadatos: { titulo, rangoEdad, nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body;
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora.token)).send({
    actividades: [{
      momento: 'DESPUES', tipo: 'EVIDENCIA',
      items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la evidencia', clavesEvidencia: [oraciones[3].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca al final.' }] }],
    }],
  }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(200);
  return lecturaId as string;
}

/** Publica en el bus lo que publicará Lectura (Módulo 6) cuando el niño termine una lectura. */
async function terminarLectura(estudianteId: string, lecturaId: string) {
  const suyo = avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
  suyo.set(lecturaId, 'FINALIZADA');
  avance.set(estudianteId, suyo);
  await bus.publicar([crearEvento(EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA, uuidV7(), { estudianteId, lecturaId })]);
}

let editora: Awaited<ReturnType<typeof backoffice>>;
let revisor: Awaited<ReturnType<typeof backoffice>>;
let tokenDocente: string;
let aulaId: string;
const ninos: Record<'mateo' | 'lucia', { id: string; token: string }> = {} as never;
let mundos: { id: string; numero: number }[];
const lecturasR2: string[] = [];
const misionesR2: string[] = [];

describe('Preparación: lecturas publicadas y un aula con dos niños', () => {
  it('editora, revisor, docente y niños de 9 y 11 años con sesión en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisor = await backoffice('REVISOR');
    for (let i = 1; i <= 4; i++) lecturasR2.push(await publicar(`Lectura ${i} para 8–9 años`, 'R2'));
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '4.° A', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const anio = new Date().getFullYear();
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    for (const [clave, alias, edad] of [['mateo', 'Mateo', 9], ['lucia', 'Lucía', 11]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      const token = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken;
      ninos[clave] = { id: m.estudianteId, token };
    }
    mundos = (await t.http().get(`${API}/backoffice/mundos`).set(bearer(editora.token)).expect(200)).body;
    expect(mundos.map((m) => m.numero)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Backoffice de misiones (RF-032)', () => {
  it('solo editores (y revisores para consultar) con MFA; el esqueleto de ejemplo ya no existe', async () => {
    await t.http().get(`${API}/backoffice/mundos`).set(bearer(tokenDocente)).expect(403);
    await t.http().get(`${API}/backoffice/mundos`).set(bearer(ninos.mateo.token)).expect(403);
    await t.http().get(`${API}/backoffice/mundos/${mundos[0]?.id}/misiones?edad=R2`).set(bearer(revisor.token)).expect(200);
    await t.http().post(`${API}/backoffice/mundos/${mundos[0]?.id}/misiones`).set(bearer(revisor.token)).send({ rangoEdad: 'R2', titulo: 'No', lecturaIds: [lecturasR2[0]] }).expect(403);
    await t.http().post(`${API}/aventura/demo`).set(bearer(ninos.mateo.token)).send({}).expect(404);
  });

  it('la editora arma 3 misiones del Explorador para 8–9 años; cada una queda en sus tablas y en la auditoría', async () => {
    const explorador = mundos[0]?.id as string;
    for (const [i, lecturaIds] of [[lecturasR2[0]], [lecturasR2[1]], [lecturasR2[2], lecturasR2[3]]].entries()) {
      const r = await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token))
        .send({ rangoEdad: 'R2', titulo: `Misión ${i + 1}`, descripcion: 'Sigue las huellas', lecturaIds }).expect(201);
      expect(r.body).toMatchObject({ orden: i + 1, rangoEdad: 'R2', lecturas: lecturaIds.map((id) => ({ id, publicada: true })) });
      misionesR2.push(r.body.id);
    }
    const filas = await t.prisma.misionLectura.findMany({ where: { misionId: misionesR2[2] }, orderBy: { orden: 'asc' } });
    expect(filas.map((f) => [f.lecturaId, f.orden])).toEqual([[lecturasR2[2], 1], [lecturasR2[3], 2]]);
    expect(await t.prisma.auditoria.count({ where: { accion: 'MISION_CREADA', actorId: editora.id, actorRol: 'EDITOR' } })).toBe(3);
    const lista = (await t.http().get(`${API}/backoffice/mundos`).set(bearer(editora.token)).expect(200)).body;
    expect(lista[0].misionesPorEdad).toEqual({ R1: 0, R2: 3, R3: 0 });
    const disponibles = (await t.http().get(`${API}/backoffice/misiones/lecturas-disponibles?edad=R2`).set(bearer(editora.token)).expect(200)).body;
    expect(disponibles.map((f: { id: string }) => f.id).sort()).toEqual([...lecturasR2].sort());
  });

  it('rechaza lecturas de otra edad o no publicadas, y datos inválidos', async () => {
    const explorador = mundos[0]?.id as string;
    const deOnce = await publicar('Volcanes del Perú', 'R3');
    const otraEdad = await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Volcanes', lecturaIds: [deOnce] }).expect(400);
    expect(otraEdad.body.detail).toBe('"Volcanes del Perú" es para 10–12 años y la misión es para 8–9 años');
    await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Fantasma', lecturaIds: [uuidV7()] }).expect(400);
    await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R9', titulo: 'Edad', lecturaIds: [lecturasR2[0]] }).expect(400);
    await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Ab', lecturaIds: [lecturasR2[0]] }).expect(400);
    await t.http().post(`${API}/backoffice/mundos/${uuidV7()}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Sin mundo', lecturaIds: [lecturasR2[0]] }).expect(404);
    expect(await t.prisma.mision.count()).toBe(3);
  });

  it('reordenar intercambia posiciones en una transacción (restricción única diferible)', async () => {
    const explorador = mundos[0]?.id as string;
    const nuevo = [misionesR2[2], misionesR2[0], misionesR2[1]];
    const r = await t.http().put(`${API}/backoffice/mundos/${explorador}/orden`).set(bearer(editora.token)).send({ rangoEdad: 'R2', misionIds: nuevo }).expect(200);
    expect(r.body.map((m: { id: string; orden: number }) => [m.id, m.orden])).toEqual(nuevo.map((id, i) => [id, i + 1]));
    const enBase = await t.prisma.mision.findMany({ where: { mundoId: explorador }, orderBy: { orden: 'asc' }, select: { id: true } });
    expect(enBase.map((m) => m.id)).toEqual(nuevo);
    await t.http().put(`${API}/backoffice/mundos/${explorador}/orden`).set(bearer(editora.token)).send({ rangoEdad: 'R2', misionIds: nuevo.slice(1) }).expect(400);
    expect(await t.prisma.auditoria.count({ where: { accion: 'MISIONES_REORDENADAS', recursoId: explorador } })).toBe(1);
  });

  it('la base rechaza misiones con edad inválida o progresos imposibles (segunda barrera)', async () => {
    await expect(t.prisma.$executeRaw`INSERT INTO aventura.mision (id, mundo_id, rango_edad, orden, titulo) VALUES (${uuidV7()}::uuid, ${mundos[0]?.id}::uuid, 'R9', 9, 'Mala edad')`).rejects.toThrow(/ck_mision_rango_edad/);
    await expect(t.prisma.$executeRaw`INSERT INTO aventura.progreso_mundo (estudiante_id, mundo_id, estado) VALUES (${uuidV7()}::uuid, ${mundos[0]?.id}::uuid, 'COMPLETADO')`).rejects.toThrow(/ck_progreso_mundo_fechas/);
  });
});

describe('Mapa del estudiante (RF-030, RF-032, RF-033)', () => {
  it('sin el Módulo 5, Mateo (9 años) empieza en el Explorador; los demás mundos están bloqueados', async () => {
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(mapa).toMatchObject({ diagnosticoPendiente: false, mundoActual: 1 });
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(mapa.mundos[0].misiones).toEqual({ completadas: 0, total: 3, necesarias: 3 });
    await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200);
    expect(await t.prisma.progresoMundo.count({ where: { estudianteId: ninos.mateo.id } })).toBe(5);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'aventura.EstudiantePosicionado', agregadoId: ninos.mateo.id } })).toBe(1);
  });

  it('ve las misiones de su edad en orden, con las lecturas sin respuestas; un mundo bloqueado da 409', async () => {
    const r = (await t.http().get(`${API}/aventura/mundos/${mundos[0]?.id}/misiones`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(r.misiones.map((m: { id: string; estado: string }) => [m.id, m.estado])).toEqual([[misionesR2[2], 'PENDIENTE'], [misionesR2[0], 'PENDIENTE'], [misionesR2[1], 'PENDIENTE']]);
    expect(r.misiones[0].lecturas.map((l: { titulo: string; avance: string }) => [l.titulo, l.avance])).toEqual([['Lectura 3 para 8–9 años', 'PENDIENTE'], ['Lectura 4 para 8–9 años', 'PENDIENTE']]);
    expect(JSON.stringify(r)).not.toMatch(/indice|pistas|explicacion|claves/i);
    const bloqueado = await t.http().get(`${API}/aventura/mundos/${mundos[1]?.id}/misiones`).set(bearer(ninos.mateo.token)).expect(409);
    expect(bloqueado.body.detail).toMatch(/bloqueado/);
    await t.http().get(`${API}/aventura/mundos/${uuidV7()}/misiones`).set(bearer(ninos.mateo.token)).expect(404);
    await t.http().get(`${API}/aventura/mapa`).set(bearer(tokenDocente)).expect(403);
  });

  it('RN-05 y RF-033: Lucía con diagnóstico pendiente no tiene mapa; al finalizarlo con LIT 80 y VOC 66 empieza en el Detective', async () => {
    diagnosticos.set(ninos.lucia.id, { estado: 'PENDIENTE' });
    const pendiente = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.lucia.token)).expect(200)).body;
    expect(pendiente.diagnosticoPendiente).toBe(true);
    await t.http().get(`${API}/aventura/mundos/${mundos[0]?.id}/misiones`).set(bearer(ninos.lucia.token)).expect(409);
    expect(await t.prisma.progresoMundo.count({ where: { estudianteId: ninos.lucia.id } })).toBe(0);

    diagnosticos.set(ninos.lucia.id, { estado: 'FINALIZADO', maestrias: { LIT: 80, VOC: 66, INF: 50, CRI: 40, ARG: 30 } });
    await bus.publicar([crearEvento(EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO, uuidV7(), { estudianteId: ninos.lucia.id, maestrias: { LIT: 80, VOC: 66, INF: 50, CRI: 40, ARG: 30 } })]);
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.lucia.token)).expect(200)).body;
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(mapa.mundos[1].celebrar).toBe(false); // el mundo inicial no se celebra
    // Las misiones de 8–9 años no son de Lucía (11 años).
    expect(mapa.mundos[0].misiones.total).toBe(0);
  });
});

describe('Avance y desbloqueo por eventos (RF-031, RF-032, RN-09)', () => {
  it('terminar lecturas completa misiones; con LIT y VOC ≥ 65 y 3 misiones se abre el Detective con celebración', async () => {
    const yo = ninos.mateo;
    maestrias.set(yo.id, { LIT: 70, VOC: 68, INF: 40 });
    await terminarLectura(yo.id, lecturasR2[0] as string);
    await terminarLectura(yo.id, lecturasR2[1] as string);
    expect((await t.http().get(`${API}/aventura/mapa`).set(bearer(yo.token))).body.mundos[1].estado).toBe('BLOQUEADO');
    await terminarLectura(yo.id, lecturasR2[2] as string); // la misión 3 tiene dos lecturas: sigue en curso
    const enCurso = await t.prisma.progresoMision.findUnique({ where: { estudianteId_misionId: { estudianteId: yo.id, misionId: misionesR2[2] as string } } });
    expect(enCurso).toMatchObject({ estado: 'EN_CURSO', completadaEn: null });

    const t0 = Date.now();
    await terminarLectura(yo.id, lecturasR2[3] as string);
    expect(Date.now() - t0).toBeLessThan(2000); // RF-031: desbloqueo en ≤ 2 s tras el evento que cumple el umbral
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(yo.token)).expect(200)).body;
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(mapa.mundos[0].misiones.completadas).toBe(3);
    expect(mapa.mundos[1].celebrar).toBe(true);
    const evento = await t.prisma.outboxEvento.findFirst({ where: { tipo: 'aventura.MundoDesbloqueado', agregadoId: yo.id } });
    expect(evento?.payload).toEqual({ estudianteId: yo.id, mundoCompletado: 1, mundoDesbloqueado: 2 });
    expect(evento?.publicadoEn).not.toBeNull();
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'aventura.MisionCompletada' } })).toBe(3);

    await t.http().post(`${API}/aventura/mundos/${mundos[1]?.id}/celebracion`).set(bearer(yo.token)).expect(204);
    expect((await t.http().get(`${API}/aventura/mapa`).set(bearer(yo.token))).body.mundos[1].celebrar).toBe(false);
    const fila = await t.prisma.progresoMundo.findUnique({ where: { estudianteId_mundoId: { estudianteId: yo.id, mundoId: mundos[1]?.id as string } } });
    expect(fila?.celebradoEn).not.toBeNull();
  });

  it('repetir el evento no desbloquea dos veces ni hace retroceder misiones', async () => {
    await terminarLectura(ninos.mateo.id, lecturasR2[3] as string);
    await bus.publicar([crearEvento(EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, uuidV7(), { estudianteId: ninos.mateo.id })]);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'aventura.MundoDesbloqueado', agregadoId: ninos.mateo.id } })).toBe(1);
    expect(await t.prisma.progresoMision.count({ where: { estudianteId: ninos.mateo.id, estado: 'COMPLETADA' } })).toBe(3);
  });

  it('las misiones aparecen en el catálogo para asignar del aula, con su mundo y su edad (Módulo 2)', async () => {
    const catalogo = (await t.http().get(`${API}/aulas/${aulaId}/asignaciones/catalogo`).set(bearer(tokenDocente)).expect(200)).body;
    expect(catalogo.misiones).toHaveLength(3);
    expect(catalogo.misiones[0]).toMatchObject({ tipo: 'MISION', detalle: 'Mundo 1 · Explorador · 8–9 años' });
  });
});
```

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

```ts
import { expect, Page, test as base } from '@playwright/test';

import { idMundo, misionConLecturas, simularDesbloqueo, tituloMision } from '../../support/aventura';
import { cuentaBackoffice, ingresarBackoffice, lecturaPublicada } from '../../support/contenido';
import { retoTerminado } from '../../support/diagnostico';
import { AulaPreparada, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Aventura de punta a punta (RF-030 a RF-033) en escritorio, tablet y celular: la editora
 * arma misiones en la web real y el niño (9 años) las encuentra en su mapa; los mundos bloqueados no
 * se abren y un desbloqueo se celebra una sola vez.
 */
test.describe('Aventura: mapa, mundos y misiones (RF-030 a RF-033)', () => {
  test.setTimeout(150_000);

  async function entrarComoNino(page: Page, aula: AulaPreparada, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  test('la editora arma una misión en la web y el niño la ve en su mundo; los demás siguen bloqueados', async ({ page, request }) => {
    const sufijo = Date.now().toString(36);
    const lectura = await lecturaPublicada(request, { titulo: `La cueva del eco ${sufijo}`, tematica: `Cuevas ${sufijo}` });
    const editora = await cuentaBackoffice('EDITOR');
    const titulo = tituloMision('Huellas en el bosque');

    // RF-032: la editora elige el mundo y la edad, y arma la misión con lecturas publicadas de esa edad.
    await ingresarBackoffice(page, editora);
    await page.getByRole('link', { name: 'Armar las misiones' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Misiones' })).toBeVisible();
    await page.getByLabel('Mundo', { exact: true }).selectOption({ label: 'Mundo 1 · Explorador' });
    await page.getByLabel('Edad', { exact: true }).selectOption('R2');
    await page.getByRole('button', { name: '+ Nueva misión' }).click();
    await page.getByLabel('Título de la misión').fill(titulo);
    await page.getByLabel('Descripción (opcional)').fill('Sigue las huellas hasta la cueva.');
    await page.getByRole('button', { name: `Agregar ${lectura.titulo}` }).click();
    await expect(page.getByRole('button', { name: `Quitar ${lectura.titulo}` })).toBeVisible();
    await page.getByRole('button', { name: 'Crear misión' }).click();
    await expect(page.getByText('Misión creada.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: titulo })).toBeVisible();
    await salirDelPanel(page);

    // RF-030, RF-033: tras su reto inicial sin destacar en LIT ni VOC, empieza en el Explorador.
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017: 8–9 años
    await retoTerminado(request, aula, 'Mateo'); // RN-05: primero su reto inicial (sin destacar: mundo 1)
    await tabletDelAulaActivada(page, request, aula);
    await entrarComoNino(page, aula, 'Mateo');
    const mundos = page.getByRole('region', { name: 'Tus mundos' });
    await expect(mundos.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toContainText('¡Estás aquí!');
    await expect(mundos.getByRole('link', { name: /Entrar al mundo [2-5]/ })).toHaveCount(0);
    await expect(mundos.getByText('Completa el mundo anterior')).toHaveCount(4);

    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
    await page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Explorador' })).toBeVisible();
    const mision = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: titulo }) });
    await expect(mision.getByText('Por empezar')).toBeVisible();
    await expect(mision.getByText('Sigue las huellas hasta la cueva.')).toBeVisible();
    await expect(mision.getByText(lectura.titulo)).toBeVisible();
    await expect(mision.getByText('Por leer')).toBeVisible();
  });

  test('un mundo bloqueado no se abre aunque el niño escriba su dirección', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala' }]);
    await retoTerminado(request, aula, 'Lía');
    await tabletDelAulaActivada(page, request, aula);
    await entrarComoNino(page, aula, 'Lía');
    await page.goto(`/estudiante/mundos/${await idMundo(3)}`);
    await expect(page.getByText('Este mundo todavía está bloqueado: completa el anterior para abrirlo')).toBeVisible();
    await page.getByRole('link', { name: 'Tu mapa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
  });

  test('RF-031: al desbloquear el Detective el niño ve la celebración una sola vez', async ({ page, request }) => {
    const editora = await cuentaBackoffice('EDITOR');
    const delDetective = await misionConLecturas(request, editora, 2, tituloMision('El enigma del valle'), ['Pistas en la arena']);
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Teo');
    await tabletDelAulaActivada(page, request, aula);
    await entrarComoNino(page, aula, 'Teo');
    await expect(page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toBeVisible(); // ya tiene su mapa

    await simularDesbloqueo(aula.estudiantes['Teo'] as string, 2);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    const celebracion = page.getByRole('dialog', { name: '¡Desbloqueaste el mundo Detective!' });
    await expect(celebracion).toBeVisible();
    await expect(celebracion.getByRole('button', { name: '¡Vamos!' })).toBeFocused();
    const vista = page.waitForResponse((r) => r.url().endsWith('/celebracion') && r.status() === 204);
    await celebracion.getByRole('button', { name: '¡Vamos!' }).click();
    await vista;
    await expect(celebracion).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toContainText('¡Mundo completado!');

    // No se repite: la API la marcó como vista.
    await page.reload();
    await expect(page.getByRole('link', { name: 'Entrar al mundo 2: Detective' })).toContainText('¡Estás aquí!');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Entrar al mundo 2: Detective' }).click();
    await expect(page.getByRole('heading', { level: 2, name: delDetective.titulo })).toBeVisible();
  });

  test('el revisor consulta las misiones pero no las cambia', async ({ page }) => {
    const revisor = await cuentaBackoffice('REVISOR');
    await ingresarBackoffice(page, revisor);
    await page.getByRole('link', { name: 'Ver las misiones' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Misiones' })).toBeVisible();
    await expect(page.getByLabel('Mundo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Nueva misión' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
  });
});
```

`tests/e2e/support/aventura.ts`:

```ts
import { resolve } from 'node:path';

import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { CuentaBackoffice, lecturaPublicada, sesionBackoffice } from './contenido';
import { MARCA_CONTENIDO_E2E } from './escuela';

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** Título único de una misión de prueba; la marca "Prueba E2E" hace que la limpieza la borre. */
export const tituloMision = (titulo: string) => `${MARCA_CONTENIDO_E2E}: ${titulo} ${Date.now().toString(36)}`;

/** Id de un mundo del catálogo (los 5 que carga la migración). */
export async function idMundo(numero: number): Promise<string> {
  const prisma = db();
  try {
    return (await prisma.mundo.findUniqueOrThrow({ where: { numero } })).id;
  } finally {
    await prisma.$disconnect();
  }
}

/** Una misión de 8–9 años armada por la API del backoffice con lecturas nuevas publicadas. */
export async function misionConLecturas(
  request: APIRequestContext,
  editora: CuentaBackoffice,
  numeroMundo: number,
  titulo: string,
  lecturas: string[],
): Promise<{ misionId: string; titulo: string; lecturas: string[] }> {
  const sufijo = Date.now().toString(36);
  const ids: string[] = [];
  const titulos: string[] = [];
  for (const t of lecturas) {
    const l = await lecturaPublicada(request, { titulo: `${t} ${sufijo}`, tematica: `Aventura ${sufijo}` });
    ids.push(l.lecturaId);
    titulos.push(l.titulo);
  }
  const r = await request.post(`/api/v1/backoffice/mundos/${await idMundo(numeroMundo)}/misiones`, {
    headers: await sesionBackoffice(request, editora),
    data: { rangoEdad: 'R2', titulo, lecturaIds: ids },
  });
  expect(r.status(), await r.text()).toBe(201);
  return { misionId: (await r.json()).id, titulo, lecturas: titulos };
}

/**
 * RF-031: deja al niño como lo dejará el evento de los Módulos 6 y 7 al cumplir el umbral (RN-09):
 * los mundos anteriores completados y este disponible, con la celebración aún sin ver. La regla en
 * sí se prueba en los niveles 1 y 2 con los eventos reales; aquí se prueba lo que ve el niño.
 */
export async function simularDesbloqueo(estudianteId: string, numero: number): Promise<void> {
  const prisma = db();
  try {
    const ahora = new Date();
    const mundos = await prisma.mundo.findMany({ where: { numero: { lte: numero } } });
    await prisma.$transaction(
      mundos.map((m) =>
        prisma.progresoMundo.update({
          where: { estudianteId_mundoId: { estudianteId, mundoId: m.id } },
          data: m.numero < numero ? { estado: 'COMPLETADO', completadoEn: ahora } : { estado: 'DISPONIBLE', desbloqueadoEn: ahora, celebradoEn: null },
        }),
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
```

`tests/load/scenarios/aventura-mapa.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del mapa de aventuras (k6).
 *   RNF-001: lecturas → p95 < 300 ms y p99 < 800 ms.
 *     · GET /aventura/mapa: los 5 mundos con su estado y las misiones de la edad del niño (RF-030);
 *     · GET /aventura/mundos/{id}/misiones: misiones con sus lecturas y el avance (RF-032).
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa) y misiones sembradas:
 *             node tests/load/sembrar-aventura.mjs
 * Ejecutar:   k6 run tests/load/scenarios/aventura-mapa.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 -e DURACION=30s tests/load/scenarios/aventura-mapa.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NINOS = 10;

export const options = {
  scenarios: {
    mapa: {
      executor: 'constant-vus',
      vus: NINOS,
      duration: __ENV.DURACION || '1m',
      exec: 'recorrerMapa',
      tags: { escenario: 'mapa' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /aventura/mapa}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /aventura/mundos/{id}/misiones}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Una docente con un aula de 10 niños de 9 años, cada uno con su sesión en la tablet del aula. */
export function setup() {
  const email = `carga.aventura.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Carga', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${['zorro', 'panda', 'leon', 'rana', 'pulpo'][i % 5]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  const { tokenDispositivo } = http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: 'Tablet carga' }), { headers: docente }).json();

  const ninos = matriculados.map((m) => {
    http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
    const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: m.estudianteId, pin: '4826' }), cabeceras).json();
    const nino = { ...JSON_HEADERS, Authorization: `Bearer ${ingreso.accessToken}` };
    retoInicial(nino);
    return nino;
  });
  // Al terminar el reto, cada niño quedó en su mundo inicial (RF-033); se mide el uso de todos los días.
  const mapa = http.get(`${BASE}/aventura/mapa`, { headers: ninos[0] }).json();
  if (!mapa.mundos || mapa.mundos[0].misiones.total === 0) fail('No hay misiones: ejecuta antes node tests/load/sembrar-aventura.mjs');
  return { ninos, mundoActual: mapa.mundos[0].id };
}

/** RN-05: un niño nuevo hace su reto inicial (Módulo 5) antes de que se abra su mapa. */
function retoInicial(nino) {
  const { id } = http.post(`${BASE}/diagnosticos`, null, { headers: nino }).json();
  for (let i = 0; i < 20; i++) {
    const item = http.get(`${BASE}/diagnosticos/${id}/siguiente-item`, { headers: nino }).json('item');
    if (!item) break;
    http.post(`${BASE}/diagnosticos/${id}/respuestas`, JSON.stringify({ itemId: item.itemId, indice: 0 }), { headers: nino });
  }
  if (http.post(`${BASE}/diagnosticos/${id}/finalizar`, null, { headers: nino }).status !== 200) fail('No se pudo terminar el reto inicial de un niño de carga');
}

export function recorrerMapa(datos) {
  const yo = datos.ninos[(__VU - 1) % datos.ninos.length];
  const mapa = http.get(`${BASE}/aventura/mapa`, { headers: yo, tags: { nombre: 'GET /aventura/mapa' } });
  check(mapa, { 'mapa con 5 mundos': (r) => r.status === 200 && r.json('mundos').length === 5 });
  const misiones = http.get(`${BASE}/aventura/mundos/${datos.mundoActual}/misiones`, { headers: yo, tags: { nombre: 'GET /aventura/mundos/{id}/misiones' } });
  check(misiones, { 'misiones del mundo actual': (r) => r.status === 200 && r.json('misiones').length >= 3 });
}
```

`tests/load/sembrar-aventura.mjs`:

```js
// Siembra misiones para el escenario k6 de Aventura (scenarios/aventura-mapa.js): 3 misiones de
// 8–9 años en cada mundo, cada una con 2 lecturas publicadas de esa edad (RF-032).
// SOLO para desarrollo y CI (ver sembrado.mjs).
//
// Uso (con la API en marcha):  node tests/load/sembrar-aventura.mjs
import { conPrisma, cuentaBackoffice, exigirEntornoLocal, llamar, publicarLecturas } from './sembrado.mjs';

const MISIONES_POR_MUNDO = 3;
const LECTURAS_POR_MISION = 2;

exigirEntornoLocal();
await conPrisma(async (prisma) => {
  const editora = await cuentaBackoffice(prisma, 'EDITOR');
  const revisor = await cuentaBackoffice(prisma, 'REVISOR');
  const mundos = await llamar('GET', '/backoffice/mundos', undefined, editora);
  const lecturas = await publicarLecturas(editora, revisor, mundos.length * MISIONES_POR_MUNDO * LECTURAS_POR_MISION, { prefijo: 'Misión de carga', rangoEdad: 'R2' });
  let i = 0;
  for (const mundo of mundos) {
    for (let m = 1; m <= MISIONES_POR_MUNDO; m++) {
      const lecturaIds = lecturas.slice(i, i + LECTURAS_POR_MISION);
      i += LECTURAS_POR_MISION;
      await llamar('POST', `/backoffice/mundos/${mundo.id}/misiones`, { rangoEdad: 'R2', titulo: `Carga ${mundo.numero}.${m}`, lecturaIds }, editora);
    }
  }
});
console.log(`✔ ${MISIONES_POR_MUNDO} misiones por mundo (8–9 años) para la prueba de carga de Aventura.`);
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@aventura
Característica: Mapa de aventuras, mundos y misiones
  Como estudiante de LectoAventura
  Quiero recorrer los 5 mundos completando misiones de lectura
  Para sentir que avanzo y desbloquear nuevos desafíos

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-030 @RF-033 @camino-feliz @smoke
  Escenario: Tras su reto inicial, un niño empieza en el mundo Explorador y los demás están bloqueados
    Dado un niño de 9 años que ya hizo su reto inicial, con la tablet activada
    Cuando entra con su avatar y su PIN
    Entonces su mapa lo ubica en el mundo "Explorador"
    Y los mundos "Detective", "Investigador", "Crítico" y "Maestro de la Lectura" aparecen bloqueados

  @RF-032 @camino-feliz
  Escenario: La editora arma una misión y el niño la encuentra en su mundo
    Dado que hay una lectura publicada para 8–9 años llamada "La cueva del eco"
    Cuando una editora arma en el mundo "Explorador" la misión "Huellas en el bosque" con esa lectura
    Y un niño de 9 años abre el mundo "Explorador"
    Entonces ve la misión "Huellas en el bosque" por empezar, con la lectura "La cueva del eco"

  @RF-030 @negativo
  Escenario: Un mundo bloqueado no se puede abrir
    Dado un niño de 9 años que ya hizo su reto inicial, con la tablet activada
    Cuando entra con su avatar y su PIN
    Y intenta abrir el mundo "Investigador"
    Entonces le explica que primero debe completar el mundo anterior

  @RF-031 @RN-09
  Escenario: Al desbloquear el mundo Detective el niño lo celebra una sola vez
    Dado un niño de 9 años que ya hizo su reto inicial, con la tablet activada
    Y que ya entró y tiene su mapa
    Cuando cumple el umbral de maestría y misiones del Explorador
    Y vuelve a su mapa
    Entonces ve la celebración "¡Desbloqueaste el mundo Detective!"
    Y al cerrarla, el Explorador aparece completado y la celebración no vuelve a salir
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect, Page } from '@playwright/test';

import { idMundo, simularDesbloqueo, tituloMision } from '../support/aventura';
import { cuentaBackoffice, ingresarBackoffice, lecturaPublicada } from '../support/contenido';
import { retoTerminado } from '../support/diagnostico';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de Aventura (RF-030 a RF-033). */

const NUMERO: Record<string, number> = { Explorador: 1, Detective: 2, Investigador: 3, Crítico: 4, 'Maestro de la Lectura': 5 };

interface Estado {
  lectura?: string;
  mision?: string;
}
const estado = new WeakMap<object, Estado>();
const de = (mundo: object): Estado => {
  if (!estado.has(mundo)) estado.set(mundo, {});
  return estado.get(mundo) as Estado;
};

const enlaceDelMundo = (page: Page, nombre: string) => page.getByRole('link', { name: `Entrar al mundo ${NUMERO[nombre]}: ${nombre}` });

async function entrar(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

async function abrirMapa(page: Page) {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
}

// ── RF-030, RF-033: posición inicial y mundos bloqueados ──────────────────

Dado('un niño de 9 años que ya hizo su reto inicial, con la tablet activada', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017
  await retoTerminado(request, mundo.aula, 'Mateo'); // RN-05; sin destacar en LIT ni VOC: mundo 1 (RF-033)
  await tabletDelAulaActivada(page, request, mundo.aula);
});

Cuando('entra con su avatar y su PIN', async ({ page }) => {
  await entrar(page);
});

Entonces('su mapa lo ubica en el mundo {string}', async ({ page }, nombre: string) => {
  await abrirMapa(page);
  await expect(enlaceDelMundo(page, nombre)).toContainText('¡Estás aquí!');
});

Entonces('los mundos {string}, {string}, {string} y {string} aparecen bloqueados', async ({ page }, a: string, b: string, c: string, d: string) => {
  for (const nombre of [a, b, c, d]) {
    await expect(enlaceDelMundo(page, nombre)).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: nombre }).getByText('Completa el mundo anterior')).toBeVisible();
  }
});

// ── RF-032: misiones ──────────────────────────────────────────────────────

Dado('que hay una lectura publicada para 8–9 años llamada {string}', async ({ request, mundo }, titulo: string) => {
  const sufijo = Date.now().toString(36);
  de(mundo).lectura = (await lecturaPublicada(request, { titulo: `${titulo} ${sufijo}`, rangoEdad: 'R2', tematica: `Aventura ${sufijo}` })).titulo;
});

Cuando('una editora arma en el mundo {string} la misión {string} con esa lectura', async ({ page, mundo }, nombreMundo: string, titulo: string) => {
  const e = de(mundo);
  e.mision = tituloMision(titulo);
  await ingresarBackoffice(page, await cuentaBackoffice('EDITOR'));
  await page.goto('/backoffice/misiones');
  await page.getByLabel('Mundo', { exact: true }).selectOption({ label: `Mundo ${NUMERO[nombreMundo]} · ${nombreMundo}` });
  await page.getByLabel('Edad', { exact: true }).selectOption('R2');
  await page.getByRole('button', { name: '+ Nueva misión' }).click();
  await page.getByLabel('Título de la misión').fill(e.mision);
  await page.getByRole('button', { name: `Agregar ${e.lectura}` }).click();
  await page.getByRole('button', { name: 'Crear misión' }).click();
  await expect(page.getByText('Misión creada.')).toBeVisible();
  await salirDelPanel(page);
});

Cuando('un niño de 9 años abre el mundo {string}', async ({ page, request, mundo }, nombre: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo');
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrar(page);
  await abrirMapa(page);
  await enlaceDelMundo(page, nombre).click();
  await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
});

Entonces('ve la misión {string} por empezar, con la lectura {string}', async ({ page, mundo }, _titulo: string, _lectura: string) => {
  // Los títulos reales llevan un sufijo único por escenario.
  const e = de(mundo);
  const mision = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: e.mision }) });
  await expect(mision.getByText('Por empezar')).toBeVisible();
  await expect(mision.getByText(e.lectura as string)).toBeVisible();
});

Cuando('intenta abrir el mundo {string}', async ({ page }, nombre: string) => {
  await page.goto(`/estudiante/mundos/${await idMundo(NUMERO[nombre] as number)}`);
});

Entonces('le explica que primero debe completar el mundo anterior', async ({ page }) => {
  await expect(page.getByText('Este mundo todavía está bloqueado: completa el anterior para abrirlo')).toBeVisible();
});

// ── RF-031: desbloqueo y celebración ──────────────────────────────────────

Dado('que ya entró y tiene su mapa', async ({ page }) => {
  await entrar(page);
  await expect(enlaceDelMundo(page, 'Explorador')).toContainText('¡Estás aquí!');
});

Cuando('cumple el umbral de maestría y misiones del Explorador', async ({ mundo }) => {
  // Lo que hará el evento de los Módulos 6 y 7 (RN-09); la regla se prueba en los niveles 1 y 2.
  await simularDesbloqueo(mundo.aula?.estudiantes['Mateo'] as string, 2);
});

Cuando('vuelve a su mapa', async ({ page }) => {
  await abrirMapa(page);
});

Entonces('ve la celebración {string}', async ({ page }, titulo: string) => {
  const celebracion = page.getByRole('dialog', { name: titulo });
  await expect(celebracion).toBeVisible();
  await expect(celebracion.getByRole('button', { name: '¡Vamos!' })).toBeFocused();
});

Entonces('al cerrarla, el Explorador aparece completado y la celebración no vuelve a salir', async ({ page }) => {
  const vista = page.waitForResponse((r) => r.url().endsWith('/celebracion') && r.status() === 204);
  await page.getByRole('dialog').getByRole('button', { name: '¡Vamos!' }).click();
  await vista;
  await expect(enlaceDelMundo(page, 'Explorador')).toContainText('¡Mundo completado!');
  await page.reload();
  await expect(enlaceDelMundo(page, 'Detective')).toContainText('¡Estás aquí!');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
```

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
