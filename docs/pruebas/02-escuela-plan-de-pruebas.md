<!-- Generado con node docs/pruebas/construir.mjs desde 02-escuela-plan-de-pruebas.plantilla.md. No editar a mano. -->
# Plan Maestro de Pruebas — Módulo 2: Escuela (Aulas y Asignaciones)

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/escuela` + pantallas web del modo escuela, del panel familiar y del inicio del estudiante
> **Requisitos cubiertos:** RF-014 a RF-020, RN-01, RN-03, RN-04, RN-17, RF-077 (parcial: vinculación, invitaciones y tarjetas), RNF-001, RNF-003, RNF-019, RNF-022, RNF-023, RNF-031, convenciones del API (SRS §7), cardinalidad "1 responsable + hasta 2 familiares vinculados" (SRS §7) y el cambio aprobado **CR-01** (tarjetas sin código de aula)
> **Fecha de ejecución:** 16/10/2026 · **Resultado global:** ✅ 380 pruebas automatizadas en verde en los 4 niveles (las del Módulo 1 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 2 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 220 | 70 | ✅ 220/220 · cobertura 95,9 % líneas / 93,9 % ramas | 30 s |
| 2 · Integración (Supertest + PostgreSQL real) | 72 | 21 | ✅ 72/72 | 71 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 69 | 15 | ✅ 69/69 (64 en la corrida completa; las otras 5 pasaron al repetirlas: 3 tenían un selector de prueba ambiguo, ya corregido, y 2 fueron un cuelgue del navegador en celular) | 24,7 min |
| 3 · Carga (RNF-003 / RNF-001) | 5 mediciones | 5 | ✅ 0 % errores · panel con 40 estudiantes p95 91 ms · lecturas p95 ≤ 73 ms | 1 min |
| 4 · Aceptación (Gherkin en español) | 19 escenarios | 5 | ✅ 19/19 · informe para el Product Owner | 4,5 min |

**Defectos encontrados por las pruebas y corregidos:** 9 · **Brechas con el SRS cerradas:** 7 · **Desviaciones del SRS documentadas:** 1 (tarjetas por `POST`, ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `escuela` (SRS §7) |
| PDF | pdf-lib 1.17 (ya usada en el Módulo 1; sin dependencias nuevas) |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` |

## 1.2 Mapa de dependencias del módulo

