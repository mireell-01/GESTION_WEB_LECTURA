<!-- Generado con node docs/pruebas/construir.mjs desde 10-acompanamiento-familiar-plan-de-pruebas.plantilla.md. No editar a mano. -->
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

```ts
import { describe, expect, it } from 'vitest';

import {
  CONSEJOS_FAMILIA,
  CONSEJOS_HABITO,
  consejosPara,
  habilidadesAReforzar,
  semanaFamiliarPorResumir,
} from '../../../../src/modules/reporting/domain/services/acompanamiento-familiar';
import { celdasDe } from '../../../../src/modules/reporting/domain/services/mapa-calor';
import { HmacFirmaBaja } from '../../../../src/modules/reporting/infrastructure/firma-baja';
import { HABILIDADES, RANGOS_EDAD } from '../../../../src/modules/shared-kernel/public-api';

/** Nivel 1 — Dominio del acompañamiento familiar (RF-068 a RF-070). */
const medidas = (v: Record<string, number>, items = 6) => Object.entries(v).map(([habilidad, valor]) => ({ habilidad, valor, items }));
const CUENTA = '0192f1c4-7a10-7c3e-9b2a-1f0e5d6c7b8a';

describe('Habilidades a reforzar (RF-068)', () => {
  it('las medidas por debajo de "Logrado" (65), de la más baja a la más alta, hasta 3', () => {
    const celdas = celdasDe(medidas({ LIT: 80, INF: 31, VOC: 48, CRI: 64.9, ARG: 20 }));
    expect(habilidadesAReforzar(celdas)).toEqual([
      { habilidad: 'ARG', valor: 20 },
      { habilidad: 'INF', valor: 31 },
      { habilidad: 'VOC', valor: 48 },
    ]);
  });

  it('se usan desde el reto inicial (aunque aún no haya nivel declarado); sin medir o desde 65, no', () => {
    const celdas = celdasDe(medidas({ LIT: 40, INF: 40, CRI: 65 }, 2));
    expect(celdas.find((c) => c.habilidad === 'LIT')!.nivel).toBeNull();
    // Empate: en el orden del SRS.
    expect(habilidadesAReforzar(celdas)).toEqual([
      { habilidad: 'LIT', valor: 40 },
      { habilidad: 'INF', valor: 40 },
    ]);
    expect(habilidadesAReforzar(celdasDe([]))).toEqual([]);
  });
});

describe('Consejos para casa (RF-069)', () => {
  it('al menos un consejo práctico por habilidad y edad, para no especialistas', () => {
    for (const h of HABILIDADES) {
      for (const r of RANGOS_EDAD) {
        const consejos = consejosPara(h, r);
        expect(consejos.length, `${h} ${r}`).toBeGreaterThanOrEqual(1);
        expect(consejos.length).toBeLessThanOrEqual(2);
        for (const c of consejos) {
          expect(c.length).toBeGreaterThan(40);
          // Sin tecnicismos del SRS ni siglas.
          expect(c).not.toMatch(/inferencia|CNEB|maestría|literal/i);
          expect(c).not.toMatch(/\b(LIT|INF|VOC|CRI|ARG)\b/);
        }
      }
    }
    expect(CONSEJOS_HABITO.length).toBeGreaterThanOrEqual(1);
  });

  it('según la edad: un consejo solo para los mayores no se da a un niño de 6–7 años', () => {
    const soloMayores = CONSEJOS_FAMILIA.CRI.find((c) => c.edades?.join() === 'R2,R3')!.texto;
    expect(consejosPara('CRI', 'R3', 5)).toContain(soloMayores);
    expect(consejosPara('CRI', 'R1', 5)).not.toContain(soloMayores);
    expect(consejosPara('ARG', 'R1', 5)).toContain(CONSEJOS_FAMILIA.ARG.find((c) => c.edades?.join() === 'R1')!.texto);
  });
});

describe('Semana del resumen (RF-070: domingos a las 18:00 de Lima)', () => {
  it('el domingo desde las 18:00 resume la semana en curso; antes, la anterior', () => {
    expect(semanaFamiliarPorResumir(new Date('2026-10-25T22:59:00Z'))).toBe('2026-10-12'); // domingo 25, 17:59
    expect(semanaFamiliarPorResumir(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-19'); // domingo 25, 18:00
    expect(semanaFamiliarPorResumir(new Date('2026-10-26T04:59:00Z'))).toBe('2026-10-19'); // domingo 25, 23:59
  });

  it('de lunes a sábado, la última que ya se pudo enviar', () => {
    expect(semanaFamiliarPorResumir(new Date('2026-10-26T15:00:00Z'))).toBe('2026-10-19'); // lunes 26
    expect(semanaFamiliarPorResumir(new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-19'); // sábado 31
  });
});

describe('Enlace de baja firmado (RF-070)', () => {
  const firma = new HmacFirmaBaja('secreto-de-prueba');

  it('lleva la cuenta y su firma; se verifica en tiempo constante', () => {
    const token = firma.token(CUENTA);
    expect(token.startsWith(`${CUENTA}.`)).toBe(true);
    expect(firma.cuentaDe(token)).toBe(CUENTA);
  });

  it('una firma alterada, la firma de otra cuenta, otro secreto o basura no sirven', () => {
    const token = firma.token(CUENTA);
    expect(firma.cuentaDe(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(firma.cuentaDe(`0192f1c4-7a10-7c3e-9b2a-000000000000.${token.split('.')[1]}`)).toBeNull();
    expect(new HmacFirmaBaja('otro-secreto').cuentaDe(token)).toBeNull();
    for (const basura of ['', 'x', `${token}.extra`, 'no-es-uuid.firma', undefined as unknown as string]) {
      expect(firma.cuentaDe(basura)).toBeNull();
    }
  });

  it('sin secreto no arranca (no se firman enlaces con una clave vacía)', () => {
    expect(() => new HmacFirmaBaja('')).toThrow('JWT_SECRET');
  });
});
```

