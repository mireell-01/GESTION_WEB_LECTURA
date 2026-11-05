<!-- Generado con node docs/pruebas/construir.mjs desde 12-administracion-plan-de-pruebas.plantilla.md. No editar a mano. -->
# Plan Maestro de Pruebas — Módulo 12: Administración de la plataforma

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/administracion`, con cambios en IAM, Escuela, Gamificación y Reporting. En la web, el backoffice de la administración:
> - Instituciones;
> - Docentes;
> - Auditoría;
> - Gamificación.
>
> Además, la sugerencia de instituciones al crear un aula.
>
> **Requisitos cubiertos:** RF-076 a RF-078, RN-17, RF-011 (verificación en dos pasos para todo el backoffice), RNF-001, RNF-022 y RNF-023, y la auditoría que pide el SRS §8 (accesos, PIN, consentimientos, exportaciones, eliminaciones, publicaciones y cambios de cuentas)
> **Fecha de ejecución:** 01/11/2026 · **Resultado global:** ✅ 1127 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 a 11 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 12 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 666 | 35 | ✅ 666/666 · cobertura 98,2 % líneas / 94,0 % ramas | 71 s |
| 2 · Integración (Supertest + PostgreSQL real) | 207 | 17 | ✅ 207/207 | 298 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 185 | 21 | ✅ 185/185 en una sola corrida completa contra la compilación de producción (+ 4 omitidas a propósito: los tamaños de laptop solo corren en computadora) | 21,2 min |
| 3 · Carga (RNF-001) | 5 mediciones | 5 | ✅ 0 errores en 3525 consultas con 60 000 registros de auditoría · todo en p95 < 100 ms | 30 s |
| 4 · Aceptación (Gherkin en español) | 69 escenarios | 7 | ✅ 69/69 · informe para el Product Owner | 13,0 min |

**Defectos encontrados por las pruebas y corregidos:** 10 · **Brechas con el SRS cerradas:** 12 · **Decisiones documentadas donde el SRS no decía cómo:** 9 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22. Sin tablas nuevas: usa `admin.auditoria`, `escuela.institucion`, `gamificacion.parametro_gamificacion` e `iam.cuenta_adulta`. Migración `20261030000000_administracion_plataforma`: retención de 2 años en el *trigger* de la auditoría e índices por acción y por recurso |
| IP de cada acción | `AsyncLocalStorage` de Node (contexto de la solicitud, sin dependencias nuevas) |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` (sin dependencias nuevas) |

## 1.2 Mapa de dependencias del módulo

```
interface  AdministracionController (/admin/instituciones, /admin/docentes, /admin/auditoria,
           /admin/parametros-gamificacion: ADMIN_PLATAFORMA con MFA)
           AuditoriaAccesosInterceptor (global): audita los endpoints marcados con @Auditar
   │  usa CasosUsoAdministracion (token CASOS_USO_ADMINISTRACION)
   ▼
application DocentesAdminUseCase · InstitucionesAdminUseCase · ParametrosGamificacionUseCase ·
           AuditoriaUseCase (consultar por páginas, depurar) · RegistrarAuditoriaUseCase
   │  puertos: AuditoriaRepository y la anticorrupción GestionCuentas (IAM), GestionEscuela, GestionGamificacion
   ▼
domain     acciones auditadas (con su nombre) · filtros, cursor y retención de 2 años · Auditoria

infrastructure PrismaAuditoriaRepository · fachadas de IAM, Escuela y Gamificación ·
               AuditoriaSuscripciones (eventos de todos los módulos) · RetencionAuditoria (diaria)

Cambios en otros módulos (por su public-api, sin cruzar fronteras):
  IAM ─────────── AdministrarDocentesUseCase (listar, alta con enlace de 72 h, suspender con sesiones
                  revocadas, reactivar) y cuentaActiva; eventos DocenteDadoDeAlta, CuentaSuspendida y CuentaReactivada
  Escuela ─────── InstitucionesUseCase (registrar, suspender, reactivar, vincular aulas por nombre),
                  resumen de aulas por docente, aula nueva con institución suspendida → 409, código de familia
                  de un aula de docente suspendido → 409 (solo lectura); GET /instituciones para la docente
  Gamificación ── ParametrosAdminUseCase (versiones validadas) y umbrales de insignias versionados
  Reporting ───── @Auditar en el detalle de un estudiante y en el reporte del aula
  shared-kernel ─ contexto de la solicitud (IP) y el decorador @Auditar
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `AuditoriaRepository` | Interna (puerto) | `AuditoriaEnMemoria`, con la regla de la base (inmutable; solo se borra lo de más de 2 años) | **Real**: Prisma y el *trigger* de la base |
| `GestionCuentas`, `GestionEscuela`, `GestionGamificacion` | Anticorrupción | `CuentasFalsas`, `EscuelaFalsa`, `GamificacionFalsa` | **Reales**: las fachadas de IAM, Escuela y Gamificación |
| Casos de uso de IAM, Escuela y Gamificación | De cada módulo | Sus dobles de siempre (`CuentasEnMemoria`, `InstitucionesEnMemoria`, `VersionesEnMemoria`…) | **Reales** |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| D-1 | «I.E. 70001» e «IE 70001» no se reconocían como la misma institución (se podía registrar dos veces) | 1 · Unitarias | Se quitan los puntos y el «°» antes de comparar |
| D-2 | La contraseña aleatoria del alta dependía del largo del token generado | 1 · Unitarias | Se forma con dos tokens opacos |
| D-3 | Gamificación no exportaba su fachada: la administración no habría arrancado | Estático · ESLint | La fachada se exporta en el módulo |
| D-4 | La lista de docentes confiaba en que el repositorio filtrara por rol | 1 · Unitarias | El caso de uso también filtra por rol |
| D-5 | El aviso de suspensión decía «Sus 1 aula queda» | Revisión visual | Singular y plural correctos |
| D-6 | La fecha de la versión vigente terminaba en «p. m..» | Revisión visual | Texto entre paréntesis |
| D-7 | En laptops, el formulario de instituciones dejaba una columna vacía a la derecha | Revisión visual | Los campos llenan la fila (el nombre, más ancho) |
| D-8 | En 1280 px los 5 campos de puntos no cabían en una fila y quedaban desalineados | 3 · Diseño en laptops | Columnas de 150 px alineadas por abajo |
| D-9 | En el celular, el aviso con un correo largo desbordaba la página 25 px | 3 · E2E celular | El texto se parte donde haga falta |
| D-10 | La auditoría filtrada buscaba el nombre de cada actor uno por uno (50 consultas por página) | Carga (p95 183 ms) | Se buscan a la vez: p95 97 ms |

**Brechas con el SRS cerradas (todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-076 | Instituciones | Registrar (nombre, código modular, región), suspender y reactivar, con sus aulas, docentes y estudiantes | U + I + S + UAT + carga |
| B-2 | RF-076 | Alta de docentes | La cuenta nace sin contraseña conocida; el docente la crea con un enlace de 72 horas | U + I + S + UAT |
| B-3 | RF-076 | «Docente suspendido pierde acceso inmediato» | Se revocan todas sus sesiones (cada petición las valida) y no puede volver a ingresar | U + I + S + UAT |
| B-4 | RF-076 | «Sus aulas quedan en solo lectura» | Nadie las cambia (ni con un código de familia); sus estudiantes siguen entrando y leyendo | U + I + S + UAT |
| B-5 | RF-077, SRS §8 | Acciones sensibles sin auditar | Consentimientos, PIN, contraseñas, MFA, exportaciones, eliminaciones, desactivaciones, bloqueos, dispositivos, retiro y archivo, instituciones, cuentas, parámetros, y el acceso al detalle de un estudiante y a los reportes | U + I + S + UAT |
| B-6 | RF-077 | La IP de cada acción | Se toma del contexto de la solicitud (también en los eventos de los demás módulos) | I + S + UAT |
| B-7 | RF-077 | «Permitir consultar» | Por fecha, acción, actor y recurso, de 50 en 50, con el nombre de cada acción y de quién la hizo | U + I + S + UAT + carga |
| B-8 | RF-077 | Retención de 2 años | La base solo deja borrar lo de más de 2 años; un trabajo diario lo borra | U + I |
| B-9 | RF-078 | Pantalla y API de parámetros | Versión completa validada en rango; cada publicación es una versión nueva | U + I + S + UAT |
| B-10 | RF-078 | «Umbrales de insignias» | Versionados como el resto: primera lectura, evidencias y racha | U + I |
| B-11 | SAD §7 | `/admin/instituciones`, `/admin/docentes`, `GET /admin/auditoria`, `PUT /admin/parametros-gamificacion` | Implementados (con el historial de versiones y la lista de acciones) | I + S |
| B-12 | RNF-001 | Tiempos del panel de administración | p95 < 100 ms con 60 000 registros de auditoría | Carga |

**Decisiones de diseño (el SRS no decía cómo):**
- **Docente suspendido (decisión del Product Owner, 30/10/2026):** sus estudiantes siguen entrando y leyendo; sus aulas quedan en solo lectura hasta reactivarlo.
- **Institución suspendida (decisión del Product Owner, 30/10/2026):** solo se marca. Ya no se elige para aulas nuevas; sus docentes se suspenden uno por uno si hace falta.
- **Alta de docentes:** por correo con un enlace de 72 horas, reutilizando la página de crear contraseña. El registro del Módulo 1 no cambia: los docentes también pueden registrarse solos.
- **Instituciones y aulas:** el aula guarda el nombre que escribe la docente (no cambia el formulario del Módulo 2). Al registrar una institución se vinculan las aulas que la nombraban igual; al crear un aula se sugieren las activas.
- **Accesos auditados:** el detalle de un estudiante, el reporte del aula y la propia consulta de la auditoría (`@Auditar`). Si la auditoría de un acceso fallara, el acceso no se niega, pero el error queda registrado.
- **Retención:** la base solo permite borrar registros de más de 2 años; el trabajo diario deja un día de margen por la diferencia de relojes.
- **Parámetros:** una versión publicada nunca se edita. Los umbrales configurables son los de las insignias que se ganan contando; las de nivel y de mundo no tienen umbral.
- **Primera cuenta de administración:** con el comando de desarrollo `npm run cuenta:backoffice -- --rol ADMIN_PLATAFORMA`. En producción se creará al desplegar.
- **Qué se suspende:** solo cuentas docentes, como pide RF-076. Las familias y las cuentas del backoffice no se suspenden desde este panel.

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Auditoría sin partición mensual | Con años de uso la tabla crece | Particionar por mes cuando el volumen lo pida (hoy: p95 < 100 ms con 60 000 registros) |
| Primera administración en producción | El comando actual es solo de desarrollo | Crearla en el despliegue con un comando del servidor (al publicar el hosting) |
| Cuentas del backoffice | Editores y revisores se crean por comando | Agregarlos al panel de la administración |
| Lista de docentes | Muestra hasta 200 (la búsqueda acota) | Paginación cuando haya más docentes |
| Exportar la auditoría | Solo se consulta en pantalla | CSV para revisiones externas |
| Heredadas | Outbox no transaccional; límite de tasa en memoria; *worker* dentro de la API | Ver informes de los Módulos 1 a 11 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Administración usa IAM, Escuela y Gamificación solo por su `public-api` | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` | Node.js 22 | Alta, suspensión, instituciones, parámetros, umbrales, auditoría y retención | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | Todo el flujo con la base real, el *trigger* y la IP | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Las 4 pantallas, la docente suspendida y el diseño en laptops | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/administracion.js`, nuevo) | Binario k6 | Panel de administración con 20 000 registros de auditoría | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 7 escenarios nuevos | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/administracion/{dobles.ts, administracion.spec.ts}
│   ├── unit/iam/aplicacion/administrar-docentes.spec.ts
│   ├── unit/escuela/aplicacion/instituciones.spec.ts      # + InstitucionesEnMemoria en dobles.ts
│   ├── unit/gamificacion/aplicacion/parametros-admin.spec.ts
│   └── integration/administracion/administracion-http.int-spec.ts
├── tests/
│   ├── e2e/
│   │   ├── support/administracion.ts                       # Instituciones de prueba, correo de alta, parámetros
│   │   ├── support/contenido.ts                            # + cuenta de administración con MFA
│   │   ├── support/limpieza.ts                             # + instituciones y versiones de prueba
│   │   ├── specs/administracion/administracion.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts                 # + las 4 pantallas en dispositivos y laptops
│   │   ├── features/administracion/administracion.feature
│   │   └── steps/administracion.steps.ts                   # + fixtures: deshacer parámetros al terminar
│   └── load/
│       ├── sembrar-administracion.mjs
│       └── scenarios/administracion.js
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Docentes (IAM):**
  - el alta, su correo y su enlace de 72 horas (vale a las 71 horas, no a las 72);
  - la suspensión cierra las sesiones y bloquea el ingreso;
  - la reactivación;
  - solo cuentas docentes;
  - la lista sin datos de acceso.
- **Instituciones (Escuela):** comparación de nombres; registro con vínculo de aulas; validaciones y duplicados; conteos sin aulas archivadas; suspender solo la marca; aula nueva con institución suspendida; el código de familia de un aula de un docente suspendido.
- **Parámetros (Gamificación):**
  - validación completa con cada error explicado;
  - se guarda en el formato de la versión 1;
  - umbrales de insignias;
  - publicar aplica desde ese logro: lo ganado no cambia, la lectura siguiente da los puntos nuevos y la insignia sale con el umbral nuevo;
  - una versión inválida no se publica.
- **Auditoría (Administración):**
  - nombres de las acciones;
  - filtros y cursor;
  - IP inválida;
  - páginas sin repetir ni saltar;
  - depurar solo lo de más de 2 años;
  - docentes con sus aulas en solo lectura.

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/administracion/dobles.ts` y los de cada módulo.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```

## 4.4 Código completo del test unitario
`apps/api/test/unit/administracion/administracion.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { Auditoria } from '../../../src/modules/administracion/domain/entities/auditoria';
import { ACCIONES_AUDITADAS, etiquetaAccion } from '../../../src/modules/administracion/domain/services/acciones-auditadas';
import { cursorDe, filtroAuditoria, inicioRetencion, POR_PAGINA } from '../../../src/modules/administracion/domain/services/consulta-auditoria';
import { crearEntornoAdministracion, EntornoAdministracion } from './dobles';