```
interface  EscuelaController (/aulas/*, DOCENTE) · FamiliaYEstudianteController
           (/estudiantes/{id}/invitaciones-familiar, /familia/vincular, /yo/asignaciones) · DTO
   │  usa CasosUsoEscuela (token CASOS_USO_ESCUELA)
   ▼
application 14 casos de uso (aulas, matrícula, tarjetas, asignaciones, invitaciones) · EscuelaFacade
   │  puertos: AulaRepository, MatriculaRepository, AsignacionRepository, InvitacionRepository,
   │           GeneradorTarjetasPdf, ServicioIdentidad (anticorrupción hacia IAM), CatalogoAsignable
   ▼
domain     Aula, Matricula, Asignacion (PROGRAMADA→ACTIVA→VENCIDA→CERRADA), InvitacionFamiliar
           · VO CodigoAula, CodigoInvitacion, FechaLima · PoliticaMatricula · errores · eventos

infrastructure Prisma*Repository · PdfLibTarjetas · ServicioIdentidadIam (sobre IamFacade)

Otros módulos (solo por su public-api o por el shared-kernel):
  IAM ─────────── perfiles, PIN, vínculos familiares (VincularFamiliarUseCase, iam.vinculo_responsable)
  shared-kernel ─ CatalogoAsignable: Contenido registra las lecturas publicadas y Aventura las misiones
                  ResolutorContextoAula (Escuela lo registra para la tablet del aula, CR-01)
  Administración  escucha los eventos de Escuela y los guarda en admin.auditoria (RF-077)
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `AulaRepository`, `MatriculaRepository`, `AsignacionRepository`, `InvitacionRepository` | Interna (puerto) | En memoria (`test/unit/escuela/dobles.ts`); la de invitaciones copia filas como una base real | **Real**: Prisma + PostgreSQL |
| `ServicioIdentidad` (IAM) | Interna (anticorrupción) | `IdentidadFalsa` con errores configurables | **Real**: `IamFacade` + `iam.*` |
| `CatalogoAsignable` (Contenido, Aventura) | Interna (registro) | `CatalogoFalso` | **Real**: lectura publicada y misión sembradas en la base de pruebas |
| `GeneradorTarjetasPdf` | Interna | `TarjetasEspia` + prueba propia del adaptador real con pdf-lib | **Real** (se leen los PIN del PDF) |
| Huella de códigos (SHA-256) | Inyectada | Huella legible `huella(...)` | **Real** |
| Fuente aleatoria (`randomInt`) | Inyectada | Cola controlable | **Real** |
| Reloj | Inyectado | Reloj controlable (`avanzarMin`) | Reloj real |
| `BusEventos` + Outbox + auditoría | Interna | `BusEspia` | **Real**: `admin.outbox_evento` y `admin.auditoria` |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| E-1 | La matrícula (RF-015/RF-016) devolvía el **PIN en la respuesta JSON** y las tarjetas eran un JSON con PIN: la pantalla podía mostrarlo, contra "PIN visible solo en la tarjeta impresa" (RF-017) | Análisis vs SRS | La matrícula ya no devuelve el PIN; el PIN se asigna al imprimir y existe solo dentro del PDF |
| E-2 | Las tarjetas seguían llevando el **código de aula**, que tras CR-01 ya no sirve para entrar | Análisis vs CR-01 | Tarjeta con aula, avatar, alias y PIN; prueba que el PDF no contiene "código" |
| E-3 | Código muerto de CR-01: `CodigoAulaInvalidoError`, `AulaRepository.buscarPorCodigo`, `CodigoAula.intentar` | Revisión de cobertura | Eliminado |
| E-4 | Una fecha límite imposible se informaba como "asignación repetida" (409) si el contenido ya estaba asignado | 2 · `escuela-http.int-spec.ts` | Primero las reglas de la asignación (fechas), después las del aula |
| E-5 | El título del PDF perdía el guion largo: el filtro de caracteres de la fuente estándar se aplicaba también a los metadatos (que admiten Unicode) | 1 · `tarjetas-y-auditoria.spec.ts` | El filtro solo se aplica al texto dibujado |
| E-6 | En Edge reciente `scrollIntoView` devuelve una promesa y el `useEffect` del código de invitación la retornaba: React lo marca como error | 3 · `modo-escuela.spec.ts` | El efecto ya no retorna nada |
| E-7 | Las pruebas de un mismo archivo compartían la IP simulada; con 3 dispositivos superaban el límite de 10 ingresos/min (RNF-019) y fallaban con 429 | 3 · E2E | IP simulada distinta por prueba (`base.extend` de `extraHTTPHeaders`) |
| E-8 | Un alias de 20 letras o un nombre de aula largo se salían de la tarjeta impresa | Revisión del PDF de ejemplo | `ajustarAlAncho`: achica la letra y, si no alcanza, recorta con "..."; prueba con textos largos |
| E-9 | Pruebas mal escritas: el nombre "Ana" también coincidía con la casilla "Elegir a Ana…" y un paso Gherkin no recibía su parámetro | 3 y 4 · Playwright / bddgen | Selector exacto y paso con su parámetro |

**Brechas con el SRS detectadas en la auditoría del módulo y cerradas (todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-017 | No había PDF; un `POST` devolvía JSON | PDF A4 con 8 tarjetas por hoja y líneas de corte (pdf-lib); `Cache-Control: no-store`; reimprimir invalida la tarjeta anterior | U + I + S + UAT |
| B-2 | RF-018 | No existían las asignaciones | Agregado `Asignacion` con estados por fecha de Lima, destinatarios, catálogo de lecturas/misiones publicadas, cierre y "Misión del docente" en el inicio del estudiante | U + I + S + UAT |
| B-3 | RF-019 | No existía la invitación familiar | Código de 8 caracteres de un solo uso y 7 días; en la base solo su huella SHA-256; canje atómico; anti-enumeración; límite 10/min por IP | U + I + S + UAT |
| B-4 | RF-019 / RF-077 | "Vinculación queda auditada": la tabla `admin.auditoria` no se usaba | Administración registra `FAMILIAR_VINCULADO`, `INVITACION_FAMILIAR_GENERADA` y `TARJETAS_ACCESO_GENERADAS` con actor, rol, recurso, fecha e IP | U + I |
| B-5 | RN-17 / SRS §7 | IAM no tenía familiares vinculados ("hasta 2") | `VincularFamiliarUseCase` (máx. 2 por estudiante, 6 estudiantes por familia), panel "Desde su aula" y la tablet de casa muestra al niño vinculado | U + I + S |
| B-6 | RF-014 a RF-020 | Escuela no tenía pantallas | Mis aulas, crear aula, detalle, matrícula uno/CSV, tarjetas, invitación, asignaciones, archivar; responsivas | S + UAT |
| B-7 | RF-020 | Archivar no cerraba las asignaciones abiertas | Archivar cierra las asignaciones abiertas; las invitaciones pendientes dejan de servir | U + I + S |

**Desviación documentada del SRS:** el SRS (§7) define `GET /api/v1/aulas/{id}/tarjetas-acceso.pdf`. Como el PIN solo se guarda cifrado, imprimir **asigna PIN nuevos**: un `GET` con ese efecto podría dispararse solo (vista previa de enlaces, reintentos del navegador) e invalidar tarjetas ya entregadas. Se implementó `POST /api/v1/aulas/{id}/tarjetas-acceso.pdf` con los estudiantes elegidos en el cuerpo. Registrado también en [`docs/datos/modelo-de-datos.md`](../datos/modelo-de-datos.md).

**Decisiones de diseño (no estaban en el SRS):**
- Fecha límite de una asignación: hasta 6 meses adelante; las fechas son días de Lima (UTC−5 todo el año).
- Hasta 3 códigos de invitación sin usar por estudiante.
- El familiar vinculado acompaña y puede hacer entrar al niño en la tablet de casa, pero no edita su perfil de aula ni cambia su PIN (los gestiona la docente, responsable del perfil).
- La familia puede canjear el código sin dar antes el consentimiento parental: el perfil ya existe bajo el consentimiento institucional del aula (RN-01).

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| No hay pantalla para quitar un vínculo familiar | Si un código llega a la persona equivocada, hoy solo se corrige en la base | La columna `revocado_en` ya existe; agregar "Quitar familiar" en el panel docente (Módulo 10 o 12) |
| Las lecturas y misiones reales llegan con los Módulos 3 y 4 | En la base de desarrollo el catálogo está vacío y no se puede asignar nada todavía | Contenido y Aventura ya registran su fuente; al publicar contenido aparecerá solo |
| "Misión del docente" aún no abre la lectura | El niño la ve, pero el lector llega con los Módulos 4 y 6 | Enlazar la tarjeta a la sesión de lectura |
| La auditoría registra solo las acciones de Escuela | Cambios de PIN, consentimientos, exportaciones y eliminaciones de IAM aún no se auditan (RF-077) | Agregar sus eventos a `AuditoriaSuscripciones` en el Módulo 12 |
| `institucion_id` del aula sigue vacío | La institución se guarda como texto | Registro de instituciones (RF-076) |
| La auditoría acumula los registros de las pruebas E2E en la base de desarrollo | Es de solo agregar por diseño; no contienen datos personales (cuentas de prueba, IP simuladas) | Usar una base propia para E2E en local, como en CI |
| Heredadas del Módulo 1 | Outbox no transaccional; límite de tasa en memoria; la API en modo `watch` se reinicia si cambia un archivo durante las E2E | Ver informe del Módulo 1 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva: el módulo usa las mismas herramientas del Módulo 1.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Escuela solo usa IAM por su `public-api`; los demás módulos, por el shared-kernel | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` + `unplugin-swc` | Node.js 22 | Dominio de Escuela, casos de uso con dobles, PDF real, auditoría y vínculos de IAM | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real: huellas, destinatarios, auditoría, canje atómico, PIN del PDF | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | La docente usa la web real; descarga del PDF; el niño entra con el PIN impreso | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/escuela-panel.js`) | Binario k6 | RNF-003 (panel con aula de 40 < 1,5 s p95) y RNF-001 | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios Gherkin en español para el Product Owner | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── support/pdf-texto.ts                 # Lee el texto y los PIN de un PDF generado (I, S, UAT)
│   ├── unit/escuela/
│   │   ├── dobles.ts                        # Repos en memoria, IAM simulado, catálogo, PDF espía
│   │   ├── dominio/dominio-escuela.spec.ts  # Aula, Matricula, FechaLima, Asignacion, invitación
│   │   ├── aplicacion/{aulas-y-matriculas,asignaciones,invitaciones}.spec.ts
│   │   └── infraestructura/tarjetas-y-auditoria.spec.ts   # PDF real + RF-077
│   ├── unit/iam/aplicacion/vinculos-familiares.spec.ts   # RF-019 en IAM y tablet de casa
│   └── integration/escuela/escuela-http.int-spec.ts       # HTTP + PostgreSQL
├── tests/
│   ├── e2e/
│   │   ├── support/escuela.ts               # Aula preparada, catálogo de prueba, PIN del PDF descargado
│   │   ├── specs/escuela/modo-escuela.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts  # + paneles del modo escuela
│   │   ├── features/escuela/modo-escuela.feature
│   │   └── steps/escuela.steps.ts
│   └── load/scenarios/escuela-panel.js      # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Dominio:** `Aula` (datos válidos, archivado de solo lectura), `Matricula`, `PoliticaMatricula` (45 activos, alias + avatar distinguibles, PIN sin repetidos/escaleras/años), `FechaLima` (día de Lima aunque en UTC ya sea mañana, fechas imposibles), `Asignacion` (estados por fecha al milisegundo del cierre del día en Lima, CERRADA definitiva, destinatarios sin repetir, límites de fechas), `CodigoInvitacion` (alfabeto sin ambiguos, lo que escribe la familia) e `InvitacionFamiliar` (7 días exactos, un solo uso).
- **Casos de uso** con dobles: crear aula con código único (reintenta si choca), consultar con RN-17, matricular uno y CSV (sin PIN en la respuesta), **tarjetas con PIN nuevo solo en el PDF**, retirar, archivar (cierra asignaciones), **asignaciones** (catálogo, duplicados, destinatarios, estados guardados al consultarlas, misión del docente), **invitación y canje** (huella, anti-enumeración, código no gastado si IAM rechaza, dos canjes simultáneos, liberación).
- **IAM:** vínculo familiar (solo familias activas, sin duplicar, máx. 2 y 6) y tablet de casa con el niño vinculado.
- **Adaptadores:** PDF real (A4, 8 por hoja, textos y PIN) y registro de auditoría (IP inválida → desconocida).

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/escuela/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
El reporte de cobertura queda en `apps/api/reports/unit/coverage/index.html`; ahora incluye el dominio, la aplicación y el PDF de Escuela.

## 4.4 Código completo del test unitario
`apps/api/test/unit/escuela/aplicacion/invitaciones.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CanjearInvitacionFamiliarUseCase,
  GenerarInvitacionFamiliarUseCase,
} from '../../../../src/modules/escuela/application/use-cases/invitaciones-familiar.use-case';
import { MAX_INVITACIONES_PENDIENTES } from '../../../../src/modules/escuela/domain/entities/invitacion-familiar';
import {
  AulaArchivadaError,
  DemasiadasInvitacionesError,
  FamiliaCompletaError,
  InvitacionInvalidaError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { ErrorDeNegocio, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn } from '../dobles';

/** Nivel 1 — Invitación familiar (RF-019, RN-17): código de un solo uso, 7 días, auditado. */
const DOCENTE = 'doc-1';
const FAMILIAR = 'fam-1';

describe('Invitación familiar (RF-019)', () => {
  let e: EntornoEscuela;
  let generar: GenerarInvitacionFamiliarUseCase;
  let canjear: CanjearInvitacionFamiliarUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela();
    generar = new GenerarInvitacionFamiliarUseCase(
      e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.aleatorio, e.generarId, e.reloj.ahora,
    );
    canjear = new CanjearInvitacionFamiliarUseCase(e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.reloj.ahora);
  });

  const preparar = async () => {
    const aula = await aulaDe(e, DOCENTE, { nombre: '3.° B' });
    const mateo = await estudianteEn(e, aula, 'Mateo');
    return { aula, mateo };
  };

  it('la docente obtiene un código legible de 7 días; en la base solo queda su huella', async () => {
    const { aula, mateo } = await preparar();
    e.encolarAleatorios([0, 1, 2, 3, 4, 5, 6, 7]);
    const inv = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo, ip: '203.0.113.7' });

    expect(inv).toEqual({
      codigo: 'ABCD-EFGH',
      expiraEn: '2026-10-22T15:00:00.000Z',
      estudiante: { id: mateo, alias: 'Mateo', avatar: 'leon' },
      aula: { id: aula.id, nombre: '3.° B' },
    });
    const [guardada] = [...e.invitaciones.filas.values()];
    expect(guardada?.hashCodigo).toBe('huella(ABCDEFGH)');
    expect(JSON.stringify(guardada)).not.toContain('ABCD-EFGH');
    expect(e.bus.publicados.at(-1)).toMatchObject({
      nombreEvento: EVENTOS_ESCUELA.INVITACION_FAMILIAR_GENERADA,
      datos: { actorId: DOCENTE, estudianteId: mateo, aulaId: aula.id, ip: '203.0.113.7' },
    });
  });

  it('RN-17: solo para estudiantes de sus aulas activas', async () => {
    const { aula, mateo } = await preparar();
    await expect(generar.ejecutar({ docenteId: 'otra-docente', estudianteId: mateo })).rejects.toThrow(NoEncontradoError);
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: 'no-existe' })).rejects.toThrow(NoEncontradoError);
    aula.archivar(e.reloj.ahora());
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).rejects.toThrow(AulaArchivadaError);
  });

  it(`limita los códigos pendientes (${MAX_INVITACIONES_PENDIENTES}) y no invita si ya hay 2 familiares`, async () => {
    const { mateo } = await preparar();
    for (let i = 0; i < MAX_INVITACIONES_PENDIENTES; i++) await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).rejects.toThrow(DemasiadasInvitacionesError);

    // Al vencer, dejan de contar.
    e.reloj.avanzarMin(7 * 24 * 60);
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).resolves.toBeTruthy();

    e.identidad.vinculos.push({ perfilId: mateo, cuentaFamiliarId: 'f1' }, { perfilId: mateo, cuentaFamiliarId: 'f2' });
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).rejects.toThrow(FamiliaCompletaError);
  });

  it('el familiar canjea el código (escrito como sea) y queda vinculado y auditado', async () => {
    const { aula, mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });

    const r = await canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo: ` ${codigo.toLowerCase().replace('-', ' ')} `, ip: '198.51.100.4' });
    expect(r).toEqual({ estudiante: { id: mateo, alias: 'Mateo', avatar: 'leon' }, aula: '3.° B' });
    expect(e.identidad.vinculos).toEqual([{ perfilId: mateo, cuentaFamiliarId: FAMILIAR }]);
    expect([...e.invitaciones.filas.values()][0]).toMatchObject({ usadaEn: e.reloj.ahora(), cuentaFamiliarId: FAMILIAR });
    expect(e.bus.publicados.at(-1)).toMatchObject({
      nombreEvento: EVENTOS_ESCUELA.FAMILIAR_VINCULADO,
      datos: { actorId: FAMILIAR, estudianteId: mateo, aulaId: aula.id, docenteId: DOCENTE, ip: '198.51.100.4' },
    });
  });

  it('un código usado, vencido, inventado o mal escrito responde siempre lo mismo', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    const { codigo: vencido } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    await canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo });

    const intentos = [codigo, 'ZZZZ-ZZZZ', 'hola', ''];
    for (const c of intentos) {
      await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-2', codigo: c })).rejects.toThrow(InvitacionInvalidaError);
    }
    e.reloj.avanzarMin(7 * 24 * 60);
    await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-2', codigo: vencido })).rejects.toThrow(InvitacionInvalidaError);
  });

  it('no sirve si el estudiante dejó el aula o el aula se archivó', async () => {
    const { aula, mateo } = await preparar();
    const { codigo: c1 } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    (await e.matriculas.buscar(aula.id, mateo))?.retirar(e.reloj.ahora());
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo: c1 })).rejects.toThrow(InvitacionInvalidaError);

    const otra = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    const ana = await estudianteEn(e, otra, 'Ana', 'zorro');
    const { codigo: c2 } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: ana });
    otra.archivar(e.reloj.ahora());
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo: c2 })).rejects.toThrow(InvitacionInvalidaError);
  });

  it('si IAM no permite el vínculo (p. ej. ya lo acompaña), el código no se gasta', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    e.identidad.errorAlVincular = new ErrorDeNegocio('Ya acompañas a Mateo desde tu cuenta', 'CONFLICTO');

    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo })).rejects.toThrow(/Ya acompañas/);
    expect([...e.invitaciones.filas.values()][0]?.usadaEn).toBeNull();

    e.identidad.errorAlVincular = null;
    await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-2', codigo })).resolves.toBeTruthy();
  });

  it('con dos canjes simultáneos del mismo código, solo uno vincula', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });

    const resultados = await Promise.allSettled([
      canjear.ejecutar({ cuentaFamiliarId: 'fam-a', codigo }),
      canjear.ejecutar({ cuentaFamiliarId: 'fam-b', codigo }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(InvitacionInvalidaError) });
    expect(e.identidad.vinculos).toHaveLength(1);
  });

  it('si el vínculo falla después de reclamar el código, lo libera', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    const original = e.identidad.vincularFamiliar.bind(e.identidad);
    e.identidad.vincularFamiliar = async () => {
      throw new ErrorDeNegocio('Mateo ya tiene 2 familiares vinculados', 'CONFLICTO');
    };
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo })).rejects.toThrow(/2 familiares/);
    expect([...e.invitaciones.filas.values()][0]).toMatchObject({ usadaEn: null, cuentaFamiliarId: null });

    e.identidad.vincularFamiliar = original;
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo })).resolves.toBeTruthy();
  });
});
```

`apps/api/test/unit/escuela/dominio/dominio-escuela.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { Asignacion, MAX_DIAS_ASIGNACION } from '../../../../src/modules/escuela/domain/entities/asignacion';
import { Aula, MAX_MATRICULAS_ACTIVAS } from '../../../../src/modules/escuela/domain/entities/aula';
import { InvitacionFamiliar, VIGENCIA_INVITACION_DIAS } from '../../../../src/modules/escuela/domain/entities/invitacion-familiar';
import { Matricula } from '../../../../src/modules/escuela/domain/entities/matricula';
import {
  AulaArchivadaError,
  AulaLlenaError,
  DatoAsignacionInvalidoError,
  DatoAulaInvalidoError,
  EstudianteRepetidoEnAulaError,
  InvitacionInvalidaError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { generarPinTarjeta, PoliticaMatricula } from '../../../../src/modules/escuela/domain/services/politica-matricula';
import { ALFABETO_CODIGO_AULA, CodigoAula } from '../../../../src/modules/escuela/domain/value-objects/codigo-aula';
import { CodigoInvitacion } from '../../../../src/modules/escuela/domain/value-objects/codigo-invitacion';
import { FechaLima } from '../../../../src/modules/escuela/domain/value-objects/fecha-lima';

/** Nivel 1 — Dominio de Escuela (RF-014 a RF-020): reglas puras, sin base de datos. */
const AHORA = new Date('2026-10-15T15:00:00Z'); // jueves, 10:00 en Lima

describe('Aula (RF-014, RF-020)', () => {
  const crear = (cambios: Partial<Parameters<typeof Aula.crear>[0]> = {}) =>
    Aula.crear({
      id: 'aula-1', docenteId: 'doc-1', nombre: ' 3.° B ', grado: '3', anioLectivo: 2026, institucion: 'IE 1234',
      codigo: CodigoAula.desdePersistencia('ABC234'), ahora: AHORA, ...cambios,
    });

  it('se crea activa, recorta el nombre y pertenece a su docente', () => {
    const aula = crear();
    expect(aula.nombre).toBe('3.° B');
    expect(aula.estaActiva).toBe(true);
    expect(aula.perteneceA('doc-1')).toBe(true);
    expect(aula.perteneceA('doc-2')).toBe(false);
  });

  it.each([
    [{ nombre: 'B' }, /nombre/],
    [{ grado: '7' }, /grado/],
    [{ anioLectivo: 2030 }, /año lectivo/],
    [{ institucion: 'IE' }, /institución/],
  ])('rechaza datos inválidos %o', (cambio, mensaje) => {
    expect(() => crear(cambio)).toThrow(DatoAulaInvalidoError);
    expect(() => crear(cambio)).toThrow(mensaje);
  });

  it('al archivarse queda en solo lectura y no se archiva dos veces', () => {
    const aula = crear();
    aula.archivar(AHORA);
    expect(aula.estaActiva).toBe(false);
    expect(aula.propsSnapshot.archivadaEn).toEqual(AHORA);
    expect(() => aula.asegurarEditable()).toThrow(AulaArchivadaError);
    expect(() => aula.archivar(AHORA)).toThrow(AulaArchivadaError);
  });

  it('el código de aula tiene 6 caracteres sin ambiguos (0/O, 1/I/L)', () => {
    let i = 0;
    const codigo = CodigoAula.generar((n) => (i++ * 7) % n).value;
    expect(codigo).toHaveLength(6);
    expect([...codigo].every((c) => ALFABETO_CODIGO_AULA.includes(c))).toBe(true);
    expect(ALFABETO_CODIGO_AULA).not.toMatch(/[01OIL]/);
  });
});

describe('Matrícula y política de matrícula (RF-015, RF-016)', () => {
  it('retirar conserva la fecha y es idempotente', () => {
    const m = Matricula.crear({ id: 'm-1', aulaId: 'a', estudianteId: 'e', ahora: AHORA });
    m.retirar(AHORA);
    m.retirar(new Date('2027-01-01'));
    expect(m.activa).toBe(false);
    expect(m.propsSnapshot.retiradaEn).toEqual(AHORA);
  });

  it(`un aula admite hasta ${MAX_MATRICULAS_ACTIVAS} estudiantes activos`, () => {
    expect(() => PoliticaMatricula.validarCapacidad(44, 1)).not.toThrow();
    expect(() => PoliticaMatricula.validarCapacidad(44, 2)).toThrow(AulaLlenaError);
  });

  it('alias + avatar deben distinguirse en el aula (sin importar mayúsculas)', () => {
    const existentes = [{ alias: 'Mateo', avatar: 'leon' }];
    expect(() => PoliticaMatricula.validarDistinguible(existentes, { alias: ' mateo ', avatar: 'leon' })).toThrow(EstudianteRepetidoEnAulaError);
    expect(() => PoliticaMatricula.validarDistinguible(existentes, { alias: 'Mateo', avatar: 'zorro' })).not.toThrow();
  });

  it('el PIN de la tarjeta evita repetidos, escaleras y años', () => {
    // La fuente entrega primero PIN fáciles (1111, 1234, 2017) y luego uno válido.
    const cola = [1, 1, 1, 1, 1, 2, 3, 4, 2, 0, 1, 7, 4, 8, 2, 6];
    expect(generarPinTarjeta(() => cola.shift() as number, 2017)).toBe('4826');
    // También rechaza el año de nacimiento aunque no parezca un año reciente.
    const conAnio = [1, 9, 8, 6, 5, 7, 3, 9];
    expect(generarPinTarjeta(() => conAnio.shift() as number, 1986)).toBe('5739');
  });
});

describe('FechaLima: días del calendario escolar en hora de Lima', () => {
  it('un día va de 00:00 a 23:59:59.999 en Lima (UTC−5)', () => {
    const dia = FechaLima.de('2026-10-20');
    expect(dia.inicio.toISOString()).toBe('2026-10-20T05:00:00.000Z');
    expect(dia.fin.toISOString()).toBe('2026-10-21T04:59:59.999Z');
  });

  it('"hoy" es el día de Lima aunque en UTC ya sea mañana', () => {
    expect(FechaLima.hoy(new Date('2026-10-16T04:30:00Z')).value).toBe('2026-10-15');
    expect(FechaLima.hoy(new Date('2026-10-16T05:00:00Z')).value).toBe('2026-10-16');
  });

  it('suma días y compara', () => {
    const hoy = FechaLima.hoy(AHORA);
    expect(hoy.sumarDias(17).value).toBe('2026-11-01');
    expect(hoy.esAnteriorA(hoy.sumarDias(1))).toBe(true);
    expect(hoy.esAnteriorA(hoy)).toBe(false);
  });

  it.each(['2026-02-30', '20-10-2026', '2026/10/20', ''])('rechaza fechas inválidas: "%s"', (texto) => {
    expect(() => FechaLima.de(texto)).toThrow(DatoAsignacionInvalidoError);
  });
});

describe('Asignación (RF-018): PROGRAMADA → ACTIVA → VENCIDA → CERRADA', () => {
  const crear = (desde: string, hasta: string, estudianteIds: string[] = []) =>
    Asignacion.crear({
      id: 'asig-1', aulaId: 'aula-1', docenteId: 'doc-1', tipo: 'LECTURA', contenidoId: 'lectura-1',
      titulo: ' El zorro y la luna ', estudianteIds, desde: FechaLima.de(desde), hasta: FechaLima.de(hasta), ahora: AHORA,
    });

  it('si empieza hoy nace ACTIVA; si empieza después, PROGRAMADA', () => {
    expect(crear('2026-10-15', '2026-10-15').estado).toBe('ACTIVA');
    const futura = crear('2026-10-19', '2026-10-23');
    expect(futura.estado).toBe('PROGRAMADA');
    expect(futura.propsSnapshot.titulo).toBe('El zorro y la luna');
  });

  it('el tiempo la lleva de PROGRAMADA a ACTIVA y a VENCIDA (al terminar el día límite en Lima)', () => {
    const a = crear('2026-10-19', '2026-10-23');
    expect(a.estadoEn(new Date('2026-10-19T04:59:59Z'))).toBe('PROGRAMADA');
    expect(a.estadoEn(new Date('2026-10-19T05:00:00Z'))).toBe('ACTIVA');
    expect(a.estadoEn(new Date('2026-10-24T04:59:59Z'))).toBe('ACTIVA');
    expect(a.estadoEn(new Date('2026-10-24T05:00:00Z'))).toBe('VENCIDA');

    expect(a.actualizarEstado(new Date('2026-10-20T15:00:00Z'))).toBe(true);
    expect(a.estado).toBe('ACTIVA');
    expect(a.actualizarEstado(new Date('2026-10-20T16:00:00Z'))).toBe(false);
  });

  it('cerrada queda cerrada aunque siga dentro de fechas', () => {
    const a = crear('2026-10-15', '2026-10-30');
    a.cerrar();
    expect(a.estadoEn(new Date('2026-10-20T15:00:00Z'))).toBe('CERRADA');
    expect(a.estaAbierta(AHORA)).toBe(false);
  });

  it('es para toda el aula o solo para los estudiantes elegidos (sin repetir)', () => {
    expect(crear('2026-10-15', '2026-10-20').esPara('cualquiera')).toBe(true);
    const elegidos = crear('2026-10-15', '2026-10-20', ['e1', 'e2', 'e1']);
    expect(elegidos.paraTodaElAula).toBe(false);
    expect(elegidos.estudianteIds).toEqual(['e1', 'e2']);
    expect(elegidos.esPara('e2')).toBe(true);
    expect(elegidos.esPara('e3')).toBe(false);
  });

  it.each([
    ['2026-10-14', '2026-10-20', /anterior a hoy/],
    ['2026-10-20', '2026-10-19', /igual o posterior/],
    ['2026-10-15', FechaLima.hoy(AHORA).sumarDias(MAX_DIAS_ASIGNACION + 1).value, /6 meses/],
  ])('rechaza fechas imposibles: %s → %s', (desde, hasta, mensaje) => {
    expect(() => crear(desde, hasta)).toThrow(mensaje);
  });

  it('necesita el título de su contenido', () => {
    expect(() =>
      Asignacion.crear({
        id: 'x', aulaId: 'a', docenteId: 'd', tipo: 'MISION', contenidoId: 'm', titulo: '  ', estudianteIds: [],
        desde: FechaLima.de('2026-10-15'), hasta: FechaLima.de('2026-10-16'), ahora: AHORA,
      }),
    ).toThrow(DatoAsignacionInvalidoError);
  });
});

describe('Invitación familiar (RF-019): código de un solo uso por 7 días', () => {
  it('el código tiene 8 caracteres sin ambiguos y se lee como ABCD-2345', () => {
    let i = 0;
    const codigo = CodigoInvitacion.generar((n) => i++ % n);
    expect(codigo.value).toBe('ABCDEFGH');
    expect(codigo.legible).toBe('ABCD-EFGH');
  });

  it('acepta lo que escribe la familia con guion, espacios o minúsculas', () => {
    expect(CodigoInvitacion.intentar(' abcd-efgh ')?.value).toBe('ABCDEFGH');
    expect(CodigoInvitacion.intentar('ABCD EFGH')?.value).toBe('ABCDEFGH');
    expect(CodigoInvitacion.intentar('ABCD-EFG')).toBeNull();
    expect(CodigoInvitacion.intentar('ABCD-EFG0')).toBeNull(); // 0 es ambiguo: no existe en el alfabeto
  });

  const emitir = () =>
    InvitacionFamiliar.emitir({ id: 'inv-1', aulaId: 'a', estudianteId: 'e', docenteId: 'd', hashCodigo: 'h', ahora: AHORA });

  it(`vence a los ${VIGENCIA_INVITACION_DIAS} días`, () => {
    const inv = emitir();
    expect(inv.expiraEn.toISOString()).toBe('2026-10-22T15:00:00.000Z');
    expect(inv.estaVigente(new Date('2026-10-22T14:59:59Z'))).toBe(true);
    expect(inv.estaVigente(new Date('2026-10-22T15:00:00Z'))).toBe(false);
    expect(() => inv.canjear('fam-1', new Date('2026-10-23T00:00:00Z'))).toThrow(InvitacionInvalidaError);
  });

  it('se usa una sola vez y registra quién la canjeó', () => {
    const inv = emitir();
    inv.canjear('fam-1', AHORA);
    expect(inv.propsSnapshot).toMatchObject({ usadaEn: AHORA, cuentaFamiliarId: 'fam-1' });
    expect(inv.estaVigente(AHORA)).toBe(false);
    expect(() => inv.canjear('fam-2', AHORA)).toThrow(InvitacionInvalidaError);
  });
});
```

`apps/api/test/unit/escuela/aplicacion/asignaciones.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CatalogoDelAulaUseCase,
  ListarAsignacionesUseCase,
  MisionesDelDocenteUseCase,
} from '../../../../src/modules/escuela/application/use-cases/consultar-asignaciones.use-case';
import {
  CerrarAsignacionUseCase,
  CrearAsignacionInput,
  CrearAsignacionUseCase,
} from '../../../../src/modules/escuela/application/use-cases/gestionar-asignaciones.use-case';
import {
  AsignacionDuplicadaError,
  AulaArchivadaError,
  ContenidoNoDisponibleError,
  DatoAsignacionInvalidoError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn } from '../dobles';

