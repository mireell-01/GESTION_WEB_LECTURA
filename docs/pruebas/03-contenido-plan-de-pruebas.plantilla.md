# Plan Maestro de Pruebas — Módulo 3: Biblioteca y gestión de contenido

> **Proyecto:** LectoAventura · **Módulo:** `apps/api/src/modules/contenido` + backoffice de contenido (editor y revisor) y biblioteca de docentes, familias y niños
> **Requisitos cubiertos:** RF-021 a RF-029, RN-15, RF-018 (catálogo real para asignar), RF-077 (parcial: flujo editorial), RF-011 (backoffice con MFA), RNF-001, RNF-006, RNF-019, RNF-022, RNF-023, RNF-031 y convenciones del API (SRS §7)
> **Fecha de ejecución:** 16–17/10/2026 · **Resultado global:** ✅ 467 pruebas automatizadas en verde en los 4 niveles (las de los Módulos 1 y 2 siguen pasando)

| Nivel | Pruebas (total del proyecto) | Nuevas del Módulo 3 | Resultado | Tiempo |
| :--- | ---: | ---: | :--- | ---: |
| 1 · Unitarias (Vitest) | 280 | 60 | ✅ 280/280 · cobertura 96,5 % líneas / 92,4 % ramas | 17 s |
| 2 · Integración (Supertest + PostgreSQL real) | 82 | 10 | ✅ 82/82 | 77 s |
| 3 · Sistema E2E (Playwright: computadora 1280 px, tablet 820 px y celular 390 px) | 81 | 12 | ✅ 81/81 en una sola corrida completa contra la compilación de producción | 6,2 min |
| 3 · Carga (RNF-001) | 4 mediciones | 4 | ✅ 0 % errores · p95 entre 66 y 104 ms | 1 min |
| 4 · Aceptación (Gherkin en español) | 24 escenarios | 5 | ✅ 24/24 · informe para el Product Owner | 2,0 min |

**Defectos encontrados por las pruebas y corregidos:** 13 · **Brechas con el SRS cerradas:** 11 · **Decisiones documentadas donde el SRS no decía cómo:** 6 (ver §1.3).

---

# 1. DIAGNÓSTICO ARQUITECTÓNICO Y DE TESTABILIDAD DEL MÓDULO

## 1.1 Lenguaje, runtime y framework detectados

| Capa | Tecnología |
| :--- | :--- |
| Lenguaje | TypeScript 5.6 (modo `strict`, `noUncheckedIndexedAccess`) |
| Runtime | Node.js 22.23 (Windows 11 en desarrollo; Ubuntu en CI) |
| Backend | NestJS 10.4 · Monolito modular + Clean Architecture + DDD (ADR-001) |
| Persistencia | PostgreSQL 16 + Prisma 5.22, schema `contenido` (9 tablas, SRS §7) + una columna nueva (`comentario_revision`) |
| Archivos | Carpeta local con el mismo contrato que S3 (URL firmada HMAC-SHA256 de 10 min); sin dependencias nuevas |
| Imágenes | Conversión a WebP en el navegador (`canvas.toBlob`), sin librerías nuevas |
| Frontend | Next.js 15.5 (App Router) + React 19 · design system propio `@lectoaventura/ui` |

## 1.2 Mapa de dependencias del módulo

```
interface  BackofficeLecturasController (/backoffice/lecturas/*, /backoffice/recursos/*; EDITOR y REVISOR con MFA)
           BibliotecaController (/biblioteca, /biblioteca/{id}, /biblioteca/recursos/{id})
           DTO de entrada (class-validator) · cuerpo binario solo en PUT /backoffice/recursos/{id}/archivo
   │  usa CasosUsoContenido (token CASOS_USO_CONTENIDO)
   ▼
application AutoriaUseCase (crear, borrador, unir/dividir, actividades, historia, versión nueva)
           PublicacionUseCase (enviar, aprobar, rechazar, archivar, listar, detalle)
           RecursosUseCase (URL firmada, recibir el archivo, quitar, entregar)
           BibliotecaUseCase (filtros, alcance del estudiante, paginación por cursor)
   │  puertos: LecturaRepository, AlmacenArchivos, FirmadorSubidas, IdentidadLectores (IAM), BusEventos
   ▼
domain     Lectura · VersionLectura (BORRADOR → EN_REVISION → PUBLICADA → ARCHIVADA)
           VO MetadatosLectura · servicios: segmentador, actividades, grafo de historia, política de recursos
           errores de negocio · eventos (creada, enviada, publicada, rechazada, versión nueva, archivada)

infrastructure PrismaLecturaRepository · AlmacenDiscoLocal · FirmadorSubidasHmac · IdentidadLectoresIam
               CatalogoLecturas (se registra en el shared-kernel para Escuela)

Otros módulos (solo por su public-api o por el shared-kernel):
  IAM ─────────── rango de edad del estudiante (IamFacade); guard global con MFA para el backoffice (RF-011)
  shared-kernel ─ CatalogoAsignable: Contenido aporta las lecturas publicadas a las asignaciones (Módulo 2)
                  NivelLector: el Módulo 7 registrará el nivel real; hoy se usa el de la edad
  Administración  escucha los eventos de Contenido y los guarda en admin.auditoria (RF-077)
```