/** Nivel 1 — Administración de la plataforma (RF-076 a RF-078) con dobles. */
const ADMIN = '0192f000-0000-7000-8000-00000000a001';

describe('[Administracion][Core][Fast] Auditoría: dominio (RF-077)', () => {
  it('cada acción auditada tiene su nombre para la administración', () => {
    expect(etiquetaAccion('PIN_RESTABLECIDO')).toBe('PIN restablecido');
    expect(etiquetaAccion('ACCION_ANTIGUA')).toBe('ACCION_ANTIGUA');
    expect(Object.keys(ACCIONES_AUDITADAS)).toEqual(expect.arrayContaining(['CONSENTIMIENTO_OTORGADO', 'DATOS_EXPORTADOS', 'PERFIL_ELIMINADO', 'LECTURA_PUBLICADA', 'CUENTA_SUSPENDIDA', 'DETALLE_ESTUDIANTE_CONSULTADO']));
  });

  it('se conserva 2 años', () => {
    expect(inicioRetencion(new Date('2026-10-30T15:00:00Z'))).toEqual(new Date('2024-10-30T15:00:00Z'));
  });

  it('valida los filtros: fechas de Lima (el día "hasta" completo), acción conocida, actor y página', () => {
    expect(filtroAuditoria({ desde: '2026-10-01', hasta: '2026-10-30' })).toMatchObject({
      desde: new Date('2026-10-01T05:00:00Z'),
      hasta: new Date('2026-10-31T04:59:59.999Z'),
      accion: null,
      antesDe: null,
    });
    expect(() => filtroAuditoria({ desde: '2026-10-30', hasta: '2026-10-01' })).toThrow('anterior a «hasta»');
    expect(() => filtroAuditoria({ desde: 'ayer' })).toThrow('no es válida');
    expect(() => filtroAuditoria({ accion: 'BORRAR_TODO' })).toThrow('no se audita');
    expect(() => filtroAuditoria({ actorId: 'no-es-uuid' })).toThrow('El actor no es válido');
    expect(() => filtroAuditoria({ antesDe: 'basura' })).toThrow('La página pedida no es válida');
    const cursor = cursorDe({ ocurridoEn: new Date('2026-10-30T15:00:00Z'), id: ADMIN });
    expect(filtroAuditoria({ antesDe: cursor }).antesDe).toEqual({ ocurridoEn: new Date('2026-10-30T15:00:00Z'), id: ADMIN });
  });

  it('un registro necesita acción y tipo de recurso', () => {
    const base = { id: 'a', actorId: null, actorRol: null, recursoId: null, ip: null, datos: {}, ocurridoEn: new Date() };
    expect(() => Auditoria.registrar({ ...base, accion: ' ', recursoTipo: 'aula' })).toThrow('la acción y el tipo de recurso');
  });
});

describe('[Administracion][Core][Fast] Auditoría: registrar, consultar y depurar (RF-077)', () => {
  let e: EntornoAdministracion;
  beforeEach(() => {
    e = crearEntornoAdministracion();
  });

  const registrar = (accion: string, minutosAtras: number, extra: Partial<Parameters<EntornoAdministracion['registrar']['ejecutar']>[0]> = {}) =>
    e.registrar.ejecutar({
      actorId: ADMIN,
      actorRol: null,
      accion,
      recursoTipo: 'cuenta_adulta',
      recursoId: 'doc-1',
      ip: '198.51.100.7',
      datos: { evento: 'iam.CuentaSuspendida', agregadoId: 'doc-1', motivo: 'prueba' },
      ocurridoEn: new Date(e.reloj.ahora().getTime() - minutosAtras * 60_000),
      ...extra,
    });

  it('una IP inválida se guarda como desconocida, sin perder el registro', async () => {
    await registrar('CUENTA_SUSPENDIDA', 0, { ip: 'no-es-ip' });
    expect(e.auditoria.filas[0]).toMatchObject({ accion: 'CUENTA_SUSPENDIDA', ip: null });
  });

  it('muestra lo más reciente primero, con el nombre de la acción y de quien la hizo, sin datos repetidos', async () => {
    e.cuentas.adultos.set(ADMIN, { nombre: 'Ana Admin', rol: 'ADMIN_PLATAFORMA' });
    await registrar('CUENTA_SUSPENDIDA', 10);
    await registrar('CUENTA_REACTIVADA', 5);
    await registrar('ESTUDIANTE_BLOQUEADO', 1, { actorId: '0192f000-0000-7000-8000-0000000e5701', actorRol: 'ESTUDIANTE', recursoTipo: 'perfil_estudiante' });
    const { registros, siguiente } = await e.consulta.consultar({});
    expect(siguiente).toBeNull();
    expect(registros.map((r) => r.accion)).toEqual(['ESTUDIANTE_BLOQUEADO', 'CUENTA_REACTIVADA', 'CUENTA_SUSPENDIDA']);
    expect(registros[1]).toMatchObject({
      etiqueta: 'Cuenta reactivada',
      actor: { id: ADMIN, nombre: 'Ana Admin', rol: 'ADMIN_PLATAFORMA' },
      recurso: { tipo: 'cuenta_adulta', id: 'doc-1' },
      ip: '198.51.100.7',
      datos: { motivo: 'prueba' },
    });
    expect(registros[0]?.actor).toEqual({ id: '0192f000-0000-7000-8000-0000000e5701', nombre: null, rol: 'ESTUDIANTE' });
  });

  it('filtra por acción, actor, recurso y fechas', async () => {
    await registrar('CUENTA_SUSPENDIDA', 3 * 24 * 60);
    await registrar('CUENTA_REACTIVADA', 60, { recursoId: 'doc-2' });
    await registrar('CUENTA_SUSPENDIDA', 30, { actorId: null });
    expect((await e.consulta.consultar({ accion: 'CUENTA_SUSPENDIDA' })).registros).toHaveLength(2);
    expect((await e.consulta.consultar({ actorId: ADMIN })).registros).toHaveLength(2);
    expect((await e.consulta.consultar({ recursoTipo: 'cuenta_adulta', recursoId: 'doc-2' })).registros.map((r) => r.accion)).toEqual(['CUENTA_REACTIVADA']);
    expect((await e.consulta.consultar({ desde: '2026-10-30' })).registros).toHaveLength(2);
    expect((await e.consulta.consultar({ hasta: '2026-10-29' })).registros).toHaveLength(1);
  });

  it(`pagina de ${POR_PAGINA} en ${POR_PAGINA}, sin repetir ni saltar registros (aunque compartan la hora)`, async () => {
    for (let i = 0; i < POR_PAGINA + 5; i++) await registrar('CUENTA_SUSPENDIDA', i < 10 ? 5 : i);
    const primera = await e.consulta.consultar({});
    expect(primera.registros).toHaveLength(POR_PAGINA);
    expect(primera.siguiente).not.toBeNull();
    const segunda = await e.consulta.consultar({ antesDe: primera.siguiente as string });
    expect(segunda.registros).toHaveLength(5);
    expect(segunda.siguiente).toBeNull();
    const ids = [...primera.registros, ...segunda.registros].map((r) => r.id);
    expect(new Set(ids).size).toBe(POR_PAGINA + 5);
  });

  it('las acciones para el filtro, con su nombre', () => {
    expect(e.consulta.acciones()).toContainEqual({ accion: 'DATOS_EXPORTADOS', etiqueta: 'Datos de un estudiante exportados' });
  });

  it('depurar borra solo lo que superó los 2 años (con un día de margen)', async () => {
    const dosAnios = 2 * 365 * 24 * 60;
    await registrar('CUENTA_SUSPENDIDA', dosAnios + 3 * 24 * 60); // más de 2 años y 1 día: se borra
    await registrar('CUENTA_SUSPENDIDA', dosAnios + 12 * 60 - 2 * 24 * 60); // aún dentro de la retención
    await registrar('CUENTA_REACTIVADA', 5);
    expect(await e.consulta.depurar(e.reloj.ahora())).toBe(1);
    expect(e.auditoria.filas).toHaveLength(2);
    expect(await e.consulta.depurar(e.reloj.ahora())).toBe(0);
  });
});

describe('[Administracion][Core][Fast] Docentes, instituciones y parámetros (RF-076, RF-078)', () => {
  let e: EntornoAdministracion;
  beforeEach(() => {
    e = crearEntornoAdministracion();
  });

  it('lista cada docente con sus aulas; suspendido con aulas, sus aulas quedan en solo lectura', async () => {
    const rosa = await e.docentes.darDeAlta({ nombre: 'Rosa Pérez', email: 'rosa@ie.pe' }, ADMIN);
    const luis = await e.docentes.darDeAlta({ nombre: 'Luis Ramos', email: 'luis@ie.pe' }, ADMIN);
    e.escuela.aulas.set(rosa.id, { aulas: 2, estudiantes: 41 });
    expect(rosa).toMatchObject({ estado: 'PENDIENTE_VERIFICACION', aulas: 0, aulasEnSoloLectura: false });

    expect(await e.docentes.suspender(rosa.id, ADMIN)).toMatchObject({ estado: 'SUSPENDIDA', aulas: 2, estudiantes: 41, aulasEnSoloLectura: true });
    expect(await e.docentes.suspender(luis.id, ADMIN)).toMatchObject({ estado: 'SUSPENDIDA', aulasEnSoloLectura: false });
    expect((await e.docentes.listar({ estado: 'SUSPENDIDA' })).map((d) => [d.nombre, d.aulasEnSoloLectura])).toEqual([
      ['Rosa Pérez', true],
      ['Luis Ramos', false],
    ]);
    expect(await e.docentes.reactivar(rosa.id, ADMIN)).toMatchObject({ estado: 'ACTIVA', aulasEnSoloLectura: false });
    expect(e.cuentas.acciones).toEqual([`alta:${ADMIN}`, `alta:${ADMIN}`, `suspender:${rosa.id}:${ADMIN}`, `suspender:${luis.id}:${ADMIN}`, `reactivar:${rosa.id}:${ADMIN}`]);
  });

  it('instituciones y parámetros pasan a su módulo con la administradora como actor', async () => {
    const i = await e.instituciones.crear({ nombre: 'IE 70001' }, ADMIN);
    expect(await e.instituciones.cambiarEstado(i.id, 'SUSPENDIDA', ADMIN)).toMatchObject({ estado: 'SUSPENDIDA' });
    expect(await e.instituciones.listar()).toHaveLength(1);
    expect((await e.parametros.publicar({ puntos: {} }, ADMIN)).version).toBe(2);
    expect(e.gamificacion.publicadas).toEqual([{ entrada: { puntos: {} }, adminId: ADMIN }]);
    expect((await e.parametros.vigentes()).version).toBe(1);
    expect(await e.parametros.historial()).toHaveLength(1);
  });
});
```

`apps/api/test/unit/iam/aplicacion/administrar-docentes.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { AdministrarDocentesUseCase } from '../../../../src/modules/iam/application/use-cases/administrar-docentes.use-case';
import { AutenticarAdultoUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-adulto.use-case';
import { RestablecerContrasenaUseCase } from '../../../../src/modules/iam/application/use-cases/restablecer-contrasena.use-case';
import { ValidarAccesoUseCase } from '../../../../src/modules/iam/application/use-cases/validar-acceso.use-case';
import { EnlaceInvalidoError } from '../../../../src/modules/iam/domain/errors/enlace-invalido-error';
import { CuentaSuspendidaError, EmailYaRegistradoError, SesionInvalidaError } from '../../../../src/modules/iam/domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../../../src/modules/iam/domain/events/eventos-iam';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntorno, cuentaActiva, Entorno } from '../dobles';

/** Nivel 1 — RF-076 (Módulo 12): la administración da de alta, suspende y reactiva cuentas docentes. */
const URL_WEB = 'http://localhost:3002';
const ADMIN = 'admin-1';
const CONTRASENA = 'Lectura-Segura-2026';