/** Nivel 1 — Asignaciones (RF-018): crear, listar, cerrar y verlas en la aventura del estudiante. */
const DOCENTE = 'doc-1';

describe('Asignaciones de la docente (RF-018)', () => {
  let e: EntornoEscuela;
  let crear: CrearAsignacionUseCase;
  let listar: ListarAsignacionesUseCase;
  let misiones: MisionesDelDocenteUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela(); // jueves 15/10/2026, 10:00 en Lima
    crear = new CrearAsignacionUseCase(e.aulas, e.matriculas, e.asignaciones, e.catalogo, e.identidad, e.bus, e.generarId, e.reloj.ahora);
    listar = new ListarAsignacionesUseCase(e.aulas, e.asignaciones, e.identidad, e.reloj.ahora);
    misiones = new MisionesDelDocenteUseCase(e.aulas, e.matriculas, e.asignaciones, e.reloj.ahora);
  });

  const asignar = (aulaId: string, cambios: Partial<CrearAsignacionInput> = {}) =>
    crear.ejecutar({ docenteId: DOCENTE, aulaId, tipo: 'LECTURA', contenidoId: 'lectura-1', fechaLimite: '2026-10-23', ...cambios });

  it('asigna una lectura publicada a toda el aula: empieza hoy y toma el título del catálogo', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const vista = await asignar(aula.id);

    expect(vista).toMatchObject({
      tipo: 'LECTURA', titulo: 'El zorro y la luna', paraTodaElAula: true, estudiantes: [],
      fechaInicio: '2026-10-15', fechaLimite: '2026-10-23', estado: 'ACTIVA',
    });
    expect(e.bus.publicados.at(-1)).toMatchObject({
      nombreEvento: EVENTOS_ESCUELA.ASIGNACION_CREADA,
      datos: { actorId: DOCENTE, aulaId: aula.id, tipo: 'LECTURA', contenidoId: 'lectura-1', estudianteIds: [] },
    });
  });

  it('asigna una misión a estudiantes elegidos, solo si están matriculados en el aula', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');
    const otraAula = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    const ajeno = await estudianteEn(e, otraAula, 'Rita');

    const vista = await asignar(aula.id, { tipo: 'MISION', contenidoId: 'mision-1', fechaInicio: '2026-10-19', estudianteIds: [mateo, ana] });
    expect(vista).toMatchObject({ titulo: 'El mapa perdido', paraTodaElAula: false, estado: 'PROGRAMADA' });
    expect(vista.estudiantes.map((s) => s.alias)).toEqual(['Ana', 'Mateo']);

    await expect(asignar(aula.id, { contenidoId: 'lectura-2', estudianteIds: [mateo, ajeno] })).rejects.toThrow(DatoAsignacionInvalidoError);
  });

  it('rechaza contenido no publicado, repetir uno abierto y asignar en un aula archivada', async () => {
    const aula = await aulaDe(e, DOCENTE);
    await expect(asignar(aula.id, { contenidoId: 'no-existe' })).rejects.toThrow(ContenidoNoDisponibleError);
    await expect(asignar(aula.id, { tipo: 'MISION', contenidoId: 'lectura-1' })).rejects.toThrow(/misión no está disponible/);

    await asignar(aula.id);
    await expect(asignar(aula.id, { fechaInicio: '2026-11-02', fechaLimite: '2026-11-06' })).rejects.toThrow(AsignacionDuplicadaError);

    aula.archivar(e.reloj.ahora());
    await expect(asignar(aula.id, { contenidoId: 'lectura-2' })).rejects.toThrow(AulaArchivadaError);
  });

  it('una lectura se puede volver a asignar cuando la anterior ya venció o se cerró', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const primera = await asignar(aula.id, { fechaLimite: '2026-10-16' });
    e.reloj.avanzarMin(3 * 24 * 60); // domingo 18
    await expect(asignar(aula.id, { fechaLimite: '2026-10-30' })).resolves.toMatchObject({ estado: 'ACTIVA' });
    expect((await listar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id })).find((a) => a.id === primera.id)?.estado).toBe('VENCIDA');
  });

  it('la lista pone primero las que están en curso y guarda los estados que cambió el tiempo', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const vence = await asignar(aula.id, { contenidoId: 'lectura-2', fechaLimite: '2026-10-16' });
    const programada = await asignar(aula.id, { tipo: 'MISION', contenidoId: 'mision-1', fechaInicio: '2026-10-19', fechaLimite: '2026-10-30' });
    const larga = await asignar(aula.id, { fechaLimite: '2026-11-20' });
    e.asignaciones.guardadas = 0;

    e.reloj.avanzarMin(4 * 24 * 60); // lunes 19, 10:00 en Lima
    const lista = await listar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id });
    expect(lista.map((a) => [a.id, a.estado])).toEqual([
      [programada.id, 'ACTIVA'],
      [larga.id, 'ACTIVA'],
      [vence.id, 'VENCIDA'],
    ]);
    expect(e.asignaciones.guardadas).toBe(2); // la vencida y la que empezó hoy
    expect(e.asignaciones.filas.get(vence.id)?.estado).toBe('VENCIDA');
  });

  it('cerrar la saca de la aventura; cerrar dos veces no publica otro evento; una ajena responde 404', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula);
    const asignacion = await asignar(aula.id);
    const cerrar = new CerrarAsignacionUseCase(e.aulas, e.asignaciones, e.bus, e.reloj.ahora);

    expect(await misiones.ejecutar(mateo)).toHaveLength(1);
    await cerrar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, asignacionId: asignacion.id });
    await cerrar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, asignacionId: asignacion.id });
    expect(e.bus.nombres().filter((n) => n === EVENTOS_ESCUELA.ASIGNACION_CERRADA)).toHaveLength(1);
    expect(await misiones.ejecutar(mateo)).toEqual([]);

    const otra = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    await expect(cerrar.ejecutar({ docenteId: DOCENTE, aulaId: otra.id, asignacionId: asignacion.id })).rejects.toThrow(NoEncontradoError);
  });

  it('"Misión del docente": el estudiante ve solo lo que es para él y está en curso', async () => {
    const aula = await aulaDe(e, DOCENTE, { nombre: '3.° B' });
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');
    await asignar(aula.id, { fechaLimite: '2026-10-23' });
    await asignar(aula.id, { tipo: 'MISION', contenidoId: 'mision-1', fechaLimite: '2026-10-20', estudianteIds: [ana] });
    await asignar(aula.id, { contenidoId: 'lectura-2', fechaInicio: '2026-10-19', fechaLimite: '2026-10-30' });

    expect(await misiones.ejecutar(mateo)).toEqual([
      { id: expect.any(String), tipo: 'LECTURA', contenidoId: 'lectura-1', titulo: 'El zorro y la luna', fechaLimite: '2026-10-23', aula: '3.° B' },
    ]);
    expect((await misiones.ejecutar(ana)).map((m) => m.titulo)).toEqual(['El mapa perdido', 'El zorro y la luna']);

    // Al retirarse del aula o archivarse esta, ya no ve las misiones.
    (await e.matriculas.buscar(aula.id, mateo))?.retirar(e.reloj.ahora());
    expect(await misiones.ejecutar(mateo)).toEqual([]);
    aula.archivar(e.reloj.ahora());
    expect(await misiones.ejecutar(ana)).toEqual([]);
  });

  it('el catálogo del aula separa lecturas y misiones publicadas', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const catalogo = await new CatalogoDelAulaUseCase(e.aulas, e.catalogo).ejecutar({ docenteId: DOCENTE, aulaId: aula.id });
    expect(catalogo.lecturas.map((c) => c.titulo)).toEqual(['El zorro y la luna', 'Rimas del río']);
    expect(catalogo.misiones.map((c) => c.detalle)).toEqual(['Mundo 1 · Explorador']);
    await expect(new CatalogoDelAulaUseCase(e.aulas, e.catalogo).ejecutar({ docenteId: 'otra', aulaId: aula.id })).rejects.toThrow(NoEncontradoError);
  });
});
```

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- Rutas `/api/v1/aulas/*`, `/estudiantes/{id}/invitaciones-familiar`, `/familia/vincular` y `/yo/asignaciones` con validación, roles (403), RN-17 (404 a otra docente), Problem Details y la base real.
- **El PIN impreso funciona:** se descarga el PDF, se leen los PIN y el niño entra desde la tablet del aula; reimprimir invalida el PIN anterior; queda auditado.
- **Asignaciones en la base:** `lectura_id`/`mision_id` según el tipo (restricción `ck_asignacion_destino`), destinatarios, fecha límite a las 23:59:59,999 de Lima, estado VENCIDO guardado al consultar.
- **Invitación:** solo la huella SHA-256 en la base, canje con IP real detrás del proxy, auditoría con actor e IP, vínculo en `iam.vinculo_responsable`, mismo mensaje para código usado o inventado, **429 al 11.º intento por minuto**.
- **Archivar:** solo lectura (409), perfiles conservados, asignaciones cerradas, invitaciones anuladas.
- **RNF-031:** el recorrido del modo escuela no deja PIN de tarjetas ni códigos de invitación en los logs.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/escuela/escuela-http.int-spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';

import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { pinesDelPdf } from '../../support/pdf-texto';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Escuela integrada (RF-014 a RF-020): controllers + guards + validación + casos de uso
 * + Prisma + PostgreSQL real, junto con IAM (perfiles, PIN, vínculos) y Administración (auditoría).
 */