`apps/api/test/unit/reporting/aplicacion/familia-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { EnlaceBajaInvalidoError } from '../../../../src/modules/reporting/application/use-cases/preferencias-familia.use-case';
import { parrafoHijo } from '../../../../src/modules/reporting/application/use-cases/resumen-familiar.use-case';
import { CONSEJOS_FAMILIA, CONSEJOS_HABITO } from '../../../../src/modules/reporting/domain/services/acompanamiento-familiar';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoFamilia, EntornoFamilia } from '../dobles-familia';

/** Nivel 1 — Casos de uso del acompañamiento familiar con dobles (RF-068 a RF-070, RN-17). */
const CARMEN = '0192f1c4-7a10-7c3e-9b2a-00000000000a';
const JOSE = '0192f1c4-7a10-7c3e-9b2a-00000000000b';
const ELENA = '0192f1c4-7a10-7c3e-9b2a-00000000000c';
const MATEO = 'est-mateo';
const LUCIA = 'est-lucia';
const PEDRO = 'est-pedro';
const BENJA = 'est-benja';
const DOMINGO_1830 = new Date('2026-10-25T23:30:00Z'); // domingo 25, 18:30 en Lima

describe('Acompañamiento familiar: panel por hijo, preferencias y resumen semanal', () => {
  let e: EntornoFamilia;

  beforeEach(() => {
    e = crearEntornoFamilia();
    e.hijos.porCuenta.set(CARMEN, [
      { id: LUCIA, alias: 'Lucía', avatar: 'koala', rangoEdad: 'R2', activo: true, relacion: 'RESPONSABLE' },
      { id: MATEO, alias: 'Mateo', avatar: 'leon', rangoEdad: 'R2', activo: true, relacion: 'VINCULADO' },
    ]);
    e.hijos.porCuenta.set(JOSE, [{ id: PEDRO, alias: 'Pedro', avatar: 'panda', rangoEdad: 'R1', activo: false, relacion: 'RESPONSABLE' }]);
    e.hijos.porCuenta.set(ELENA, [{ id: BENJA, alias: 'Benja', avatar: 'tigre', rangoEdad: 'R3', activo: true, relacion: 'RESPONSABLE' }]);
    e.repo.familias.set(CARMEN, [MATEO, LUCIA]);
    e.repo.familias.set(JOSE, [PEDRO]);
    e.repo.familias.set(ELENA, [BENJA]);

    e.repo.maestria(MATEO, { LIT: 80, INF: 31, VOC: 48, CRI: 70, ARG: 66 });
    e.repo.avances.set(MATEO, { lecturasTerminadas: 3, mundosCompletados: 1, mundoActual: { numero: 2, nombre: 'Detective' }, puntos: 120, insignias: 2 });
    e.repo.actividad.set(MATEO, new Date('2026-10-20T20:00:00Z'));
    e.repo.semanal.push(
      { estudianteId: MATEO, semana: '2026-10-19', lecturas: 2, minutos: 25.4, respuestas: 14 },
      { estudianteId: MATEO, semana: '2026-10-12', lecturas: 0, minutos: 0.3, respuestas: 2 },
    );
    e.realizadas.porEstudiante.set(MATEO, [{ lecturaId: 'l-killa', finalizadaEn: new Date('2026-10-20T20:00:00Z') }]);
    e.fichas.lista.push(
      { id: 'l-killa', titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', habilidadesObjetivo: ['INF', 'ARG'] },
      { id: 'l-condor', titulo: 'El cóndor', rangoEdad: 'R2', nivelDificultad: 3, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
      { id: 'l-r3', titulo: 'Para grandes', rangoEdad: 'R3', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['INF', 'VOC'] },
    );
  });

  describe('Panel por hijo (RF-068, RF-069)', () => {
    it('RN-17: un niño que no está vinculado a la cuenta responde como si no existiera', async () => {
      await expect(e.panel.panel(CARMEN, PEDRO)).rejects.toBeInstanceOf(NoEncontradoError);
      await expect(e.panel.panel(JOSE, MATEO)).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('su semana, su avance, sus habilidades y cómo acompañar en casa las que necesitan refuerzo', async () => {
      const p = await e.panel.panel(CARMEN, MATEO);
      expect(p.estudiante).toEqual({ id: MATEO, alias: 'Mateo', avatar: 'leon', rangoEdad: 'R2', activo: true, relacion: 'VINCULADO' });
      expect(p.actualizadoEn).toBe('2026-10-21T14:55:00.000Z');
      // Si leyó algo, al menos 1 minuto.
      expect(p.semana).toEqual({
        actual: { semana: '2026-10-19', minutos: 25, lecturas: 2, respuestas: 14 },
        anterior: { semana: '2026-10-12', minutos: 1, lecturas: 0, respuestas: 2 },
      });
      expect(p.avance).toEqual({
        lecturasTerminadas: 3,
        mundosCompletados: 1,
        mundoActual: { numero: 2, nombre: 'Detective' },
        puntos: 120,
        insignias: 2,
        ultimaActividad: '2026-10-20T20:00:00.000Z',
      });
      expect(p.habilidades.map((h) => [h.habilidad, h.valor, h.nivel])).toEqual([
        ['LIT', 80, 'A'],
        ['INF', 31, 'C'],
        ['VOC', 48, 'B'],
        ['CRI', 70, 'A'],
        ['ARG', 66, 'A'],
      ]);
      // RF-069: 2 consejos de su edad por habilidad; la lectura de su edad que la trabaja y no terminó.
      expect(p.aReforzar).toEqual([
        { habilidad: 'INF', valor: 31, consejos: CONSEJOS_FAMILIA.INF.slice(0, 2).map((c) => c.texto), lectura: { id: 'l-condor', titulo: 'El cóndor' } },
        { habilidad: 'VOC', valor: 48, consejos: CONSEJOS_FAMILIA.VOC.slice(0, 2).map((c) => c.texto), lectura: null },
      ]);
      expect(p.habito).toEqual(CONSEJOS_HABITO);
    });

    it('un hijo que aún no empieza: todo en cero, sin mundo ni habilidades por reforzar', async () => {
      const p = await e.panel.panel(CARMEN, LUCIA);
      expect(p.semana.actual).toEqual({ semana: '2026-10-19', minutos: 0, lecturas: 0, respuestas: 0 });
      expect(p.avance).toEqual({ lecturasTerminadas: 0, mundosCompletados: 0, mundoActual: null, puntos: 0, insignias: 0, ultimaActividad: null });
      expect(p.habilidades.every((h) => h.valor === null)).toBe(true);
      expect(p.aReforzar).toEqual([]);
    });
  });

  describe('Preferencias (RF-070)', () => {
    it('recibe el resumen salvo que se dé de baja; lo cambia desde su panel', async () => {
      expect(await e.preferencias.consultar(CARMEN)).toEqual({ resumenSemanal: true });
      expect(await e.preferencias.cambiar(CARMEN, false)).toEqual({ resumenSemanal: false });
      expect(await e.preferencias.consultar(CARMEN)).toEqual({ resumenSemanal: false });
    });

    it('baja con un clic con el enlace firmado del correo, y deshacerla desde la misma página', async () => {
      const token = e.firma.token(CARMEN);
      expect(await e.preferencias.porEnlace(token, false)).toEqual({ resumenSemanal: false });
      expect(e.repo.prefs.get(CARMEN)).toBe(false);
      expect(await e.preferencias.porEnlace(token, true)).toEqual({ resumenSemanal: true });
    });

    it('un enlace alterado o incompleto no cambia nada (400)', async () => {
      const token = e.firma.token(CARMEN);
      for (const malo of [`${token.slice(0, -1)}x`, '', 'cualquier-cosa']) {
        const error = await e.preferencias.porEnlace(malo, false).catch((x: unknown) => x);
        expect(error).toBeInstanceOf(EnlaceBajaInvalidoError);
        expect((error as EnlaceBajaInvalidoError).tipo).toBe('VALIDACION');
      }
      expect(e.repo.prefs.size).toBe(0);
    });
  });

  describe('Resumen semanal (RF-070)', () => {
    beforeEach(() => {
      e.reloj.actual = DOMINGO_1830;
    });

    it('el domingo desde las 18:00, una vez por familia y semana, con cada hijo activo', async () => {
      e.repo.prefs.set(ELENA, false); // se dio de baja
      expect(await e.resumen.enviarPendientes()).toBe(1); // José: su único hijo está desactivado
      expect(await e.resumen.enviarPendientes()).toBe(0);
      expect(e.correo.enviados.map((c) => c.cuentaId)).toEqual([CARMEN]);

      const correo = e.correo.enviados[0]!;
      expect(correo.asunto).toBe('Resumen semanal: así leyeron Lucía y Mateo');
      expect(correo.texto).toContain('Hola. Así leyeron Lucía y Mateo en LectoAventura en la semana del 19 de octubre:');
      expect(correo.texto).toContain('Mateo\n• Esta semana: 25 min de lectura y 2 lecturas terminadas (la semana anterior: 1 min).');
      expect(correo.texto).toContain('• Va en el mundo 2 · Detective; lleva 3 lecturas terminadas y 120 puntos.');
      expect(correo.texto).toContain(`• Para acompañar en casa inferencias: ${CONSEJOS_FAMILIA.INF[0]!.texto}`);
      expect(correo.texto).toContain(`Lucía\n• Esta semana no leyó en LectoAventura. Una idea para la próxima: ${CONSEJOS_HABITO[0]}`);
      expect(correo.texto).toContain('• Aún no empieza su aventura: cuando haga su reto inicial verás aquí su avance.');
      expect(correo.enlace).toBe('https://lectoaventura.pe/familia');

      // Baja con un clic: el enlace del texto (página web) y el del programa de correo (RFC 8058).
      const token = decodeURIComponent(/resumen-familiar\/baja\?token=(\S+)/.exec(correo.texto)![1]!);
      expect(e.firma.cuentaDe(token)).toBe(CARMEN);
      expect(correo.bajaUrl).toBe(`https://lectoaventura.pe/api/v1/familia/preferencias-notificacion/baja?token=${encodeURIComponent(token)}`);
    });

    it('si el correo de una familia falla, las demás lo reciben y el suyo se reintenta en el próximo ciclo', async () => {
      e.correo.fallaPara.add(CARMEN);
      await expect(e.resumen.enviarPendientes()).rejects.toThrow('No salió el resumen semanal de 1 familia(s); se reintentará');
      expect(e.correo.enviados.map((c) => c.cuentaId)).toEqual([ELENA]);
      expect(e.repo.resumenes.has(`${CARMEN}:2026-10-19`)).toBe(false);
      e.correo.fallaPara.clear();
      expect(await e.resumen.enviarPendientes()).toBe(1);
      expect(e.correo.enviados.map((c) => c.cuentaId)).toEqual([ELENA, CARMEN]);
    });

    it('sin familias no hace nada; se puede correr como si fuera otro momento', async () => {
      e.repo.familias.clear();
      expect(await e.resumen.enviarPendientes()).toBe(0);
      e.repo.familias.set(ELENA, [BENJA]);
      expect(await e.resumen.enviarPendientes(new Date('2026-10-18T23:30:00Z'))).toBe(1); // domingo 18
      expect(e.repo.resumenes.has(`${ELENA}:2026-10-12`)).toBe(true);
    });
  });

  it('el párrafo de un hijo con puntos pero sin mapa todavía', async () => {
    e.repo.avances.set(LUCIA, { lecturasTerminadas: 1, mundosCompletados: 0, mundoActual: null, puntos: 1, insignias: 0 });
    const texto = parrafoHijo(await e.panel.panel(CARMEN, LUCIA));
    expect(texto).toContain('• Lleva 1 lectura terminada y 1 punto.');
  });
});
```

`apps/api/test/unit/reporting/dobles-familia.ts`:

```ts
/**
 * Dobles de prueba del acompañamiento familiar (Módulo 10): las vistas del schema `reporting` y las
 * preferencias en memoria, los hijos de la familia (IAM), su correo y las lecturas terminadas.
 */