describe('[IAM][Core][Fast] Gestión de cuentas docentes por la administración (RF-076)', () => {
  let e: Entorno;
  let gestion: AdministrarDocentesUseCase;
  let ingresar: AutenticarAdultoUseCase;
  let restablecer: RestablecerContrasenaUseCase;
  let validar: ValidarAccesoUseCase;

  beforeEach(() => {
    e = crearEntorno();
    gestion = new AdministrarDocentesUseCase(e.cuentas, e.verificaciones, e.hash, e.tokens, e.sesiones, e.correo, e.bus, URL_WEB, e.generarId, e.reloj.ahora);
    ingresar = new AutenticarAdultoUseCase(e.cuentas, e.hash, e.totp, e.emisor);
    restablecer = new RestablecerContrasenaUseCase(e.cuentas, e.verificaciones, e.hash, e.filtradas, e.tokens, e.sesiones, e.bus, e.reloj.ahora);
    validar = new ValidarAccesoUseCase(e.sesiones, e.tokens, e.reloj.ahora);
  });

  const codigoDelCorreo = () => new URL(e.correo.enviados.at(-1)?.enlace as string).searchParams.get('codigo') as string;

  it('alta: la cuenta nace sin contraseña conocida y el docente la crea con un enlace de 72 horas', async () => {
    const d = await gestion.darDeAlta({ nombre: 'Rosa Pérez', email: ' Rosa@IE70001.edu.pe ', adminId: ADMIN });
    expect(d).toMatchObject({ nombre: 'Rosa Pérez', email: 'rosa@ie70001.edu.pe', estado: 'PENDIENTE_VERIFICACION' });
    const [correo] = e.correo.enviados;
    expect(correo).toMatchObject({ para: 'rosa@ie70001.edu.pe', asunto: 'Tu cuenta de docente en LectoAventura' });
    expect(correo?.texto).toContain('vence en 72 horas');
    expect(correo?.enlace).toMatch(/^http:\/\/localhost:3002\/restablecer\?codigo=/);
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_IAM.DOCENTE_DADO_DE_ALTA, agregadoId: d.id, datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA' } });
    await expect(ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rejects.toThrow();

    // 71 horas después todavía sirve; al crear su contraseña su correo queda verificado y ya ingresa.
    e.reloj.avanzarMin(71 * 60);
    await restablecer.ejecutar({ codigo: codigoDelCorreo(), contrasenaNueva: CONTRASENA });
    expect((await gestion.docente(d.id)).estado).toBe('ACTIVA');
    expect((await ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rol).toBe('DOCENTE');
  });

  it('el enlace del alta vence a las 72 horas', async () => {
    await gestion.darDeAlta({ nombre: 'Rosa Pérez', email: 'rosa@ie70001.edu.pe', adminId: ADMIN });
    e.reloj.avanzarMin(72 * 60 + 1);
    await expect(restablecer.ejecutar({ codigo: codigoDelCorreo(), contrasenaNueva: CONTRASENA })).rejects.toThrow(EnlaceInvalidoError);
  });

  it('un correo ya registrado no se da de alta otra vez', async () => {
    await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    await expect(gestion.darDeAlta({ nombre: 'Rosa Pérez', email: 'rosa@ie70001.edu.pe', adminId: ADMIN })).rejects.toThrow(EmailYaRegistradoError);
    expect(e.correo.enviados).toHaveLength(0);
  });

  it('suspender: pierde el acceso al instante (sus sesiones se cierran) y ya no puede ingresar', async () => {
    const cuenta = await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    const sesion = await ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA });
    expect((await validar.ejecutar(sesion.accessToken)).sub).toBe(cuenta.id);

    expect(await gestion.suspender(cuenta.id, ADMIN)).toMatchObject({ estado: 'SUSPENDIDA' });
    await expect(validar.ejecutar(sesion.accessToken)).rejects.toThrow(SesionInvalidaError);
    await expect(ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rejects.toThrow(CuentaSuspendidaError);

    // Suspender de nuevo no cambia nada ni se anuncia dos veces.
    await gestion.suspender(cuenta.id, ADMIN);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_IAM.CUENTA_SUSPENDIDA)).toHaveLength(1);
    expect(e.bus.publicados.at(-1)).toMatchObject({ datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA' } });
  });

  it('reactivar: vuelve a ingresar con su contraseña de siempre', async () => {
    const cuenta = await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    await gestion.suspender(cuenta.id, ADMIN);
    expect(await gestion.reactivar(cuenta.id, ADMIN)).toMatchObject({ estado: 'ACTIVA' });
    expect((await ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rol).toBe('DOCENTE');
    await gestion.reactivar(cuenta.id, ADMIN);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_IAM.CUENTA_REACTIVADA)).toHaveLength(1);
  });

  it('solo cuentas docentes: una familia, un editor o un id inexistente responden como si no existieran', async () => {
    const familia = await cuentaActiva(e, { rol: 'FAMILIAR' });
    const editor = await cuentaActiva(e, { rol: 'EDITOR' });
    for (const id of [familia.id, editor.id, 'no-existe']) {
      await expect(gestion.suspender(id, ADMIN)).rejects.toThrow(NoEncontradoError);
      await expect(gestion.docente(id)).rejects.toThrow('Docente no encontrado');
    }
    expect(familia.estaActiva()).toBe(true);
  });

  it('lista solo docentes, con su estado y sin datos de acceso', async () => {
    const rosa = await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    const luis = await cuentaActiva(e, { email: 'luis@ie70001.edu.pe', rol: 'DOCENTE' });
    await cuentaActiva(e, { rol: 'FAMILIAR' });
    await gestion.suspender(luis.id, ADMIN);
    const todos = await gestion.listar();
    expect(todos.map((d) => d.email).sort()).toEqual(['luis@ie70001.edu.pe', 'rosa@ie70001.edu.pe']);
    expect(Object.keys(todos[0] as object).sort()).toEqual(['creadoEn', 'email', 'estado', 'id', 'nombre']);
    expect((await gestion.listar({ estado: 'SUSPENDIDA' })).map((d) => d.id)).toEqual([luis.id]);
    expect((await gestion.listar({ estado: 'ACTIVA' })).map((d) => d.id)).toEqual([rosa.id]);
  });
});
```

`apps/api/test/unit/escuela/aplicacion/instituciones.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { CrearAulaUseCase } from '../../../../src/modules/escuela/application/use-cases/crear-aula.use-case';
import { InstitucionesUseCase } from '../../../../src/modules/escuela/application/use-cases/instituciones.use-case';
import {
  CanjearInvitacionFamiliarUseCase,
  GenerarInvitacionFamiliarUseCase,
} from '../../../../src/modules/escuela/application/use-cases/invitaciones-familiar.use-case';
import { Aula } from '../../../../src/modules/escuela/domain/entities/aula';
import {
  AulaSoloLecturaError,
  InstitucionInvalidaError,
  InstitucionRepetidaError,
  InstitucionSuspendidaError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { normalizarNombreInstitucion } from '../../../../src/modules/escuela/domain/services/institucion';
import { CodigoAula } from '../../../../src/modules/escuela/domain/value-objects/codigo-aula';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn, InstitucionesEnMemoria } from '../dobles';

/** Nivel 1 — RF-076 (Módulo 12): instituciones, aulas nuevas y aulas de un docente suspendido. */
const ADMIN = 'admin-1';
const DOCENTE = 'doc-1';

describe('[Escuela][Menor][Fast] Instituciones educativas (RF-076)', () => {
  let e: EntornoEscuela;
  let repo: InstitucionesEnMemoria;
  let instituciones: InstitucionesUseCase;
  let crearAula: CrearAulaUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela();
    repo = new InstitucionesEnMemoria(e.aulas, e.matriculas);
    instituciones = new InstitucionesUseCase(repo, e.bus, e.generarId, e.reloj.ahora);
    crearAula = new CrearAulaUseCase(e.aulas, e.identidad, e.bus, e.aleatorio, e.generarId, e.reloj.ahora, instituciones);
  });

  /** Un aula ya creada por una docente con el nombre de institución que escribió. */
  const aulaCon = async (institucion: string, docenteId = DOCENTE) => {
    const aula = Aula.crear({ id: e.generarId(), docenteId, nombre: '3.° B', grado: '3', anioLectivo: 2026, institucion, codigo: CodigoAula.desdePersistencia('ABCDEF'), ahora: e.reloj.ahora() });
    await e.aulas.guardar(aula);
    return aula;
  };
  const nuevaAula = (institucion: string) =>
    crearAula.ejecutar({ docenteId: DOCENTE, nombre: '4.° A', grado: '4', anioLectivo: 2026, institucion, autoridadConsentimiento: 'Dir. Rosa Paz' });

  it('compara nombres sin tildes, mayúsculas, puntos ni espacios de más', () => {
    expect(normalizarNombreInstitucion('  I.E. N.° 70 001  Santa Rosa ')).toBe('ie n 70 001 santa rosa');
    expect(normalizarNombreInstitucion('IE N 70 001 SANTA ROSA')).toBe(normalizarNombreInstitucion('i.e. n° 70 001 santa rosa'));
  });

  it('registra una institución y vincula las aulas que ya la nombraban igual', async () => {
    const igual = await aulaCon('I.E. N.° 70001 Santa Rosa');
    await aulaCon('IE 70002 San Juan');
    const i = await instituciones.crear({ nombre: ' IE  N° 70001   Santa Rosa ', codigoModular: '0234567', region: 'Puno', adminId: ADMIN });
    expect(i).toMatchObject({ nombre: 'IE N° 70001 Santa Rosa', codigoModular: '0234567', region: 'Puno', estado: 'ACTIVA', aulas: 1, docentes: 1, estudiantes: 0 });
    expect(repo.vinculos.get(igual.id)).toBe(i.id);
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_ESCUELA.INSTITUCION_CREADA, agregadoId: i.id, datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA', aulasVinculadas: 1 } });
  });

  it('valida los datos y no repite nombre ni código modular', async () => {
    await instituciones.crear({ nombre: 'IE 70001 Santa Rosa', codigoModular: '0234567', adminId: ADMIN });
    await expect(instituciones.crear({ nombre: 'I.E. 70001 SANTA ROSA', adminId: ADMIN })).rejects.toThrow(InstitucionRepetidaError);
    await expect(instituciones.crear({ nombre: 'IE 70002 San Juan', codigoModular: '0234567', adminId: ADMIN })).rejects.toThrow('código modular');
    await expect(instituciones.crear({ nombre: 'IE', adminId: ADMIN })).rejects.toThrow(InstitucionInvalidaError);
    await expect(instituciones.crear({ nombre: 'IE 70003', codigoModular: '12345', adminId: ADMIN })).rejects.toThrow('7 dígitos');
    await expect(instituciones.crear({ nombre: 'IE 70003', region: 'x'.repeat(61), adminId: ADMIN })).rejects.toThrow('60 caracteres');
  });

  it('cuenta sus aulas activas, sus docentes y sus estudiantes (un aula archivada no cuenta)', async () => {
    const i = await instituciones.crear({ nombre: 'IE 70001 Santa Rosa', adminId: ADMIN });
    const a1 = await aulaCon('IE 70001 Santa Rosa');
    const a2 = await aulaCon('IE 70001 Santa Rosa', 'doc-2');
    const archivada = await aulaCon('IE 70001 Santa Rosa', 'doc-3');
    for (const a of [a1, a2, archivada]) await instituciones.vincularAula(a.id, i.id);
    await estudianteEn(e, a1, 'Mateo');
    await estudianteEn(e, a2, 'Ana');
    await estudianteEn(e, archivada, 'Luis');
    archivada.archivar(e.reloj.ahora());
    expect((await instituciones.listar())[0]).toMatchObject({ aulas: 2, docentes: 2, estudiantes: 2 });
  });

  it('suspender solo la marca: ya no se elige para aulas nuevas; reactivarla la devuelve', async () => {
    const i = await instituciones.crear({ nombre: 'IE 70001 Santa Rosa', adminId: ADMIN });
    await instituciones.crear({ nombre: 'IE 70002 San Juan', adminId: ADMIN });
    expect(await instituciones.cambiarEstado(i.id, 'SUSPENDIDA', ADMIN)).toMatchObject({ estado: 'SUSPENDIDA' });
    await instituciones.cambiarEstado(i.id, 'SUSPENDIDA', ADMIN);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_ESCUELA.INSTITUCION_SUSPENDIDA)).toHaveLength(1);
    expect((await instituciones.activas()).map((x) => x.nombre)).toEqual(['IE 70002 San Juan']);

    await expect(nuevaAula('i.e. 70001 santa rosa')).rejects.toThrow(InstitucionSuspendidaError);
    expect(e.aulas.filas.size).toBe(0);

    await instituciones.cambiarEstado(i.id, 'ACTIVA', ADMIN);
    expect(e.bus.nombres()).toContain(EVENTOS_ESCUELA.INSTITUCION_REACTIVADA);
    const aula = await nuevaAula('IE 70001 Santa Rosa');
    expect(repo.vinculos.get(aula.id)).toBe(i.id);
    await expect(instituciones.cambiarEstado('no-existe', 'ACTIVA', ADMIN)).rejects.toThrow('Institución no encontrada');
  });

  it('un aula con una institución que no está registrada se crea igual, sin vínculo (como hasta ahora)', async () => {
    const aula = await nuevaAula('IE 99999 La Esperanza');
    expect(aula.institucion).toBe('IE 99999 La Esperanza');
    expect(repo.vinculos.size).toBe(0);
  });
});

describe('[Escuela][Core][Fast] Aulas de un docente suspendido: solo lectura (RF-076)', () => {
  it('el código para la familia ya no se puede canjear; nada se gasta ni se vincula', async () => {
    const e = crearEntornoEscuela();
    const generar = new GenerarInvitacionFamiliarUseCase(e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.aleatorio, e.generarId, e.reloj.ahora);
    const canjear = new CanjearInvitacionFamiliarUseCase(e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.reloj.ahora);
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });

    e.identidad.suspendidas.add(DOCENTE);
    await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-1', codigo })).rejects.toThrow(AulaSoloLecturaError);
    expect(e.identidad.vinculos).toEqual([]);
    expect([...e.invitaciones.filas.values()][0]?.usadaEn).toBeNull();

    // Al reactivarla, el mismo código sirve.
    e.identidad.suspendidas.delete(DOCENTE);
    await canjear.ejecutar({ cuentaFamiliarId: 'fam-1', codigo });
    expect(e.identidad.vinculos).toHaveLength(1);
  });
});
```

`apps/api/test/unit/gamificacion/aplicacion/parametros-admin.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import type { ParametrosRepository, VersionParametros } from '../../../../src/modules/gamificacion/application/ports/parametros.repository';
import { ParametrosAdminUseCase } from '../../../../src/modules/gamificacion/application/use-cases/parametros-admin.use-case';
import { EVENTOS_GAMIFICACION } from '../../../../src/modules/gamificacion/domain/events/eventos-gamificacion';
import { leerParametros, PARAMETROS_POR_DEFECTO } from '../../../../src/modules/gamificacion/domain/services/parametros';
import { aJsonParametros, ParametrosInvalidosError, validarParametros } from '../../../../src/modules/gamificacion/domain/services/parametros-editables';
import { aplicarUmbrales } from '../../../../src/modules/gamificacion/domain/services/reglas-insignia';
import { CATALOGO, crearEntornoGamificacion, EntornoGamificacion } from '../dobles';

/** Nivel 1 — RF-078 (Módulo 12): la administración publica versiones nuevas de los parámetros. */
const NINO = 'nino-9';
const ADMIN = 'admin-1';
const CON_UMBRAL = ['PRIMERA_LECTURA', 'DETECTIVE_EVIDENCIAS', 'LECTOR_PERSEVERANTE'];

/** Una versión completa y válida (la del SRS, con un umbral ajustado). */
const editables = () => {
  const { version: _version, ...p } = structuredClone(PARAMETROS_POR_DEFECTO);
  return { ...p, nivelLector: { base: 100 }, insignias: { DETECTIVE_EVIDENCIAS: 3 } };
};

/** Las versiones guardadas, como `parametro_gamificacion`; el repositorio de juego lee la última. */
class VersionesEnMemoria implements ParametrosRepository {
  readonly filas: VersionParametros[] = [{ version: 1, vigenteDesde: new Date('2026-10-01T00:00:00Z'), creadoPor: null, creadoEn: new Date('2026-10-01T00:00:00Z'), parametros: aJsonParametros(editables()) }];
  async versiones() {
    return [...this.filas].sort((a, b) => b.version - a.version);
  }
  async publicar(p: { parametros: Record<string, unknown>; creadoPor: string; ahora: Date }) {
    const version = Math.max(...this.filas.map((f) => f.version)) + 1;
    this.filas.push({ version, vigenteDesde: p.ahora, creadoPor: p.creadoPor, creadoEn: p.ahora, parametros: p.parametros });
    return version;
  }
}