const CONTRASENA = 'Lectura-Segura-2026';
const API = '/api/v1';
const ANIO = new Date().getFullYear();

let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
/** Lee el cuerpo binario (PDF) de una respuesta de supertest. */
const binario = (res: NodeJS.ReadableStream, listo: (error: Error | null, cuerpo: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => listo(null, Buffer.concat(partes)));
};
/** Día de Lima (AAAA-MM-DD) desplazado `dias` desde hoy. */
const diaLima = (dias = 0) => new Date(Date.now() - 5 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);

async function cuentaConSesion(email: string, rol: 'FAMILIAR' | 'DOCENTE') {
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
  const correos = (await t.http().get(`${API}/dev/correos`).expect(200)).body as { para: string; enlace: string }[];
  const enlace = correos.find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
  const { id } = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
  return { id, token: login.body.accessToken as string };
}

/** Contenido publicado que el docente puede asignar (lo crearán los módulos Biblioteca y Aventura). */
async function sembrarCatalogo() {
  const autorId = uuidV7();
  const lectura = await t.prisma.lectura.create({ data: { id: uuidV7(), autorId } });
  const version = await t.prisma.versionLectura.create({
    data: {
      id: uuidV7(), lecturaId: lectura.id, numero: 1, estado: 'PUBLICADO', titulo: 'El zorro y la luna', rangoEdad: 'R2',
      nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0',
      texto: 'Había una vez un zorro que miraba la luna.', autorId, revisorId: uuidV7(), publicadaEn: new Date(),
    },
  });
  await t.prisma.lectura.update({ where: { id: lectura.id }, data: { versionPublicadaId: version.id } });
  const borrador = await t.prisma.lectura.create({ data: { id: uuidV7(), autorId } });
  await t.prisma.versionLectura.create({
    data: {
      id: uuidV7(), lecturaId: borrador.id, numero: 1, titulo: 'Borrador sin publicar', rangoEdad: 'R2', nivelDificultad: 1,
      tematica: 'x', tipoTexto: 'CUENTO', texto: 'x', autorId,
    },
  });
  const mundo = await t.prisma.mundo.findUniqueOrThrow({ where: { numero: 1 } });
  const mision = await t.prisma.mision.create({ data: { id: uuidV7(), mundoId: mundo.id, rangoEdad: 'R2', orden: 1, titulo: 'El mapa perdido' } });
  return { lecturaId: lectura.id, borradorId: borrador.id, misionId: mision.id };
}

let docente: { id: string; token: string };
let aulaId: string;
let mateoId: string;
let anaId: string;
let catalogo: Awaited<ReturnType<typeof sembrarCatalogo>>;

describe('Aulas y matrículas (RF-014, RF-015, RF-016, RN-17)', () => {
  it('la docente crea su aula con código único y el consentimiento institucional queda registrado', async () => {
    docente = await cuentaConSesion('docente.escuela@lectoaventura.test', 'DOCENTE');
    const r = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({
      nombre: '3.° B', grado: '3', anioLectivo: ANIO, institucion: 'IE 1234 Santa Rosa',
      autoridadConsentimiento: 'Directora Ruiz', declaraConsentimiento: true,
    }).expect(201);
    aulaId = r.body.id;

    expect(r.body).toMatchObject({ nombre: '3.° B', estado: 'ACTIVA', totalEstudiantes: 0 });
    expect(r.body.codigo).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(await t.prisma.consentimiento.findFirstOrThrow({ where: { aulaId } })).toMatchObject({
      tipo: 'INSTITUCIONAL', cuentaResponsableId: docente.id, otorganteNombre: 'Directora Ruiz',
    });
  });

  it('valida los datos del aula y exige declarar el consentimiento', async () => {
    const base = { nombre: '3.° C', grado: '3', anioLectivo: ANIO, institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz' };
    const sinDeclarar = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({ ...base, declaraConsentimiento: false }).expect(400);
    expect(sinDeclarar.body.detail).toMatch(/consentimiento de las familias/);
    const grado = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({ ...base, grado: '7', declaraConsentimiento: true }).expect(400);
    expect(grado.body.detail).toMatch(/1.° a 6.°/);
  });

  it('matricula uno y por CSV; la respuesta nunca trae el PIN', async () => {
    const uno = await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(docente.token)).send({
      alias: 'Mateo', anioNacimiento: 2017, mesNacimiento: 5, avatar: 'leon',
    }).expect(201);
    mateoId = uno.body.estudianteId;
    expect(uno.body).toEqual({ estudianteId: expect.any(String), alias: 'Mateo', avatar: 'leon' });

    const csv = await t.http().post(`${API}/aulas/${aulaId}/matriculas/importacion`).set(bearer(docente.token)).send({
      csv: 'alias,año,mes,avatar\nAna,2017,3,zorro\nMateo,2017,5,leon\nRita,2017,13,panda',
    }).expect(201);
    anaId = csv.body.matriculados[0].estudianteId;
    expect(csv.body.matriculados.map((m: { alias: string }) => m.alias)).toEqual(['Ana']);
    expect(csv.body.rechazadas.map((f: { fila: number; motivo: string }) => [f.fila, f.motivo])).toEqual([
      [3, 'Ya hay un estudiante con ese alias y avatar en el aula; cambia uno de los dos'],
      [4, expect.stringMatching(/mes/i)],
    ]);
    expect(JSON.stringify(csv.body)).not.toMatch(/"pin"/);

    const perfil = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: mateoId } });
    expect(perfil).toMatchObject({ cuentaResponsableId: docente.id, alias: 'Mateo' });
    expect(perfil.hashPin).toMatch(/^\$argon2id\$/);
    expect(await t.prisma.matricula.count({ where: { aulaId, estado: 'ACTIVA' } })).toBe(2);
  });

  it('RN-17: otra docente no ve ni gestiona el aula (404); una familia no entra al modo escuela (403)', async () => {
    const otra = await cuentaConSesion('otra.docente@lectoaventura.test', 'DOCENTE');
    await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(otra.token)).expect(404);
    await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(otra.token)).send({ alias: 'Xavi', anioNacimiento: 2017, mesNacimiento: 1, avatar: 'koala' }).expect(404);
    expect((await t.http().get(`${API}/aulas`).set(bearer(otra.token)).expect(200)).body).toEqual([]);
    await t.http().get(`${API}/aulas/no-es-un-id`).set(bearer(otra.token)).expect(404);

    const familia = await cuentaConSesion('familia.curiosa@lectoaventura.test', 'FAMILIAR');
    await t.http().get(`${API}/aulas`).set(bearer(familia.token)).expect(403);

    const detalle = await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(docente.token)).expect(200);
    expect(detalle.body.estudiantes.map((e: { alias: string }) => e.alias)).toEqual(['Ana', 'Mateo']);
    expect(detalle.body.estudiantes[0]).toMatchObject({ bloqueado: false, familiaresVinculados: 0 });
  });
});

describe('Tarjetas de acceso en PDF (RF-017, CR-01)', () => {
  it('el PDF trae un PIN nuevo por estudiante que sirve para entrar desde la tablet del aula', async () => {
    const r = await t.http()
      .post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`)
      .set(bearer(docente.token))
      .send({ estudianteIds: [mateoId, anaId] })
      .buffer(true)
      .parse(binario)
      .expect(200);

    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('attachment; filename="tarjetas-3-b.pdf"');
    expect(r.headers['cache-control']).toBe('no-store');
    const [pinAna, pinMateo] = pinesDelPdf(r.body as Buffer);
    expect(pinMateo).toMatch(/^\d{4}$/);

    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet 1' }).expect(201)).body
      .tokenDispositivo as string;
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: mateoId, pin: pinMateo }).expect(200);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: anaId, pin: pinAna }).expect(200);

    // RF-077: imprimir cambia PIN, así que queda auditado.
    expect(await t.prisma.auditoria.findFirstOrThrow({ where: { accion: 'TARJETAS_ACCESO_GENERADAS', recursoId: aulaId } })).toMatchObject({
      actorId: docente.id, actorRol: 'DOCENTE', datos: expect.objectContaining({ cantidad: 2 }),
    });

    // Reimprimir invalida la tarjeta anterior.
    const otra = await t.http().post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`).set(bearer(docente.token)).send({ estudianteIds: [mateoId] }).buffer(true).parse(binario).expect(200);
    const [nuevo] = pinesDelPdf(otra.body as Buffer);
    if (nuevo !== pinMateo) {
      await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: mateoId, pin: pinMateo }).expect(401);
    }
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: mateoId, pin: nuevo }).expect(200);
  });

  it('pide estudiantes del aula', async () => {
    const r = await t.http().post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`).set(bearer(docente.token)).send({ estudianteIds: [uuidV7()] }).expect(400);
    expect(r.body.detail).toMatch(/al menos un estudiante/);
    await t.http().post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`).set(bearer(docente.token)).send({ estudianteIds: [] }).expect(400);
  });
});