| Dependencia | Tipo | Nivel 1 (unitarias) | Nivel 2 (integración) |
| :--- | :--- | :--- | :--- |
| `LecturaRepository` | Interna (puerto) | `LecturasEnMemoria` (`test/unit/contenido/dobles.ts`): copia los datos y respeta que solo el borrador cambia | **Real**: Prisma + PostgreSQL, 9 tablas |
| `AlmacenArchivos` | Interna (puerto) | `AlmacenEnMemoria` + prueba propia del adaptador de disco | **Real**: carpeta temporal (`ALMACEN_DIR`) |
| `FirmadorSubidas` | Interna (puerto) | Adaptador real HMAC (firma alterada, vencida, secreto corto) | **Real** |
| `IdentidadLectores` (IAM) | Interna (anticorrupción) | `LectoresFalsos` | **Real**: `IamFacade` + `iam.perfil_estudiante` |
| `ResolutorNivelLector` | Interna (registro) | `NivelLectorFalso` | Nivel por edad (sin Módulo 7) |
| `BusEventos` + Outbox + auditoría | Interna | `BusEspia` | **Real**: `admin.outbox_evento` y `admin.auditoria` |
| Reloj y generador de ids | Inyectados | Controlables | Reales (UUID v7) |

## 1.3 Deuda técnica, problemas de testabilidad y defectos encontrados

**Defectos encontrados por esta suite (todos corregidos y cubiertos por una prueba):**

| # | Hallazgo | Nivel que lo detectó | Corrección |
| :--- | :--- | :--- | :--- |
| C-1 | Las imágenes protegidas no se veían: la sesión vive solo en memoria (no en cookies) y un `<img src>` no puede enviar el token | 3 · navegador | `ArchivoProtegido` pide el archivo con la sesión y lo muestra como `blob:`; las URL de la biblioteca son inmutables y cacheables |
| C-2 | Las tarjetas de la biblioteca y de las aulas se veían angostas: la regla `.la-tarjeta a:not(.la-boton)` las ponía en `inline-flex` | 3 · `responsivo.spec.ts` + revisión visual | Regla más específica `a.ficha` / `a.aula-enlace` en `grid` |
| C-3 | El rango de "acentos combinados" de dos expresiones regulares estaba escrito con los caracteres invisibles en vez de `̀-ͯ` (en Contenido y en las tarjetas de Escuela): funcionaba, pero un editor podía romperlo sin que se notara | Revisión de código | Escrito con escapes; las pruebas de pistas que revelan la respuesta y de tarjetas lo cubren |
| C-4 | La capa `interface` y la raíz del módulo importaban tipos del `domain`, contra las reglas de arquitectura (ADR-001) | Estático · `eslint-plugin-boundaries` | `application/dto/contrato-contenido.ts` reexporta lo que necesita la interfaz |
| C-5 | Quedaba el andamiaje de ejemplo del módulo, con `POST /contenido/demo` que devolvía lo recibido: superficie de ataque sin uso | Auditoría del módulo | Eliminado junto con las entidades de ejemplo |
| C-6 | Una prueba unitaria aceptaba cualquier error con `.catch(...)` | Revisión de pruebas | `await expect(...).rejects.toThrow(VersionNoEditableError)` |
| C-7 | En integración, armar una petición antes de esperar el token de otra dejaba a Supertest sin servidor (`address` nulo) | 2 · Supertest | El token se obtiene antes de armar la petición |
| C-8 | La imagen PNG de la prueba E2E estaba mal formada: el navegador respondía "The source image could not be decoded" | 3 · `biblioteca.spec.ts` | PNG de 2×2 generado con su CRC y su zlib correctos; ahora se comprueba la conversión real a WebP |
| C-9 | Selectores ambiguos en pruebas nuevas: el resumen de la ficha repite el comienzo del texto; `getByText('Tocar la luna')` (sin `exact`) encontraba «quería tocar la luna» del propio texto; "Borrador responsivo" se repetía entre dispositivos (el equipo ve los borradores de todas) | 3 · Playwright | Se espera el detalle y se busca dentro del artículo; coincidencia exacta y se comprueba además que no se vean ni la pista ni la explicación; títulos únicos por prueba |
| C-10 | Carrera en las pruebas: `page.goto` justo después de `ingresarComoAdulto` (que no espera, a propósito) cortaba el ingreso; una prueba de 7 pantallas necesitaba más de 60 s | 3 y 4 · con la web compilada | Se espera la URL del panel antes de navegar; tiempo de 150 s para esa prueba |
| C-11 | La IP simulada por prueba salía de solo 250 direcciones: dos pruebas del mismo minuto podían compartirla y sumar 10 ingresos (429, RNF-019) | 3 · traza de Playwright | IP del prefijo de documentación IPv6 `2001:db8::/32` con 32 bits al azar (se verificó que el límite separa cada IP) |
| C-12 | Entorno local: en Windows, `nest --watch` se reiniciaba incluso al **leer** archivos del proyecto, y Next en desarrollo compila cada página la primera vez (hasta 16 s): la primera corrida falló en cadena en celular | 3 · registros de la API y de la web | Las E2E y el UAT locales se corren contra la compilación de producción, como en CI (`api-compilada` y `web-compilada` en `.claude/launch.json`): 81 pruebas en unos 9 min en vez de 30 |
| C-13 | Con las lecturas que publican las pruebas anteriores, la que buscaba una prueba podía quedar en la página 2 de la biblioteca (12 por página, orden alfabético) | 3 · celular, al final de la corrida | Cada prueba da a su lectura una temática única y filtra por ella (`filtrarPorTema`), como haría una docente |