import type { LecturaRealizada, ResolutorLecturasRealizadas } from '../../../src/modules/shared-kernel/public-api';
import type {
  AvanceEstudiante,
  HijoFamilia,
  HijosFamilia,
  NotificadorFamilia,
  ReportesFamiliaRepository,
} from '../../../src/modules/reporting/application/ports/familia.ports';
import { PanelHijoUseCase } from '../../../src/modules/reporting/application/use-cases/panel-hijo.use-case';
import { PreferenciasFamiliaUseCase } from '../../../src/modules/reporting/application/use-cases/preferencias-familia.use-case';
import { ResumenFamiliarUseCase } from '../../../src/modules/reporting/application/use-cases/resumen-familiar.use-case';
import { MaestriaMedida } from '../../../src/modules/reporting/domain/services/mapa-calor';
import { ActividadSemanal } from '../../../src/modules/reporting/domain/services/resumen-semanal';
import { HmacFirmaBaja } from '../../../src/modules/reporting/infrastructure/firma-baja';
import { Reloj } from '../iam/dobles';
import { FichasFalsas } from './dobles';

export class FamiliaEnMemoria implements ReportesFamiliaRepository {
  refresco: Date | null = new Date('2026-10-21T14:55:00Z');
  readonly medidas = new Map<string, MaestriaMedida[]>();
  readonly avances = new Map<string, AvanceEstudiante>();
  readonly actividad = new Map<string, Date>();
  readonly semanal: ActividadSemanal[] = [];
  /** cuenta → hijos activos (vista `v_hijos_familia`). */
  readonly familias = new Map<string, string[]>();
  readonly prefs = new Map<string, boolean>();
  readonly resumenes = new Set<string>();

  async refrescadoEn() {
    return this.refresco;
  }
  async ultimaActividad(ids: string[]) {
    return new Map([...this.actividad].filter(([id]) => ids.includes(id)));
  }
  async actividadSemanal(ids: string[], semanas: string[]) {
    return this.semanal.filter((a) => ids.includes(a.estudianteId) && semanas.includes(a.semana));
  }
  async maestriasPerfil(estudianteId: string) {
    return this.medidas.get(estudianteId) ?? [];
  }
  async avance(estudianteId: string) {
    return this.avances.get(estudianteId) ?? null;
  }
  async hijosPorFamilia() {
    return new Map(this.familias);
  }
  async preferencias(cuentaIds: string[]) {
    return new Map([...this.prefs].filter(([id]) => cuentaIds.includes(id)));
  }
  async guardarPreferencia(cuentaId: string, resumenSemanal: boolean) {
    this.prefs.set(cuentaId, resumenSemanal);
  }
  async registrarResumenFamiliar(cuentaId: string, semana: string) {
    const llave = `${cuentaId}:${semana}`;
    if (this.resumenes.has(llave)) return false;
    this.resumenes.add(llave);
    return true;
  }
  async liberarResumenFamiliar(cuentaId: string, semana: string) {
    this.resumenes.delete(`${cuentaId}:${semana}`);
  }

  /** Atajo: la maestría de un estudiante en las habilidades indicadas (6 preguntas cada una, o las dadas). */
  maestria(estudianteId: string, valores: Record<string, number>, items = 6) {
    this.medidas.set(estudianteId, Object.entries(valores).map(([habilidad, valor]) => ({ habilidad, valor, items })));
  }
}

export class HijosFalsos implements HijosFamilia {
  readonly porCuenta = new Map<string, HijoFamilia[]>();
  async hijosDe(cuentaId: string) {
    return this.porCuenta.get(cuentaId) ?? [];
  }
}

export class CorreoFamiliaFalso implements NotificadorFamilia {
  readonly enviados: { cuentaId: string; asunto: string; texto: string; enlace?: string; bajaUrl?: string }[] = [];
  /** Familias a las que el servidor de correo rechaza el envío. */
  readonly fallaPara = new Set<string>();
  async notificar(cuentaId: string, mensaje: { asunto: string; texto: string; enlace?: string; bajaUrl?: string }) {
    if (this.fallaPara.has(cuentaId)) throw new Error('SMTP no disponible');
    this.enviados.push({ cuentaId, ...mensaje });
    return true;
  }
}

export class RealizadasFalsas implements ResolutorLecturasRealizadas {
  readonly porEstudiante = new Map<string, LecturaRealizada[]>();
  async realizadasDe(estudianteId: string) {
    return this.porEstudiante.get(estudianteId) ?? [];
  }
}

export const SECRETO_PRUEBA = 'secreto-de-prueba-para-firmar-enlaces';

/** Ensambla los casos de uso de la familia con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoFamilia() {
  const reloj = new Reloj(new Date('2026-10-21T15:00:00Z')); // miércoles 21, 10:00 en Lima
  const repo = new FamiliaEnMemoria();
  const hijos = new HijosFalsos();
  const fichas = new FichasFalsas();
  const realizadas = new RealizadasFalsas();
  const correo = new CorreoFamiliaFalso();
  const firma = new HmacFirmaBaja(SECRETO_PRUEBA);
  const panel = new PanelHijoUseCase(repo, hijos, fichas, realizadas, reloj.ahora);
  return {
    reloj,
    repo,
    hijos,
    fichas,
    realizadas,
    correo,
    firma,
    panel,
    preferencias: new PreferenciasFamiliaUseCase(repo, firma),
    resumen: new ResumenFamiliarUseCase(repo, hijos, panel, correo, firma, 'https://lectoaventura.pe', reloj.ahora),
  };
}

export type EntornoFamilia = ReturnType<typeof crearEntornoFamilia>;
```

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

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../../src/modules/reporting/application/casos-uso-reporting';
import { fechaLocalLima, lunesDeLaSemana } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';
import { API, ayudantesReporting, bearer } from './ayudantes';

/**
 * Nivel 2 — Acompañamiento familiar (RF-068 a RF-070) contra PostgreSQL real: el panel de cada hijo lee
 * las vistas de reportes (su semana, su avance real tras el reto inicial y una lectura, sus habilidades y
 * los consejos para casa con una lectura sugerida); solo de los hijos vinculados (RN-17); el resumen del
 * domingo a las 18:00 sale una vez por familia con su enlace de baja con un clic (también el de RFC 8058).
 */
let t: AppDePrueba;
let casos: CasosUsoReporting;
const { backoffice, adulto, docente, publicarKilla, retoInicial, leerKilla, maestria, crearAula, sesionNino } = ayudantesReporting(() => t);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoReporting>(CASOS_USO_REPORTING);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

type Cuenta = { email: string; token: string; id: string };
let carmen: Cuenta;
let jose: Cuenta;
let rosa: Cuenta;
let mateo: string;
let lucia: string;
let pedro: string;
let killa: { lecturaId: string; o: string[] };

/** El domingo de esta semana de Lima a las 18:30 (y los siguientes). */
const domingo = (semanasDespues = 0) => {
  const lunes = lunesDeLaSemana(fechaLocalLima(new Date()));
  return new Date(Date.parse(`${lunes}T23:30:00Z`) + (6 + 7 * semanasDespues) * 86_400_000);
};
const panel = (estudianteId: string, token = carmen.token) => t.http().get(`${API}/familia/estudiantes/${estudianteId}/panel`).set(bearer(token));
const correosDe = async (email: string) =>
  ((await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; texto: string; enlace?: string; bajaUrl?: string }[]).filter(
    (c) => c.para === email && c.asunto.startsWith('Resumen semanal: así'),
  );

async function hijo(token: string, alias: string, anio: number) {
  return (await t.http().post(`${API}/estudiantes`).set(bearer(token)).send({ alias, anioNacimiento: anio, mesNacimiento: 3, avatar: 'koala', pin: '2580' }).expect(201)).body.id as string;
}