describe('Asignaciones (RF-018)', () => {
  let asignacionId: string;

  it('el catálogo muestra solo lo publicado: lecturas y misiones', async () => {
    catalogo = await sembrarCatalogo();
    const r = await t.http().get(`${API}/aulas/${aulaId}/asignaciones/catalogo`).set(bearer(docente.token)).expect(200);
    expect(r.body).toEqual({
      lecturas: [{ id: catalogo.lecturaId, tipo: 'LECTURA', titulo: 'El zorro y la luna', detalle: '8–9 años · nivel 2' }],
      misiones: [{ id: catalogo.misionId, tipo: 'MISION', titulo: 'El mapa perdido', detalle: 'Mundo 1 · Explorador · 8–9 años' }],
    });
  });

  it('asigna a toda el aula con fecha límite; se guarda con su estado y sin destinatarios', async () => {
    const r = await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send({
      tipo: 'LECTURA', contenidoId: catalogo.lecturaId, fechaLimite: diaLima(7),
    }).expect(201);
    asignacionId = r.body.id;
    expect(r.body).toMatchObject({ titulo: 'El zorro y la luna', paraTodaElAula: true, estado: 'ACTIVA', fechaInicio: diaLima(), fechaLimite: diaLima(7) });

    const fila = await t.prisma.asignacion.findUniqueOrThrow({ where: { id: asignacionId }, include: { destinatarios: true } });
    expect(fila).toMatchObject({ tipo: 'LECTURA', lecturaId: catalogo.lecturaId, misionId: null, estado: 'ACTIVA', paraTodaElAula: true, destinatarios: [] });
    expect(fila.fechaLimite.toISOString()).toBe(`${diaLima(8)}T04:59:59.999Z`);
  });

  it('asigna una misión solo a Ana; los destinatarios quedan en su tabla', async () => {
    const r = await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send({
      tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(3), estudianteIds: [anaId],
    }).expect(201);
    expect(r.body.estudiantes).toEqual([{ id: anaId, alias: 'Ana', avatar: 'zorro' }]);
    expect(await t.prisma.asignacionDestinatario.findMany({ where: { asignacionId: r.body.id } })).toEqual([{ asignacionId: r.body.id, estudianteId: anaId }]);
  });

  it('rechaza borradores, repetidos, fechas imposibles y estudiantes ajenos', async () => {
    const enviar = (cuerpo: object) => t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send(cuerpo);
    expect((await enviar({ tipo: 'LECTURA', contenidoId: catalogo.borradorId, fechaLimite: diaLima(5) }).expect(404)).body.detail).toMatch(/no está disponible/);
    expect((await enviar({ tipo: 'LECTURA', contenidoId: catalogo.lecturaId, fechaLimite: diaLima(9) }).expect(409)).body.detail).toMatch(/ya tiene/);
    expect((await enviar({ tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(-1) }).expect(400)).body.detail).toMatch(/igual o posterior/);
    expect((await enviar({ tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: '15/10/2026' }).expect(400)).body.detail).toMatch(/AAAA-MM-DD/);
    await enviar({ tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(3), estudianteIds: [uuidV7()] }).expect(400);
    await enviar({ tipo: 'VIDEO', contenidoId: catalogo.misionId, fechaLimite: diaLima(3) }).expect(400);
  });

  it('"Misión del docente": cada estudiante ve en su aventura lo que le toca', async () => {
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet 2' }).expect(201)).body
      .tokenDispositivo as string;
    const entrar = async (perfilId: string) => {
      await t.http().post(`${API}/estudiantes/${perfilId}/pin/restablecer`).set(bearer(docente.token)).send({ pinNuevo: '4826' }).expect(200);
      return (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId, pin: '4826' }).expect(200)).body.accessToken as string;
    };

    const mateo = await entrar(mateoId);
    const ana = await entrar(anaId);
    expect((await t.http().get(`${API}/yo/asignaciones`).set(bearer(mateo)).expect(200)).body).toEqual([
      { id: asignacionId, tipo: 'LECTURA', contenidoId: catalogo.lecturaId, titulo: 'El zorro y la luna', fechaLimite: diaLima(7), aula: '3.° B' },
    ]);
    expect((await t.http().get(`${API}/yo/asignaciones`).set(bearer(ana)).expect(200)).body.map((a: { titulo: string }) => a.titulo)).toEqual([
      'El mapa perdido', 'El zorro y la luna',
    ]);

    // Cerrada por la docente, desaparece de la aventura y figura como CERRADA en su lista.
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones/${asignacionId}/cerrar`).set(bearer(docente.token)).expect(200);
    expect((await t.http().get(`${API}/yo/asignaciones`).set(bearer(mateo)).expect(200)).body).toEqual([]);
    const lista = await t.http().get(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).expect(200);
    expect(lista.body.map((a: { titulo: string; estado: string }) => [a.titulo, a.estado])).toEqual([
      ['El mapa perdido', 'ACTIVA'],
      ['El zorro y la luna', 'CERRADA'],
    ]);

    // Un adulto no consulta "mis asignaciones" de estudiante.
    await t.http().get(`${API}/yo/asignaciones`).set(bearer(docente.token)).expect(403);
  });

  it('el paso del tiempo vence la asignación en la base al consultarla', async () => {
    const fila = await t.prisma.asignacion.findFirstOrThrow({ where: { aulaId, tipo: 'MISION' } });
    await t.prisma.asignacion.update({
      where: { id: fila.id },
      data: { fechaInicio: new Date(Date.now() - 5 * 86_400_000), fechaLimite: new Date(Date.now() - 86_400_000) },
    });
    const lista = await t.http().get(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).expect(200);
    expect(lista.body.find((a: { id: string }) => a.id === fila.id).estado).toBe('VENCIDA');
    expect((await t.prisma.asignacion.findUniqueOrThrow({ where: { id: fila.id } })).estado).toBe('VENCIDA');
  });
});

describe('Invitación familiar (RF-019)', () => {
  let familia: { id: string; token: string };
  let codigo: string;

  it('la docente genera un código de un solo uso; en la base solo queda su huella', async () => {
    const r = await t.http().post(`${API}/estudiantes/${mateoId}/invitaciones-familiar`).set(bearer(docente.token)).expect(201);
    codigo = r.body.codigo;
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.body).toMatchObject({ estudiante: { id: mateoId, alias: 'Mateo', avatar: 'leon' }, aula: { id: aulaId, nombre: '3.° B' } });
    expect(new Date(r.body.expiraEn).getTime() - Date.now()).toBeGreaterThan(7 * 86_400_000 - 60_000);

    const fila = await t.prisma.invitacionFamiliar.findFirstOrThrow({ where: { estudianteId: mateoId } });
    expect(fila.hashCodigo).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fila.hashCodigo).not.toContain(codigo.replace('-', ''));
    expect(await t.prisma.auditoria.count({ where: { accion: 'INVITACION_FAMILIAR_GENERADA', recursoId: mateoId, actorId: docente.id } })).toBe(1);
  });

  it('RN-17: otra docente no invita a sus familias (404); una familia no genera códigos (403)', async () => {
    const otra = await cuentaConSesion('tercera.docente@lectoaventura.test', 'DOCENTE');
    await t.http().post(`${API}/estudiantes/${mateoId}/invitaciones-familiar`).set(bearer(otra.token)).expect(404);
    familia = await cuentaConSesion('mama.mateo@lectoaventura.test', 'FAMILIAR');
    await t.http().post(`${API}/estudiantes/${mateoId}/invitaciones-familiar`).set(bearer(familia.token)).expect(403);
  });

  it('la familia canjea el código: queda vinculada, auditada con su IP y lo ve en su panel', async () => {
    const r = await t.http().post(`${API}/familia/vincular`).set(bearer(familia.token)).set('X-Forwarded-For', '203.0.113.7')
      .send({ codigo: codigo.toLowerCase() }).expect(201);
    expect(r.body).toEqual({ estudiante: { id: mateoId, alias: 'Mateo', avatar: 'leon' }, aula: '3.° B' });

    expect(await t.prisma.vinculoResponsable.findFirstOrThrow({ where: { perfilId: mateoId } })).toMatchObject({
      cuentaId: familia.id, origen: 'INVITACION_DOCENTE', revocadoEn: null,
    });
    expect(await t.prisma.invitacionFamiliar.findFirstOrThrow({ where: { estudianteId: mateoId } })).toMatchObject({ cuentaFamiliarId: familia.id });
    expect(await t.prisma.auditoria.findFirstOrThrow({ where: { accion: 'FAMILIAR_VINCULADO' } })).toMatchObject({
      actorId: familia.id, actorRol: 'FAMILIAR', recursoTipo: 'perfil_estudiante', recursoId: mateoId, ip: '203.0.113.7',
    });

    const panel = await t.http().get(`${API}/familia/estudiantes`).set(bearer(familia.token)).expect(200);
    expect(panel.body).toEqual([expect.objectContaining({ id: mateoId, alias: 'Mateo', relacion: 'VINCULADO' })]);
    // Solo lo acompaña: no edita su perfil de aula.
    await t.http().patch(`${API}/familia/estudiantes/${mateoId}`).set(bearer(familia.token)).send({ alias: 'Mati' }).expect(404);

    const detalle = await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(docente.token)).expect(200);
    expect(detalle.body.estudiantes.find((e: { id: string }) => e.id === mateoId).familiaresVinculados).toBe(1);
  });

  it('el mismo código no sirve dos veces ni para otra familia; uno inventado responde igual', async () => {
    const papa = await cuentaConSesion('papa.mateo@lectoaventura.test', 'FAMILIAR');
    const reuso = await t.http().post(`${API}/familia/vincular`).set(bearer(papa.token)).set('X-Forwarded-For', '203.0.113.8').send({ codigo }).expect(400);
    const inventado = await t.http().post(`${API}/familia/vincular`).set(bearer(papa.token)).set('X-Forwarded-For', '203.0.113.8').send({ codigo: 'ZZZZ-ZZZZ' }).expect(400);
    expect(reuso.body.detail).toBe(inventado.body.detail);
    expect(reuso.body.detail).toMatch(/no es válido o ya venció/);
  });

  it('desde la tablet de casa, el niño vinculado entra con el PIN de su tarjeta', async () => {
    const casa = (await t.http().post(`${API}/familia/dispositivos`).set(bearer(familia.token)).send({ nombre: 'Tablet de casa' }).expect(201)).body
      .tokenDispositivo as string;
    const contexto = await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', casa).expect(200);
    expect(contexto.body.estudiantes).toEqual([{ id: mateoId, alias: 'Mateo', avatar: 'leon' }]);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: casa, perfilId: mateoId, pin: '4826' }).expect(200);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: casa, perfilId: anaId, pin: '4826' }).expect(403);
  });

  it('limita los intentos de canje por IP (10 por minuto)', async () => {
    // Las demás pruebas amplían el límite (todas salen de 127.0.0.1); aquí se usa el real.
    process.env['LIMITE_TASA_FACTOR'] = '1';
    onTestFinished(() => {
      process.env['LIMITE_TASA_FACTOR'] = '100';
    });
    const intento = () =>
      t.http().post(`${API}/familia/vincular`).set(bearer(familia.token)).set('X-Forwarded-For', '203.0.113.99').send({ codigo: 'AAAA-AAAA' });
    for (let i = 0; i < 10; i++) expect((await intento()).status).toBe(400);
    const bloqueado = await intento();
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers['retry-after']).toBeDefined();
  });
});

describe('Retirar y archivar (RF-020)', () => {
  it('archivar: solo lectura, conserva perfiles, cierra asignaciones y anula invitaciones pendientes', async () => {
    const { codigo } = (await t.http().post(`${API}/estudiantes/${anaId}/invitaciones-familiar`).set(bearer(docente.token)).expect(201)).body;
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send({
      tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(4),
    }).expect(201);

    const r = await t.http().post(`${API}/aulas/${aulaId}/archivar`).set(bearer(docente.token)).expect(200);
    expect(r.body).toMatchObject({ estado: 'ARCHIVADA', totalEstudiantes: 2 });
    expect(await t.prisma.asignacion.count({ where: { aulaId, estado: { in: ['PROGRAMADA', 'ACTIVA'] } } })).toBe(0);
    expect(await t.prisma.perfilEstudiante.count({ where: { id: { in: [mateoId, anaId] }, eliminadoEn: null } })).toBe(2);

    const tia = await cuentaConSesion('tia.ana@lectoaventura.test', 'FAMILIAR');
    await t.http().post(`${API}/familia/vincular`).set(bearer(tia.token)).set('X-Forwarded-For', '203.0.113.20').send({ codigo }).expect(400);

    // Solo lectura: se consulta, pero no se matricula, asigna ni retira.
    await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(docente.token)).expect(200);
    await t.http().get(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).expect(200);
    await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(docente.token)).send({ alias: 'Leo', anioNacimiento: 2017, mesNacimiento: 1, avatar: 'koala' }).expect(409);
    await t.http().delete(`${API}/aulas/${aulaId}/matriculas/${anaId}`).set(bearer(docente.token)).expect(409);
    await t.http().post(`${API}/estudiantes/${anaId}/invitaciones-familiar`).set(bearer(docente.token)).expect(409);
    await t.http().post(`${API}/aulas/${aulaId}/archivar`).set(bearer(docente.token)).expect(409);
  });

  it('retirar a un estudiante de un aula activa lo saca de la lista y de la tablet del aula', async () => {
    const aula = (await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({
      nombre: '4.° A', grado: '4', anioLectivo: ANIO, institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body;
    const leo = (await t.http().post(`${API}/aulas/${aula.id}/matriculas`).set(bearer(docente.token)).send({ alias: 'Leo', anioNacimiento: 2016, mesNacimiento: 2, avatar: 'koala' }).expect(201)).body;
    const tablet = (await t.http().post(`${API}/aulas/${aula.id}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;

    await t.http().delete(`${API}/aulas/${aula.id}/matriculas/${leo.estudianteId}`).set(bearer(docente.token)).expect(200);
    expect((await t.http().get(`${API}/aulas/${aula.id}`).set(bearer(docente.token)).expect(200)).body.estudiantes).toEqual([]);
    expect((await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', tablet).expect(200)).body.estudiantes).toEqual([]);
    await t.http().delete(`${API}/aulas/${aula.id}/matriculas/${leo.estudianteId}`).set(bearer(docente.token)).expect(404);
  });
});
```

Lector de PDF usado por las pruebas (`apps/api/test/support/pdf-texto.ts`):

```ts
import { inflateSync } from 'node:zlib';