**Brechas con el SRS cerradas (el módulo era solo un andamiaje; todas con pruebas):**

| # | Requisito | Qué faltaba | Implementación | Pruebas |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | RF-021 | Crear lecturas con sus metadatos | Título, edad (6–7, 8–9, 10–12), nivel 1–5, temática, tipo de texto, habilidades objetivo y licencia; la licencia es obligatoria para enviar | U + I + S + UAT |
| B-2 | RF-022 | Segmentación en oraciones | Corta tras `. ! ? …` sin cortar abreviaturas, iniciales ni números; cada línea es un párrafo; al editar el texto se **conservan los ids** de lo que no cambió; el editor une o corta a mano | U + I + S |
| B-3 | RF-023 | Recursos multimedia | URL firmada de 10 min; la API comprueba la **firma real** del archivo (WebP/AVIF, MP3/OGG/WebM/M4A), el peso (200 KB / 2 MB) y que sea exactamente lo declarado; texto alternativo obligatorio | U + I + S |
| B-4 | RF-024 | Actividades antes, durante y después | "Durante" exige oración de anclaje; selección, ordenar, completar, evidencia y respuesta abierta | U + I + S |
| B-5 | RF-025 | Pistas y evidencias | Pistas P1 a P3 en orden (P1 obligatoria en ítems cerrados), evidencias que son oraciones del texto, explicación modelada; una pista que **revela la respuesta** impide enviar | U + I |
| B-6 | RF-026 / RN-15 | Flujo editorial | Enviar → aprobar o devolver con comentario; el autor nunca aprueba lo suyo (dominio + `CHECK` de la base); en revisión nadie edita | U + I + S + UAT |
| B-7 | RF-027 | Versiones | Editar lo publicado crea la versión N+1; la publicada no cambia hasta aprobar la nueva; anclajes y evidencias se trasladan a los ids nuevos | U + I + UAT |
| B-8 | RF-028 | Biblioteca | Adultos: filtros por edad, nivel, temática, tipo y habilidad; niño: solo su edad y su nivel ± 1; sin respuestas; 12 por página con cursor | U + I + S + UAT + carga |
| B-9 | RF-029 | Historias ramificadas | Un inicio, hasta 3 decisiones por nodo, finales sin salida, sin ciclos ni nodos sueltos | U |
| B-10 | RF-018 | El catálogo para asignar estaba vacío (deuda del Módulo 2) | Las lecturas publicadas aparecen solas al crear una asignación y salen al archivarse | I + S + UAT |
| B-11 | RNF-006 / RF-077 | Peso máximo y auditoría del flujo editorial | Una lectura de más de 1,5 MB no se envía; enviar, publicar, devolver, versión nueva y archivar quedan en `admin.auditoria` con actor y rol | U + I |