describe('Preparación', () => {
  it('Mateo lee de verdad en su aula; Carmen lo acompaña por invitación y tiene a Lucía; José tiene a Pedro', async () => {
    killa = await publicarKilla(await backoffice('EDITOR'), await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    const aula = await crearAula(rosa.token, '4.° A', ['Mateo']);
    mateo = aula.ids['Mateo'] as string;
    const tokenMateo = await sesionNino(rosa.token, aula.aulaId, mateo);
    await retoInicial(tokenMateo, ['LIT', 'VOC']);
    await leerKilla(tokenMateo, killa);

    carmen = await adulto('Carmen Díaz', 'FAMILIAR');
    jose = await adulto('José Ramos', 'FAMILIAR');
    for (const f of [carmen, jose]) {
      await t.http().post(`${API}/consentimientos`).set(bearer(f.token)).send({ otorganteNombre: 'Adulto responsable', aceptaPolitica: true }).expect(201);
    }
    const anio = new Date().getFullYear() - 9;
    lucia = await hijo(carmen.token, 'Lucía', anio);
    pedro = await hijo(jose.token, 'Pedro', anio);
    const { codigo } = (await t.http().post(`${API}/estudiantes/${mateo}/invitaciones-familiar`).set(bearer(rosa.token)).expect(201)).body;
    await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo }).expect(201);
    // Lo que Progreso habría medido a Lucía.
    await maestria(lucia, { LIT: 72, INF: 31, VOC: 48, CRI: 66, ARG: 55 });
    await casos.vistas.refrescar();
  });
});

describe('Panel por hijo (RF-068, RF-069)', () => {
  it('RF-068: el avance real de Mateo, su semana y sus habilidades, aunque lo gestione su docente', async () => {
    const p = (await panel(mateo).expect(200)).body;
    expect(p.estudiante).toMatchObject({ id: mateo, alias: 'Mateo', rangoEdad: 'R2', activo: true, relacion: 'VINCULADO' });
    expect(p.actualizadoEn).not.toBeNull();
    expect(p.semana.actual).toMatchObject({ semana: lunesDeLaSemana(fechaLocalLima(new Date())), lecturas: 1 });
    expect(p.semana.actual.respuestas).toBeGreaterThan(0);
    expect(p.semana.anterior).toMatchObject({ minutos: 0, lecturas: 0, respuestas: 0 });
    // Su reto inicial (bien en literal y vocabulario) lo ubicó en el mundo 2; Killa le dio puntos y "Primera lectura".
    expect(p.avance).toMatchObject({ lecturasTerminadas: 1, mundosCompletados: 1, mundoActual: { numero: 2, nombre: 'Detective' } });
    expect(p.avance.puntos).toBeGreaterThan(0);
    expect(p.avance.insignias).toBeGreaterThanOrEqual(1);
    expect(p.avance.ultimaActividad).not.toBeNull();
    expect(p.habilidades.map((h: { habilidad: string }) => h.habilidad)).toEqual(['LIT', 'INF', 'VOC', 'CRI', 'ARG']);
    expect(p.habito.length).toBeGreaterThanOrEqual(1);
  });

  it('RF-069: por cada habilidad a reforzar, consejos para casa y una lectura de su edad que aún no terminó', async () => {
    const p = (await panel(lucia).expect(200)).body;
    expect(p.estudiante.relacion).toBe('RESPONSABLE');
    expect(p.avance).toMatchObject({ lecturasTerminadas: 0, mundoActual: null, puntos: 0 });
    const reforzar = p.aReforzar as { habilidad: string; valor: number; consejos: string[]; lectura: { id: string; titulo: string } | null }[];
    expect(reforzar.map((r) => `${r.habilidad}:${r.valor}`)).toEqual(['INF:31', 'VOC:48', 'ARG:55']);
    for (const r of reforzar) expect(r.consejos).toHaveLength(2);
    expect(reforzar[0]!.lectura).toEqual({ id: killa.lecturaId, titulo: 'Killa y la llama' });
    expect(reforzar[1]!.lectura).toBeNull(); // ninguna lectura publicada trabaja vocabulario
    // Mateo ya terminó Killa: no se le sugiere de nuevo.
    await maestria(mateo, { INF: 30 });
    await casos.vistas.refrescar();
    expect((await panel(mateo).expect(200)).body.aReforzar[0]).toMatchObject({ habilidad: 'INF', lectura: null });
  });

  it('RN-17: solo los hijos vinculados a la cuenta; para cualquier otro, 404', async () => {
    await panel(lucia, jose.token).expect(404);
    await panel(mateo, jose.token).expect(404);
    await panel('no-es-un-id', jose.token).expect(404);
    await panel(pedro, jose.token).expect(200);
    // Solo familias (la docente tiene su propio panel) y con sesión.
    await panel(mateo, rosa.token).expect(403);
    await t.http().get(`${API}/familia/estudiantes/${mateo}/panel`).expect(401);
  });

  it('RNF-001: el panel responde en menos de 300 ms (y nunca más de 800 ms)', async () => {
    const tiempos: number[] = [];
    for (let i = 0; i < 11; i++) {
      const inicio = performance.now();
      await panel(mateo).expect(200);
      tiempos.push(performance.now() - inicio);
    }
    const ordenados = tiempos.slice(1).sort((a, b) => a - b);
    expect(ordenados[5]).toBeLessThan(300);
    expect(ordenados.at(-1)).toBeLessThan(800);
  });
});