/**
 * Textos dibujados en un PDF generado con pdf-lib (fuentes estándar): descomprime cada stream y
 * lee los operadores `Tj`. Sirve para comprobar lo que verá impreso la docente (p. ej. el PIN).
 */
export function textosDelPdf(pdf: Buffer): string[] {
  const textos: string[] = [];
  for (const m of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let datos = Buffer.from(m[1] ?? '', 'latin1');
    try {
      datos = inflateSync(datos);
    } catch {
      // stream sin comprimir
    }
    const contenido = datos.toString('latin1');
    for (const h of contenido.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) textos.push(Buffer.from(h[1] ?? '', 'hex').toString('latin1'));
    for (const p of contenido.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) textos.push(p[1] ?? '');
  }
  return textos;
}

/** Cada tarjeta dibuja su PIN dígito por dígito: reconstruye los PIN en orden de aparición. */
export function pinesDelPdf(pdf: Buffer): string[] {
  const textos = textosDelPdf(pdf);
  const pines: string[] = [];
  for (let i = 0; i + 3 < textos.length; i++) {
    const cuatro = textos.slice(i, i + 4);
    if (textos[i - 1] === 'Mi PIN' && cuatro.every((t) => /^\d$/.test(t))) pines.push(cuatro.join(''));
  }
  return pines;
}
```

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **La docente en la web real:** crea su aula, matricula uno por uno y por CSV (fila rechazada con su motivo), descarga el PDF, activa la tablet y el niño entra con el PIN leído del PDF descargado; el PIN nunca aparece en pantalla.
- **Asignación → "Misión del docente"** en el inicio del niño.
- **Invitación familiar:** el código se lee en pantalla, la familia lo canjea (en minúsculas), lo ve en "Desde su aula", el código no sirve dos veces y el niño entra desde la tablet de casa.
- **Archivar:** el aula queda de solo lectura.
- **Diseño responsivo (RNF-022, RNF-023)** de los paneles nuevos en 1280, 820 y 390 px: sin desbordes y con objetivos táctiles ≥ 48 px (las casillas se miden por su etiqueta).

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:escuela --workspace @lectoaventura/tests-load
```
Al terminar, `support/limpieza.ts` borra las cuentas `@e2e.lectoaventura.test` (con sus aulas, matrículas, asignaciones, invitaciones y vínculos) y el contenido "Prueba E2E".

**Resultado de carga obtenido el 16/10/2026** (sondeo equivalente de 60 s con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API en modo `watch`):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /api/v1/aulas/{id}` con 40 estudiantes, 10 docentes (RNF-003) | 3 671 | 0,00 % | 70 ms | 91 ms | 108 ms | p95 < 1,5 s | ✅ |
| `GET /api/v1/aulas` (RNF-001) | 3 671 | 0,00 % | 44 ms | 57 ms | 66 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `GET /api/v1/aulas/{id}/asignaciones` | 3 671 | 0,00 % | 46 ms | 60 ms | 70 ms | p95 < 300 ms | ✅ |
| `GET /api/v1/yo/asignaciones`, 10 niños (RNF-001) | 10 466 | 0,00 % | 56 ms | 73 ms | 85 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `POST /api/v1/aulas/{id}/tarjetas-acceso.pdf` (8 PIN con Argon2id + PDF), cada 5 s | 10 | 0,00 % | 1 456 ms | 1 697 ms | 1 697 ms | sin meta en el SRS | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/escuela/modo-escuela.spec.ts`:

```ts
import { expect, test as base } from '@playwright/test';

import {
  abrirAula,
  diaLima,
  docenteConAula,
  PIN_PRUEBA,
  pinesDeLaDescarga,
  sembrarCatalogoE2E,
  sesionApi,
  tabletDelAulaActivada,
} from '../../support/escuela';
import {
  cuentaVerificada,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  salirDelPanel,
} from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Modo escuela de punta a punta (RF-014 a RF-020) en escritorio, tablet y celular:
 * la docente usa la web real y los niños entran desde la tablet, como en el aula.
 */
test.describe('Modo escuela (RF-014 a RF-020)', () => {
  test('la docente crea su aula, matricula, descarga las tarjetas y el niño entra con el PIN impreso', async ({ page, request }) => {
    const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
    await ingresarComoAdulto(page, docente.email, docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/);

    // RF-014: crear el aula con el consentimiento institucional.
    await page.getByRole('button', { name: '+ Nueva aula' }).click();
    await page.getByLabel('Nombre del aula').fill('3.° B');
    await page.getByLabel('Institución educativa').fill('IE 1234 Santa Rosa');
    await page.getByLabel('Autoridad que firmó el consentimiento').fill('Directora Ruiz');
    await expect(page.getByRole('button', { name: 'Crear aula' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /Declaro que la institución/ }).check();
    await page.getByRole('button', { name: 'Crear aula' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '3.° B' })).toBeVisible();

    // RF-015: uno por uno, sin apellidos, documento ni foto.
    await page.getByLabel('Alias del estudiante').fill('Mateo');
    await page.getByRole('button', { name: 'León', exact: true }).click();
    await page.getByRole('button', { name: 'Matricular', exact: true }).click();
    await expect(page.getByText(/Matriculados: Mateo/)).toBeVisible();

    // RF-016: CSV con una fila rechazada y su motivo.
    await page.getByRole('button', { name: 'Varios con CSV' }).click();
    await page.getByLabel('Contenido del CSV').fill('alias,año,mes,avatar\nAna,2017,3,buho\nRita,2017,13,panda');
    await page.getByRole('button', { name: 'Matricular desde el CSV' }).click();
    await expect(page.getByRole('cell', { name: 'Rita,2017,13,panda' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Estudiantes (2/45)' })).toBeVisible();

    // RF-017: el PDF trae un PIN por tarjeta; el PIN no aparece en pantalla.
    await page.getByRole('checkbox', { name: 'Elegir a todos' }).check();
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar tarjetas (2)' }).click(),
    ]);
    expect(descarga.suggestedFilename()).toBe('tarjetas-3-b.pdf');
    const [pinAna, pinMateo] = await pinesDeLaDescarga(descarga);
    expect(pinMateo).toMatch(/^\d{4}$/);
    await expect(page.getByText(/Tarjetas listas \(2\)/)).toBeVisible();
    await expect(page.getByText(pinMateo as string, { exact: true })).toHaveCount(0);

    // CR-01: la docente activa la tablet del aula y Mateo entra con el PIN de su tarjeta.
    await page.getByRole('link', { name: 'Mis aulas' }).first().click();
    await page.getByRole('button', { name: 'Activar esta tablet para 3.° B' }).click();
    await page.getByRole('button', { name: 'Dejar la tablet lista para los niños' }).click();
    await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toBeVisible();
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, pinMateo as string);
    await esperarAreaEstudiante(page, 'Mateo');
    expect(pinAna).toMatch(/^\d{4}$/);
  });

  test('la docente deja una lectura y el niño la ve en su inicio como "Misión del docente"', async ({ page, request }) => {
    const { lectura } = await sembrarCatalogoE2E();
    const aula = await docenteConAula(request, [{ alias: 'Lucía', avatar: 'zorro' }]);

    await abrirAula(page, aula);
    await page.getByRole('button', { name: '+ Nueva asignación' }).click();
    await page.getByLabel('Lectura', { exact: true }).selectOption({ label: `${lectura} — 8–9 años · nivel 2` });
    await page.getByLabel('Fecha límite').fill(diaLima(7));
    await page.getByRole('button', { name: 'Asignar', exact: true }).click();
    const asignacion = page.getByRole('listitem').filter({ hasText: lectura });
    await expect(asignacion.getByText('En curso')).toBeVisible();
    await expect(asignacion.getByText('Toda el aula')).toBeVisible();
    await salirDelPanel(page);

    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Lucía' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Lucía');
    const misiones = page.getByRole('region', { name: 'Misiones de tu profe' });
    await expect(misiones.getByText('Misión del docente')).toBeVisible();
    await expect(misiones.getByText(lectura)).toBeVisible();
  });

  test('la familia se vincula con el código de la docente y el niño entra desde la tablet de casa', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await abrirAula(page, aula);

    // RF-019: el código se ve una sola vez, listo para anotarlo.
    await page.getByRole('button', { name: 'Invitar a la familia de Mateo' }).click();
    const caja = page.getByRole('region', { name: 'Código de invitación para la familia de Mateo' });
    const codigo = (await caja.locator('.invitacion__codigo').innerText()).trim();
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await salirDelPanel(page);

    const familia = await cuentaVerificada(request, { prefijo: 'familia', nombre: 'Carmen Familia' });
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page).toHaveURL(/\/familia$/);
    await page.getByLabel('Código de la docente').fill(codigo.toLowerCase());
    await page.getByRole('button', { name: 'Usar el código' }).click();
    await expect(page.getByText('¡Listo! Ahora acompañas a Mateo (3.° B) desde tu cuenta.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Desde su aula (1)' })).toBeVisible();

    // El mismo código ya no sirve (un solo uso).
    await page.getByLabel('Código de la docente').fill(codigo);
    await page.getByRole('button', { name: 'Usar el código' }).click();
    await expect(page.getByText(/no es válido o ya venció/)).toBeVisible();

    // RN-04: vinculada la tablet de casa, Mateo entra con su PIN.
    await page.getByRole('button', { name: 'Vincular este dispositivo' }).click();
    await expect(page.getByText('Este dispositivo está vinculado por 30 días')).toBeVisible();
    await salirDelPanel(page);
    await page.goto('/ingresar/estudiante');
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Mateo');

    // La docente ve que su familia ya está vinculada.
    const detalle = await request.get(`/api/v1/aulas/${aula.aulaId}`, { headers: await sesionApi(request, aula.docente) });
    expect((await detalle.json()).estudiantes[0].familiaresVinculados).toBe(1);
  });

  test('al cierre del año la docente archiva el aula y queda solo para consultar', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await abrirAula(page, aula);

    await page.getByRole('button', { name: 'Archivar aula' }).click();
    await page.getByRole('button', { name: 'Sí, archivar 3.° B' }).click();
    await expect(page.getByText('Esta aula está archivada: puedes consultarla, pero ya no se modifica.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Matricular estudiantes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Descargar tarjetas/ })).toHaveCount(0);
    // Ana sigue en la lista de estudiantes del aula (también aparece en el reto de repaso, Módulo 5).
    await expect(page.locator('.alumnos').getByText('Ana', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Mis aulas' }).first().click();
    await expect(page.getByRole('link', { name: 'Abrir 3.° B' }).getByText('Archivada')).toBeVisible();
  });
});
```

`tests/e2e/support/escuela.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { APIRequestContext, Download, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { pinesDelPdf } from '../../../apps/api/test/support/pdf-texto';
import { cuentaVerificada, ingresarComoAdulto } from './iam';

/** Lo que llevan en el título los contenidos de prueba (la limpieza final los borra). */
export const MARCA_CONTENIDO_E2E = 'Prueba E2E';
/** PIN conocido que la docente fija como responsable (RN-03) cuando la prueba no mira el PDF. */
export const PIN_PRUEBA = '4826';

/** Día de Lima (AAAA-MM-DD) a `dias` de hoy: así lo pide el formulario de asignaciones. */
export function diaLima(dias = 0): string {
  return new Date(Date.now() - 5 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
}

export async function sesionApi(request: APIRequestContext, cuenta: { email: string; contrasena: string }): Promise<Record<string, string>> {
  const login = await request.post('/api/v1/auth/login', { data: cuenta });
  expect(login.status(), await login.text()).toBe(200);
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

export interface AulaPreparada {
  docente: { email: string; contrasena: string };
  aulaId: string;
  aula: string;
  /** Id de cada estudiante por su alias. Todos tienen el PIN_PRUEBA. */
  estudiantes: Record<string, string>;
}

/** Docente con su aula y estudiantes, preparados por la API (RF-014, RF-015). */
export async function docenteConAula(
  request: APIRequestContext,
  estudiantes: { alias: string; avatar: string }[],
  aula = '3.° B',
): Promise<AulaPreparada> {
  const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
  const headers = await sesionApi(request, docente);
  const creada = await request.post('/api/v1/aulas', {
    headers,
    data: {
      nombre: aula, grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234 Santa Rosa',
      autoridadConsentimiento: 'Directora Ruiz', declaraConsentimiento: true,
    },
  });
  expect(creada.status(), await creada.text()).toBe(201);
  const aulaId = (await creada.json()).id as string;

  const ids: Record<string, string> = {};
  for (const e of estudiantes) {
    const r = await request.post(`/api/v1/aulas/${aulaId}/matriculas`, { headers, data: { ...e, anioNacimiento: 2017, mesNacimiento: 4 } });
    expect(r.status(), await r.text()).toBe(201);
    ids[e.alias] = (await r.json()).estudianteId;
    const pin = await request.post(`/api/v1/estudiantes/${ids[e.alias]}/pin/restablecer`, { headers, data: { pinNuevo: PIN_PRUEBA } });
    expect(pin.status()).toBe(200);
  }
  return { docente, aulaId, aula, estudiantes: ids };
}

/** CR-01: activa la tablet del aula por la API y la deja así en este navegador. */
export async function tabletDelAulaActivada(page: Page, request: APIRequestContext, preparada: AulaPreparada): Promise<void> {
  const headers = await sesionApi(request, preparada.docente);
  const r = await request.post(`/api/v1/aulas/${preparada.aulaId}/dispositivos`, { headers, data: { nombre: 'Tablet del aula' } });
  expect(r.status(), await r.text()).toBe(201);
  const { tokenDispositivo } = await r.json();
  await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);
}

/** La docente entra a su panel y abre su aula. */
export async function abrirAula(page: Page, preparada: AulaPreparada): Promise<void> {
  await ingresarComoAdulto(page, preparada.docente.email, preparada.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.getByRole('link', { name: `Abrir ${preparada.aula}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: preparada.aula })).toBeVisible();
}