**Decisiones de diseño (el SRS no decía cómo):**
- **Comentario del revisor:** columna nueva `contenido.version_lectura.comentario_revision` (migración `20261020000000_comentario_revision`); se limpia al volver a enviar.
- **Archivos:** carpeta local `ALMACEN_DIR` (fuera de Git) con el mismo contrato que S3; cambiar a S3 es reemplazar un adaptador. La firma usa separación de dominio (`subidas:`) para no confundirse con un JWT.
- **WebP en el navegador:** la imagen se convierte antes de subirla (≤ 200 KB); el servidor no necesita librerías de imágenes y rechaza lo que no sea WebP/AVIF de verdad.
- **Nivel del niño:** hasta que llegue el perfil lector (Módulo 7), sale de su edad (6–7 → 1, 8–9 → 2, 10–12 → 3) y ve ese nivel ± 1.
- **Cuentas del backoffice:** EDITOR y REVISOR no se registran solas; en desarrollo se invitan con `npm run cuenta:backoffice` (la persona elige su contraseña con el enlace de recuperación y configura su MFA al entrar). El alta desde la administración llega con el Módulo 12.
- **RNF-006** se comprueba al enviar a revisión (texto + actividades + historia + recursos).

**Deuda técnica pendiente (no bloqueante, registrada):**

| Tema | Riesgo | Propuesta |
| :--- | :--- | :--- |
| Archivos en disco local | Con varias instancias de la API cada una tendría su carpeta | Adaptador S3 al desplegar (el puerto `AlmacenArchivos` ya existe) |
| Archivos sin referencia | Quitar un recurso no borra el archivo, porque otras versiones pueden compartirlo | Recolector periódico de claves sin referencia |
| Duración del audio | La mide el navegador; la API valida el rango (1–900 s) pero no la lee del archivo | Leer la duración del contenedor al recibirlo |
| Leer la lectura con sus actividades | El niño ve el texto y "muy pronto"; el lector llega con el Módulo 6 | Enlazar el detalle con la sesión de lectura |
| Nivel lector real | Hoy el nivel sale de la edad | El Módulo 7 registra su `ResolutorNivelLector` en el shared-kernel |
| Alta de editores y revisores | Solo por script en desarrollo | Gestión de cuentas en la administración (RF-076, Módulo 12) |
| Heredadas | Outbox no transaccional; límite de tasa en memoria; secreto MFA sin cifrar; la API en modo `watch` se reinicia durante las E2E (resuelto en local corriendo las suites contra la compilación, ver C-12) | Ver informes de los Módulos 1 y 2 |

---

# 2. MATRIZ DE APLICATIVOS Y HERRAMIENTAS REQUERIDAS (STACK 2026-2027)

No se instaló ninguna dependencia nueva: el módulo usa las mismas herramientas de los Módulos 1 y 2.

| Nivel de prueba | Librería / framework principal | Aplicativo / motor necesario | Propósito en el módulo | Comando de instalación |
| :--- | :--- | :--- | :--- | :--- |
| Estático | ESLint 9 + `eslint-plugin-boundaries` + TypeScript | Node.js 22 | Contenido usa IAM solo por su `public-api`; Escuela y Administración no conocen a Contenido | `npm ci` |
| 1 · Unitarias | Vitest 3.2 + `@vitest/coverage-v8` + `unplugin-swc` | Node.js 22 | Dominio (segmentador, actividades, grafo, recursos, versiones), casos de uso con dobles, firma y almacén reales | Ya instalado |
| 2 · Integración | Supertest 7 + `@nestjs/testing` + PostgreSQL 16 (o Testcontainers) | PostgreSQL 16 / Docker | HTTP + base real: MFA, tablas de actividades, subida firmada, auditoría, catálogo de Escuela | Ya instalado |
| 3 · Sistema E2E | Playwright 1.64 | Microsoft Edge (local) / Chromium (CI) | Editora y revisor en la web real con MFA; imagen convertida a WebP; biblioteca de docente y niño | Ya instalado |
| 3 · Carga | k6 (`tests/load/scenarios/biblioteca.js`) + sembrado `tests/load/sembrar-biblioteca.mjs` | Binario k6 | RNF-001 en la biblioteca de adultos y niños | `winget install k6 --source winget` |
| 4 · Aceptación | playwright-bdd 9.2 | Microsoft Edge / Chromium | 5 escenarios Gherkin en español para el Product Owner | Ya instalado |

---

# 3. ESTRUCTURA DE DIRECTORIOS DE TESTING (SCAFFOLDING)