describe('Preferencias y resumen semanal (RF-070)', () => {
  it('cada familia lo recibe salvo que se dé de baja; lo cambia desde su panel', async () => {
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).expect(200)).body).toEqual({ resumenSemanal: true });
    await t.http().patch(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).send({ resumenSemanal: 'no' }).expect(400);
    await t.http().patch(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).send({ resumenSemanal: false }).expect(200);
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).expect(200)).body).toEqual({ resumenSemanal: false });
    await t.http().patch(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).send({ resumenSemanal: true }).expect(200);
  });

  it('el domingo a las 18:00 de Lima sale una vez por familia con cada hijo, su semana y un consejo', async () => {
    expect(await casos.resumenFamiliar.enviarPendientes(new Date(domingo().getTime() - 60 * 60_000))).toBe(2); // 17:30: la semana anterior
    expect(await casos.resumenFamiliar.enviarPendientes(domingo())).toBe(2);
    expect(await casos.resumenFamiliar.enviarPendientes(domingo())).toBe(0);
    const [ultimo] = await correosDe(carmen.email);
    expect(ultimo!.asunto).toBe('Resumen semanal: así leyeron Lucía y Mateo');
    expect(ultimo!.texto).toContain('Mateo\n• Esta semana:');
    expect(ultimo!.texto).toContain('1 lectura terminada');
    expect(ultimo!.texto).toContain('• Va en el mundo 2 · Detective; lleva 1 lectura terminada');
    expect(ultimo!.texto).toContain('Lucía\n• Esta semana no leyó en LectoAventura.');
    expect(ultimo!.texto).toContain('• Para acompañar en casa inferencias: ');
    expect(ultimo!.enlace).toBe('http://localhost:3002/familia');
    expect(ultimo!.bajaUrl).toMatch(/^http:\/\/localhost:3002\/api\/v1\/familia\/preferencias-notificacion\/baja\?token=/);
    expect(await t.prisma.resumenFamiliarEnviado.count()).toBe(4);
  });

  it('baja con un clic desde el enlace del correo, sin sesión; deshacerla; enlaces alterados no sirven', async () => {
    const [ultimo] = await correosDe(carmen.email);
    const token = decodeURIComponent(/resumen-familiar\/baja\?token=(\S+)/.exec(ultimo!.texto)![1]!);
    expect((await t.http().post(`${API}/familia/preferencias-notificacion/baja`).send({ token }).expect(200)).body).toEqual({ resumenSemanal: false });
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(carmen.token)).expect(200)).body).toEqual({ resumenSemanal: false });
    expect((await t.http().post(`${API}/familia/preferencias-notificacion/alta`).send({ token }).expect(200)).body).toEqual({ resumenSemanal: true });
    // RFC 8058: el programa de correo hace un POST al enlace con "List-Unsubscribe=One-Click".
    const ruta = new URL(ultimo!.bajaUrl!).pathname.replace(API, '') + new URL(ultimo!.bajaUrl!).search;
    await t.http().post(`${API}${ruta}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(carmen.token)).expect(200)).body).toEqual({ resumenSemanal: false });
    for (const malo of [`${token.slice(0, -2)}xx`, '', 'cualquier-cosa']) {
      await t.http().post(`${API}/familia/preferencias-notificacion/baja`).send({ token: malo }).expect(400);
    }
    await t.http().post(`${API}/familia/preferencias-notificacion/baja`).send({ token, extra: 1 }).expect(400);
  });

  it('dada de baja, el domingo siguiente no le llega; a José, sí', async () => {
    expect(await casos.resumenFamiliar.enviarPendientes(domingo(1))).toBe(1);
    expect(await correosDe(carmen.email)).toHaveLength(2);
    expect(await correosDe(jose.email)).toHaveLength(3);
  });

  it('solo desarrollo: los trabajos de reportes se pueden correr como si fuera otro momento; en producción no existe', async () => {
    const r = (await t.http().post(`${API}/dev/reportes/ejecutar`).send({ ahora: domingo(2).toISOString() }).expect(200)).body;
    expect(r).toEqual({ docentes: expect.any(Number), familias: 1 });
    await t.http().post(`${API}/dev/reportes/ejecutar`).send({ ahora: 'ayer' }).expect(400);
    const entorno = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      await t.http().post(`${API}/dev/reportes/ejecutar`).send({}).expect(404);
    } finally {
      process.env['NODE_ENV'] = entorno;
    }
  });
});
```

`apps/api/test/integration/reporting/ayudantes.ts`:

```ts
import { authenticator } from 'otplib';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba } from '../setup/app';

/**
 * Ayudantes de las pruebas de integración de Reporting (Módulos 9 y 10): cuentas, la lectura de ejemplo
 * publicada por el flujo real, el reto inicial y una lectura real de un niño, y la maestría que
 * calcularía Progreso.
 */
export const API = '/api/v1';
export const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';
export const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const pista = (nivel: string, texto: string) => ({ nivel, texto });

export function ayudantesReporting(app: () => AppDePrueba) {
  const t = () => app();

  async function backoffice(rol: 'EDITOR' | 'REVISOR') {
    const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
    const secreto = authenticator.generateSecret();
    const cuenta = await t().prisma.cuenta.create({ data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' } });
    await t().prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
    return (await t().http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, codigoMfa: authenticator.generate(secreto) }).expect(200)).body.accessToken as string;
  }

  /** Una cuenta adulta registrada y verificada por el flujo real (RF-001, RF-002). */
  async function adulto(nombre: string, rol: 'DOCENTE' | 'FAMILIAR') {
    const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
    await t().http().post(`${API}/auth/registro`).send({ nombre, email, contrasena: CONTRASENA, rol }).expect(201);
    const enlace = ((await t().http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
    await t().http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
    const token = (await t().http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
    return { email, token, id: (await t().prisma.cuenta.findUniqueOrThrow({ where: { email } })).id };
  }

  const docente = (nombre: string) => adulto(nombre, 'DOCENTE');

  /** "Killa y la llama" publicada por el flujo real: inferencia con pistas, evidencia y una abierta. */
  async function publicarKilla(editora: string, revisora: string) {
    const { lecturaId, oraciones } = (
      await t().http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
        metadatos: { titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' },
        texto: TEXTO,
      }).expect(201)
    ).body as { lecturaId: string; oraciones: { id: string }[] };
    const o = oraciones.map((x) => x.id);
    const actividades = [
      {
        momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
        items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.')] }],
      },
      {
        momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
        items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
      },
      { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', explicacionModelada: 'Sí: así encontró la espina.' }] },
    ];
    await t().http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
    await t().http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
    await t().http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
    return { lecturaId, o };
  }

  /** El reto inicial por la API, acertando solo en las habilidades indicadas (Módulo 5). */
  async function retoInicial(token: string, acertar: string[]) {
    const { id } = (await t().http().post(`${API}/diagnosticos`).set(bearer(token)).expect(201)).body;
    for (;;) {
      const { item } = (await t().http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(token)).expect(200)).body;
      if (!item) break;
      const fila = await t().prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: item.itemId } });
      const correcta = (fila.respuestaCorrecta as { indice: number }).indice;
      const indice = acertar.includes(fila.habilidad) ? correcta : (correcta + 1) % (fila.contenido as { opciones: string[] }).opciones.length;
      await t().http().post(`${API}/diagnosticos/${id}/respuestas`).set(bearer(token)).send({ itemId: item.itemId, indice }).expect(200);
    }
    await t().http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(token)).expect(200);
  }

  /** Lee Killa por la API: se equivoca una vez en la inferencia (ve la pista P1), toca la evidencia y escribe. */
  async function leerKilla(token: string, killa: { lecturaId: string; o: string[] }) {
    const id = (await t().http().post(`${API}/sesiones-lectura`).set(bearer(token)).send({ lecturaId: killa.lecturaId }).expect(201)).body.id as string;
    await t().http().put(`${API}/sesiones-lectura/${id}/prediccion`).set(bearer(token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200);
    let primera = true;
    for (let paso = 0; paso < 10; paso++) {
      const p = (await t().http().get(`${API}/sesiones-lectura/${id}`).set(bearer(token)).expect(200)).body.pregunta as { itemId: string; enunciado: string; opciones: string[] } | null;
      if (!p) break;
      let cuerpo: Record<string, unknown>;
      if (p.enunciado.startsWith('¿Por qué')) {
        cuerpo = { indice: p.opciones.indexOf(primera ? 'Estaba feliz' : 'Le dolía algo') };
        primera = false;
      } else if (p.enunciado.startsWith('Toca')) cuerpo = { oraciones: [killa.o[3]] };
      else cuerpo = { texto: 'Sí, porque así encontró la espina y lo curó' };
      await t().http().post(`${API}/sesiones-lectura/${id}/respuestas`).set(bearer(token)).send({ itemId: p.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
    }
    await t().http().post(`${API}/sesiones-lectura/${id}/finalizar`).set(bearer(token)).send({ reflexion: 'Era una espina' }).expect(200);
    return id;
  }

  /** Maestría de un estudiante en las 5 habilidades (lo que calcularía Progreso con sus lecturas). */
  async function maestria(estudianteId: string, valores: Partial<Record<(typeof HABILIDADES)[number], number>>, items = 6) {
    for (const habilidad of HABILIDADES) {
      const valor = valores[habilidad] ?? 70;
      await t().prisma.maestriaHabilidad.upsert({
        where: { estudianteId_habilidad: { estudianteId, habilidad } },
        create: { estudianteId, habilidad, valor, itemsContados: items, actualizadoEn: new Date() },
        update: { valor, itemsContados: items },
      });
    }
  }

  async function crearAula(token: string, nombre: string, ninos: string[]) {
    const aulaId = (await t().http().post(`${API}/aulas`).set(bearer(token)).send({
      nombre, grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id as string;
    const anio = new Date().getFullYear() - 9;
    const csv = ninos.map((alias) => `${alias},${anio},1,zorro`).join('\n');
    const { matriculados } = (await t().http().post(`${API}/aulas/${aulaId}/matriculas/importacion`).set(bearer(token)).send({ csv }).expect(201)).body as { matriculados: { estudianteId: string; alias: string }[] };
    return { aulaId, ids: Object.fromEntries(matriculados.map((m) => [m.alias, m.estudianteId])) as Record<string, string> };
  }

  /** El niño entra en la tablet del aula con su PIN (CR-01) y obtiene su sesión. */
  async function sesionNino(tokenDocente: string, aulaId: string, estudianteId: string) {
    const tablet = (await t().http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    await t().http().post(`${API}/estudiantes/${estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
    return (await t().http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: estudianteId, pin: '4826' }).expect(200)).body.accessToken as string;
  }

  return { backoffice, adulto, docente, publicarKilla, retoInicial, leerKilla, maestria, crearAula, sesionNino };
}
```

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

```ts
import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { docenteConAula } from '../../support/escuela';
import {
  acompanarDesdeElAula,
  domingoALas1830,
  ejecutarReportes,
  enlaceDeBaja,
  familiaConConsentimiento,
  hijoDeFamilia,
  resumenesDe,
} from '../../support/familia';
import { ingresarComoAdulto, ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';
import { refrescarVistas, sembrarMaestria } from '../../support/seguimiento';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

async function sinDesbordes(page: Page) {
  const desborde = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.documentElement.scrollWidth - window.innerWidth));
  expect(desborde, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(0);
}

/**
 * Nivel 3 — Acompañamiento familiar de punta a punta (RF-068 a RF-071) en escritorio, tablet y celular:
 * la familia abre el avance de su hijo (su semana, su mundo, sus habilidades y cómo acompañarlo en casa),
 * decide si recibe el resumen semanal y se da de baja con un clic desde el correo; y gestiona los perfiles
 * de sus hijos (avatar, PIN, desactivar, hasta 6).
 */
