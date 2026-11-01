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

<<archivo:apps/api/test/unit/administracion/administracion.spec.ts>>

`apps/api/test/unit/iam/aplicacion/administrar-docentes.spec.ts`:

<<archivo:apps/api/test/unit/iam/aplicacion/administrar-docentes.spec.ts>>

`apps/api/test/unit/escuela/aplicacion/instituciones.spec.ts`:

<<archivo:apps/api/test/unit/escuela/aplicacion/instituciones.spec.ts>>

`apps/api/test/unit/gamificacion/aplicacion/parametros-admin.spec.ts`:

<<archivo:apps/api/test/unit/gamificacion/aplicacion/parametros-admin.spec.ts>>

`apps/api/test/unit/administracion/dobles.ts`:

<<archivo:apps/api/test/unit/administracion/dobles.ts>>

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

<<archivo:apps/api/test/integration/administracion/administracion-http.int-spec.ts>>

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

<<archivo:tests/e2e/specs/administracion/administracion.spec.ts>>

`tests/e2e/support/administracion.ts`:

<<archivo:tests/e2e/support/administracion.ts>>

`tests/load/sembrar-administracion.mjs`:

<<archivo:tests/load/sembrar-administracion.mjs>>

`tests/load/scenarios/administracion.js`:

<<archivo:tests/load/scenarios/administracion.js>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/administracion/administracion.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/administracion.steps.ts>>

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