```
G.W_PROYECTO/
├── apps/api/test/
│   ├── unit/contenido/
│   │   ├── dobles.ts                          # Repositorio y almacén en memoria, lectores y nivel simulados
│   │   ├── dominio/dominio-contenido.spec.ts  # Metadatos, segmentador, actividades, grafo, recursos, versiones
│   │   ├── aplicacion/contenido-casos-de-uso.spec.ts   # Autoría, publicación, recursos y biblioteca
│   │   └── infraestructura/almacen-y-firma.spec.ts     # HMAC y carpeta local reales
│   └── integration/contenido/contenido-http.int-spec.ts  # HTTP + PostgreSQL
├── tests/
│   ├── e2e/
│   │   ├── support/contenido.ts               # Cuentas EDITOR/REVISOR con MFA, lectura publicada por la API
│   │   ├── specs/contenido/biblioteca.spec.ts
│   │   ├── specs/diseno/responsivo.spec.ts    # + backoffice de contenido y biblioteca
│   │   ├── features/contenido/biblioteca.feature
│   │   └── steps/contenido.steps.ts
│   └── load/
│       ├── sembrar-biblioteca.mjs             # Publica N lecturas por la API (solo desarrollo y CI)
│       └── scenarios/biblioteca.js            # k6
```

---

# 4. NIVEL 1: PRUEBAS UNITARIAS (UNIT TESTING)

## 4.1 Qué se evalúa
- **Dominio:** `MetadatosLectura` (límites y normalización), **segmentador** (abreviaturas, iniciales, números, versos, ids conservados, cortes manuales, 400 oraciones y 20 000 caracteres), **actividades** (orden por momento, ítems cerrados, P1, evidencias y pistas que revelan la respuesta), **grafo de historia** (inicio único, destinos, ciclos, nodos sueltos y sin salida), **política de recursos** (firma real, pesos, texto alternativo) y el agregado **`VersionLectura`** (solo el autor edita, ajustes al cambiar el texto, unir y trasladar anclajes, RN-15, rechazo con motivo, versión nueva con ids propios, RNF-006).
- **Casos de uso** con dobles: autoría completa, flujo de publicación (también si la autora tuviera el rol de revisora), listado con prioridades, subida firmada (firma alterada, vencida, de otra persona, archivo distinto de lo declarado), biblioteca de adultos y niños, detalle sin respuestas y paginación.
- **Adaptadores:** firma HMAC (vencimiento, cambios, secreto corto) y carpeta local (no se sale de su carpeta).

## 4.2 Aplicativos y librerías
Vitest 3.2 · dobles propios en `apps/api/test/unit/contenido/dobles.ts`.

## 4.3 Configuración y ejecución paso a paso
```bash
npm run test:unit
```
El reporte de cobertura queda en `apps/api/reports/unit/coverage/index.html`; ahora incluye el dominio, la aplicación y los adaptadores de archivos de Contenido (entre 92 % y 100 % de líneas por archivo).

## 4.4 Código completo del test unitario
`apps/api/test/unit/contenido/dominio/dominio-contenido.spec.ts`:

<<archivo:apps/api/test/unit/contenido/dominio/dominio-contenido.spec.ts>>

`apps/api/test/unit/contenido/aplicacion/contenido-casos-de-uso.spec.ts`:

<<archivo:apps/api/test/unit/contenido/aplicacion/contenido-casos-de-uso.spec.ts>>

`apps/api/test/unit/contenido/infraestructura/almacen-y-firma.spec.ts`:

<<archivo:apps/api/test/unit/contenido/infraestructura/almacen-y-firma.spec.ts>>

---

# 5. NIVEL 2: PRUEBAS DE INTEGRACIÓN (INTEGRATION TESTING)

## 5.1 Qué se evalúa
- **Backoffice con MFA (RF-011):** sin MFA verificado no se entra; familias y docentes reciben 403.
- **Lecturas en la base:** creación segmentada; editar el texto conserva los ids de las oraciones que no cambian; actividades con anclaje, pistas y evidencias en sus tablas (`actividad`, `item`, `pista`, `clave_evidencia`).
- **Subida firmada (RF-023):** se declara, se sube el WebP real con su token y se guarda; la biblioteca lo entrega solo si la versión está publicada.
- **Flujo editorial (RF-026, RF-077):** enviar → devolver con motivo → reenviar → aprobar; cada paso en `admin.auditoria` con actor y rol.
- **Biblioteca (RF-028):** docentes y familias ven lo publicado **sin respuestas**; la imagen se entrega con caché inmutable.
- **Módulo 2:** la lectura publicada aparece en el catálogo para asignar y sale al archivarse.
- **Versiones (RF-027):** la nueva no toca la publicada ni sus oraciones; al aprobarse la reemplaza.

## 5.2 Aplicativos y librerías
Supertest 7 · `@nestjs/testing` · PostgreSQL 16 (`lectoaventura_test`, recreada en cada ejecución) o Testcontainers en CI · carpeta temporal para los archivos.