test.describe('Acompañamiento familiar (RF-068 a RF-071)', () => {
  test.setTimeout(150_000);

  test('RF-068, RF-069: el avance de su hijo y cómo acompañarlo en casa', async ({ page, request }) => {
    // Mateo lee de verdad en su aula; la familia lo acompaña por invitación de su docente.
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
    await sembrarMaestria(aula.estudiantes['Mateo'] as string, { INF: 30, LIT: 80, VOC: 80 });
    const familia = await familiaConConsentimiento(request, 'familia-avance');
    await acompanarDesdeElAula(request, aula, 'Mateo', familia);
    await refrescarVistas();

    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await page.getByRole('link', { name: 'Ver el avance de Mateo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
    await expect(page.getByText('Desde su aula')).toBeVisible();

    // RF-068: cuánto leyó esta semana, su avance y sus habilidades.
    const semana = page.getByRole('list', { name: 'Esta semana' });
    await expect(semana.getByRole('listitem').filter({ hasText: 'lectura terminada' }).locator('.seg-cifra')).toHaveText('1');
    const mundo = page.getByRole('list', { name: 'Su avance' }).getByRole('listitem').first();
    await expect(mundo.locator('.seg-cifra')).toHaveText('Mundo 2');
    await expect(mundo).toContainText('Detective');
    await expect(page.getByRole('list', { name: 'Habilidades', exact: true }).getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('progressbar', { name: 'Inferencias: En inicio (30)' })).toBeVisible();

    // RF-069: inferencias para reforzar, con ideas prácticas para casa y una lectura que aún no leyó.
    const reforzar = page.getByRole('list', { name: 'Habilidades para reforzar' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Inferencias' }) });
    await expect(reforzar.getByRole('list', { name: 'Ideas para inferencias' }).getByRole('listitem')).toHaveCount(2);
    await expect(reforzar.getByText(/^Lectura sugerida: «.+»/)).toBeVisible();
    await expect(reforzar).not.toContainText(`«${killa.titulo}»`);
    await expect(page.getByRole('list', { name: 'Ideas para el hábito' }).getByRole('listitem')).toHaveCount(3);
    await sinDesbordes(page);

    // Vuelve a "Mis hijos".
    await page.getByRole('link', { name: 'Mis hijos' }).first().click();
    await expect(page.getByRole('heading', { name: 'Desde su aula (1)' })).toBeVisible();
  });

  test('RF-070: decide si recibe el resumen del domingo y se da de baja con un clic desde el correo', async ({ page, request, browser, baseURL }) => {
    const familia = await familiaConConsentimiento(request, 'familia-resumen');
    await hijoDeFamilia(request, familia, 'Lucía');
    await ingresarComoAdulto(page, familia.email, familia.contrasena);

    // Desde su panel: desactivar y volver a activar.
    const casilla = page.getByRole('checkbox', { name: 'Recibir el resumen semanal' });
    await expect(casilla).toBeChecked();
    await casilla.uncheck();
    await expect(page.getByText('Listo: ya no recibirás el resumen semanal.')).toBeVisible();
    await page.reload();
    await expect(casilla).not.toBeChecked();
    await casilla.check();
    await expect(page.getByText('Listo: recibirás el resumen cada domingo.')).toBeVisible();

    // El domingo a las 18:00 le llega, con el enlace de baja.
    await ejecutarReportes(request, domingoALas1830());
    const [correo] = await resumenesDe(request, familia.email);
    expect(correo!.asunto).toBe('Resumen semanal: así leyó Lucía');
    expect(correo!.texto).toContain('Lucía\n• Esta semana no leyó en LectoAventura.');

    // Un clic en el enlace basta, sin iniciar sesión; y se puede deshacer.
    const otra = await browser.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });
    const pagina = await otra.newPage();
    await pagina.goto(enlaceDeBaja(correo!.texto));
    await expect(pagina.getByRole('heading', { level: 1, name: 'Ya no recibirás el resumen semanal' })).toBeVisible();
    await sinDesbordes(pagina);
    await pagina.getByRole('button', { name: 'Me equivoqué: quiero seguir recibiéndolo' }).click();
    await expect(pagina.getByRole('heading', { level: 1, name: 'Volverás a recibir el resumen semanal' })).toBeVisible();
    await pagina.goto(enlaceDeBaja(correo!.texto));
    await expect(pagina.getByRole('heading', { level: 1, name: 'Ya no recibirás el resumen semanal' })).toBeVisible();
    await otra.close();

    // Dada de baja, el domingo siguiente no le llega; y su panel lo muestra.
    await ejecutarReportes(request, domingoALas1830(1));
    expect(await resumenesDe(request, familia.email)).toHaveLength(1);
    await page.reload();
    await expect(casilla).not.toBeChecked();
  });

  test('RF-071: gestiona los perfiles de sus hijos — avatar, PIN, desactivar — hasta 6', async ({ page, request }) => {
    const familia = await familiaConConsentimiento(request, 'familia-perfiles');
    for (const alias of ['Lucía', 'Ana', 'Teo', 'Luis', 'Sara']) await hijoDeFamilia(request, familia, alias);
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page.getByRole('heading', { name: 'Mis hijos (5/6)' })).toBeVisible();

    const lucia = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Lucía' }) });
    await lucia.getByRole('button', { name: 'Editar' }).click();
    await lucia.getByRole('button', { name: 'Tigre', exact: true }).click();
    await lucia.getByRole('button', { name: 'Guardar' }).click();
    await expect(lucia.getByText('Perfil actualizado.')).toBeVisible();

    await lucia.getByRole('button', { name: 'Cambiar PIN' }).click();
    await lucia.getByLabel('Nuevo PIN de 4 números').fill('7391');
    await lucia.getByRole('button', { name: 'Guardar PIN' }).click();
    await expect(lucia.getByText(/^PIN restablecido/)).toBeVisible();

    await lucia.getByRole('button', { name: 'Desactivar' }).click();
    await expect(lucia.getByText('Desactivado', { exact: true })).toBeVisible();
    await expect(lucia.getByRole('button', { name: 'Activar' })).toBeVisible();

    // El sexto perfil llena la cuenta: ya no se puede agregar otro.
    await page.getByRole('button', { name: '+ Agregar perfil' }).click();
    await page.getByLabel('Alias o apodo').fill('Pía');
    await page.getByLabel('PIN de 4 números').fill('5274');
    await page.getByLabel('Repite el PIN').fill('5274');
    await page.getByRole('button', { name: 'Crear perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Mis hijos (6/6)' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Agregar perfil' })).toHaveCount(0);
    const septimo = await request.post('/api/v1/estudiantes', {
      headers: familia.headers,
      data: { alias: 'Uno más', anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 3, avatar: 'zorro', pin: '5274' },
    });
    expect(septimo.status()).toBe(409);
    await sinDesbordes(page);
  });
});
```

`tests/e2e/support/familia.ts`:

```ts
import { APIRequestContext, expect } from '@playwright/test';

import { AulaPreparada, sesionApi } from './escuela';
import { cuentaVerificada } from './iam';

/**
 * Ayudantes del Módulo 10 (acompañamiento familiar): familias preparadas por la API, hijos propios o
 * acompañados por invitación de su docente, y el resumen del domingo sin esperar al domingo.
 */
export interface FamiliaPreparada {
  email: string;
  contrasena: string;
  headers: Record<string, string>;
}

/** Una familia verificada que ya dio su consentimiento (RF-005). */
export async function familiaConConsentimiento(request: APIRequestContext, prefijo = 'familia'): Promise<FamiliaPreparada> {
  const cuenta = await cuentaVerificada(request, { prefijo, nombre: 'Carmen Prueba' });
  const headers = await sesionApi(request, cuenta);
  const r = await request.post('/api/v1/consentimientos', { headers, data: { otorganteNombre: 'Carmen Prueba', aceptaPolitica: true } });
  expect(r.status(), await r.text()).toBe(201);
  return { ...cuenta, headers };
}

/** Un hijo propio de la familia (RF-071), de 9 años. */
export async function hijoDeFamilia(request: APIRequestContext, familia: FamiliaPreparada, alias: string, avatar = 'koala'): Promise<string> {
  const r = await request.post('/api/v1/estudiantes', {
    headers: familia.headers,
    data: { alias, anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 3, avatar, pin: '2580' },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).id;
}

/** RF-019: la docente invita a la familia y esta canjea el código; desde entonces lo acompaña. */
export async function acompanarDesdeElAula(request: APIRequestContext, aula: AulaPreparada, alias: string, familia: FamiliaPreparada): Promise<void> {
  const docente = await sesionApi(request, aula.docente);
  const invitacion = await request.post(`/api/v1/estudiantes/${aula.estudiantes[alias]}/invitaciones-familiar`, { headers: docente });
  expect(invitacion.status(), await invitacion.text()).toBe(201);
  const vinculo = await request.post('/api/v1/familia/vincular', { headers: familia.headers, data: { codigo: (await invitacion.json()).codigo } });
  expect(vinculo.status(), await vinculo.text()).toBe(201);
}

/** El próximo domingo a las 18:30 de Lima (`semanas` después). */
export function domingoALas1830(semanas = 0): string {
  const lima = new Date(Date.now() - 5 * 3_600_000);
  const dias = (7 - lima.getUTCDay()) % 7 + 7 * semanas;
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + dias, 23, 30)).toISOString();
}

/** Lo que hace el worker de reportes, como si fuera `ahora` (solo desarrollo y CI: sin SMTP real). */
export async function ejecutarReportes(request: APIRequestContext, ahora: string): Promise<{ docentes: number; familias: number }> {
  const r = await request.post('/api/v1/dev/reportes/ejecutar', { data: { ahora } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

/** Los resúmenes semanales que recibió la familia (bandeja de correos de desarrollo), del más reciente al más antiguo. */
export async function resumenesDe(request: APIRequestContext, email: string): Promise<{ asunto: string; texto: string; bajaUrl?: string }[]> {
  const correos = (await (await request.get('/api/v1/dev/correos')).json()) as { para: string; asunto: string; texto: string; bajaUrl?: string }[];
  return correos.filter((c) => c.para === email && c.asunto.startsWith('Resumen semanal: así'));
}

/** La ruta de la página de baja con un clic que trae el correo (sin el dominio). */
export function enlaceDeBaja(texto: string): string {
  const url = /(\S+\/resumen-familiar\/baja\?token=\S+)/.exec(texto)?.[1];
  expect(url, 'el correo trae el enlace de baja').toBeTruthy();
  const u = new URL(url as string);
  return `${u.pathname}${u.search}`;
}
```

`tests/load/sembrar-familia.mjs`:

```js
// Una familia con 6 hijos (el máximo de RF-071), cada uno con su maestría en las 5 habilidades (la que
// Progreso mediría al leer), para el escenario k6 del acompañamiento familiar (scenarios/familia-panel.js,
// RF-068, RF-069, RNF-001). SOLO para desarrollo y CI (ver sembrado.mjs). La familia usa la contraseña
// fija de las cuentas de carga (dominio e2e.lectoaventura.test, que la limpieza de las pruebas E2E borra).
// Imprime solo el correo de la familia.
//
// Uso (con la API en marcha):  node tests/load/sembrar-familia.mjs
import { conPrisma, exigirEntornoLocal, llamar, salir } from './sembrado.mjs';

const CONTRASENA = 'Carga-Lectora-2026-k6';
const HIJOS = ['Lucía', 'Mateo', 'Ana', 'Teo', 'Sara', 'Luis'];
const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'];

exigirEntornoLocal();
const email = `carga.familia.${Date.now().toString(36)}@e2e.lectoaventura.test`;
await llamar('POST', '/auth/registro', { nombre: 'Familia Carga', email, contrasena: CONTRASENA, rol: 'FAMILIAR' });
const correo = (await llamar('GET', '/dev/correos')).find((c) => c.para === email);
if (!correo) salir('No llegó el correo de verificación (¿la API corre con la bandeja de desarrollo?).');
await llamar('POST', '/auth/verificar-correo', { codigo: correo.enlace.split('codigo=')[1] });
const { accessToken } = await llamar('POST', '/auth/login', { email, contrasena: CONTRASENA });
const familia = { Authorization: `Bearer ${accessToken}` };

await llamar('POST', '/consentimientos', { otorganteNombre: 'Familia Carga', aceptaPolitica: true }, familia);
const ids = [];
for (const [i, alias] of HIJOS.entries()) {
  const { id } = await llamar('POST', '/estudiantes', { alias, anioNacimiento: 2015 + (i % 3), mesNacimiento: 3, avatar: 'koala', pin: '2580' }, familia);
  ids.push(id);
}

// Maestría variada: cada hijo tiene habilidades por reforzar (consejos y lecturas sugeridas).
await conPrisma(async (prisma) => {
  await prisma.maestriaHabilidad.createMany({
    data: ids.flatMap((estudianteId, i) =>
      HABILIDADES.map((habilidad, j) => ({ estudianteId, habilidad, valor: (i * 11 + j * 17) % 100, itemsContados: 6, actualizadoEn: new Date() })),
    ),
  });
  // Lo que hace el worker de reportes cada 5 minutos.
  await prisma.$executeRawUnsafe('SELECT "reporting"."refrescar_vistas"()');
});
console.log(email);
```

`tests/load/scenarios/familia-panel.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del acompañamiento familiar (k6), con una familia de 6 hijos:
 *   RF-068, RF-069 / RNF-001: panel de un hijo (su semana, su avance, sus habilidades y los consejos con
 *   lectura sugerida) → p95 < 300 ms y p99 < 800 ms.
 *   RF-070: su preferencia del resumen semanal → p95 < 300 ms.
 *
 * Requisitos: API en marcha y la familia sembrada (sembrar-familia.mjs imprime su correo).
 * Ejecutar:   k6 run -e EMAIL=$(node tests/load/sembrar-familia.mjs) tests/load/scenarios/familia-panel.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const HIJOS = 6;

export const options = {
  scenarios: {
    panel_familia: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'acompanar',
      tags: { escenario: 'panel_familia' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /familia/estudiantes/{id}/panel}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /familia/preferencias-notificacion}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** La familia sembrada inicia sesión una vez; los ids de sus hijos salen de su lista. */
export function setup() {
  if (!__ENV.EMAIL) fail('Falta EMAIL: siembra la familia con node tests/load/sembrar-familia.mjs');
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email: __ENV.EMAIL, contrasena: CONTRASENA }), {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipDispositivo() },
  });
  if (sesion.status !== 200) fail(`La familia de carga no pudo ingresar: ${sesion.status}`);
  const familia = { Authorization: `Bearer ${sesion.json('accessToken')}` };
  const hijos = http.get(`${BASE}/familia/estudiantes`, { headers: familia });
  if (hijos.status !== 200 || hijos.json().length !== HIJOS) fail(`La familia sembrada no tiene ${HIJOS} hijos`);
  return { familia, hijos: hijos.json().map((h) => h.id) };
}

/** La familia abre el avance de uno de sus hijos y revisa su preferencia del resumen. */
export function acompanar(datos) {
  const id = datos.hijos[Math.floor(Math.random() * datos.hijos.length)];
  const panel = http.get(`${BASE}/familia/estudiantes/${id}/panel`, { headers: datos.familia, tags: { nombre: 'GET /familia/estudiantes/{id}/panel' } });
  check(panel, {
    'panel con 5 habilidades': (r) => r.status === 200 && r.json('habilidades').length === 5,
    'consejos para las habilidades a reforzar': (r) => r.status === 200 && r.json('aReforzar').every((a) => a.consejos.length >= 1),
  });
  const prefs = http.get(`${BASE}/familia/preferencias-notificacion`, { headers: datos.familia, tags: { nombre: 'GET /familia/preferencias-notificacion' } });
  check(prefs, { 'preferencia del resumen': (r) => r.status === 200 && typeof r.json('resumenSemanal') === 'boolean' });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@familia
Característica: Acompañamiento familiar
  Como madre, padre o adulto responsable
  Quiero ver cómo lee mi hijo o hija y saber cómo ayudarle en casa
  Para acompañar su aventura lectora sin tener que ser especialista

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-068 @RF-069 @camino-feliz @smoke
  Escenario: La familia ve el avance de su hijo y cómo acompañarle en casa
    Dado una familia que acompaña a Mateo, que esta semana terminó una lectura y tiene inferencias por reforzar
    Cuando abre el avance de Mateo
    Entonces ve cuánto leyó esta semana y en qué mundo va
    Y ve inferencias como habilidad a reforzar con al menos una idea práctica para casa

  @RN-17 @negativo
  Escenario: Una familia no ve el avance de un niño que no es suyo
    Dado dos familias, cada una con su hija
    Cuando una intenta abrir el avance de la hija de la otra
    Entonces ve "No encontramos a este niño o niña entre tus hijos." y ningún dato de ella

  @RF-070
  Escenario: Recibe el resumen el domingo y se da de baja con un clic
    Dado una familia con su hija Lucía
    Cuando llega el domingo a las 18:00
    Entonces recibe por correo el resumen semanal de Lucía con un enlace para darse de baja
    Y con un clic en ese enlace, sin iniciar sesión, deja de recibirlo
    Y el domingo siguiente ya no le llega

  @RF-070
  Escenario: Decide desde su panel si recibe el resumen
    Dado una familia con su hija Lucía
    Cuando desactiva "Recibir el resumen semanal" en su panel
    Entonces el domingo no le llega el resumen
    Y al activarlo de nuevo, el domingo siguiente sí le llega

  @RF-071
  Escenario: Gestiona los perfiles de sus hijos, hasta 6
    Dado una familia con 5 perfiles de hijos
    Cuando cambia el avatar de Lucía, le restablece el PIN y la desactiva
    Entonces Lucía aparece con su nuevo avatar y desactivada
    Y al crear el sexto perfil ya no puede agregar otro
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect, Page } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { docenteConAula } from '../support/escuela';
import {
  acompanarDesdeElAula,
  domingoALas1830,
  ejecutarReportes,
  enlaceDeBaja,
  familiaConConsentimiento,
  hijoDeFamilia,
  resumenesDe,
} from '../support/familia';
import { ingresarComoAdulto, ipSimulada } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { refrescarVistas, sembrarMaestria } from '../support/seguimiento';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del acompañamiento familiar (RF-068 a RF-071, RN-17). */

const familia = (mundo: Mundo) => mundo.familia!;
const casillaResumen = (page: Page) => page.getByRole('checkbox', { name: 'Recibir el resumen semanal' });
const tarjetaDe = (page: Page, alias: string) => page.locator('article').filter({ has: page.getByRole('heading', { name: alias }) });

async function entrar(page: Page, mundo: Mundo) {
  await ingresarComoAdulto(page, familia(mundo).email, familia(mundo).contrasena);
  await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible();
}

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('una familia que acompaña a Mateo, que esta semana terminó una lectura y tiene inferencias por reforzar', async ({ request, mundo }) => {
  const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
  await sembrarMaestria(aula.estudiantes['Mateo'] as string, { INF: 30, LIT: 80, VOC: 80 });
  const f = await familiaConConsentimiento(request, 'uat-familia');
  await acompanarDesdeElAula(request, aula, 'Mateo', f);
  mundo.familia = { ...f, hijos: { Mateo: aula.estudiantes['Mateo'] as string } };
  await refrescarVistas();
});

Dado('dos familias, cada una con su hija', async ({ request, mundo }) => {
  const f = await familiaConConsentimiento(request, 'uat-familia-a');
  const otra = await familiaConConsentimiento(request, 'uat-familia-b');
  mundo.familia = { ...f, hijos: { Lucía: await hijoDeFamilia(request, f, 'Lucía'), Ajena: await hijoDeFamilia(request, otra, 'Valentina') } };
});

Dado('una familia con su hija Lucía', async ({ request, mundo }) => {
  const f = await familiaConConsentimiento(request, 'uat-familia');
  mundo.familia = { ...f, hijos: { Lucía: await hijoDeFamilia(request, f, 'Lucía') } };
});

Dado('una familia con {int} perfiles de hijos', async ({ request, mundo }, n: number) => {
  const f = await familiaConConsentimiento(request, 'uat-familia');
  const hijos: Record<string, string> = {};
  for (const alias of ['Lucía', 'Ana', 'Teo', 'Luis', 'Sara'].slice(0, n)) hijos[alias] = await hijoDeFamilia(request, f, alias);
  mundo.familia = { ...f, hijos };
});

// ── Acciones ─────────────────────────────────────────────────────────────────

Cuando('abre el avance de Mateo', async ({ page, mundo }) => {
  await entrar(page, mundo);
  await page.getByRole('link', { name: 'Ver el avance de Mateo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
});

Cuando('una intenta abrir el avance de la hija de la otra', async ({ page, mundo }) => {
  await entrar(page, mundo);
  await page.goto(`/familia/hijos/${familia(mundo).hijos['Ajena']}`);
});

Cuando('llega el domingo a las 18:00', async ({ request }) => {
  await ejecutarReportes(request, domingoALas1830());
});

Cuando('desactiva {string} en su panel', async ({ page, mundo }, casilla: string) => {
  await entrar(page, mundo);
  await page.getByRole('checkbox', { name: casilla }).uncheck();
  await expect(page.getByText('Listo: ya no recibirás el resumen semanal.')).toBeVisible();
});

Cuando('cambia el avatar de Lucía, le restablece el PIN y la desactiva', async ({ page, mundo }) => {
  await entrar(page, mundo);
  const lucia = tarjetaDe(page, 'Lucía');
  await lucia.getByRole('button', { name: 'Editar' }).click();
  await lucia.getByRole('button', { name: 'Tigre', exact: true }).click();
  await lucia.getByRole('button', { name: 'Guardar' }).click();
  await expect(lucia.getByText('Perfil actualizado.')).toBeVisible();
  await lucia.getByRole('button', { name: 'Cambiar PIN' }).click();
  await lucia.getByLabel('Nuevo PIN de 4 números').fill('7391');
  await lucia.getByRole('button', { name: 'Guardar PIN' }).click();
  await expect(lucia.getByText(/^PIN restablecido/)).toBeVisible();
  await lucia.getByRole('button', { name: 'Desactivar' }).click();
  await expect(lucia.getByText('Perfil desactivado.')).toBeVisible();
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('ve cuánto leyó esta semana y en qué mundo va', async ({ page }) => {
  const semana = page.getByRole('list', { name: 'Esta semana' });
  await expect(semana.getByRole('listitem').first()).toContainText('de lectura');
  await expect(semana.getByRole('listitem').filter({ hasText: 'lectura terminada' }).locator('.seg-cifra')).toHaveText('1');
  const mundo = page.getByRole('list', { name: 'Su avance' }).getByRole('listitem').first();
  await expect(mundo.locator('.seg-cifra')).toHaveText('Mundo 2');
  await expect(mundo).toContainText('Detective');
});

Entonces('ve inferencias como habilidad a reforzar con al menos una idea práctica para casa', async ({ page }) => {
  const inferencias = page.getByRole('list', { name: 'Habilidades para reforzar' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Inferencias' }) });
  await expect(inferencias).toContainText('Descubrir lo que no se dice');
  const ideas = inferencias.getByRole('list', { name: 'Ideas para inferencias' }).getByRole('listitem');
  expect(await ideas.count()).toBeGreaterThanOrEqual(1);
  // Para no especialistas: sin siglas ni términos técnicos.
  for (const idea of await ideas.allInnerTexts()) expect(idea).not.toMatch(/\b(INF|CNEB)\b|maestría/i);
});

Entonces('ve {string} y ningún dato de ella', async ({ page }, mensaje: string) => {
  await expect(page.getByText(mensaje)).toBeVisible();
  await expect(page.getByText('Valentina')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Habilidades', exact: true })).toHaveCount(0);
});

Entonces('recibe por correo el resumen semanal de Lucía con un enlace para darse de baja', async ({ request, mundo }) => {
  const [correo] = await resumenesDe(request, familia(mundo).email);
  expect(correo!.asunto).toBe('Resumen semanal: así leyó Lucía');
  expect(correo!.texto).toContain('Lucía\n• ');
  expect(enlaceDeBaja(correo!.texto)).toMatch(/^\/resumen-familiar\/baja\?token=/);
  // También el botón "Cancelar suscripción" del programa de correo (RFC 8058).
  expect(correo!.bajaUrl).toMatch(/\/api\/v1\/familia\/preferencias-notificacion\/baja\?token=/);
});

Entonces('con un clic en ese enlace, sin iniciar sesión, deja de recibirlo', async ({ browser, baseURL, request, mundo }) => {
  const [correo] = await resumenesDe(request, familia(mundo).email);
  const contexto = await browser.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });
  const pagina = await contexto.newPage();
  await pagina.goto(enlaceDeBaja(correo!.texto));
  await expect(pagina.getByRole('heading', { level: 1, name: 'Ya no recibirás el resumen semanal' })).toBeVisible();
  await contexto.close();
});

Entonces('el domingo siguiente ya no le llega', async ({ request, mundo }) => {
  await ejecutarReportes(request, domingoALas1830(1));
  expect(await resumenesDe(request, familia(mundo).email)).toHaveLength(1);
});

Entonces('el domingo no le llega el resumen', async ({ request, mundo }) => {
  await ejecutarReportes(request, domingoALas1830());
  expect(await resumenesDe(request, familia(mundo).email)).toHaveLength(0);
});

Entonces('al activarlo de nuevo, el domingo siguiente sí le llega', async ({ page, request, mundo }) => {
  await casillaResumen(page).check();
  await expect(page.getByText('Listo: recibirás el resumen cada domingo.')).toBeVisible();
  await ejecutarReportes(request, domingoALas1830(1));
  expect(await resumenesDe(request, familia(mundo).email)).toHaveLength(1);
});

Entonces('Lucía aparece con su nuevo avatar y desactivada', async ({ page }) => {
  await page.reload();
  const lucia = tarjetaDe(page, 'Lucía');
  await expect(lucia.getByText('Desactivado', { exact: true })).toBeVisible();
  await lucia.getByRole('button', { name: 'Editar' }).click();
  await expect(lucia.getByRole('button', { name: 'Tigre', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

Entonces('al crear el sexto perfil ya no puede agregar otro', async ({ page }) => {
  await page.reload();
  await page.getByRole('button', { name: '+ Agregar perfil' }).click();
  await page.getByLabel('Alias o apodo').fill('Pía');
  await page.getByLabel('PIN de 4 números').fill('5274');
  await page.getByLabel('Repite el PIN').fill('5274');
  await page.getByRole('button', { name: 'Crear perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Mis hijos (6/6)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Agregar perfil' })).toHaveCount(0);
});
```

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