function prisma(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/**
 * Una lectura publicada y una misión para asignar (RF-018). Las publicarán los módulos Biblioteca
 * y Aventura; mientras tanto la prueba las crea marcadas como "Prueba E2E" y la limpieza las borra.
 */
export async function sembrarCatalogoE2E(): Promise<{ lectura: string; mision: string }> {
  const lectura = `${MARCA_CONTENIDO_E2E}: El zorro y la luna`;
  const mision = `${MARCA_CONTENIDO_E2E}: El mapa perdido`;
  const db = prisma();
  try {
    if (!(await db.versionLectura.findFirst({ where: { titulo: lectura, estado: 'PUBLICADO' } }))) {
      const autorId = crypto.randomUUID();
      const creada = await db.lectura.create({ data: { autorId } });
      const version = await db.versionLectura.create({
        data: {
          lecturaId: creada.id, numero: 1, estado: 'PUBLICADO', titulo: lectura, rangoEdad: 'R2', nivelDificultad: 2,
          tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0',
          texto: 'Había una vez un zorro que miraba la luna.', autorId, revisorId: crypto.randomUUID(), publicadaEn: new Date(),
        },
      });
      await db.lectura.update({ where: { id: creada.id }, data: { versionPublicadaId: version.id } });
    }
    if (!(await db.mision.findFirst({ where: { titulo: mision } }))) {
      const mundo = await db.mundo.findUniqueOrThrow({ where: { numero: 5 }, include: { misiones: { select: { orden: true } } } });
      const libre = [20, 19, 18, 17, 16].find((o) => !mundo.misiones.some((m) => m.orden === o)) as number;
      await db.mision.create({ data: { mundoId: mundo.id, rangoEdad: 'R2', orden: libre, titulo: mision } });
    }
    return { lectura, mision };
  } finally {
    await db.$disconnect();
  }
}

/** Borra los contenidos de prueba (lo llama la limpieza final). */
export async function borrarCatalogoE2E(db: PrismaClient): Promise<void> {
  const versiones = await db.versionLectura.findMany({ where: { titulo: { startsWith: MARCA_CONTENIDO_E2E } }, select: { lecturaId: true } });
  await db.lectura.deleteMany({ where: { id: { in: versiones.map((v) => v.lecturaId) } } });
  await db.mision.deleteMany({ where: { titulo: { startsWith: MARCA_CONTENIDO_E2E } } });
}

/** RF-017: los PIN impresos en el PDF descargado, en el orden de las tarjetas (alfabético). */
export async function pinesDeLaDescarga(descarga: Download): Promise<string[]> {
  return pinesDelPdf(await readFile(await descarga.path()));
}
```

`tests/load/scenarios/escuela-panel.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del modo escuela (k6).
 *   RNF-003: panel docente con un aula de 40 estudiantes → p95 < 1,5 s.
 *   RNF-001: lecturas (lista de aulas, "Misión del docente") → p95 < 300 ms y p99 < 800 ms.
 *   RF-017: imprimir una hoja de 8 tarjetas (8 PIN nuevos con Argon2id + PDF) sin errores.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa, sin SMTP).
 * Ejecutar:   k6 run tests/load/scenarios/escuela-panel.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 -e DURACION=30s tests/load/scenarios/escuela-panel.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