## 5.3 Configuración y ejecución paso a paso
```bash
npm run test:int
```

## 5.4 Código completo del test de integración
`apps/api/test/integration/contenido/contenido-http.int-spec.ts`:

<<archivo:apps/api/test/integration/contenido/contenido-http.int-spec.ts>>

---

# 6. NIVEL 3: PRUEBAS DE SISTEMA (SYSTEM / E2E & PERFORMANCE)

## 6.1 Qué se evalúa
- **La editora en la web real** (con su código de verificación en dos pasos): crea el borrador, ve las oraciones, sube una imagen PNG que el navegador convierte a WebP, escribe una actividad "después" con P1 y evidencia y la envía.
- **El revisor** la devuelve con un comentario, la autora lo ve y la reenvía; el revisor la aprueba.
- **La docente** la encuentra en su biblioteca, con la imagen, sin respuestas, y puede asignarla a su aula (Módulo 2).
- **El niño** (9 años) entra con su PIN y en "Biblioteca" ve solo lo de su edad y nivel.
- **Diseño responsivo (RNF-022, RNF-023)** del backoffice (listado, editor con actividades y cortes, nueva lectura) y de la biblioteca en 1280, 820 y 390 px: sin desbordes y con objetivos táctiles ≥ 48 px.

## 6.2 Aplicativos y librerías
Playwright 1.64 con Microsoft Edge (local) o Chromium (CI) · k6 para carga.

## 6.3 Configuración y ejecución paso a paso
```bash
npm run test:e2e
```
En local conviene correr la suite contra la **compilación de producción**, como en CI: así nada reinicia los servidores durante la corrida (C-12) y las páginas no se compilan en plena prueba. Se detienen los servidores de desarrollo, se compila una vez y se arrancan las configuraciones `api-compilada` y `web-compilada` de `.claude/launch.json` (o los mismos comandos en dos terminales); Playwright los reutiliza:
```bash
npm run build --workspace @lectoaventura/api && npm run build --workspace @lectoaventura/web
```
```bash
npm run test:biblioteca --workspace @lectoaventura/tests-load
```
Al terminar, `support/limpieza.ts` borra las cuentas `@e2e.lectoaventura.test` y las lecturas que escribieron.

**Resultado de carga obtenido el 17/10/2026** (30 lecturas publicadas con `sembrar-biblioteca.mjs`; sondeo equivalente de 60 s con el mismo perfil del script k6, que se ejecuta en CI; portátil de desarrollo con la API compilada y PostgreSQL local):

| Escenario | Peticiones | Errores | p50 | p95 | p99 | Meta SRS | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| `GET /api/v1/biblioteca`, 10 docentes (12 por página) | 3 547 | 0,00 % | 54 ms | 71 ms | 85 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `GET /api/v1/biblioteca?tema=animales&nivel=2` | 3 547 | 0,00 % | 49 ms | 66 ms | 82 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `GET /api/v1/biblioteca/{id}` (detalle sin respuestas) | 3 547 | 0,00 % | 61 ms | 80 ms | 99 ms | p95 < 300 ms, p99 < 800 ms | ✅ |
| `GET /api/v1/biblioteca`, 10 niños (su edad y nivel ± 1) | 7 314 | 0,00 % | 79 ms | 104 ms | 126 ms | p95 < 300 ms, p99 < 800 ms | ✅ |

## 6.4 Código completo del test de sistema + script de carga
`tests/e2e/specs/contenido/biblioteca.spec.ts`:

<<archivo:tests/e2e/specs/contenido/biblioteca.spec.ts>>

`tests/e2e/support/contenido.ts`:

<<archivo:tests/e2e/support/contenido.ts>>

`tests/load/scenarios/biblioteca.js`:

<<archivo:tests/load/scenarios/biblioteca.js>>

`tests/load/sembrar-biblioteca.mjs`:

<<archivo:tests/load/sembrar-biblioteca.mjs>>

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

<<archivo:tests/e2e/features/contenido/biblioteca.feature>>

## 7.2 Automatización (Step Definitions)

<<archivo:tests/e2e/steps/contenido.steps.ts>>

**Checklist manual para el Product Owner / equipo de contenidos:**