describe('[Gamificacion][Menor][Fast] Validación de una versión nueva (RF-078)', () => {
  it('acepta una versión completa en rango y la guarda en el formato de la versión 1', () => {
    const p = validarParametros(editables(), CON_UMBRAL);
    expect(p.insignias).toEqual({ DETECTIVE_EVIDENCIAS: 3 });
    const json = aJsonParametros(p);
    expect(json['nivelLector']).toEqual({ umbral: '100 * n * (n + 1) / 2' });
    // Lo que se guarda se vuelve a leer igual.
    expect(leerParametros(2, json)).toEqual({ version: 2, ...p });
  });

  it('rechaza valores fuera de rango, faltantes o sin sentido y dice qué corregir', () => {
    const malo = {
      ...editables(),
      puntos: { ...editables().puntos, itemCorrecto: -5, lecturaCompletada: 2.5, racha: {} },
      antiFarming: { porcentajeRepeticion: 120, topeDiario: 5 },
      nivelLector: {},
      respuestasAbiertas: { palabrasMinimasR2: 8, palabrasMinimasR3: 4 },
      insignias: { RANGO_DETECTIVE: 2, PRIMERA_LECTURA: 0 },
    };
    const error = (() => {
      try {
        validarParametros(malo, CON_UMBRAL);
      } catch (e) {
        return e as ParametrosInvalidosError;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(ParametrosInvalidosError);
    expect(error?.detalle?.['errores']).toEqual([
      'los puntos por lectura completada debe ser un número entero entre 0 y 500',
      'los puntos por respuesta correcta debe ser un número entero entre 0 y 500',
      'la racha debe tener entre 1 y 6 bonos',
      'el porcentaje al repetir una lectura debe ser un número entero entre 0 y 100',
      'el tope de puntos por día debe ser un número entero entre 10 y 10000',
      'la base del nivel lector debe ser un número entero entre 10 y 10000',
      'a los 10–12 años se piden al menos tantas palabras como a los 6–9',
      'la insignia RANGO_DETECTIVE no se gana contando y no tiene umbral',
      'el umbral de la insignia PRIMERA_LECTURA debe ser un número entero entre 1 y 1000',
    ]);
    expect(() => validarParametros(null, CON_UMBRAL)).toThrow(ParametrosInvalidosError);
  });

  it('los días de la racha deben ser números', () => {
    const p = editables();
    expect(() => validarParametros({ ...p, puntos: { ...p.puntos, racha: { siete: 30 } } }, CON_UMBRAL)).toThrow('los días de cada bono de racha');
  });
});

describe('[Gamificacion][Menor][Fast] Umbrales de insignias (RF-078)', () => {
  it('cambian lecturas, evidencias o días de racha; las de nivel y de mundo no tienen umbral', () => {
    const ajustado = aplicarUmbrales(CATALOGO, { PRIMERA_LECTURA: 2, DETECTIVE_EVIDENCIAS: 3, LECTOR_PERSEVERANTE: 5, RANGO_DETECTIVE: 9, MAESTRO_INFERENCIAS: 1 });
    expect(ajustado.map((i) => i.regla)).toEqual([
      { tipo: 'LECTURAS', meta: 2 },
      { tipo: 'EVIDENCIAS', meta: 3 },
      { tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' },
      { tipo: 'RACHA', dias: 5 },
      { tipo: 'MUNDO', numero: 2 },
    ]);
    expect(aplicarUmbrales(CATALOGO, {})).toEqual(CATALOGO);
  });

  it('una versión mal guardada (umbral 0 o código raro) se ignora al leerla', () => {
    expect(leerParametros(3, { insignias: { PRIMERA_LECTURA: 0, 'x-y': 3, DETECTIVE_EVIDENCIAS: 4 } }).insignias).toEqual({ DETECTIVE_EVIDENCIAS: 4 });
  });
});

describe('[Gamificacion][Menor][Fast] Publicar parámetros (RF-078): aplica solo a lo que ocurre después', () => {
  let e: EntornoGamificacion;
  let versiones: VersionesEnMemoria;
  let caso: ParametrosAdminUseCase;

  beforeEach(() => {
    e = crearEntornoGamificacion();
    e.identidad.perfiles.set(NINO, { alias: 'Mateo', avatar: 'zorro', rangoEdad: 'R2' });
    versiones = new VersionesEnMemoria();
    caso = new ParametrosAdminUseCase(versiones, e.repo, e.bus, e.reloj.ahora);
    // El juego lee la última versión publicada (como el repositorio real).
    e.repo.parametros = async () => {
      const [ultima] = await versiones.versiones();
      return leerParametros((ultima as VersionParametros).version, ultima?.parametros);
    };
  });

  it('muestra la versión vigente con los umbrales del catálogo y los ajustados', async () => {
    const v = await caso.vigentes();
    expect(v).toMatchObject({ version: 1, creadoPor: null, vigenteDesde: '2026-10-01T00:00:00.000Z' });
    expect(v.parametros.puntos.lecturaCompletada).toBe(20);
    expect(v.insignias).toEqual([
      { codigo: 'PRIMERA_LECTURA', nombre: 'Primera lectura', tipo: 'LECTURAS', umbralCatalogo: 1, umbral: 1 },
      { codigo: 'DETECTIVE_EVIDENCIAS', nombre: 'Detective de Evidencias', tipo: 'EVIDENCIAS', umbralCatalogo: 5, umbral: 3 },
      { codigo: 'LECTOR_PERSEVERANTE', nombre: 'Lector Perseverante', tipo: 'RACHA', umbralCatalogo: 7, umbral: 7 },
    ]);
    expect(v.limites.puntos).toEqual({ min: 0, max: 500 });
  });

  it('cada publicación es una versión nueva, anunciada para la auditoría; lo ya otorgado no cambia', async () => {
    await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
    expect(e.repo.motivos(NINO)).toEqual(['LECTURA_COMPLETADA:20']);

    const p = editables();
    const v = await caso.publicar({ ...p, puntos: { ...p.puntos, lecturaCompletada: 30 } }, ADMIN);
    expect(v).toMatchObject({ version: 2, creadoPor: ADMIN, vigenteDesde: e.reloj.ahora().toISOString() });
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_GAMIFICACION.PARAMETROS_PUBLICADOS, agregadoId: '2', datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA', version: 2 } });
    expect((await caso.historial()).map((h) => [h.version, h.creadoPor])).toEqual([
      [2, ADMIN],
      [1, null],
    ]);

    await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-2', sesionId: 's-2' });
    expect(e.repo.motivos(NINO)).toEqual(['LECTURA_COMPLETADA:20', 'LECTURA_COMPLETADA:30']);
  });

  it('un umbral más bajo se aplica desde el siguiente logro (y el pasaporte lo muestra)', async () => {
    const p = editables();
    await caso.publicar({ ...p, insignias: { DETECTIVE_EVIDENCIAS: 2 } }, ADMIN);
    const evidencia = { estudianteId: NINO, sesionId: 's-1', lecturaId: 'l-1', itemId: 'i-1', habilidad: 'LIT' as const, nivelDificultad: 2, esCorrecta: true, pistasUsadas: 0, puntajeItem: 1, esRepeticion: false, palabras: null, modalidad: 'EVIDENCIA' as const };
    await e.logros.alItem({ ...evidencia, respuestaId: 'r-1' });
    await e.logros.alItem({ ...evidencia, respuestaId: 'r-2' });
    expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toContain('i-detective');
    const detective = (await e.pasaporte.pasaporte(NINO)).insignias.find((i) => i.codigo === 'DETECTIVE_EVIDENCIAS');
    expect(detective).toMatchObject({ ganada: true, meta: 2 });
  });

  it('una versión inválida no se publica', async () => {
    await expect(caso.publicar({ ...editables(), antiFarming: { porcentajeRepeticion: 25, topeDiario: 0 } }, ADMIN)).rejects.toThrow(ParametrosInvalidosError);
    expect(versiones.filas).toHaveLength(1);
    expect(e.bus.publicados).toHaveLength(0);
  });
});
```

`apps/api/test/unit/administracion/dobles.ts`:

```ts
/**
 * Dobles de prueba de Administración (Módulo 12): la auditoría en memoria (con la regla de la base: no
 * se modifica y solo se borra lo de más de 2 años) y las fachadas de IAM, Escuela y Gamificación.
 */
import type { DocenteAdministrado } from '../../../src/modules/iam/public-api';
import type { AulasDeDocente, InstitucionVista } from '../../../src/modules/escuela/public-api';
import type { ParametrosVigentesVista } from '../../../src/modules/gamificacion/public-api';
import type { AuditoriaRepository } from '../../../src/modules/administracion/application/ports/auditoria.repository';
import type { GestionCuentas, GestionEscuela, GestionGamificacion } from '../../../src/modules/administracion/application/ports/plataforma.ports';
import { AuditoriaUseCase, DocentesAdminUseCase, InstitucionesAdminUseCase, ParametrosGamificacionUseCase } from '../../../src/modules/administracion/application/use-cases/plataforma.use-cases';
import { RegistrarAuditoriaUseCase } from '../../../src/modules/administracion/application/use-cases/registrar-auditoria.use-case';
import { Auditoria, AuditoriaProps } from '../../../src/modules/administracion/domain/entities/auditoria';
import { FiltroAuditoria, inicioRetencion } from '../../../src/modules/administracion/domain/services/consulta-auditoria';
import { Reloj } from '../iam/dobles';

export class AuditoriaEnMemoria implements AuditoriaRepository {
  readonly filas: AuditoriaProps[] = [];
  constructor(private readonly ahora: () => Date) {}

  async agregar(r: Auditoria) {
    this.filas.push({ ...r.propsSnapshot });
  }

  async consultar(f: FiltroAuditoria, limite: number) {
    return this.filas
      .filter(
        (r) =>
          (!f.desde || r.ocurridoEn >= f.desde) &&
          (!f.hasta || r.ocurridoEn <= f.hasta) &&
          (!f.accion || r.accion === f.accion) &&
          (!f.actorId || r.actorId === f.actorId) &&
          (!f.recursoTipo || r.recursoTipo === f.recursoTipo) &&
          (!f.recursoId || r.recursoId === f.recursoId) &&
          (!f.antesDe || r.ocurridoEn < f.antesDe.ocurridoEn || (r.ocurridoEn.getTime() === f.antesDe.ocurridoEn.getTime() && r.id < f.antesDe.id)),
      )
      .sort((a, b) => b.ocurridoEn.getTime() - a.ocurridoEn.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limite);
  }

  /** Como el trigger de la base: si alguno no superó los 2 años, no se borra nada. */
  async borrarAnterioresA(limite: Date) {
    const borrar = this.filas.filter((r) => r.ocurridoEn < limite);
    if (borrar.some((r) => r.ocurridoEn >= inicioRetencion(this.ahora()))) throw new Error('La auditoría solo admite agregar registros');
    for (const r of borrar) this.filas.splice(this.filas.indexOf(r), 1);
    return borrar.length;
  }
}

export class CuentasFalsas implements GestionCuentas {
  readonly docentes = new Map<string, DocenteAdministrado>();
  readonly adultos = new Map<string, { nombre: string; rol: string }>();
  readonly acciones: string[] = [];

  async listarDocentes(filtro: { texto?: string; estado?: DocenteAdministrado['estado'] }) {
    return [...this.docentes.values()].filter((d) => !filtro.estado || d.estado === filtro.estado);
  }
  async docente(id: string) {
    const d = this.docentes.get(id);
    if (!d) throw new Error('Docente no encontrado');
    return d;
  }
  async darDeAltaDocente(e: { nombre: string; email: string; adminId: string }) {
    const d: DocenteAdministrado = { id: `doc-${this.docentes.size + 1}`, nombre: e.nombre, email: e.email, estado: 'PENDIENTE_VERIFICACION', creadoEn: '2026-10-30T15:00:00.000Z' };
    this.docentes.set(d.id, d);
    this.acciones.push(`alta:${e.adminId}`);
    return d;
  }
  async suspenderDocente(id: string, adminId: string) {
    const d = await this.docente(id);
    d.estado = 'SUSPENDIDA';
    this.acciones.push(`suspender:${id}:${adminId}`);
    return d;
  }
  async reactivarDocente(id: string, adminId: string) {
    const d = await this.docente(id);
    d.estado = 'ACTIVA';
    this.acciones.push(`reactivar:${id}:${adminId}`);
    return d;
  }
  async actores(ids: string[]) {
    return new Map(ids.filter((id) => this.adultos.has(id)).map((id) => [id, this.adultos.get(id)!]));
  }
}

export class EscuelaFalsa implements GestionEscuela {
  readonly instituciones: InstitucionVista[] = [];
  readonly aulas = new Map<string, AulasDeDocente>();
  async listarInstituciones() {
    return this.instituciones;
  }
  async crearInstitucion(e: { nombre: string; codigoModular?: string | null; region?: string | null; adminId: string }) {
    const i: InstitucionVista = { id: `inst-${this.instituciones.length + 1}`, nombre: e.nombre, codigoModular: e.codigoModular ?? null, region: e.region ?? null, estado: 'ACTIVA', creadaEn: '2026-10-30T15:00:00.000Z', aulas: 0, docentes: 0, estudiantes: 0 };
    this.instituciones.push(i);
    return i;
  }
  async cambiarEstadoInstitucion(id: string, estado: InstitucionVista['estado']) {
    const i = this.instituciones.find((x) => x.id === id)!;
    i.estado = estado;
    return i;
  }
  async aulasDeDocentes(ids: string[]) {
    return new Map(ids.map((id) => [id, this.aulas.get(id) ?? { aulas: 0, estudiantes: 0 }]));
  }
}

export class GamificacionFalsa implements GestionGamificacion {
  readonly publicadas: { entrada: unknown; adminId: string }[] = [];
  async vigentes() {
    return { version: 1 } as ParametrosVigentesVista;
  }
  async historial() {
    return [{ version: 1, vigenteDesde: '2026-10-01T00:00:00.000Z', creadoPor: null }];
  }
  async publicar(entrada: unknown, adminId: string) {
    this.publicadas.push({ entrada, adminId });
    return { version: 2 } as ParametrosVigentesVista;
  }
}

export function crearEntornoAdministracion() {
  let secuencia = 0;
  const reloj = new Reloj(new Date('2026-10-30T15:00:00Z'));
  const auditoria = new AuditoriaEnMemoria(reloj.ahora);
  const cuentas = new CuentasFalsas();
  const escuela = new EscuelaFalsa();
  const gamificacion = new GamificacionFalsa();
  // Ids ordenables como los UUID v7 (hexadecimales crecientes).
  const generarId = () => `0192f000-0000-7000-8000-${String(++secuencia).padStart(12, '0')}`;
  return {
    reloj,
    auditoria,
    cuentas,
    escuela,
    gamificacion,
    docentes: new DocentesAdminUseCase(cuentas, escuela),
    instituciones: new InstitucionesAdminUseCase(escuela),
    parametros: new ParametrosGamificacionUseCase(gamificacion),
    consulta: new AuditoriaUseCase(auditoria, cuentas),
    registrar: new RegistrarAuditoriaUseCase(auditoria, generarId),
  };
}

export type EntornoAdministracion = ReturnType<typeof crearEntornoAdministracion>;
```

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **Instituciones:** registro con el aula vinculada; duplicados y datos inválidos; suspendida, la docente no la ve ni crea aulas en ella (409); reactivada, sí. Solo la administración con MFA (403 sin MFA, 403 docente, 401 sin sesión).
- **Docentes:**
  - alta con el correo y el enlace;
  - suspender: la sesión abierta da 401 y el ingreso 403 «suspendida»; la familia no canjea su código (409); el niño sigue y otro entra en la tablet;
  - reactivar;
  - una familia o un id inexistente dan 404.
- **Auditoría:**
  - suspensiones, PIN, consentimientos, instituciones, altas y reactivaciones, con actor, rol, recurso e IP;
  - el acceso de la docente al detalle (un acceso negado no se registra);
  - consulta por acción, recurso y actor; acciones; 400 por filtros inválidos;
  - páginas de 50;
  - inmutable (ni se edita ni se borra lo reciente) y depuración de lo de más de 2 años.
- **Parámetros:** la versión vigente con sus umbrales; una inválida no se publica (400 con qué corregir). La versión 2 aplica desde ahora: la lectura siguiente da 30 puntos y «Primera lectura» pide 2.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```
Al terminar, la prueba borra las versiones de parámetros que publicó: son catálogo y no se vacían entre archivos.

## 5.4 Código completo del test de integración
`apps/api/test/integration/administracion/administracion-http.int-spec.ts`:

```ts
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../../../src/modules/administracion/application/casos-uso-administracion';
import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { API, ayudantesReporting, bearer, CONTRASENA } from '../reporting/ayudantes';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Administración de la plataforma (RF-076 a RF-078) contra PostgreSQL real:
 * instituciones (suspender solo la marca), cuentas docentes (alta por correo, suspensión con pérdida
 * de acceso inmediata y aulas en solo lectura mientras sus niños siguen leyendo, reactivación),
 * auditoría con IP, filtros, páginas, inmutabilidad y retención de 2 años, y parámetros de
 * gamificación versionados que aplican solo a lo que ocurre después.
 */
let t: AppDePrueba;
let casos: CasosUsoAdministracion;
const { backoffice, adulto, docente, publicarKilla, leerKilla, crearAula } = ayudantesReporting(() => t);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoAdministracion>(CASOS_USO_ADMINISTRACION);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  // Los parámetros son catálogo (no se vacían entre archivos): se deja solo la versión 1.
  await t?.prisma.parametroGamificacion.deleteMany({ where: { version: { gt: 1 } } });
  await t?.cerrar();
});

type Cuenta = { email: string; token: string; id: string };
const IP = '203.0.113.50';

/** Una cuenta de administración con verificación en dos pasos (como todo el backoffice, RF-011). */
async function administrador(conMfa = true): Promise<Cuenta> {
  const email = `admin.${uuidV7().slice(-6)}@lectoaventura.test`;
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: 'Ana Admin', email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol: 'ADMIN_PLATAFORMA', estado: 'ACTIVA' },
  });
  const secreto = authenticator.generateSecret();
  if (conMfa) await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, ...(conMfa ? { codigoMfa: authenticator.generate(secreto) } : {}) }).expect(200);
  return { email, token: login.body.accessToken as string, id: cuenta.id };
}

const ingresar = (email: string) => t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA });
const registros = (accion: string) => t.prisma.auditoria.findMany({ where: { accion }, orderBy: { ocurridoEn: 'asc' } });

let admin: Cuenta;
let rosa: Cuenta;
let carmen: Cuenta;
let killa: { lecturaId: string; o: string[] };
let aulaId: string;
let mateo: string;
let ana: string;
let tablet: string;
let tokenMateo: string;
let tokenAna: string;
let codigoFamilia: string;
let institucionId: string;

describe('[Administracion][Core][Slow] Preparación', () => {
  it('una administradora; Rosa con su aula "4.° A" del "IE 1234"; un código para la familia de Mateo', async () => {
    admin = await administrador();
    killa = await publicarKilla(await backoffice('EDITOR'), await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    carmen = await adulto('Carmen Díaz', 'FAMILIAR');
    await t.http().post(`${API}/consentimientos`).set(bearer(carmen.token)).send({ otorganteNombre: 'Carmen Díaz', aceptaPolitica: true }).expect(201);
    const aula = await crearAula(rosa.token, '4.° A', ['Mateo', 'Ana']);
    aulaId = aula.aulaId;
    mateo = aula.ids['Mateo'] as string;
    ana = aula.ids['Ana'] as string;
    tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(rosa.token)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    for (const id of [mateo, ana]) {
      await t.http().post(`${API}/estudiantes/${id}/pin/restablecer`).set(bearer(rosa.token)).set('X-Forwarded-For', IP).send({ pinNuevo: '4826' }).expect(200);
    }
    const nino = async (id: string) => (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: id, pin: '4826' }).expect(200)).body.accessToken as string;
    tokenMateo = await nino(mateo);
    tokenAna = await nino(ana);
    codigoFamilia = (await t.http().post(`${API}/estudiantes/${mateo}/invitaciones-familiar`).set(bearer(rosa.token)).expect(201)).body.codigo;
  });
});

describe('[Administracion][Core][Slow] RF-076: instituciones', () => {
  const url = `${API}/admin/instituciones`;
  const nuevaAula = (institucion: string) =>
    t.http().post(`${API}/aulas`).set(bearer(rosa.token)).send({ nombre: '5.° B', grado: '5', anioLectivo: new Date().getFullYear(), institucion, autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true });

  it('registra una institución y vincula el aula que ya la nombraba igual', async () => {
    expect((await t.http().get(url).set(bearer(admin.token)).expect(200)).body).toEqual([]);
    const i = (await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'I.E. 1234', codigoModular: '0123456', region: 'Puno' }).expect(201)).body;
    institucionId = i.id;
    expect(i).toMatchObject({ nombre: 'I.E. 1234', codigoModular: '0123456', region: 'Puno', estado: 'ACTIVA', aulas: 1, docentes: 1, estudiantes: 2 });
    expect((await t.prisma.aula.findUniqueOrThrow({ where: { id: aulaId } })).institucionId).toBe(i.id);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'IE 1234' }).expect(409);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'IE 99', codigoModular: '123' }).expect(400);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'IE 99', director: 'x' }).expect(400);
  });

  it('suspendida, no se elige para aulas nuevas; reactivada, sí (y el aula queda vinculada)', async () => {
    expect((await t.http().patch(`${url}/${institucionId}`).set(bearer(admin.token)).send({ estado: 'SUSPENDIDA' }).expect(200)).body.estado).toBe('SUSPENDIDA');
    expect((await t.http().get(`${API}/instituciones`).set(bearer(rosa.token)).expect(200)).body).toEqual([]);
    const r = await nuevaAula('ie 1234').expect(409);
    expect(r.body.detail).toContain('está suspendida');

    await t.http().patch(`${url}/${institucionId}`).set(bearer(admin.token)).send({ estado: 'ACTIVA' }).expect(200);
    expect((await t.http().get(`${API}/instituciones`).set(bearer(rosa.token)).expect(200)).body).toEqual([{ id: institucionId, nombre: 'I.E. 1234' }]);
    const aula = (await nuevaAula('IE 1234').expect(201)).body;
    expect((await t.prisma.aula.findUniqueOrThrow({ where: { id: aula.id } })).institucionId).toBe(institucionId);
    await t.http().patch(`${url}/no-existe`).set(bearer(admin.token)).send({ estado: 'ACTIVA' }).expect(404);
  });

  it('solo la administración con verificación en dos pasos', async () => {
    await t.http().get(url).set(bearer(rosa.token)).expect(403);
    const sinMfa = await administrador(false);
    expect((await t.http().get(url).set(bearer(sinMfa.token)).expect(403)).body.detail).toContain('verificación en dos pasos');
    await t.http().get(url).expect(401);
  });
});

describe('[Administracion][Core][Slow] RF-076: cuentas docentes', () => {
  const url = `${API}/admin/docentes`;

  it('alta: el docente crea su contraseña con el enlace del correo y ya ingresa', async () => {
    const d = (await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'Luis Ramos', email: 'luis.ramos@ie1234.edu.pe' }).expect(201)).body;
    expect(d).toMatchObject({ nombre: 'Luis Ramos', email: 'luis.ramos@ie1234.edu.pe', estado: 'PENDIENTE_VERIFICACION', aulas: 0 });
    await ingresar('luis.ramos@ie1234.edu.pe').expect(401);
    const correo = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; enlace: string }[]).find((c) => c.para === 'luis.ramos@ie1234.edu.pe');
    expect(correo?.asunto).toBe('Tu cuenta de docente en LectoAventura');
    await t.http().post(`${API}/auth/restablecer`).send({ codigo: new URL(correo!.enlace).searchParams.get('codigo'), contrasenaNueva: CONTRASENA }).expect(200);
    expect((await ingresar('luis.ramos@ie1234.edu.pe').expect(200)).body.rol).toBe('DOCENTE');
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'Luis Ramos', email: 'luis.ramos@ie1234.edu.pe' }).expect(409);
    await t.http().post(url).set(bearer(admin.token)).send({ nombre: 'Sin correo', email: 'no-es-correo' }).expect(400);
  });

  it('lista cada docente con sus aulas y estudiantes', async () => {
    const lista = (await t.http().get(url).set(bearer(admin.token)).expect(200)).body as { email: string; estado: string; aulas: number; estudiantes: number }[];
    expect(lista.find((d) => d.email === rosa.email)).toMatchObject({ estado: 'ACTIVA', aulas: 2, estudiantes: 2 });
    expect((await t.http().get(`${url}?estado=SUSPENDIDA`).set(bearer(admin.token)).expect(200)).body).toEqual([]);
    expect((await t.http().get(`${url}?texto=ramos`).set(bearer(admin.token)).expect(200)).body.map((d: { nombre: string }) => d.nombre)).toEqual(['Luis Ramos']);
    await t.http().get(`${url}?estado=BORRADA`).set(bearer(admin.token)).expect(400);
  });

  it('suspender: pierde el acceso al instante, sus aulas quedan en solo lectura y sus niños siguen leyendo', async () => {
    await t.http().get(`${API}/aulas`).set(bearer(rosa.token)).expect(200);
    const r = (await t.http().post(`${url}/${rosa.id}/suspension`).set(bearer(admin.token)).set('X-Forwarded-For', IP).expect(200)).body;
    expect(r).toMatchObject({ estado: 'SUSPENDIDA', aulas: 2, estudiantes: 2, aulasEnSoloLectura: true });

    await t.http().get(`${API}/aulas`).set(bearer(rosa.token)).expect(401);
    expect((await ingresar(rosa.email).expect(403)).body.detail).toContain('suspendida');
    // La familia no puede vincularse con el código que ella generó: el aula está en solo lectura.
    expect((await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo: codigoFamilia }).expect(409)).body.detail).toContain('solo lectura');
    // Los niños siguen: Mateo sigue con su sesión y Ana vuelve a entrar en la tablet del aula.
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(tokenMateo)).send({ lecturaId: killa.lecturaId }).expect(201);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: ana, pin: '4826' }).expect(200);
  });

  it('reactivar: vuelve a ingresar y su aula acepta cambios otra vez', async () => {
    expect((await t.http().delete(`${url}/${rosa.id}/suspension`).set(bearer(admin.token)).expect(200)).body).toMatchObject({ estado: 'ACTIVA', aulasEnSoloLectura: false });
    rosa.token = (await ingresar(rosa.email).expect(200)).body.accessToken;
    await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo: codigoFamilia }).expect(201);
  });

  it('solo cuentas docentes: una familia o un id inexistente responden 404', async () => {
    await t.http().post(`${url}/${carmen.id}/suspension`).set(bearer(admin.token)).expect(404);
    await t.http().post(`${url}/no-existe/suspension`).set(bearer(admin.token)).expect(404);
    await t.http().post(`${url}/${rosa.id}/suspension`).set(bearer(rosa.token)).expect(403);
  });
});

describe('[Administracion][Core][Slow] RF-077: auditoría', () => {
  it('registra las acciones sensibles con actor, rol, recurso, fecha e IP', async () => {
    const [suspension] = await registros('CUENTA_SUSPENDIDA');
    expect(suspension).toMatchObject({ actorId: admin.id, actorRol: 'ADMIN_PLATAFORMA', recursoTipo: 'cuenta_adulta', recursoId: rosa.id, ip: IP });
    const pines = await registros('PIN_RESTABLECIDO');
    expect(pines.map((p) => [p.actorId, p.recursoId, p.ip])).toEqual([
      [rosa.id, mateo, IP],
      [rosa.id, ana, IP],
    ]);
    // La familia de Carmen y el consentimiento institucional de cada aula de Rosa (RF-015).
    expect((await registros('CONSENTIMIENTO_OTORGADO')).map((c) => [c.actorId, (c.datos as { tipo: string }).tipo])).toEqual([
      [carmen.id, 'PARENTAL'],
      [rosa.id, 'INSTITUCIONAL'],
      [rosa.id, 'INSTITUCIONAL'],
    ]);
    expect((await registros('INSTITUCION_CREADA'))[0]).toMatchObject({ actorId: admin.id, recursoId: institucionId });
    expect((await registros('DOCENTE_DADO_DE_ALTA'))[0]).toMatchObject({ actorId: admin.id, actorRol: 'ADMIN_PLATAFORMA' });
    expect(await registros('CUENTA_REACTIVADA')).toHaveLength(1);
  });

  it('registra el acceso de la docente al detalle de un estudiante', async () => {
    await t.http().get(`${API}/aulas/${aulaId}/estudiantes/${mateo}/detalle`).set(bearer(rosa.token)).set('X-Forwarded-For', '203.0.113.51').expect(200);
    expect((await registros('DETALLE_ESTUDIANTE_CONSULTADO'))[0]).toMatchObject({ actorId: rosa.id, actorRol: 'DOCENTE', recursoTipo: 'perfil_estudiante', recursoId: mateo, ip: '203.0.113.51' });
    // Un acceso negado no se registra.
    await t.http().get(`${API}/aulas/${aulaId}/estudiantes/${mateo}/detalle`).set(bearer(admin.token)).expect(403);
    expect(await registros('DETALLE_ESTUDIANTE_CONSULTADO')).toHaveLength(1);
  });

  it('la administración la consulta con filtros, el nombre de cada acción y de quién la hizo', async () => {
    const r = (await t.http().get(`${API}/admin/auditoria?accion=CUENTA_SUSPENDIDA`).set(bearer(admin.token)).expect(200)).body;
    expect(r.siguiente).toBeNull();
    expect(r.registros).toEqual([
      expect.objectContaining({ accion: 'CUENTA_SUSPENDIDA', etiqueta: 'Cuenta suspendida', actor: { id: admin.id, nombre: 'Ana Admin', rol: 'ADMIN_PLATAFORMA' }, recurso: { tipo: 'cuenta_adulta', id: rosa.id }, ip: IP }),
    ]);
    const deMateo = (await t.http().get(`${API}/admin/auditoria?recursoTipo=perfil_estudiante&recursoId=${mateo}`).set(bearer(admin.token)).expect(200)).body;
    expect(deMateo.registros.map((x: { accion: string }) => x.accion).sort()).toEqual(['DETALLE_ESTUDIANTE_CONSULTADO', 'FAMILIAR_VINCULADO', 'INVITACION_FAMILIAR_GENERADA', 'PIN_RESTABLECIDO']);
    expect((await t.http().get(`${API}/admin/auditoria?actorId=${rosa.id}&accion=PIN_RESTABLECIDO`).set(bearer(admin.token)).expect(200)).body.registros).toHaveLength(2);
    expect((await t.http().get(`${API}/admin/auditoria/acciones`).set(bearer(admin.token)).expect(200)).body).toContainEqual({ accion: 'PIN_RESTABLECIDO', etiqueta: 'PIN restablecido' });
    await t.http().get(`${API}/admin/auditoria?accion=BORRAR_TODO`).set(bearer(admin.token)).expect(400);
    await t.http().get(`${API}/admin/auditoria?desde=2026-10-30&hasta=2026-10-01`).set(bearer(admin.token)).expect(400);
    await t.http().get(`${API}/admin/auditoria`).set(bearer(rosa.token)).expect(403);
    // Consultar la auditoría también queda registrado.
    expect((await registros('AUDITORIA_CONSULTADA')).length).toBeGreaterThanOrEqual(3);
  });

  it('por páginas de 50, sin repetir ni saltar registros', async () => {
    const ahora = Date.now();
    await t.prisma.auditoria.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({ id: uuidV7(ahora - 3_600_000 - i), actorId: admin.id, actorRol: 'ADMIN_PLATAFORMA', accion: 'MISION_CREADA', recursoTipo: 'mision', recursoId: `m-${i}`, ocurridoEn: new Date(ahora - 3_600_000 - (i % 30) * 1000) })),
    });
    const primera = (await t.http().get(`${API}/admin/auditoria?accion=MISION_CREADA`).set(bearer(admin.token)).expect(200)).body;
    expect(primera.registros).toHaveLength(50);
    const segunda = (await t.http().get(`${API}/admin/auditoria?accion=MISION_CREADA&antesDe=${encodeURIComponent(primera.siguiente)}`).set(bearer(admin.token)).expect(200)).body;
    expect(segunda.registros).toHaveLength(10);
    expect(segunda.siguiente).toBeNull();
    expect(new Set([...primera.registros, ...segunda.registros].map((x: { id: string }) => x.id)).size).toBe(60);
  });

  it('es inmutable y se conserva 2 años: solo se borra lo más antiguo', async () => {
    const [una] = await registros('CUENTA_SUSPENDIDA');
    await expect(t.prisma.auditoria.update({ where: { id: una!.id }, data: { accion: 'OTRA' } })).rejects.toThrow(/solo admite agregar/);
    await expect(t.prisma.auditoria.delete({ where: { id: una!.id } })).rejects.toThrow(/más de 2 años/);
    const vieja = await t.prisma.auditoria.create({
      data: { id: uuidV7(Date.now() - 3 * 365 * 86_400_000), accion: 'LECTURA_PUBLICADA', recursoTipo: 'lectura', ocurridoEn: new Date(Date.now() - 3 * 365 * 86_400_000) },
    });
    const total = await t.prisma.auditoria.count();
    expect(await casos.auditoria.depurar(new Date())).toBe(1);
    expect(await t.prisma.auditoria.findUnique({ where: { id: vieja.id } })).toBeNull();
    expect(await t.prisma.auditoria.count()).toBe(total - 1);
  });
});

describe('[Administracion][Core][Slow] RF-078: parámetros de gamificación', () => {
  const url = `${API}/admin/parametros-gamificacion`;

  it('muestra la versión vigente con los umbrales de las insignias', async () => {
    const v = (await t.http().get(url).set(bearer(admin.token)).expect(200)).body;
    expect(v).toMatchObject({ version: 1, creadoPor: null, parametros: { puntos: { lecturaCompletada: 20 }, antiFarming: { topeDiario: 300 }, nivelLector: { base: 100 } } });
    expect(v.insignias.map((i: { codigo: string; umbral: number }) => [i.codigo, i.umbral])).toEqual([
      ['PRIMERA_LECTURA', 1],
      ['DETECTIVE_EVIDENCIAS', 5],
      ['LECTOR_PERSEVERANTE', 7],
    ]);
  });

  it('una versión inválida no se publica y dice qué corregir', async () => {
    const { parametros } = (await t.http().get(url).set(bearer(admin.token))).body;
    const r = await t.http().put(url).set(bearer(admin.token)).send({ ...parametros, puntos: { ...parametros.puntos, lecturaCompletada: 900 } }).expect(400);
    expect(r.body.errores).toEqual(['los puntos por lectura completada debe ser un número entero entre 0 y 500']);
    await t.http().put(url).set(bearer(admin.token)).send({ puntos: {} }).expect(400);
    await t.http().put(url).set(bearer(rosa.token)).send(parametros).expect(403);
    expect(await t.prisma.parametroGamificacion.count()).toBe(1);
  });

  it('publicar crea la versión 2, que aplica solo a lo que ocurre desde ahora', async () => {
    const { parametros } = (await t.http().get(url).set(bearer(admin.token))).body;
    const v = (await t.http().put(url).set(bearer(admin.token)).set('X-Forwarded-For', IP).send({ ...parametros, puntos: { ...parametros.puntos, lecturaCompletada: 30 }, insignias: { PRIMERA_LECTURA: 2 } }).expect(200)).body;
    expect(v).toMatchObject({ version: 2, creadoPor: admin.id, parametros: { puntos: { lecturaCompletada: 30 }, insignias: { PRIMERA_LECTURA: 2 } } });
    expect((await t.http().get(`${url}/historial`).set(bearer(admin.token)).expect(200)).body.map((h: { version: number }) => h.version)).toEqual([2, 1]);
    expect((await registros('PARAMETROS_GAMIFICACION_PUBLICADOS'))[0]).toMatchObject({ actorId: admin.id, recursoId: '2', ip: IP });

    // Ana termina Killa: +30 (no 20) y "Primera lectura" ahora pide 2 lecturas.
    await leerKilla(tokenAna, killa);
    const asientos = await t.prisma.asientoPuntos.findMany({ where: { estudianteId: ana, motivo: 'LECTURA_COMPLETADA' } });
    expect(asientos.map((a) => a.puntos)).toEqual([30]);
    const primera = await t.prisma.insignia.findUniqueOrThrow({ where: { codigo: 'PRIMERA_LECTURA' } });
    expect(await t.prisma.insigniaOtorgada.count({ where: { estudianteId: ana, insigniaId: primera.id } })).toBe(0);
  });
});
```

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **Suspender y reactivar (RF-076):**
  - la docente tiene su panel abierto en otra computadora;
  - la administración la busca, ve el aviso de lo que pasará y la suspende;
  - el panel de la docente la saca y no puede volver a ingresar;
  - Mateo sigue entrando en la tablet del aula;
  - al reactivarla, vuelve.
- **Alta (RF-076):** la administración da de alta a un docente, que crea su contraseña con el enlace del correo e ingresa.
- **Instituciones (RF-076):** registrada y suspendida, no se sugiere y no se puede crear un aula en ella.
- **Auditoría (RF-077):** el cambio de PIN de una docente, con su nombre, el estudiante y la IP.
- **Gamificación (RF-078):** publicar una versión con «Lectura terminada» en 25; un valor fuera de rango ni pide confirmación. Al terminar se deshace.
- **RN-17:** una docente no entra a la administración.
- **Diseño (RNF-022, RNF-023):** las 4 pantallas en 1280, 820 y 390 px. En 5 tamaños de laptop:
  - filtros en una fila;
  - el alta en una fila, sin espacio vacío;
  - los 5 puntos en una fila.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
```bash
npm run test:administracion --workspace @lectoaventura/tests-load
```

**Resultado de carga obtenido el 01/11/2026.** El perfil es el mismo del script k6, que se ejecuta en CI:
- 5 sesiones de la administración durante 30 s;
- con 60 000 registros de auditoría;
- contra la base de pruebas, para no dejar registros inmutables en la de desarrollo;
- API compilada en el puerto 3011.

| Consulta | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /admin/auditoria` (primera página) | 705 | 0 | 42 ms | 74 ms | 106 ms | p95 < 300 ms (RNF-001) | ✅ |
| `GET /admin/auditoria?accion=…` | 705 | 0 | 62 ms | 97 ms | 114 ms | p95 < 300 ms | ✅ |
| `GET /admin/auditoria?desde=…` (último mes) | 705 | 0 | 45 ms | 77 ms | 98 ms | p95 < 300 ms | ✅ |
| `GET /admin/docentes` | 705 | 0 | 28 ms | 55 ms | 70 ms | p95 < 300 ms | ✅ |
| `GET /admin/instituciones` | 705 | 0 | 21 ms | 39 ms | 52 ms | p95 < 300 ms | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/administracion/administracion.spec.ts`:

```ts
import { expect, Page, test as base } from '@playwright/test';

import { deshacerParametrosPublicados, enlaceDeAlta, institucionDePrueba } from '../../support/administracion';
import { cuentaBackoffice, CuentaBackoffice, ingresarBackoffice, sesionBackoffice } from '../../support/contenido';
import { docenteConAula, PIN_PRUEBA, sesionApi } from '../../support/escuela';
import { correoUnico, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

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

/** La docente en la lista de la administración (buscada por su correo, que es único). */
async function buscarDocente(page: Page, email: string) {
  await page.goto('/backoffice/docentes');
  await page.getByLabel('Nombre o correo').fill(email);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fila = page.getByRole('list', { name: 'Cuentas docentes' }).getByRole('listitem');
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(email);
  return fila;
}

/**
 * Nivel 3 — Administración de la plataforma de punta a punta (RF-076 a RF-078) en escritorio, tablet y
 * celular: docentes (suspender, reactivar, dar de alta), instituciones, auditoría y gamificación.
 */
test.describe('[Administracion][Core][Slow] Administración de la plataforma (RF-076 a RF-078)', () => {
  test.setTimeout(150_000);
  let admin: CuentaBackoffice;

  test.beforeEach(async () => {
    admin = await cuentaBackoffice('ADMIN_PLATAFORMA');
  });

  test('RF-076: suspender a una docente le quita el acceso al instante, sus niños siguen entrando; al reactivarla vuelve', async ({ page, request, browser }, info) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    // La tablet del aula ya estaba activada (la docente la activó antes).
    const docenteApi = await sesionApi(request, aula.docente);
    const { tokenDispositivo } = await (await request.post(`/api/v1/aulas/${aula.aulaId}/dispositivos`, { headers: docenteApi, data: { nombre: 'Tablet' } })).json();

    // La docente tiene su panel abierto en otra computadora.
    const otra = await browser.newContext({ baseURL: info.project.use.baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });
    const docente = await otra.newPage();
    await ingresarComoAdulto(docente, aula.docente.email, aula.docente.contrasena);
    await expect(docente).toHaveURL(/\/docente$/);

    await ingresarBackoffice(page, admin);
    const fila = await buscarDocente(page, aula.docente.email);
    await expect(fila).toContainText('1 aula · 1 estudiante');
    await fila.getByRole('button', { name: 'Suspender' }).click();
    await expect(fila.getByRole('note')).toHaveText('Perderá el acceso al instante. Su aula queda en solo lectura; sus estudiantes siguen leyendo.');
    await fila.getByRole('button', { name: 'Sí, suspender' }).click();
    await expect(page.getByText(/cuenta suspendida, ya no puede ingresar\. Su aula queda en solo lectura/)).toBeVisible();
    await expect(fila).toContainText('Suspendida');
    await expect(fila).toContainText('Aulas en solo lectura');
    await sinDesbordes(page);

    // Al instante: su panel ya no responde y no puede volver a ingresar.
    await docente.reload();
    await expect(docente).toHaveURL(/\/ingresar/);
    await ingresarComoAdulto(docente, aula.docente.email, aula.docente.contrasena);
    await expect(docente.getByText('Tu cuenta está suspendida. Comunícate con la administración.')).toBeVisible();
    // Mateo sigue entrando con su PIN en la tablet del aula.
    const mateo = await request.post('/api/v1/acceso-estudiante/login', { data: { tokenDispositivo, perfilId: aula.estudiantes['Mateo'], pin: PIN_PRUEBA } });
    expect(mateo.status()).toBe(200);

    await fila.getByRole('button', { name: 'Reactivar' }).click();
    await expect(fila).toContainText('Activa');
    await ingresarComoAdulto(docente, aula.docente.email, aula.docente.contrasena);
    await expect(docente).toHaveURL(/\/docente$/);
    await otra.close();
  });

  test('RF-076: da de alta a un docente, que crea su contraseña con el enlace del correo', async ({ page, request }) => {
    const email = correoUnico('alta');
    await ingresarBackoffice(page, admin);
    await page.goto('/backoffice/docentes');
    await page.getByLabel('Nombre y apellido').fill('Luis Ramos');
    await page.getByLabel('Correo', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Dar de alta' }).click();
    await expect(page.getByText(`Listo: le enviamos a ${email} un enlace para crear su contraseña (vence en 72 horas).`)).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'Luis Ramos' }).first()).toContainText('Aún no crea su contraseña');
    await sinDesbordes(page);
    await salirDelPanel(page);

    const enlace = new URL(await enlaceDeAlta(request, email));
    await page.goto(`${enlace.pathname}${enlace.search}`);
    await page.getByLabel('Nueva contraseña').fill('Docente-Nueva-2026');
    await page.getByLabel('Repite la contraseña').fill('Docente-Nueva-2026');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('heading', { name: /Contraseña actualizada/ })).toBeVisible();
    await ingresarComoAdulto(page, email, 'Docente-Nueva-2026');
    await expect(page).toHaveURL(/\/docente$/);
  });

  test('RF-076: una institución suspendida ya no se elige para aulas nuevas', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    const nombre = institucionDePrueba();
    await ingresarBackoffice(page, admin);
    await page.goto('/backoffice/instituciones');
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByLabel('Región (opcional)').fill('Puno');
    await page.getByRole('button', { name: 'Registrar institución' }).click();
    await expect(page.getByText('Registrada.')).toBeVisible();
    const fila = page.getByRole('listitem', { name: nombre });
    await expect(fila).toContainText('Activa');
    await fila.getByRole('button', { name: 'Suspender' }).click();
    await fila.getByRole('button', { name: 'Sí, suspender' }).click();
    await expect(fila).toContainText('Suspendida');
    await sinDesbordes(page);
    await salirDelPanel(page);

    // La docente no puede crear un aula en ella (ni se le sugiere).
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await page.getByRole('button', { name: '+ Nueva aula' }).click();
    const formulario = page.getByRole('form', { name: 'Nueva aula' });
    await expect(formulario.locator(`datalist option[value="${nombre}"]`)).toHaveCount(0);
    await formulario.getByLabel('Nombre del aula').fill('5.° B');
    await formulario.getByLabel('Institución educativa').fill(nombre.toUpperCase());
    await formulario.getByLabel('Autoridad que firmó el consentimiento').fill('Dir. Ruiz');
    await formulario.getByRole('checkbox').check();
    await formulario.getByRole('button', { name: 'Crear aula' }).click();
    await expect(formulario.getByText(/está suspendida en LectoAventura/)).toBeVisible();
  });

  test('RF-077: la administración ve en la auditoría quién cambió un PIN, cuándo y desde qué IP', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    const docenteApi = await sesionApi(request, aula.docente);
    const pin = await request.post(`/api/v1/estudiantes/${aula.estudiantes['Mateo']}/pin/restablecer`, { headers: docenteApi, data: { pinNuevo: '3691' } });
    expect(pin.status()).toBe(200);

    await ingresarBackoffice(page, admin);
    await page.goto('/backoffice/auditoria');
    await page.getByLabel('Acción').selectOption({ label: 'PIN restablecido' });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    const primera = page.getByRole('table').getByRole('row').nth(1);
    await expect(primera).toContainText('PIN restablecido');
    await expect(primera).toContainText('(Docente)');
    await expect(primera).toContainText('Estudiante');
    await expect(primera).toContainText(/2001:db8:/);
    await sinDesbordes(page);
  });

  test('RF-078: publica una versión nueva de la gamificación que aplica desde ahora', async ({ page, request }) => {
    const { version } = await (await request.get('/api/v1/admin/parametros-gamificacion', { headers: await sesionBackoffice(request, admin) })).json();
    try {
      await ingresarBackoffice(page, admin);
      await page.goto('/backoffice/gamificacion');
      const puntos = page.getByRole('group', { name: 'Puntos' });
      await puntos.getByLabel('Lectura terminada').fill('25');
      await page.getByRole('button', { name: 'Publicar versión nueva' }).click();
      await page.getByRole('button', { name: `Sí, publicar la versión ${version + 1}` }).click();
      await expect(page.getByText(`Publicada la versión ${version + 1}: se aplica desde ahora. Los logros ya otorgados no cambian.`)).toBeVisible();
      await expect(page.getByRole('list', { name: 'Versiones publicadas' })).toContainText(`Versión ${version + 1}`);
      await expect(puntos.getByLabel('Lectura terminada')).toHaveValue('25');

      // Un valor fuera de rango ni siquiera pide confirmación: el campo dice su rango (la API también lo rechaza).
      await puntos.getByLabel('Lectura terminada').fill('900');
      await page.getByRole('button', { name: 'Publicar versión nueva' }).click();
      await expect(page.getByRole('button', { name: `Sí, publicar la versión ${version + 2}` })).toHaveCount(0);
      expect(await puntos.getByLabel('Lectura terminada').evaluate((e) => (e as HTMLInputElement).validity.rangeOverflow)).toBe(true);
      await expect(puntos.getByText('Entre 0 y 500').first()).toBeVisible();
      await sinDesbordes(page);
    } finally {
      await deshacerParametrosPublicados(version);
    }
  });

  test('una docente no entra a la administración', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/);
    await page.goto('/backoffice/docentes');
    await expect(page).toHaveURL(/\/docente$/);
    const api = await request.get('/api/v1/admin/docentes', { headers: await sesionApi(request, aula.docente) });
    expect(api.status()).toBe(403);
  });
});
```

`tests/e2e/support/administracion.ts`:

```ts
import { resolve } from 'node:path';

import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * Ayudantes del Módulo 12 (administración de la plataforma): nombres de institución de prueba (la
 * limpieza final las borra), el correo de alta de un docente y deshacer los parámetros publicados en
 * una prueba para que las siguientes jueguen con los de siempre.
 */

/** Prefijo de las instituciones creadas por las pruebas: la limpieza final las borra. */
export const PREFIJO_INSTITUCION_E2E = 'IE Prueba E2E';

export function institucionDePrueba(): string {
  return `${PREFIJO_INSTITUCION_E2E} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** El enlace para crear la contraseña que recibió un docente dado de alta (bandeja de desarrollo). */
export async function enlaceDeAlta(request: APIRequestContext, email: string): Promise<string> {
  const correos = (await (await request.get('/api/v1/dev/correos')).json()) as { para: string; asunto: string; enlace?: string }[];
  const correo = correos.find((c) => c.para === email && c.asunto === 'Tu cuenta de docente en LectoAventura');
  expect(correo?.enlace, 'el correo de alta').toBeTruthy();
  return correo!.enlace as string;
}

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RF-078: deja vigentes los parámetros de siempre (borra las versiones que publicó la prueba). */
export async function deshacerParametrosPublicados(desdeVersion: number): Promise<void> {
  const prisma = db();
  try {
    await prisma.parametroGamificacion.deleteMany({ where: { version: { gt: desdeVersion } } });
  } finally {
    await prisma.$disconnect();
  }
}

/** RF-077: los registros de auditoría de una acción sobre un recurso (lo que ve la administración). */
export async function auditoriaDe(accion: string, recursoId: string) {
  const prisma = db();
  try {
    return await prisma.auditoria.findMany({ where: { accion, recursoId }, orderBy: { ocurridoEn: 'asc' } });
  } finally {
    await prisma.$disconnect();
  }
}
```

`tests/load/sembrar-administracion.mjs`:

```js
// Una cuenta de administración con MFA y 20 000 registros de auditoría repartidos en 2 años (como una
// plataforma en uso), para el escenario k6 de la administración (scenarios/administracion.js, RF-076,
// RF-077, RNF-001). SOLO para desarrollo y CI (ver sembrado.mjs). Imprime solo la cabecera de su
// sesión (un token de prueba de 15 minutos, de una cuenta del dominio de pruebas que la limpieza borra).
//
// Uso (con la API en marcha):  node tests/load/sembrar-administracion.mjs
import { randomUUID } from 'node:crypto';

import { conPrisma, cuentaBackoffice, exigirEntornoLocal } from './sembrado.mjs';

const REGISTROS = 20_000;
const ACCIONES = ['LECTURA_PUBLICADA', 'PIN_RESTABLECIDO', 'CONSENTIMIENTO_OTORGADO', 'FAMILIAR_VINCULADO', 'DETALLE_ESTUDIANTE_CONSULTADO', 'MISION_CREADA'];
const RECURSO = { LECTURA_PUBLICADA: 'lectura', PIN_RESTABLECIDO: 'perfil_estudiante', CONSENTIMIENTO_OTORGADO: 'consentimiento', FAMILIAR_VINCULADO: 'perfil_estudiante', DETALLE_ESTUDIANTE_CONSULTADO: 'perfil_estudiante', MISION_CREADA: 'mision' };
const DOS_ANIOS = 2 * 365 * 86_400_000;

exigirEntornoLocal();
const cabecera = await conPrisma(async (prisma) => {
  const admin = await cuentaBackoffice(prisma, 'ADMIN_PLATAFORMA');
  const ahora = Date.now();
  for (let inicio = 0; inicio < REGISTROS; inicio += 5000) {
    await prisma.auditoria.createMany({
      data: Array.from({ length: 5000 }, (_, k) => {
        const i = inicio + k;
        const accion = ACCIONES[i % ACCIONES.length];
        return {
          id: randomUUID(),
          actorId: randomUUID(),
          actorRol: 'DOCENTE',
          accion,
          recursoTipo: RECURSO[accion],
          recursoId: randomUUID(),
          ip: `198.51.100.${(i % 250) + 1}`,
          ocurridoEn: new Date(ahora - Math.floor((i / REGISTROS) * (DOS_ANIOS - 86_400_000))),
        };
      }),
    });
  }
  return admin.Authorization;
});
console.log(cabecera);
```

`tests/load/scenarios/administracion.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de la administración de la plataforma (k6), con 20 000 registros de auditoría:
 *   RF-077 / RNF-001: la auditoría (la primera página, filtrada por acción y por el último mes) → p95 < 300 ms.
 *   RF-076: las cuentas docentes con sus aulas y las instituciones → p95 < 300 ms.
 *
 * Requisitos: API en marcha y la administración sembrada (sembrar-administracion.mjs imprime su cabecera).
 * Ejecutar:   k6 run -e AUTH="$(node tests/load/sembrar-administracion.mjs)" tests/load/scenarios/administracion.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';

export const options = {
  scenarios: {
    panel_admin: {
      executor: 'constant-vus',
      vus: 5,
      duration: __ENV.DURACION || '1m',
      exec: 'administrar',
      tags: { escenario: 'panel_admin' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /admin/auditoria}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/auditoria?accion}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/auditoria?desde}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/docentes}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/instituciones}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

export function setup() {
  if (!__ENV.AUTH) fail('Falta AUTH: siembra la administración con node tests/load/sembrar-administracion.mjs');
  return { cabeceras: { Authorization: __ENV.AUTH } };
}

function haceUnMes() {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}

/** La administración revisa la auditoría (sin filtro, por acción y por fecha) y las cuentas docentes. */
export function administrar(datos) {
  const pedir = (ruta, nombre) => http.get(`${BASE}${ruta}`, { headers: datos.cabeceras, tags: { nombre } });
  const pagina = pedir('/admin/auditoria', 'GET /admin/auditoria');
  check(pagina, { 'una página de 50 con la siguiente': (r) => r.status === 200 && r.json('registros').length === 50 && r.json('siguiente') !== null });
  const porAccion = pedir('/admin/auditoria?accion=PIN_RESTABLECIDO', 'GET /admin/auditoria?accion');
  check(porAccion, { 'solo esa acción': (r) => r.status === 200 && r.json('registros').every((x) => x.accion === 'PIN_RESTABLECIDO') });
  check(pedir(`/admin/auditoria?desde=${haceUnMes()}`, 'GET /admin/auditoria?desde'), { 'el último mes': (r) => r.status === 200 });
  check(pedir('/admin/docentes', 'GET /admin/docentes'), { 'docentes con sus aulas': (r) => r.status === 200 && Array.isArray(r.json()) });
  check(pedir('/admin/instituciones', 'GET /admin/instituciones'), { instituciones: (r) => r.status === 200 });
}
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@administracion
Característica: Administración de la plataforma
  Como administración de LectoAventura
  Quiero gestionar los colegios, las cuentas docentes, la auditoría y la gamificación
  Para cuidar la plataforma y a los niños que la usan

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-076 @camino-feliz @smoke
  Escenario: Suspender a una docente le quita el acceso y sus niños siguen leyendo
    Dado una docente con su aula y su estudiante Mateo
    Cuando la administración la suspende
    Entonces la docente ya no puede ingresar
    Y Mateo sigue entrando con su PIN en la tablet del aula
    Y la administración ve sus aulas en solo lectura

  @RF-076
  Escenario: Reactivar a una docente suspendida
    Dado una docente con su aula y su estudiante Mateo
    Y la administración la suspende
    Cuando la administración la reactiva
    Entonces la docente vuelve a ingresar a su panel

  @RF-076
  Escenario: Dar de alta a un docente que crea su contraseña por correo
    Cuando la administración da de alta a "Luis Ramos" con su correo
    Entonces Luis recibe un correo para crear su contraseña
    Y con ese enlace crea su contraseña e ingresa a su panel de docente

  @RF-076
  Escenario: Una institución suspendida no se elige para aulas nuevas
    Dado una docente con su aula y su estudiante Mateo
    Y una institución registrada por la administración
    Cuando la administración suspende la institución
    Entonces la docente no puede crear un aula en ella

  @RF-077
  Escenario: La auditoría muestra quién cambió un PIN y desde dónde
    Dado una docente con su aula y su estudiante Mateo
    Y la docente cambió el PIN de Mateo
    Cuando la administración filtra la auditoría por "PIN restablecido"
    Entonces ve el cambio con la docente, el estudiante y la dirección IP

  @RF-078
  Escenario: Publicar una versión nueva de la gamificación que aplica desde ahora
    Cuando la administración cambia los puntos por lectura terminada a 25 y publica
    Entonces queda vigente la versión nueva desde ese momento
    Y la versión anterior sigue en la lista de versiones

  @RN-17 @negativo
  Escenario: Una docente no entra a la administración
    Dado una docente con su aula y su estudiante Mateo
    Cuando la docente intenta abrir la administración de docentes
    Entonces vuelve a su panel de docente
```

## 7.2 Automatización (Step Definitions)

```ts
import { APIRequestContext, expect, Page } from '@playwright/test';

import { enlaceDeAlta, institucionDePrueba } from '../support/administracion';
import { cuentaBackoffice, ingresarBackoffice, sesionBackoffice } from '../support/contenido';
import { docenteConAula, PIN_PRUEBA, sesionApi } from '../support/escuela';
import { correoUnico, ingresarComoAdulto, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de la administración de la plataforma (RF-076 a RF-078, RN-17). */

async function comoAdministracion(page: Page, mundo: Mundo) {
  mundo.admin ??= await cuentaBackoffice('ADMIN_PLATAFORMA');
  if (!page.url().includes('/backoffice')) await ingresarBackoffice(page, mundo.admin);
}

/** La fila de la docente del escenario en la lista de la administración. */
async function filaDocente(page: Page, mundo: Mundo) {
  const email = mundo.aula!.docente.email;
  await page.goto('/backoffice/docentes');
  await page.getByLabel('Nombre o correo').fill(email);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fila = page.getByRole('list', { name: 'Cuentas docentes' }).getByRole('listitem');
  await expect(fila).toHaveCount(1);
  return fila;
}

async function salirSiHaySesion(page: Page) {
  if (await page.getByRole('button', { name: 'Salir' }).count()) await salirDelPanel(page);
}

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('una docente con su aula y su estudiante Mateo', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  const r = await request.post(`/api/v1/aulas/${mundo.aula.aulaId}/dispositivos`, { headers: await sesionApi(request, mundo.aula.docente), data: { nombre: 'Tablet' } });
  expect(r.status(), await r.text()).toBe(201);
  mundo.tablet = (await r.json()).tokenDispositivo;
});

Dado('una institución registrada por la administración', async ({ page, mundo }) => {
  await comoAdministracion(page, mundo);
  mundo.institucion = institucionDePrueba();
  await page.goto('/backoffice/instituciones');
  await page.getByLabel('Nombre').fill(mundo.institucion);
  await page.getByRole('button', { name: 'Registrar institución' }).click();
  await expect(page.getByRole('listitem', { name: mundo.institucion })).toContainText('Activa');
});

Dado('la docente cambió el PIN de Mateo', async ({ request, mundo }) => {
  const r = await request.post(`/api/v1/estudiantes/${mundo.aula!.estudiantes['Mateo']}/pin/restablecer`, {
    headers: await sesionApi(request, mundo.aula!.docente),
    data: { pinNuevo: '3691' },
  });
  expect(r.status()).toBe(200);
});

// ── Acciones ─────────────────────────────────────────────────────────────────

const suspender = async ({ page, mundo }: { page: Page; mundo: Mundo }) => {
  await comoAdministracion(page, mundo);
  const fila = await filaDocente(page, mundo);
  await fila.getByRole('button', { name: 'Suspender' }).click();
  await fila.getByRole('button', { name: 'Sí, suspender' }).click();
  await expect(fila).toContainText('Suspendida');
};
Cuando('la administración la suspende', suspender);

Cuando('la administración la reactiva', async ({ page, mundo }) => {
  const fila = await filaDocente(page, mundo);
  await fila.getByRole('button', { name: 'Reactivar' }).click();
  await expect(fila).toContainText('Activa');
});

Cuando('la administración da de alta a {string} con su correo', async ({ page, mundo }, nombre: string) => {
  await comoAdministracion(page, mundo);
  mundo.alta = { nombre, email: correoUnico('alta') };
  await page.goto('/backoffice/docentes');
  await page.getByLabel('Nombre y apellido').fill(nombre);
  await page.getByLabel('Correo', { exact: true }).fill(mundo.alta.email);
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(page.getByText(`Listo: le enviamos a ${mundo.alta.email} un enlace para crear su contraseña (vence en 72 horas).`)).toBeVisible();
});

Cuando('la administración suspende la institución', async ({ page, mundo }) => {
  const fila = page.getByRole('listitem', { name: mundo.institucion! });
  await fila.getByRole('button', { name: 'Suspender' }).click();
  await fila.getByRole('button', { name: 'Sí, suspender' }).click();
  await expect(fila).toContainText('Suspendida');
});

Cuando('la administración filtra la auditoría por {string}', async ({ page, mundo }, accion: string) => {
  await comoAdministracion(page, mundo);
  await page.goto('/backoffice/auditoria');
  await page.getByLabel('Acción').selectOption({ label: accion });
  await page.getByRole('button', { name: 'Filtrar' }).click();
});

Cuando('la administración cambia los puntos por lectura terminada a {int} y publica', async ({ page, request, mundo }, puntos: number) => {
  mundo.admin = await cuentaBackoffice('ADMIN_PLATAFORMA');
  mundo.parametrosDesde = (await (await request.get('/api/v1/admin/parametros-gamificacion', { headers: await sesionBackoffice(request, mundo.admin) })).json()).version;
  await comoAdministracion(page, mundo);
  await page.goto('/backoffice/gamificacion');
  await page.getByRole('group', { name: 'Puntos' }).getByLabel('Lectura terminada').fill(String(puntos));
  await page.getByRole('button', { name: 'Publicar versión nueva' }).click();
  await page.getByRole('button', { name: `Sí, publicar la versión ${(mundo.parametrosDesde as number) + 1}` }).click();
});

Cuando('la docente intenta abrir la administración de docentes', async ({ page, mundo }) => {
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto('/backoffice/docentes');
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('la docente ya no puede ingresar', async ({ page, mundo }) => {
  await salirSiHaySesion(page);
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await expect(page.getByText('Tu cuenta está suspendida. Comunícate con la administración.')).toBeVisible();
});

Entonces('Mateo sigue entrando con su PIN en la tablet del aula', async ({ request, mundo }: { request: APIRequestContext; mundo: Mundo }) => {
  const r = await request.post('/api/v1/acceso-estudiante/login', { data: { tokenDispositivo: mundo.tablet, perfilId: mundo.aula!.estudiantes['Mateo'], pin: PIN_PRUEBA } });
  expect(r.status()).toBe(200);
});

Entonces('la administración ve sus aulas en solo lectura', async ({ page, mundo }) => {
  await ingresarBackoffice(page, mundo.admin!);
  await expect(await filaDocente(page, mundo)).toContainText('Aulas en solo lectura');
});

Entonces('la docente vuelve a ingresar a su panel', async ({ page, mundo }) => {
  await salirSiHaySesion(page);
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
});

Entonces('Luis recibe un correo para crear su contraseña', async ({ request, mundo }) => {
  expect(await enlaceDeAlta(request, mundo.alta!.email)).toContain('/restablecer?codigo=');
});

Entonces('con ese enlace crea su contraseña e ingresa a su panel de docente', async ({ page, request, mundo }) => {
  await salirSiHaySesion(page);
  const enlace = new URL(await enlaceDeAlta(request, mundo.alta!.email));
  await page.goto(`${enlace.pathname}${enlace.search}`);
  await page.getByLabel('Nueva contraseña').fill('Docente-Nueva-2026');
  await page.getByLabel('Repite la contraseña').fill('Docente-Nueva-2026');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: /Contraseña actualizada/ })).toBeVisible();
  await ingresarComoAdulto(page, mundo.alta!.email, 'Docente-Nueva-2026');
  await expect(page).toHaveURL(/\/docente$/);
});

Entonces('la docente no puede crear un aula en ella', async ({ page, mundo }) => {
  await salirSiHaySesion(page);
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await page.getByRole('button', { name: '+ Nueva aula' }).click();
  const formulario = page.getByRole('form', { name: 'Nueva aula' });
  await formulario.getByLabel('Nombre del aula').fill('5.° B');
  await formulario.getByLabel('Institución educativa').fill(mundo.institucion!);
  await formulario.getByLabel('Autoridad que firmó el consentimiento').fill('Dir. Ruiz');
  await formulario.getByRole('checkbox').check();
  await formulario.getByRole('button', { name: 'Crear aula' }).click();
  await expect(formulario.getByText(/está suspendida en LectoAventura/)).toBeVisible();
});

Entonces('ve el cambio con la docente, el estudiante y la dirección IP', async ({ page }) => {
  const fila = page.getByRole('table').getByRole('row').nth(1);
  await expect(fila).toContainText('PIN restablecido');
  await expect(fila).toContainText('(Docente)');
  await expect(fila).toContainText('Estudiante');
  await expect(fila).toContainText(/2001:db8:/);
});

Entonces('queda vigente la versión nueva desde ese momento', async ({ page, mundo }) => {
  const nueva = (mundo.parametrosDesde as number) + 1;
  await expect(page.getByText(`Publicada la versión ${nueva}: se aplica desde ahora. Los logros ya otorgados no cambian.`)).toBeVisible();
  await expect(page.getByText(`Versión vigente: ${nueva}`)).toBeVisible();
});

Entonces('la versión anterior sigue en la lista de versiones', async ({ page, mundo }) => {
  await expect(page.getByRole('list', { name: 'Versiones publicadas' })).toContainText(`Versión ${mundo.parametrosDesde}`);
});

Entonces('vuelve a su panel de docente', async ({ page }) => {
  await expect(page).toHaveURL(/\/docente$/);
});
```

**Checklist manual para el Product Owner:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Crear la cuenta de administración con el comando y configurar la verificación en dos pasos | Entra al backoffice con su menú: Instituciones, Docentes, Auditoría y Gamificación |
| ☐ | Registrar una institución con el nombre que usa un aula existente | Se vincula el aula y aparecen sus docentes y estudiantes |
| ☐ | Suspender esa institución y, como docente, intentar crear un aula en ella | No se sugiere y no se puede crear |
| ☐ | Dar de alta a un docente | Le llega el correo; crea su contraseña e ingresa |
| ☐ | Suspender a un docente con su panel abierto | Pierde el acceso al instante; sus niños siguen entrando |
| ☐ | Revisar la auditoría filtrando por acción y fechas | Quién, qué, sobre qué, cuándo y desde qué IP |
| ☐ | Publicar una versión de la gamificación | Aplica desde ese momento; lo ganado no cambia |
| ☐ | Revisar en laptops de distinto tamaño, tablet y celular | Sin desplazarse a los lados; filtros y formularios en una fila en laptops |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea «Responsable de aprobación» de `administracion.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo administracion`. Los servidores MCP recomendados están en el informe del Módulo 1, §8. Para este módulo:
- el MCP de PostgreSQL ayuda a revisar `admin.auditoria` (sin modificarla) y las versiones de `gamificacion.parametro_gamificacion`;
- el navegador integrado sirvió para revisar las 4 pantallas en distintos tamaños.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el escenario k6 de la administración: siembra 20 000 registros de auditoría y una cuenta de administración con MFA. Sus tiempos aparecen en las anotaciones de la ejecución.

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ADM-U-01 | Alta, suspensión y reactivación de docentes (RF-076) | Unit | Pos./Neg. | Enlace de 72 h; sesiones cerradas; solo docentes | `npm run test:unit` |
| ADM-U-02 | Instituciones y aulas (RF-076) | Unit | Pos./Neg. | Vínculo por nombre; suspendida no se elige; solo lectura | `npm run test:unit` |
| ADM-U-03 | Parámetros y umbrales (RF-078) | Unit | Pos./Neg. | Validación; aplica desde ese logro | `npm run test:unit` |
| ADM-U-04 | Auditoría (RF-077) | Unit | Pos./Borde | Filtros, cursor, nombres, retención | `npm run test:unit` |
| ADM-I-01 | Instituciones con la base real | Int | Pos./Neg. | 201/409/400/404; MFA exigido | `npm run test:int` |
| ADM-I-02 | Docentes: alta, suspensión y reactivación | Int | Pos./Neg. | 401/403 al suspender; niños siguen; 404 | `npm run test:int` |
| ADM-I-03 | Auditoría con IP, filtros, páginas, inmutabilidad y retención | Int | Seguridad | Registros completos; *trigger* | `npm run test:int` |
| ADM-I-04 | Parámetros versionados | Int | Pos./Neg. | 400 con qué corregir; puntos nuevos desde ahora | `npm run test:int` |
| ADM-S-01 | Suspender, reactivar y alta | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| ADM-S-02 | Instituciones, auditoría y gamificación | Sys | Pos./Neg. | Como en §6.1 | `npm run test:e2e` |
| ADM-S-03 | Diseño (RNF-022, RNF-023) | Sys | Accesibilidad | Sin desbordes; 48 px; filas en laptops | `npm run test:e2e` |
| ADM-S-04 | Carga (RNF-001) | Sys | Rendimiento | Ver §6.3 | `npm run test:administracion --workspace @lectoaventura/tests-load` |
| ADM-A-01..07 | 7 escenarios Gherkin (RF-076 a RF-078, RN-17) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 10/10 — casos de uso con puertos y anticorrupción; la auditoría en memoria sigue la regla de la base.
- **Cobertura unitaria alcanzable** ............. 10/10 — dominio y aplicación de la administración cubiertos; los cambios en IAM, Escuela y Gamificación también.
- **Aislamiento de dependencias** ............... 10/10 — Administración usa los otros módulos solo por su `public-api`; los accesos se auditan con un decorador del shared-kernel.
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas; escenario k6 propio en CI.
- **Resiliencia ante fallos (edge cases)** ...... 10/10 — sesiones abiertas al suspender, códigos de familia pendientes, nombres escritos distinto, versiones inválidas y retención cubiertos.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