export const options = {
  scenarios: {
    panel_docente: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'consultarPanel',
      tags: { escenario: 'panel_docente' },
    },
    mision_estudiante: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'abrirInicioDelNino',
      tags: { escenario: 'mision_estudiante' },
    },
    tarjetas: {
      executor: 'constant-arrival-rate',
      rate: 12,
      timeUnit: '1m',
      duration: __ENV.DURACION || '1m',
      preAllocatedVUs: 2,
      maxVUs: 4,
      exec: 'imprimirTarjetas',
      tags: { escenario: 'tarjetas' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /aulas/{id}}': ['p(95)<1500'],
    'http_req_duration{nombre:GET /aulas}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /yo/asignaciones}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Docente con un aula de 40 estudiantes, tablet activada y un niño con sesión. */
export function setup() {
  const email = `carga.escuela.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '5.° Carga', grado: '5', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const csv = Array.from({ length: 40 }, (_, i) => `Niño ${i + 1},2016,${(i % 12) + 1},${AVATARES[i % 12]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== 40) fail('No se matricularon los 40 estudiantes de carga');

  const { tokenDispositivo } = http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: 'Tablet carga' }), { headers: docente }).json();
  const nino = matriculados[0].estudianteId;
  http.post(`${BASE}/estudiantes/${nino}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
  const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: nino, pin: '4826' }), cabeceras).json();

  return {
    aulaId: aula.id,
    docente,
    estudiante: { Authorization: `Bearer ${ingreso.accessToken}` },
    paraTarjetas: matriculados.slice(1, 9).map((m) => m.estudianteId),
  };
}

export function consultarPanel(datos) {
  const detalle = http.get(`${BASE}/aulas/${datos.aulaId}`, { headers: datos.docente, tags: { nombre: 'GET /aulas/{id}' } });
  check(detalle, { 'detalle con 40 estudiantes': (r) => r.status === 200 && r.json('estudiantes').length === 40 });
  const lista = http.get(`${BASE}/aulas`, { headers: datos.docente, tags: { nombre: 'GET /aulas' } });
  check(lista, { 'lista de aulas 200': (r) => r.status === 200 });
  const asignaciones = http.get(`${BASE}/aulas/${datos.aulaId}/asignaciones`, { headers: datos.docente, tags: { nombre: 'GET /aulas/{id}/asignaciones' } });
  check(asignaciones, { 'asignaciones 200': (r) => r.status === 200 });
}

export function abrirInicioDelNino(datos) {
  const res = http.get(`${BASE}/yo/asignaciones`, { headers: datos.estudiante, tags: { nombre: 'GET /yo/asignaciones' } });
  check(res, { 'misiones del docente 200': (r) => r.status === 200 });
}

export function imprimirTarjetas(datos) {
  const res = http.post(`${BASE}/aulas/${datos.aulaId}/tarjetas-acceso.pdf`, JSON.stringify({ estudianteIds: datos.paraTarjetas }), {
    headers: datos.docente,
    tags: { nombre: 'POST /aulas/{id}/tarjetas-acceso.pdf' },
  });
  check(res, {
    'PDF de tarjetas': (r) => r.status === 200 && r.headers['Content-Type'] === 'application/pdf',
    'sin caché': (r) => r.headers['Cache-Control'] === 'no-store',
  });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@escuela
Característica: Modo escuela de la docente
  Como docente de primaria
  Quiero organizar mi aula en LectoAventura
  Para que mis estudiantes lean lo que les asigno y sus familias les acompañen desde casa

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-014 @RF-015 @RF-016 @camino-feliz @smoke
  Escenario: La docente crea su aula y matricula a sus estudiantes
    Dado que soy una docente con mi cuenta verificada
    Cuando creo el aula "3.° B" declarando el consentimiento de la institución
    Y matriculo a "Mateo" con el avatar "León"
    Y matriculo con un archivo CSV a "Ana" y una fila con el mes 13
    Entonces veo a "Ana" y a "Mateo" en la lista de estudiantes
    Y la fila con el mes 13 aparece rechazada con el motivo "El mes de nacimiento debe estar entre 1 y 12"

  @RF-017 @CR-01 @camino-feliz
  Escenario: El niño entra con el PIN de su tarjeta impresa
    Dado que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando descargo las tarjetas de acceso de mis estudiantes
    Entonces la tarjeta de "Lucía" trae su PIN y ningún código de aula
    Y con la tablet del aula activada, "Lucía" entra con el PIN de su tarjeta

  @RF-018 @camino-feliz
  Escenario: La docente deja una lectura y el niño la ve como misión del docente
    Dado que hay una lectura publicada en la biblioteca
    Y que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando asigno esa lectura a toda el aula con fecha límite dentro de una semana
    Entonces la asignación aparece "En curso" en mi aula
    Y "Lucía" la ve en su inicio como "Misión del docente"

  @RF-019 @seguridad
  Escenario: La familia acompaña al niño con el código de un solo uso de la docente
    Dado que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando genero un código de invitación para la familia de "Lucía"
    Y su familia escribe ese código en su panel
    Entonces la familia ve a "Lucía" en "Desde su aula"
    Y el mismo código ya no sirve para otra familia

  @RF-020
  Escenario: Al cierre del año la docente archiva su aula
    Dado que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando archivo el aula "3.° B"
    Entonces el aula queda "Archivada" y solo se puede consultar
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect } from '@playwright/test';

import {
  abrirAula,
  diaLima,
  docenteConAula,
  PIN_PRUEBA,
  pinesDeLaDescarga,
  sembrarCatalogoE2E,
  tabletDelAulaActivada,
} from '../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos (Step Definitions) de los escenarios del modo escuela en español. */

// ── Aula y matrícula (RF-014, RF-015, RF-016) ─────────────────────────────

Dado('que soy una docente con mi cuenta verificada', async ({ page, request, mundo }) => {
  const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'uat-docente' });
  mundo.email = docente.email;
  mundo.contrasena = docente.contrasena;
  await ingresarComoAdulto(page, docente.email, docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
});

Cuando('creo el aula {string} declarando el consentimiento de la institución', async ({ page }, aula: string) => {
  await page.getByRole('button', { name: '+ Nueva aula' }).click();
  await page.getByLabel('Nombre del aula').fill(aula);
  await page.getByLabel('Institución educativa').fill('IE 1234 Santa Rosa');
  await page.getByLabel('Autoridad que firmó el consentimiento').fill('Directora Ruiz');
  await page.getByRole('checkbox', { name: /Declaro que la institución/ }).check();
  await page.getByRole('button', { name: 'Crear aula' }).click();
  await expect(page.getByRole('heading', { level: 1, name: aula })).toBeVisible();
});

Cuando('matriculo a {string} con el avatar {string}', async ({ page }, alias: string, avatar: string) => {
  await page.getByRole('button', { name: 'Uno por uno' }).click();
  await page.getByLabel('Alias del estudiante').fill(alias);
  await page.getByRole('button', { name: avatar, exact: true }).click();
  await page.getByRole('button', { name: 'Matricular', exact: true }).click();
  await expect(page.getByText(new RegExp(`Matriculados: ${alias}`))).toBeVisible();
});

Cuando('matriculo con un archivo CSV a {string} y una fila con el mes 13', async ({ page }, alias: string) => {
  await page.getByRole('button', { name: 'Varios con CSV' }).click();
  await page.getByLabel('Contenido del CSV').fill(`alias,año,mes,avatar\n${alias},2017,3,buho\nRita,2017,13,panda`);
  await page.getByRole('button', { name: 'Matricular desde el CSV' }).click();
});

Entonces('veo a {string} y a {string} en la lista de estudiantes', async ({ page }, a: string, b: string) => {
  const lista = page.getByRole('heading', { name: /Estudiantes \(2\/45\)/ });
  await expect(lista).toBeVisible();
  for (const alias of [a, b]) {
    await expect(page.getByRole('button', { name: `Retirar a ${alias} del aula` })).toBeVisible();
  }
});

Entonces('la fila con el mes 13 aparece rechazada con el motivo {string}', async ({ page }, motivo: string) => {
  const fila = page.getByRole('row').filter({ hasText: 'Rita,2017,13,panda' });
  await expect(fila.getByRole('cell', { name: motivo })).toBeVisible();
});

// ── Tarjetas de acceso (RF-017, CR-01) ────────────────────────────────────

Dado('que soy una docente con el aula {string} y la estudiante {string}', async ({ request, mundo }, aula: string, alias: string) => {
  mundo.aula = await docenteConAula(request, [{ alias, avatar: 'zorro' }], aula);
});

Cuando('descargo las tarjetas de acceso de mis estudiantes', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('checkbox', { name: 'Elegir a todos' }).check();
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar tarjetas \(1\)/ }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^tarjetas-.*\.pdf$/);
  mundo.pines = await pinesDeLaDescarga(descarga);
});

Entonces('la tarjeta de {string} trae su PIN y ningún código de aula', async ({ page, mundo }, alias: string) => {
  // El aula tiene un solo estudiante: su tarjeta es la única de la hoja.
  expect(Object.keys(mundo.aula!.estudiantes)).toEqual([alias]);
  expect(mundo.pines).toHaveLength(1);
  expect(mundo.pines![0]).toMatch(/^\d{4}$/);
  // El PIN solo existe en la tarjeta impresa: nunca en pantalla.
  await expect(page.getByText(mundo.pines![0] as string, { exact: true })).toHaveCount(0);
});

Entonces('con la tablet del aula activada, {string} entra con el PIN de su tarjeta', async ({ page, request, mundo }, alias: string) => {
  await salirDelPanel(page);
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await page.goto('/');
  await page.getByRole('button', { name: alias }).click();
  await escribirPin(page, mundo.pines![0] as string);
  await esperarAreaEstudiante(page, alias);
});

// ── Asignaciones (RF-018) ─────────────────────────────────────────────────

Dado('que hay una lectura publicada en la biblioteca', async ({ mundo }) => {
  mundo.lectura = (await sembrarCatalogoE2E()).lectura;
});

Cuando('asigno esa lectura a toda el aula con fecha límite dentro de una semana', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('button', { name: '+ Nueva asignación' }).click();
  await page.getByLabel('Lectura', { exact: true }).selectOption({ label: `${mundo.lectura} — 8–9 años · nivel 2` });
  await page.getByLabel('Fecha límite').fill(diaLima(7));
  await page.getByRole('button', { name: 'Asignar', exact: true }).click();
});

Entonces('la asignación aparece {string} en mi aula', async ({ page, mundo }, estado: string) => {
  await expect(page.getByRole('listitem').filter({ hasText: mundo.lectura }).getByText(estado)).toBeVisible();
});

Entonces('{string} la ve en su inicio como {string}', async ({ page, request, mundo }, alias: string, sello: string) => {
  await salirDelPanel(page);
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await page.goto('/');
  await page.getByRole('button', { name: alias }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, alias);
  const misiones = page.getByRole('region', { name: 'Misiones de tu profe' });
  await expect(misiones.getByText(sello)).toBeVisible();
  await expect(misiones.getByText(mundo.lectura!)).toBeVisible();
});

// ── Invitación familiar (RF-019) ──────────────────────────────────────────

Cuando('genero un código de invitación para la familia de {string}', async ({ page, mundo }, alias: string) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('button', { name: `Invitar a la familia de ${alias}` }).click();
  const caja = page.getByRole('region', { name: `Código de invitación para la familia de ${alias}` });
  mundo.codigo = (await caja.locator('.invitacion__codigo').innerText()).trim();
  expect(mundo.codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await salirDelPanel(page);
});

Cuando('su familia escribe ese código en su panel', async ({ page, request, mundo }) => {
  const familia = await cuentaVerificada(request, { prefijo: 'uat-familia', nombre: 'Carmen Familia' });
  await ingresarComoAdulto(page, familia.email, familia.contrasena);
  await expect(page).toHaveURL(/\/familia$/);
  await page.getByLabel('Código de la docente').fill(mundo.codigo!);
  await page.getByRole('button', { name: 'Usar el código' }).click();
});

Entonces('la familia ve a {string} en {string}', async ({ page }, alias: string, seccion: string) => {
  await expect(page.getByText(`¡Listo! Ahora acompañas a ${alias}`)).toBeVisible();
  const tarjeta = page.getByRole('heading', { name: new RegExp(seccion) }).locator('xpath=ancestor::section[1]');
  await expect(tarjeta.getByRole('heading', { name: alias })).toBeVisible();
});

Entonces('el mismo código ya no sirve para otra familia', async ({ page, request, mundo }) => {
  await salirDelPanel(page);
  const otra = await cuentaVerificada(request, { prefijo: 'uat-otra', nombre: 'Otra Familia' });
  await ingresarComoAdulto(page, otra.email, otra.contrasena);
  await page.getByLabel('Código de la docente').fill(mundo.codigo!);
  await page.getByRole('button', { name: 'Usar el código' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'El código no es válido o ya venció' })).toBeVisible();
});

// ── Archivar (RF-020) ─────────────────────────────────────────────────────

Cuando('archivo el aula {string}', async ({ page, mundo }, aula: string) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('button', { name: 'Archivar aula' }).click();
  await page.getByRole('button', { name: `Sí, archivar ${aula}` }).click();
});

Entonces('el aula queda {string} y solo se puede consultar', async ({ page }, estado: string) => {
  await expect(page.getByText('Esta aula está archivada: puedes consultarla, pero ya no se modifica.')).toBeVisible();
  await expect(page.locator('.cabecera-aula').getByText(estado)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Matricular estudiantes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Nueva asignación' })).toHaveCount(0);
});
```

**Checklist manual para el Product Owner / docente evaluador:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Como docente, "Mis aulas → + Nueva aula" | El aula se crea solo si se declara el consentimiento de la institución |
| ☐ | Matricular uno por uno | Solo pide alias, mes y año de nacimiento y avatar; no muestra ningún PIN |
| ☐ | Matricular con un CSV con una fila mal escrita | Matricula las buenas y explica por qué rechazó la otra |
| ☐ | "Descargar tarjetas" e imprimir en A4 | 8 tarjetas por hoja con aula, avatar, alias y PIN; sin código de aula |
| ☐ | Activar la tablet del aula y entrar con el PIN de una tarjeta | El niño entra; una tarjeta vieja ya no sirve |
| ☐ | "+ Nueva asignación" para toda el aula | Aparece "En curso" con su fecha límite; el niño la ve como "Misión del docente" |
| ☐ | "Invitar familia" y canjear el código desde otra cuenta familiar | La familia ve al niño en "Desde su aula"; el código no sirve una segunda vez |
| ☐ | "Archivar aula" | Queda "Archivada", solo para consultar |
| ☐ | Revisar todo en celular, tablet y computadora | Sin desplazarse a los lados; botones fáciles de tocar |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `modo-escuela.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo escuela`. Los servidores MCP recomendados (Playwright, PostgreSQL de solo lectura sobre `lectoaventura_test`, GitHub) y el flujo de auto-reparación están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL es especialmente útil para revisar `admin.auditoria` y `escuela.invitacion_familiar` después de una prueba.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga del modo escuela:

```yaml
      - run: |
          npm run start --workspace @lectoaventura/api &
          npx wait-on -t 120000 http-get://localhost:3001/api/v1/dev/correos
          k6 run -e DURACION=30s tests/load/scenarios/iam-sesiones.js
          k6 run -e DURACION=30s tests/load/scenarios/escuela-panel.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ESC-U-01 | `Aula.crear` / `archivar` (RF-014, RF-020) | Unit | Pos./Neg. | Datos inválidos rechazados; archivada = solo lectura | `npm run test:unit` |
| ESC-U-02 | `PoliticaMatricula` (RF-015) | Unit | Borde | 45 activos; alias + avatar únicos; PIN sin patrones fáciles | `npm run test:unit` |
| ESC-U-03 | `FechaLima` | Unit | Borde | 23:30 en Lima sigue siendo "hoy" aunque en UTC sea mañana; fechas imposibles rechazadas | `npm run test:unit` |
| ESC-U-04 | `Asignacion.estadoEn` (RF-018) | Unit | Borde | PROGRAMADA → ACTIVA a las 00:00 de Lima → VENCIDA a las 23:59:59,999; CERRADA definitiva | `npm run test:unit` |
| ESC-U-05 | `CodigoInvitacion` / `InvitacionFamiliar` (RF-019) | Unit | Borde | 8 caracteres sin ambiguos; vence a los 7 días exactos; un solo uso | `npm run test:unit` |
| ESC-U-06 | `CrearAulaUseCase` (RF-014, RN-01) | Unit | Positivo | Código único con reintento; consentimiento institucional registrado | `npm run test:unit` |
| ESC-U-07 | `MatricularEstudiantesUseCase` (RF-015, RF-016) | Unit | Pos./Neg. | Sin PIN en la respuesta; CSV con encabezado, avatares asignados y filas rechazadas con motivo; 60 filas y cupo | `npm run test:unit` |
| ESC-U-08 | `GenerarTarjetasUseCase` (RF-017) | Unit | Positivo | PIN nuevo por elegido, solo en el PDF; sin código de aula; solo matriculados | `npm run test:unit` |
| ESC-U-09 | `CrearAsignacionUseCase` (RF-018) | Unit | Pos./Neg. | Contenido publicado; destinatarios del aula; sin duplicar abiertas; aula activa | `npm run test:unit` |
| ESC-U-10 | `ListarAsignaciones` / `MisionesDelDocente` (RF-018) | Unit | Borde | En curso primero; estados que cambió el tiempo se guardan; el niño ve solo lo suyo y en curso | `npm run test:unit` |
| ESC-U-11 | `GenerarInvitacionFamiliar` (RF-019, RN-17) | Unit | Pos./Neg. | Solo la huella guardada; 404 a otra docente; 409 aula archivada, 3 pendientes o familia completa | `npm run test:unit` |
| ESC-U-12 | `CanjearInvitacionFamiliar` (RF-019) | Unit | Neg./Borde | Mismo error para usado, vencido, inventado o mal escrito; no se gasta si IAM rechaza; dos canjes simultáneos → uno | `npm run test:unit` |
| ESC-U-13 | `VincularFamiliarUseCase` (IAM, SRS §7) | Unit | Borde | Solo familias activas; sin duplicar; máx. 2 por estudiante y 6 por familia | `npm run test:unit` |
| ESC-U-14 | Tablet de casa con niño vinculado (RN-04) | Unit | Pos./Neg. | La familia vinculada lo ve y lo hace entrar; otra familia no | `npm run test:unit` |
| ESC-U-15 | `PdfLibTarjetas` (RF-017) | Unit | Pos./Borde | A4, 8 por hoja, textos y PIN legibles; alias y aulas largos dentro de la tarjeta; caracteres no soportados reemplazados | `npm run test:unit` |
| ESC-U-16 | `RegistrarAuditoria` (RF-077) | Unit | Borde | Actor, acción, recurso, fecha e IP; IP inválida → desconocida | `npm run test:unit` |
| ESC-I-01 | `POST/GET /api/v1/aulas` (RF-014) | Int | Pos./Neg. | Código con alfabeto sin ambiguos; consentimiento en BD; 400 sin declarar | `npm run test:int` |
| ESC-I-02 | Matrícula uno y CSV (RF-015, RF-016) | Int | Pos./Neg. | Sin PIN; PIN Argon2id en BD; filas rechazadas | `npm run test:int` |
| ESC-I-03 | RN-17 en el modo escuela | Int | Negativo | Otra docente 404; familia 403; id mal formado 404 | `npm run test:int` |
| ESC-I-04 | `POST /aulas/{id}/tarjetas-acceso.pdf` (RF-017) | Int | Positivo | PDF descargable sin caché; el PIN impreso abre la sesión; reimprimir invalida; auditado | `npm run test:int` |
| ESC-I-05 | Asignaciones (RF-018) | Int | Pos./Neg. | Solo lo publicado; columnas según el tipo; destinatarios; 404/409/400; misión del docente; VENCIDA guardada | `npm run test:int` |
| ESC-I-06 | Invitación y vínculo (RF-019) | Int | Pos./Neg./Borde | Huella SHA-256; auditoría con IP; vínculo en `iam.vinculo_responsable`; mismo mensaje; 429 al 11.º intento; tablet de casa | `npm run test:int` |
| ESC-I-07 | Archivar y retirar (RF-020) | Int | Pos./Neg. | 409 al modificar; perfiles conservados; asignaciones cerradas; invitación anulada; retirado fuera de la tablet | `npm run test:int` |
| ESC-I-08 | Logs sin secretos (RNF-031) | Int | Negativo | 0 apariciones de PIN de tarjetas y códigos de invitación | `npm run test:int` |
| ESC-S-01 | Aula → matrícula → PDF → niño entra (RF-014 a RF-017, CR-01) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| ESC-S-02 | Asignación → "Misión del docente" (RF-018) | Sys | Positivo | Aparece en el inicio del niño | `npm run test:e2e` |
| ESC-S-03 | Invitación → familia → tablet de casa (RF-019) | Sys | Pos./Neg. | Vinculada; segundo uso rechazado; el niño entra en casa | `npm run test:e2e` |
| ESC-S-04 | Archivar (RF-020) | Sys | Positivo | Solo lectura, "Archivada" en Mis aulas | `npm run test:e2e` |
| ESC-S-05 | Paneles responsivos (RNF-022, RNF-023) | Sys | Borde | 0 px de desborde y ≥ 48 px en docente y familia | `npm run test:e2e` |
| ESC-S-06 | Carga RNF-003 / RNF-001 | Sys | Rendimiento | Ver §6.3 | `npm run test:escuela --workspace @lectoaventura/tests-load` |
| ESC-A-01..05 | 5 escenarios Gherkin (RF-014 a RF-020) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — casos de uso con puertos e inyección por constructor; reloj, aleatoriedad y huella inyectados.
- **Cobertura unitaria alcanzable** ............. 9/10 — dominio y aplicación de Escuela entre 89 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — Escuela usa IAM por un puerto anticorrupción y el catálogo por el shared-kernel; Contenido y Aventura no conocen a Escuela.
- **Preparación para CI/CD** .................... 9/10 — las suites nuevas entran solas en el pipeline; humo de carga k6 agregado.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — un solo uso con canje atómico, horarios de Lima, aulas archivadas y límites cubiertos; pendiente quitar vínculos desde la interfaz.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