| ✔ | Verificación | Resultado esperado |
| :---: | :--- | :--- |
| ☐ | Crear una cuenta EDITOR y otra REVISOR con `npm run cuenta:backoffice` y entrar | Cada una elige su contraseña con el enlace y configura la verificación en dos pasos |
| ☐ | "Lecturas → + Nueva lectura" con un texto de dos párrafos | Aparecen las oraciones numeradas; se pueden unir o cortar a mano |
| ☐ | Subir una foto con su descripción | Se convierte a WebP y se ve en el borrador; sin descripción no se puede subir |
| ☐ | Agregar una actividad "durante" sin elegir oración | No se guarda: pide la oración de anclaje |
| ☐ | Escribir una pista que diga la respuesta | El panel de revisión lo señala y no deja enviar |
| ☐ | Enviar a revisión y devolver con un comentario desde la cuenta del revisor | La autora ve el comentario y la lectura vuelve a borrador |
| ☐ | Aprobar | Queda "Publicada" y aparece en la biblioteca y al crear una asignación |
| ☐ | "Crear una versión nueva" y cambiar el título | La biblioteca sigue mostrando la versión publicada hasta aprobar la nueva |
| ☐ | Entrar como niño de 9 años y abrir "Biblioteca" | Solo ve lecturas de 8–9 años y de su nivel |
| ☐ | Revisar todo en celular, tablet y computadora | Sin desplazarse a los lados; botones fáciles de tocar |

## 7.3 Ejecutar y aprobar el UAT
```bash
npm run test:uat
```
Abrir `tests/e2e/reportes/uat/informe-uat.html`, revisarlo con el Product Owner y firmar la línea "Responsable de aprobación" de `biblioteca.feature`.

---

# 8. GUÍA DE AI SKILLS, MCP Y AUTOMATIZACIÓN AGÉNTICA (2026-2027)
Se usa la misma skill del Módulo 1 (`.claude/skills/pruebas-modulo/SKILL.md`), ahora con `/pruebas-modulo contenido`. Los servidores MCP recomendados (Playwright, PostgreSQL de solo lectura sobre `lectoaventura_test`, GitHub) y el flujo de auto-reparación están en el informe del Módulo 1, §8. Para este módulo, el MCP de PostgreSQL ayuda a revisar `contenido.oracion`, `contenido.clave_evidencia` y `admin.auditoria` después de una prueba.

---

# 9. PIPELINE CI/CD (QUALITY GATES)
El workflow `.github/workflows/calidad.yml` ya ejecuta los 4 niveles; las pruebas nuevas entran solas por sus carpetas. Se agregó el humo de carga de la biblioteca (con su sembrado):

```yaml
      - run: |
          npm run start --workspace @lectoaventura/api &
          npx wait-on -t 120000 http-get://localhost:3001/api/v1/dev/correos
          k6 run -e DURACION=30s tests/load/scenarios/iam-sesiones.js
          k6 run -e DURACION=30s tests/load/scenarios/escuela-panel.js
          node tests/load/sembrar-biblioteca.mjs
          k6 run -e DURACION=30s tests/load/scenarios/biblioteca.js
```

---

# 10. MATRIZ DE TRAZABILIDAD DE PRUEBAS DEL MÓDULO

| ID caso | Funcionalidad / método | Nivel | Tipo | Resultado esperado | Comando |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CON-U-01 | `MetadatosLectura` (RF-021) | Unit | Pos./Neg. | Normaliza; rechaza título, edad, nivel, tipo o habilidades inválidos; borrador sin licencia permitido | `npm run test:unit` |
| CON-U-02 | Segmentador (RF-022) | Unit | Borde | No corta en "Sr.", "J. R." ni "3.5"; líneas = párrafos; ids conservados; cortes manuales respetados; 400 / 20 000 | `npm run test:unit` |
| CON-U-03 | Unir y dividir (RF-022) | Unit | Pos./Neg. | Solo con la siguiente del mismo párrafo; dividir solo entre palabras; anclajes y evidencias trasladados | `npm run test:unit` |
| CON-U-04 | Actividades (RF-024, RF-025) | Unit | Pos./Neg. | "Durante" con anclaje; P1 en cerrados; evidencias del texto; pista que revela la respuesta detectada | `npm run test:unit` |
| CON-U-05 | Grafo de historia (RF-029) | Unit | Borde | Un inicio; destinos existentes; sin ciclos, nodos sueltos ni nodos sin salida | `npm run test:unit` |
| CON-U-06 | Política de recursos (RF-023) | Unit | Neg./Borde | Formato por firma real; 200 KB / 2 MB; texto alternativo; archivo igual a lo declarado | `npm run test:unit` |
| CON-U-07 | `VersionLectura` (RF-026, RF-027, RN-15, RNF-006) | Unit | Pos./Neg. | Estados; el autor no aprueba; rechazo con motivo; versión nueva con ids propios; > 1,5 MB no se envía | `npm run test:unit` |
| CON-U-08 | `AutoriaUseCase` | Unit | Pos./Neg. | Solo la autora edita su borrador; en revisión nadie edita; historia y cortes guardados | `npm run test:unit` |
| CON-U-09 | `PublicacionUseCase` | Unit | Pos./Neg. | Incompleta no se envía; aprobar archiva la anterior; archivar autora o revisor; prioridades del listado | `npm run test:unit` |
| CON-U-10 | `RecursosUseCase` | Unit | Negativo | Firma alterada, vencida o ajena y archivo distinto rechazados; la biblioteca solo entrega lo publicado | `npm run test:unit` |
| CON-U-11 | `BibliotecaUseCase` (RF-028) | Unit | Pos./Borde | Adultos sin borradores y con filtros; niño con su edad y nivel ± 1; detalle sin respuestas; cursor | `npm run test:unit` |
| CON-U-12 | `FirmadorSubidasHmac` / `AlmacenDiscoLocal` | Unit | Neg./Borde | Firma vence y se invalida con cualquier cambio; secreto ≥ 32; no sale de su carpeta | `npm run test:unit` |
| CON-I-01 | Backoffice con MFA (RF-011) | Int | Negativo | Sin MFA, familia o docente: rechazado | `npm run test:int` |
| CON-I-02 | Crear y editar (RF-021, RF-022) | Int | Positivo | Borrador segmentado; ids conservados al editar | `npm run test:int` |
| CON-I-03 | Actividades en la base (RF-024, RF-025) | Int | Positivo | Filas en `actividad`, `item`, `pista`, `clave_evidencia` | `npm run test:int` |
| CON-I-04 | Subida firmada (RF-023) | Int | Pos./Neg. | WebP real guardado; entregado solo si está publicado | `npm run test:int` |
| CON-I-05 | Flujo editorial y auditoría (RF-026, RF-077) | Int | Positivo | Cada paso en `admin.auditoria` con actor y rol | `npm run test:int` |
| CON-I-06 | Biblioteca (RF-028) | Int | Positivo | Sin respuestas; imagen con caché inmutable | `npm run test:int` |
| CON-I-07 | Catálogo de Escuela (RF-018) | Int | Positivo | La publicada se puede asignar; archivada ya no | `npm run test:int` |
| CON-I-08 | Versiones (RF-027) | Int | Positivo | La publicada y sus oraciones intactas hasta aprobar la nueva | `npm run test:int` |
| CON-S-01 | Editora → revisor → docente en la web (RF-021 a RF-026, RF-028) | Sys | Positivo | En 1280, 820 y 390 px | `npm run test:e2e` |
| CON-S-02 | Biblioteca del niño (RF-028) | Sys | Pos./Neg. | Ve lo de su edad; no ve lo de 10–12 | `npm run test:e2e` |
| CON-S-03 | Publicada → asignable en el aula (RF-018) | Sys | Positivo | Aparece en "+ Nueva asignación" | `npm run test:e2e` |
| CON-S-04 | Backoffice y biblioteca responsivos (RNF-022, RNF-023) | Sys | Borde | 0 px de desborde y ≥ 48 px | `npm run test:e2e` |
| CON-S-05 | Carga RNF-001 | Sys | Rendimiento | Ver §6.3 | `npm run test:biblioteca --workspace @lectoaventura/tests-load` |
| CON-A-01..05 | 5 escenarios Gherkin (RF-021, RF-026 a RF-028) | UAT | Pos./Neg. | Ver §7.1 | `npm run test:uat` |

---

# EVALUACIÓN FINAL DEL MÓDULO AUDITADO
- **Testabilidad del código actual** ............ 9/10 — reglas puras en el dominio (segmentador, actividades, grafo, recursos); casos de uso con puertos; reloj e ids inyectados.
- **Cobertura unitaria alcanzable** ............. 9/10 — dominio y aplicación de Contenido entre 92 % y 100 % de líneas.
- **Aislamiento de dependencias** ............... 9/10 — IAM por su `public-api`; Escuela recibe las lecturas por el shared-kernel; archivos detrás de un puerto (disco hoy, S3 mañana).
- **Preparación para CI/CD** .................... 9/10 — suites nuevas entran solas en el pipeline; humo de carga k6 de la biblioteca agregado con su sembrado.
- **Resiliencia ante fallos (edge cases)** ...... 9/10 — firma de archivos y subidas, versiones inmutables, RN-15 en dominio y base, límites de texto, peso y grafo; pendiente recolectar archivos sin referencia.

# ESTADO DE CALIDAD (QUALITY READINESS)
- **Unit Test Ready**        → ✅ Listo
- **Integration Ready**      → ✅ Listo
- **System / E2E Ready**     → ✅ Listo (carga verificada con sondeo; k6 en CI)
- **UAT / Business Ready**   → ✅ Listo para firma del Product Owner
