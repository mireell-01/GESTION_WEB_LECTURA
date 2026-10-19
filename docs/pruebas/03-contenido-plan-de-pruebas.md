<!-- Generado con node docs/pruebas/construir.mjs desde 03-contenido-plan-de-pruebas.plantilla.md. No editar a mano. -->
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

```ts
import { describe, expect, it } from 'vitest';

import { Lectura } from '../../../../src/modules/contenido/domain/entities/lectura';
import { PESO_MAXIMO_LECTURA, VersionLectura } from '../../../../src/modules/contenido/domain/entities/version-lectura';
import {
  AutorNoPuedeAprobarError,
  DatoLecturaInvalidoError,
  LecturaIncompletaError,
  NoEsAutorError,
  TransicionInvalidaError,
  VersionNoEditableError,
} from '../../../../src/modules/contenido/domain/errors/errores-contenido';
import { construirActividades, problemasDeActividades } from '../../../../src/modules/contenido/domain/services/actividades';
import { construirGrafo, problemasDelGrafo } from '../../../../src/modules/contenido/domain/services/grafo-historia';
import { detectarTipoMime, validarArchivo, validarDeclaracion } from '../../../../src/modules/contenido/domain/services/politica-recursos';
import { dividir, partirParrafo, segmentar, textoDe, unirConSiguiente } from '../../../../src/modules/contenido/domain/services/segmentador';
import { MetadatosLectura } from '../../../../src/modules/contenido/domain/value-objects/metadatos-lectura';
import { actividadesCompletas, meta, metadatos, TEXTO } from '../dobles';

/** Nivel 1 — Dominio de Contenido (RF-021 a RF-029, RN-06, RN-14, RN-15, RNF-006). */
const AHORA = new Date('2026-10-20T15:00:00Z');
const ids = () => {
  let n = 0;
  return () => `n-${++n}`;
};

describe('Metadatos de la lectura (RF-021)', () => {
  it('normaliza y acepta un borrador sin licencia ni habilidades', () => {
    const m = MetadatosLectura.de(metadatos({ titulo: '  El zorro  ', licencia: '  ', habilidadesObjetivo: [] }));
    expect(m.titulo).toBe('El zorro');
    expect(m.licencia).toBeNull();
  });

  it.each([
    [{ titulo: 'Ab' }, /título/],
    [{ rangoEdad: 'R4' }, /rango de edad/],
    [{ nivelDificultad: 6 }, /1 a 5/],
    [{ tematica: 'x' }, /temática/],
    [{ tipoTexto: 'NOVELA' }, /tipo de texto/],
    [{ habilidadesObjetivo: ['LIT', 'MAT'] }, /LIT, INF/],
  ])('rechaza %o', (cambio, mensaje) => {
    expect(() => MetadatosLectura.de(metadatos(cambio))).toThrow(mensaje);
  });
});

describe('Segmentación en oraciones (RF-022)', () => {
  it('corta tras . ! ? … sin cortar en abreviaturas, iniciales ni números', () => {
    expect(partirParrafo('El Sr. Pérez llegó. ¿Viste? ¡Sí! Midió 3.5 metros… Luego se fue.')).toEqual([
      'El Sr. Pérez llegó.', '¿Viste?', '¡Sí!', 'Midió 3.5 metros…', 'Luego se fue.',
    ]);
    expect(partirParrafo('Lo escribió J. R. Ribeyro. Es peruano.')).toEqual(['Lo escribió J. R. Ribeyro.', 'Es peruano.']);
    expect(partirParrafo('Dijo: "Ven aquí." Y vino.')).toEqual(['Dijo: "Ven aquí."', 'Y vino.']);
  });

  it('cada línea es un párrafo (los versos de un poema quedan separados)', () => {
    const o = segmentar('Verso uno\n\nVerso   dos\nVerso tres.', [], ids());
    expect(o.map((x) => [x.parrafo, x.texto])).toEqual([[1, 'Verso uno'], [2, 'Verso dos'], [3, 'Verso tres.']]);
    expect(textoDe(o)).toBe('Verso uno\n\nVerso dos\n\nVerso tres.');
  });

  it('las oraciones que no cambian conservan su id; las nuevas reciben uno nuevo', () => {
    const generar = ids();
    const antes = segmentar(TEXTO, [], generar);
    const despues = segmentar(TEXTO.replace('cada noche', 'todas las noches'), antes, generar);
    expect(despues.map((o) => o.id)).toEqual(['n-7', ...antes.slice(1).map((o) => o.id)]);
  });

  it('respeta un corte o una unión hechos a mano mientras su texto no cambie', () => {
    const generar = ids();
    const base = segmentar('Era un día gris y frío. Llovía.', [], generar);
    const unidas = unirConSiguiente(base, base[0]!.id).oraciones;
    const cortada = dividir(unidas, unidas[0]!.id, 'Era un día gris'.length, generar);
    expect(cortada.map((o) => o.texto)).toEqual(['Era un día gris', 'y frío. Llovía.']);
    // Se agrega una oración al final: los cortes manuales siguen.
    const resegmentada = segmentar('Era un día gris y frío. Llovía. Fin.', cortada, generar);
    expect(resegmentada.map((o) => o.texto)).toEqual(['Era un día gris', 'y frío. Llovía.', 'Fin.']);
    expect(resegmentada.slice(0, 2).map((o) => o.id)).toEqual(cortada.map((o) => o.id));
  });

  it('unir solo con la siguiente del mismo párrafo; dividir solo entre palabras', () => {
    const o = segmentar('Uno. Dos.\nTres.', [], ids());
    expect(() => unirConSiguiente(o, o[1]!.id)).toThrow(/mismo párrafo/);
    expect(() => dividir(o, o[0]!.id, 2, ids())).toThrow(/entre dos palabras/);
    expect(() => unirConSiguiente(o, 'no-existe')).toThrow(DatoLecturaInvalidoError);
  });

  it('límites: hasta 400 oraciones y 20 000 caracteres', () => {
    expect(() => segmentar('Hola. '.repeat(401), [], ids())).toThrow(/400 oraciones/);
    expect(() => segmentar('a'.repeat(20_001), [], ids())).toThrow(/20/);
  });
});

describe('Actividades, ítems y pistas (RF-024, RF-025, RN-06, RN-15)', () => {
  const oraciones = segmentar(TEXTO, [], ids());
  const set = new Set(oraciones.map((o) => o.id));
  const completas = () => construirActividades(actividadesCompletas(oraciones.map((o) => o.id)), set, ids());

  it('ordena por momento, numera y deriva si el ítem es cerrado', () => {
    const a = completas();
    expect(a.map((x) => [x.orden, x.momento])).toEqual([[1, 'ANTES'], [2, 'DURANTE'], [3, 'DESPUES']]);
    expect(a[1]!.items[0]).toMatchObject({ esCerrado: true, contenido: { opciones: ['Tocar la luna', 'Dormir', 'Comer'] }, respuestaCorrecta: { indice: 0 } });
    expect(a[0]!.items[0]!.esCerrado).toBe(false);
    expect(problemasDeActividades(a)).toEqual([]);
  });

  it.each([
    [{ momento: 'DURANTE', tipo: 'SELECCION', items: [] }, /oración donde aparece/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [] }, /entre 1 y 10/],
    [{ momento: 'ANTES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', explicacionModelada: 'Porque sí' }] }, /no corresponde/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'a'], indiceCorrecto: 0, explicacionModelada: 'Porque sí' }] }, /repetidas/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'B'], indiceCorrecto: 5, explicacionModelada: 'Porque sí' }] }, /opción correcta/],
    [{ momento: 'ANTES', tipo: 'ORDENAMIENTO', items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: 'Ordena', elementos: ['Solo uno'], explicacionModelada: 'Porque sí' }] }, /de 2 a 8/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'B'], indiceCorrecto: 0, explicacionModelada: '' }] }, /explicación modelada/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'B'], indiceCorrecto: 0, explicacionModelada: 'Porque sí', pistas: [{ nivel: 'P2', texto: 'Segunda pista' }] }] }, /empezando por P1/],
    [{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca', clavesEvidencia: ['otra-version'], explicacionModelada: 'Porque sí' }] }, /oraciones de esta lectura/],
  ])('rechaza estructuras imposibles al guardar (%#)', (actividad, mensaje) => {
    expect(() => construirActividades([actividad], set, ids())).toThrow(mensaje);
  });

  it('para enviar a revisión: actividad "después", P1 en cerrados, evidencias y pistas que no revelan la respuesta', () => {
    const a = completas();
    a.pop(); // sin actividad "después"
    a[1]!.items[0]!.pistas = [{ nivel: 'P1', texto: 'La respuesta es tocar la luna' }];
    const sinEvidencia = construirActividades([{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la oración', explicacionModelada: 'Porque sí' }] }], set, ids());
    expect(problemasDeActividades(a)).toEqual(['Agrega al menos una actividad para después de leer', 'Actividad 2, pregunta 1: una pista revela la respuesta correcta']);
    expect(problemasDeActividades(sinEvidencia)).toEqual(['Actividad 1, pregunta 1: falta la pista P1', 'Actividad 1, pregunta 1: marca las oraciones que son evidencia']);
  });
});

describe('Historia ramificada (RF-029)', () => {
  const nodo = (clave: string, opciones: string[] = [], extra = {}) => ({
    clave, contenido: `Texto de ${clave}`, opciones: opciones.map((d) => ({ texto: `Ir a ${d}`, destino: d })), ...extra,
  });

  it('una historia válida: un inicio, decisiones que llevan a finales, sin ciclos', () => {
    const g = construirGrafo([nodo('inicio', ['a', 'b'], { esInicio: true }), nodo('a', ['fin']), nodo('b', [], { esFinal: true }), nodo('fin', [], { esFinal: true })], ids());
    expect(problemasDelGrafo(g)).toEqual([]);
    expect(problemasDelGrafo([])).toEqual([]);
  });

  it('al guardar exige nombres únicos y destinos que existan', () => {
    expect(() => construirGrafo([nodo('a'), nodo('a')], ids())).toThrow(/mismo nombre/);
    expect(() => construirGrafo([nodo('a', ['zeta'])], ids())).toThrow(/no existe/);
  });

  it('antes de publicar detecta ciclos, nodos sueltos, finales con decisiones y nodos sin salida', () => {
    const ciclo = construirGrafo([nodo('i', ['x'], { esInicio: true }), nodo('x', ['y']), nodo('y', ['x']), nodo('f', [], { esFinal: true })], ids());
    expect(problemasDelGrafo(ciclo)).toEqual(expect.arrayContaining([expect.stringMatching(/ciclo/), expect.stringMatching(/No se llega desde el inicio a: "f"/)]));
    const raro = construirGrafo([nodo('i', ['f']), nodo('f', ['i'], { esFinal: true }), nodo('s')], ids());
    expect(problemasDelGrafo(raro)).toEqual(expect.arrayContaining([
      'La historia debe tener exactamente un nodo de inicio',
      'El final "f" no debe tener decisiones',
      'El nodo "s" necesita al menos una decisión o ser un final',
    ]));
  });
});

describe('Recursos (RF-023)', () => {
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);
  const avif = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(20)]);

  it('reconoce el formato real por su firma', () => {
    expect(detectarTipoMime(webp)).toBe('image/webp');
    expect(detectarTipoMime(avif)).toBe('image/avif');
    expect(detectarTipoMime(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]))).toBe('audio/mpeg');
    expect(detectarTipoMime(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))).toBe('audio/ogg');
    expect(detectarTipoMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.alloc(20)]))).toBe('audio/webm');
    expect(detectarTipoMime(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(20)]))).toBe('audio/mp4');
    expect(detectarTipoMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectarTipoMime(Buffer.alloc(3))).toBeNull();
  });

  it('declaración: formato permitido, límites de peso y texto alternativo obligatorio para imágenes', () => {
    expect(validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: 1000, textoAlternativo: ' Un zorro mira la luna ' }))
      .toEqual({ tipo: 'IMAGEN', textoAlternativo: 'Un zorro mira la luna', duracionSeg: null });
    expect(() => validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/png', bytes: 1000, textoAlternativo: 'Zorro' })).toThrow(/WebP o AVIF/);
    expect(() => validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: 200 * 1024 + 1, textoAlternativo: 'Zorro' })).toThrow(/200 KB/);
    expect(() => validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: 10 })).toThrow(/texto alternativo/);
    expect(() => validarDeclaracion({ tipo: 'AUDIO', tipoMime: 'audio/mpeg', bytes: 2 * 1024 * 1024 + 1 })).toThrow(/2 MB/);
    expect(validarDeclaracion({ tipo: 'AUDIO', tipoMime: 'audio/ogg', bytes: 500, duracionSeg: 30 }).duracionSeg).toBe(30);
    expect(() => validarDeclaracion({ tipo: 'VIDEO', tipoMime: 'video/mp4', bytes: 10 })).toThrow(/imagen o un audio/);
  });

  it('el archivo debe ser exactamente lo declarado', () => {
    expect(() => validarArchivo(webp, { tipoMime: 'image/webp', bytes: webp.length })).not.toThrow();
    expect(() => validarArchivo(webp, { tipoMime: 'image/webp', bytes: webp.length + 1 })).toThrow(/tamaño/);
    expect(() => validarArchivo(webp, { tipoMime: 'image/avif', bytes: webp.length })).toThrow(/formato/);
  });
});

describe('Versión de una lectura: flujo de publicación (RF-026, RF-027, RN-14, RN-15)', () => {
  const borrador = (autorId = 'editora') =>
    VersionLectura.crearBorrador({ id: 'v1', lecturaId: 'l1', numero: 1, metadatos: meta(), texto: TEXTO, autorId, ahora: AHORA, generarId: ids() });
  const completa = () => {
    const v = borrador();
    v.reemplazarActividades(actividadesCompletas(v.propsSnapshot.oraciones.map((o) => o.id)), ids());
    return v;
  };

  it('nace en borrador, segmentada; solo su autor la edita', () => {
    const v = borrador();
    expect(v.estado).toBe('BORRADOR');
    expect(v.propsSnapshot.oraciones).toHaveLength(6);
    expect(() => v.asegurarEditablePor('otro-editor')).toThrow(NoEsAutorError);
  });

  it('cambiar el texto conserva anclajes y evidencias de lo que no cambió, y avisa de lo que se ajustó', () => {
    const v = completa();
    expect(v.actualizar({ texto: `${TEXTO}\nFin.` }, ids())).toEqual([]);
    // Se borra la oración evidencia ("Pero la luna seguía lejos.") y la anclada ("Quería tocarla...").
    const ajustes = v.actualizar({ texto: TEXTO.replace(' Quería tocarla con su nariz.', '').replace(' Pero la luna seguía lejos.', '') }, ids());
    expect(ajustes).toEqual([
      'Actividad 2: su oración cambió; revisa dónde aparece',
      'Actividad 3, pregunta 1: se quitaron evidencias que ya no están en el texto',
    ]);
    const anclaje = v.propsSnapshot.actividades[1]!.oracionAnclajeId;
    expect(v.propsSnapshot.oraciones.some((o) => o.id === anclaje)).toBe(true);
    expect(v.problemasParaRevision()).toContain('Actividad 3, pregunta 1: marca las oraciones que son evidencia');
  });

  it('al unir oraciones, el anclaje y la evidencia de la absorbida pasan a la que queda', () => {
    const v = completa();
    const [primera, segunda] = v.propsSnapshot.oraciones;
    v.unirOraciones(primera!.id);
    expect(v.propsSnapshot.actividades[1]!.oracionAnclajeId).toBe(primera!.id);
    expect(v.propsSnapshot.oraciones.some((o) => o.id === segunda!.id)).toBe(false);
  });

  it('enviar exige licencia, habilidades y actividades completas', () => {
    const v = borrador();
    v.actualizar({ metadatos: meta({ licencia: null, habilidadesObjetivo: [] }) }, ids());
    expect(() => v.enviarARevision('editora', AHORA)).toThrow(LecturaIncompletaError);
    try {
      v.enviarARevision('editora', AHORA);
    } catch (e) {
      expect((e as LecturaIncompletaError).problemas).toEqual([
        'Declara la licencia del texto',
        'Elige al menos una habilidad objetivo',
        'Agrega al menos una actividad para después de leer',
      ]);
    }
  });

  it('el autor no aprueba lo suyo; otra persona la publica y ya no se edita', () => {
    const v = completa();
    v.enviarARevision('editora', AHORA);
    expect(v.estado).toBe('EN_REVISION');
    expect(() => v.asegurarEditablePor('editora')).toThrow(VersionNoEditableError);
    expect(() => v.aprobar('editora', AHORA)).toThrow(AutorNoPuedeAprobarError);
    v.aprobar('revisor', AHORA);
    expect(v.propsSnapshot).toMatchObject({ estado: 'PUBLICADO', revisorId: 'revisor', publicadaEn: AHORA });
    expect(() => v.aprobar('revisor', AHORA)).toThrow(TransicionInvalidaError);
    v.archivar(AHORA);
    expect(v.estado).toBe('ARCHIVADO');
  });

  it('rechazar vuelve a borrador con el motivo, que se limpia al reenviar', () => {
    const v = completa();
    v.enviarARevision('editora', AHORA);
    expect(() => v.rechazar('revisor', 'no')).toThrow(/5 a 1000/);
    v.rechazar('revisor', 'Revisa la pista P1 de la actividad 2.');
    expect(v.propsSnapshot).toMatchObject({ estado: 'BORRADOR', comentarioRevision: 'Revisa la pista P1 de la actividad 2.' });
    v.enviarARevision('editora', AHORA);
    expect(v.propsSnapshot.comentarioRevision).toBeNull();
  });

  it('RF-027: la versión nueva copia todo con ids propios y remapea anclajes y evidencias', () => {
    const publicada = completa();
    publicada.enviarARevision('editora', AHORA);
    publicada.aprobar('revisor', AHORA);
    const nueva = VersionLectura.nuevaDesde(publicada, { id: 'v2', numero: 2, autorId: 'otra-editora', ahora: AHORA, generarId: () => `x-${Math.random()}` });
    const p = nueva.propsSnapshot;
    const anteriores = new Set(publicada.propsSnapshot.oraciones.map((o) => o.id));
    expect(p).toMatchObject({ estado: 'BORRADOR', numero: 2, autorId: 'otra-editora', revisorId: null });
    expect(p.oraciones.every((o) => !anteriores.has(o.id))).toBe(true);
    expect(p.oraciones.map((o) => o.texto)).toEqual(publicada.propsSnapshot.oraciones.map((o) => o.texto));
    const ids2 = new Set(p.oraciones.map((o) => o.id));
    expect(ids2.has(p.actividades[1]!.oracionAnclajeId as string)).toBe(true);
    expect(ids2.has(p.actividades[2]!.items[0]!.clavesEvidencia[0] as string)).toBe(true);
    expect(nueva.problemasParaRevision()).toEqual([]);
    expect(() => VersionLectura.nuevaDesde(nueva, { id: 'v3', numero: 3, autorId: 'x', ahora: AHORA, generarId: ids() })).toThrow(TransicionInvalidaError);
  });

  it('RNF-006: una lectura que pesa más de 1,5 MB no se envía', () => {
    const v = completa();
    v.agregarRecurso({ id: 'r1', tipo: 'AUDIO', claveAlmacen: 'k', tipoMime: 'audio/mpeg', bytes: PESO_MAXIMO_LECTURA, textoAlternativo: null, duracionSeg: 60, creadoEn: AHORA });
    expect(v.problemasParaRevision()).toEqual([expect.stringMatching(/^La lectura pesa 1,5\d MB; el máximo es 1,5 MB$/)]);
    v.quitarRecurso('r1');
    expect(v.problemasParaRevision()).toEqual([]);
    expect(() => v.quitarRecurso('r1')).toThrow(/no está en esta lectura/);
  });
});

describe('Lectura: la versión publicada vigente (RF-027)', () => {
  it('publicar devuelve la versión anterior; archivar la saca de circulación', () => {
    const l = Lectura.crear({ id: 'l1', autorId: 'editora', ahora: AHORA });
    expect(l.publicar('v1')).toBeNull();
    expect(l.publicar('v2')).toBe('v1');
    l.archivar(AHORA);
    expect(l.propsSnapshot).toMatchObject({ versionPublicadaId: null, archivadaEn: AHORA });
    expect(() => l.archivar(AHORA)).toThrow(TransicionInvalidaError);
  });
});
```

`apps/api/test/unit/contenido/aplicacion/contenido-casos-de-uso.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { AutoriaUseCase } from '../../../../src/modules/contenido/application/use-cases/autoria.use-case';
import { BibliotecaUseCase } from '../../../../src/modules/contenido/application/use-cases/biblioteca.use-case';
import { PublicacionUseCase } from '../../../../src/modules/contenido/application/use-cases/publicacion.use-case';
import { RecursosUseCase, VIGENCIA_SUBIDA_MS } from '../../../../src/modules/contenido/application/use-cases/recursos.use-case';
import {
  AutorNoPuedeAprobarError,
  LecturaIncompletaError,
  NoEsAutorError,
  RecursoInvalidoError,
  TransicionInvalidaError,
  VersionNoEditableError,
} from '../../../../src/modules/contenido/domain/errors/errores-contenido';
import { EVENTOS_CONTENIDO } from '../../../../src/modules/contenido/domain/events/eventos-contenido';
import { NoEncontradoError, ProhibidoError } from '../../../../src/modules/shared-kernel/public-api';
import { actividadesCompletas, crearEntornoContenido, EntornoContenido, metadatos, TEXTO } from '../dobles';

/** Nivel 1 — Casos de uso de Contenido con dobles (RF-021 a RF-028). */
const EDITORA = 'editora';
const REVISOR = 'revisor';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);

describe('Contenido: autoría, publicación, recursos y biblioteca', () => {
  let e: EntornoContenido;
  let autoria: AutoriaUseCase;
  let publicacion: PublicacionUseCase;
  let recursos: RecursosUseCase;
  let biblioteca: BibliotecaUseCase;

  beforeEach(() => {
    e = crearEntornoContenido();
    autoria = new AutoriaUseCase(e.repo, e.bus, e.generarId, e.reloj.ahora);
    publicacion = new PublicacionUseCase(e.repo, e.bus, e.reloj.ahora);
    recursos = new RecursosUseCase(e.repo, e.almacen, e.firmador, e.bus, e.generarId, e.reloj.ahora);
    biblioteca = new BibliotecaUseCase(e.repo, e.lectores, e.nivelLector);
  });

  /** Lectura lista para revisión (metadatos, texto y actividades completas). */
  const lecturaCompleta = async (cambios = {}) => {
    const creada = await autoria.crear({ editorId: EDITORA, metadatos: metadatos(cambios), texto: TEXTO });
    await autoria.reemplazarActividades({ editorId: EDITORA, lecturaId: creada.lecturaId, actividades: actividadesCompletas(creada.oraciones.map((o) => o.id)) });
    return creada.lecturaId;
  };
  const publicada = async (cambios = {}) => {
    const id = await lecturaCompleta(cambios);
    await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
    await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
    return id;
  };

  describe('Autoría (RF-021, RF-022, RF-024, RF-027, RF-029)', () => {
    it('crear deja la versión 1 en borrador, segmentada, con lo que falta para revisión', async () => {
      const d = await autoria.crear({ editorId: EDITORA, metadatos: metadatos({ licencia: null }), texto: TEXTO });
      expect(d).toMatchObject({ numero: 1, estado: 'BORRADOR', esAutor: true, permisos: { editar: true, enviar: false, revisar: false } });
      expect(d.oraciones).toHaveLength(6);
      expect(d.problemas).toEqual(['Declara la licencia del texto', 'Agrega al menos una actividad para después de leer']);
      expect(e.bus.nombres()).toEqual([EVENTOS_CONTENIDO.LECTURA_CREADA]);
    });

    it('solo la autora edita su borrador; en revisión nadie lo edita', async () => {
      const id = await lecturaCompleta();
      await expect(autoria.actualizarBorrador({ editorId: 'otro-editor', lecturaId: id, texto: 'Hola.' })).rejects.toThrow(NoEsAutorError);
      const { detalle, ajustes } = await autoria.actualizarBorrador({ editorId: EDITORA, lecturaId: id, metadatos: metadatos({ titulo: 'El zorro curioso' }) });
      expect([detalle.metadatos.titulo, ajustes]).toEqual(['El zorro curioso', []]);
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await expect(autoria.unirOraciones({ editorId: EDITORA, lecturaId: id, oracionId: detalle.oraciones[0]!.id })).rejects.toThrow(VersionNoEditableError);
    });

    it('unir, dividir y la historia ramificada se guardan en el borrador', async () => {
      const d = await autoria.crear({ editorId: EDITORA, metadatos: metadatos(), texto: 'Era un día gris y frío. Llovía.' });
      const unida = await autoria.unirOraciones({ editorId: EDITORA, lecturaId: d.lecturaId, oracionId: d.oraciones[0]!.id });
      expect(unida.oraciones.map((o) => o.texto)).toEqual(['Era un día gris y frío. Llovía.']);
      const cortada = await autoria.dividirOracion({ editorId: EDITORA, lecturaId: d.lecturaId, oracionId: unida.oraciones[0]!.id, posicion: 'Era un día gris'.length });
      expect(cortada.oraciones.map((o) => o.texto)).toEqual(['Era un día gris', 'y frío. Llovía.']);
      const grafo = await autoria.reemplazarGrafo({
        editorId: EDITORA, lecturaId: d.lecturaId,
        nodos: [{ clave: 'inicio', contenido: 'Llueve. ¿Sales?', esInicio: true, opciones: [{ texto: 'Salgo', destino: 'fin' }] }, { clave: 'fin', contenido: 'Te mojaste.', esFinal: true }],
      });
      expect([grafo.esRamificada, grafo.nodos.length]).toEqual([true, 2]);
    });

    it('RF-027: la versión nueva sale de la publicada y no la reemplaza hasta aprobarse', async () => {
      const id = await publicada();
      await expect(autoria.nuevaVersion({ editorId: EDITORA, lecturaId: 'no-existe' })).rejects.toThrow(NoEncontradoError);
      const v2 = await autoria.nuevaVersion({ editorId: 'otra-editora', lecturaId: id });
      expect(v2).toMatchObject({ numero: 2, estado: 'BORRADOR', autorId: 'otra-editora', publicada: { numero: 1 } });
      await expect(autoria.nuevaVersion({ editorId: EDITORA, lecturaId: id })).rejects.toThrow(TransicionInvalidaError);

      // Mientras tanto la biblioteca sigue mostrando la versión 1.
      const antes = await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, {});
      expect(antes.lecturas.map((f) => f.versionId)).toEqual([v2.publicada!.versionId]);

      await autoria.actualizarBorrador({ editorId: 'otra-editora', lecturaId: id, metadatos: metadatos({ titulo: 'El zorro y la luna (2.ª edición)' }) });
      await publicacion.enviarARevision({ editorId: 'otra-editora', lecturaId: id });
      await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
      const v1 = await e.repo.buscarVersion(v2.publicada!.versionId);
      expect(v1?.estado).toBe('ARCHIVADO'); // queda para las sesiones ya hechas
      expect((await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, {})).lecturas.map((f) => f.titulo)).toEqual(['El zorro y la luna (2.ª edición)']);
    });
  });

  describe('Flujo de publicación (RF-026)', () => {
    it('incompleta no se envía; completa pasa a revisión y el revisor la publica', async () => {
      const d = await autoria.crear({ editorId: EDITORA, metadatos: metadatos(), texto: TEXTO });
      await expect(publicacion.enviarARevision({ editorId: EDITORA, lecturaId: d.lecturaId })).rejects.toThrow(LecturaIncompletaError);

      const id = await lecturaCompleta();
      const enviada = await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      expect(enviada.estado).toBe('EN_REVISION');
      const vistaRevisor = await publicacion.detalle({ id: REVISOR, rol: 'REVISOR' }, id);
      expect(vistaRevisor.permisos).toMatchObject({ revisar: true, editar: false });

      const aprobada = await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
      expect(aprobada).toMatchObject({ estado: 'PUBLICADO', permisos: { archivar: true } });
      expect((await e.repo.buscarLectura(id))?.versionPublicadaId).toBe(aprobada.versionId);
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_CONTENIDO.VERSION_PUBLICADA, agregadoId: id, datos: { actorId: REVISOR, numero: 1 } });
    });

    it('si la autora tuviera también el rol de revisora, no podría aprobar lo suyo', async () => {
      const id = await lecturaCompleta();
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await expect(publicacion.aprobar({ revisorId: EDITORA, lecturaId: id })).rejects.toThrow(AutorNoPuedeAprobarError);
      expect((await publicacion.detalle({ id: EDITORA, rol: 'REVISOR' }, id)).permisos.revisar).toBe(false);
    });

    it('rechazar devuelve a borrador con el motivo, que ve la autora', async () => {
      const id = await lecturaCompleta();
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await publicacion.rechazar({ revisorId: REVISOR, lecturaId: id, comentario: 'La pista P2 es demasiado directa.' });
      const vista = await publicacion.detalle({ id: EDITORA, rol: 'EDITOR' }, id);
      expect(vista).toMatchObject({ estado: 'BORRADOR', comentarioRevision: 'La pista P2 es demasiado directa.', permisos: { editar: true } });
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_CONTENIDO.VERSION_RECHAZADA, datos: { motivo: 'La pista P2 es demasiado directa.' } });
    });

    it('archivar: la autora o un revisor; sale de la biblioteca', async () => {
      const id = await publicada();
      await expect(publicacion.archivar({ actor: { id: 'otro-editor', rol: 'EDITOR' }, lecturaId: id })).rejects.toThrow(ProhibidoError);
      await publicacion.archivar({ actor: { id: REVISOR, rol: 'REVISOR' }, lecturaId: id });
      expect((await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, {})).lecturas).toEqual([]);
      await expect(publicacion.archivar({ actor: { id: REVISOR, rol: 'REVISOR' }, lecturaId: id })).rejects.toThrow(TransicionInvalidaError);
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_CONTENIDO.LECTURA_ARCHIVADA, datos: { rol: 'REVISOR' } });
    });

    it('el listado pone primero lo que espera a cada uno', async () => {
      const enRevision = await lecturaCompleta({ titulo: 'Para revisar' });
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: enRevision });
      await autoria.crear({ editorId: EDITORA, metadatos: metadatos({ titulo: 'Mi borrador' }), texto: 'Hola.' });
      e.reloj.avanzarMin(5);
      await autoria.crear({ editorId: 'otro-editor', metadatos: metadatos({ titulo: 'Borrador ajeno' }), texto: 'Hola.' });

      expect((await publicacion.listar({ id: REVISOR, rol: 'REVISOR' }))[0]?.titulo).toBe('Para revisar');
      expect((await publicacion.listar({ id: EDITORA, rol: 'EDITOR' }))[0]?.titulo).toBe('Mi borrador');
    });
  });

  describe('Recursos con subida firmada (RF-023)', () => {
    const declarar = (lecturaId: string, cambios = {}) =>
      recursos.solicitarSubida({ editorId: EDITORA, lecturaId, tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: WEBP.length, textoAlternativo: 'Un zorro mira la luna', ...cambios });
    const token = (url: string) => decodeURIComponent(new URL(url, 'http://x').searchParams.get('token') as string);

    it('declarar, subir el archivo exacto y verlo en el borrador', async () => {
      const id = await lecturaCompleta();
      const subida = await declarar(id);
      expect(subida.url).toMatch(/^\/api\/v1\/backoffice\/recursos\/id-\d+\/archivo\?token=/);
      const r = await recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: token(subida.url), archivo: WEBP });
      expect(r).toMatchObject({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: WEBP.length, textoAlternativo: 'Un zorro mira la luna' });
      expect([...e.almacen.archivos.keys()]).toEqual([`lecturas/${id}/${subida.recursoId}.webp`]);
      expect((await publicacion.detalle({ id: EDITORA, rol: 'EDITOR' }, id)).recursos).toHaveLength(1);
      await expect(recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: token(subida.url), archivo: WEBP })).rejects.toThrow(/ya se subió/);
    });

    it('rechaza firma alterada, vencida, de otra persona o archivos que no son lo declarado', async () => {
      const id = await lecturaCompleta();
      const subida = await declarar(id);
      const t = token(subida.url);
      const subir = (cambios: Partial<{ editorId: string; recursoId: string; token: string; archivo: Buffer }>) =>
        recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: t, archivo: WEBP, ...cambios });

      await expect(subir({ token: `${t}x` })).rejects.toThrow(RecursoInvalidoError);
      await expect(subir({ editorId: 'otro-editor' })).rejects.toThrow(/no es válido o ya venció/);
      await expect(subir({ recursoId: 'otro-recurso' })).rejects.toThrow(/no es válido/);
      await expect(subir({ archivo: Buffer.concat([WEBP, Buffer.alloc(1)]) })).rejects.toThrow(/tamaño/);
      await expect(subir({ archivo: Buffer.concat([Buffer.from('<svg'), Buffer.alloc(WEBP.length - 4)]) })).rejects.toThrow(/formato/);
      e.reloj.avanzarMin(VIGENCIA_SUBIDA_MS / 60_000 + 1);
      await expect(subir({})).rejects.toThrow(/venció/);
      await expect(declarar(id, { textoAlternativo: '' })).rejects.toThrow(/texto alternativo/);
    });

    it('la biblioteca solo entrega archivos de versiones publicadas', async () => {
      const id = await lecturaCompleta();
      const subida = await declarar(id);
      await recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: token(subida.url), archivo: WEBP });
      expect((await recursos.archivo(subida.recursoId, false)).tipoMime).toBe('image/webp');
      await expect(recursos.archivo(subida.recursoId, true)).rejects.toThrow(NoEncontradoError);
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
      expect((await recursos.archivo(subida.recursoId, true)).datos.equals(WEBP)).toBe(true);
      // Publicada, ya no se le quitan archivos (RN-14).
      await expect(recursos.quitar({ editorId: EDITORA, lecturaId: id, recursoId: subida.recursoId })).rejects.toThrow(VersionNoEditableError);
    });
  });

  describe('Biblioteca (RF-028)', () => {
    beforeEach(async () => {
      await publicada({ titulo: 'Rimas del río', rangoEdad: 'R1', nivelDificultad: 1, tematica: 'Naturaleza', tipoTexto: 'POEMA' });
      await publicada({ titulo: 'El zorro y la luna', rangoEdad: 'R2', nivelDificultad: 2 });
      await publicada({ titulo: 'Detectives del museo', rangoEdad: 'R2', nivelDificultad: 4, tematica: 'Misterio', habilidadesObjetivo: ['CRI'] });
      await publicada({ titulo: 'Volcanes del Perú', rangoEdad: 'R3', nivelDificultad: 3, tematica: 'Ciencia', tipoTexto: 'CIENTIFICO' });
      await lecturaCompleta({ titulo: 'Borrador secreto' });
    });

    it('un adulto ve todo lo publicado (nunca borradores) y filtra', async () => {
      const adulto = { sub: 'familia', rol: 'FAMILIAR' as const };
      expect((await biblioteca.explorar(adulto, {})).lecturas.map((f) => f.titulo)).toEqual(['Detectives del museo', 'El zorro y la luna', 'Rimas del río', 'Volcanes del Perú']);
      expect((await biblioteca.explorar(adulto, { tema: 'cien' })).lecturas.map((f) => f.titulo)).toEqual(['Volcanes del Perú']);
      expect((await biblioteca.explorar(adulto, { habilidad: 'CRI' })).lecturas.map((f) => f.titulo)).toEqual(['Detectives del museo']);
      expect((await biblioteca.explorar(adulto, { edad: 'R1', tipo: 'POEMA' })).lecturas.map((f) => f.titulo)).toEqual(['Rimas del río']);
      const ficha = (await biblioteca.explorar(adulto, { nivel: 2 })).lecturas[0];
      expect(ficha).toMatchObject({ titulo: 'El zorro y la luna', totalActividades: 3, resumen: expect.stringMatching(/^Había una vez/) });
      expect(JSON.stringify(ficha)).not.toMatch(/respuesta|pista|explicacion/i);
    });

    it('el estudiante solo ve su rango de edad y su nivel ± 1 (por defecto, el de su edad)', async () => {
      e.lectores.rangos.set('nino-r2', 'R2');
      const nino = { sub: 'nino-r2', rol: 'ESTUDIANTE' as const };
      const r = await biblioteca.explorar(nino, {});
      expect([r.lecturas.map((f) => f.titulo), r.alcance]).toEqual([['El zorro y la luna'], { rangoEdad: 'R2', niveles: [1, 2, 3] }]);
      expect((await biblioteca.explorar(nino, { edad: 'R3' })).lecturas).toEqual([]);
      expect((await biblioteca.explorar(nino, { nivel: 4 })).lecturas).toEqual([]);

      // Cuando Progreso informe su nivel (4), ve de 3 a 5.
      e.nivelLector.niveles.set('nino-r2', 4);
      expect((await biblioteca.explorar(nino, {})).lecturas.map((f) => f.titulo)).toEqual(['Detectives del museo']);
      expect((await biblioteca.explorar({ sub: 'desconocido', rol: 'ESTUDIANTE' }, {})).lecturas).toEqual([]);
    });

    it('detalle sin respuestas; el estudiante no abre lo que está fuera de su alcance', async () => {
      const [zorro, volcanes] = (await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, { tema: '' })).lecturas.filter((f) => ['El zorro y la luna', 'Volcanes del Perú'].includes(f.titulo));
      const d = await biblioteca.detalle({ sub: 'docente', rol: 'DOCENTE' }, zorro!.lecturaId);
      expect(d.parrafos.map((p) => p.oraciones.length)).toEqual([2, 3, 1]);
      expect(d.actividadesPorMomento).toEqual({ ANTES: 1, DURANTE: 1, DESPUES: 1 });
      expect(JSON.stringify(d)).not.toMatch(/indice|clavesEvidencia|explicacion|pistas/i);

      e.lectores.rangos.set('nino-r2', 'R2');
      await expect(biblioteca.detalle({ sub: 'nino-r2', rol: 'ESTUDIANTE' }, zorro!.lecturaId)).resolves.toBeTruthy();
      await expect(biblioteca.detalle({ sub: 'nino-r2', rol: 'ESTUDIANTE' }, volcanes!.lecturaId)).rejects.toThrow(NoEncontradoError);
      await expect(biblioteca.detalle({ sub: 'docente', rol: 'DOCENTE' }, 'no-existe')).rejects.toThrow(NoEncontradoError);
    });

    it('pagina con cursor', async () => {
      for (let i = 0; i < 12; i++) await publicada({ titulo: `Cuento ${String(i).padStart(2, '0')}` });
      const adulto = { sub: 'docente', rol: 'DOCENTE' as const };
      const p1 = await biblioteca.explorar(adulto, {});
      const p2 = await biblioteca.explorar(adulto, { cursor: p1.siguiente as string });
      expect([p1.lecturas.length, p2.lecturas.length, p2.siguiente]).toEqual([12, 4, null]);
      expect(new Set([...p1.lecturas, ...p2.lecturas].map((f) => f.lecturaId)).size).toBe(16);
    });
  });
});
```

`apps/api/test/unit/contenido/infraestructura/almacen-y-firma.spec.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AlmacenDiscoLocal } from '../../../../src/modules/contenido/infrastructure/almacen/almacen-disco-local';
import { FirmadorSubidasHmac } from '../../../../src/modules/contenido/infrastructure/almacen/firmador-subidas-hmac';

/** Nivel 1 — Adaptadores de Contenido: firma de subidas (URL prefirmada) y almacén local (RF-023). */
describe('FirmadorSubidasHmac', () => {
  const firmador = new FirmadorSubidasHmac('secreto-de-pruebas-de-contenido-con-mas-de-32-caracteres');
  const ahora = new Date('2026-10-20T15:00:00Z');
  const vence = new Date(ahora.getTime() + 60_000);

  it('devuelve los datos firmados mientras no venza', () => {
    const token = firmador.firmar({ recursoId: 'r1', bytes: 10 }, vence);
    expect(firmador.verificar(token, ahora)).toEqual({ recursoId: 'r1', bytes: 10 });
    expect(firmador.verificar(token, vence)).toBeNull();
  });

  it('cualquier cambio en los datos o la firma la invalida', () => {
    const token = firmador.firmar({ recursoId: 'r1', bytes: 10 }, vence);
    const [cuerpo, firma] = token.split('.');
    const alterado = Buffer.from(JSON.stringify({ recursoId: 'r1', bytes: 999_999, exp: vence.getTime() })).toString('base64url');
    expect(firmador.verificar(`${alterado}.${firma}`, ahora)).toBeNull();
    expect(firmador.verificar(`${cuerpo}.${firma}x`, ahora)).toBeNull();
    expect(firmador.verificar('sin-punto', ahora)).toBeNull();
    expect(new FirmadorSubidasHmac('otro-secreto-de-pruebas-con-mas-de-32-caracteres').verificar(token, ahora)).toBeNull();
  });

  it('exige un secreto de al menos 32 caracteres', () => {
    expect(() => new FirmadorSubidasHmac('corto')).toThrow(/32/);
  });
});

describe('AlmacenDiscoLocal', () => {
  let carpeta: string;
  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'almacen-'));
  });
  afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('guarda y lee por clave; una clave inexistente devuelve null', async () => {
    const almacen = new AlmacenDiscoLocal(carpeta);
    await almacen.guardar('lecturas/l1/r1.webp', Buffer.from('datos'));
    expect((await almacen.leer('lecturas/l1/r1.webp'))?.toString()).toBe('datos');
    expect(await almacen.leer('lecturas/l1/no.webp')).toBeNull();
  });

  it('no permite salir de su carpeta', async () => {
    const almacen = new AlmacenDiscoLocal(carpeta);
    await expect(almacen.guardar('../fuera.txt', Buffer.from('x'))).rejects.toThrow(/inválida/);
    expect(await almacen.leer('../../etc/passwd')).toBeNull();
  });
});
```

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

```ts
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Contenido integrado (RF-021 a RF-029): backoffice con MFA, flujo de publicación,
 * subida firmada de archivos, versiones, biblioteca y su vínculo con las asignaciones de Escuela,
 * contra PostgreSQL real.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(60)]);
const TEXTO = 'Había una vez un zorro que miraba la luna. Quería tocarla.\nUna tarde subió al cerro. Pero la luna seguía lejos.';

let t: AppDePrueba;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

/** Cuenta del backoffice con MFA activo (las crea el administrador, RF-076; aquí se siembran). */
async function backoffice(rol: 'EDITOR' | 'REVISOR', conMfa = true) {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  const secreto = authenticator.generateSecret();
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' },
  });
  if (conMfa) await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, ...(conMfa ? { codigoMfa: authenticator.generate(secreto) } : {}) }).expect(200);
  return { id: cuenta.id, token: login.body.accessToken as string, requiereConfigurarMfa: login.body.requiereConfigurarMfa as boolean };
}

async function adulto(rol: 'DOCENTE' | 'FAMILIAR') {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
  return login.body.accessToken as string;
}

const metadatos = (cambios = {}) => ({
  titulo: 'El zorro y la luna', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO',
  habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0', ...cambios,
});

const actividades = (oraciones: { id: string }[]) => [
  { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿De qué tratará?', explicacionModelada: 'El título lo anticipa.' }] },
  {
    momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: oraciones[1]!.id,
    items: [{
      habilidad: 'LIT', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué quería el zorro?', opciones: ['Tocar la luna', 'Dormir'], indiceCorrecto: 0,
      explicacionModelada: 'Dice que quería tocarla.', pistas: [{ nivel: 'P1', texto: 'Relee la segunda oración.' }],
    }],
  },
  {
    momento: 'DESPUES', tipo: 'EVIDENCIA',
    items: [{
      habilidad: 'INF', nivelDificultad: 3, modalidad: 'EVIDENCIA', enunciado: 'Marca dónde se ve que la luna estaba lejos', clavesEvidencia: [oraciones[3]!.id],
      explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }],
    }],
  },
];

let editora: Awaited<ReturnType<typeof backoffice>>;
let revisor: Awaited<ReturnType<typeof backoffice>>;
let lecturaId: string;
let recursoId: string;

describe('Backoffice protegido (RF-009, RF-011)', () => {
  it('solo editores y revisores con MFA verificado; las familias no entran', async () => {
    const sinMfa = await backoffice('EDITOR', false);
    expect(sinMfa.requiereConfigurarMfa).toBe(true);
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(sinMfa.token)).send({ metadatos: metadatos(), texto: TEXTO }).expect(403);
    const familia = await adulto('FAMILIAR');
    await t.http().get(`${API}/backoffice/lecturas`).set(bearer(familia)).expect(403);
    revisor = await backoffice('REVISOR');
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(revisor.token)).send({ metadatos: metadatos(), texto: TEXTO }).expect(403);
    // El esqueleto vacío del módulo ya no existe.
    await t.http().post(`${API}/contenido/demo`).set(bearer(revisor.token)).send({}).expect(404);
  });
});

describe('Autoría y flujo de publicación (RF-021 a RF-027)', () => {
  it('la editora crea la lectura en borrador, segmentada en oraciones', async () => {
    editora = await backoffice('EDITOR');
    const r = await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({ metadatos: metadatos(), texto: TEXTO }).expect(201);
    lecturaId = r.body.lecturaId;
    expect(r.body).toMatchObject({ numero: 1, estado: 'BORRADOR', esAutor: true });
    expect(r.body.oraciones.map((o: { texto: string }) => o.texto)).toEqual([
      'Había una vez un zorro que miraba la luna.', 'Quería tocarla.', 'Una tarde subió al cerro.', 'Pero la luna seguía lejos.',
    ]);
    expect(await t.prisma.oracion.count({ where: { versionLecturaId: r.body.versionId } })).toBe(4);

    const invalido = await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({ metadatos: metadatos({ nivelDificultad: 9 }), texto: TEXTO }).expect(400);
    expect(invalido.body.type).toMatch(/validacion/);
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({ metadatos: metadatos({ titulo: 'Ab' }), texto: TEXTO }).expect(400);
  });

  it('editar el texto conserva los ids de las oraciones que no cambian (RF-022)', async () => {
    const antes = (await t.http().get(`${API}/backoffice/lecturas/${lecturaId}`).set(bearer(editora.token)).expect(200)).body;
    const r = await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/borrador`).set(bearer(editora.token))
      .send({ texto: TEXTO.replace('Una tarde', 'Una noche') }).expect(200);
    const ids = (d: { oraciones: { id: string }[] }) => d.oraciones.map((o) => o.id);
    expect(ids(r.body.detalle).filter((id: string) => ids(antes).includes(id))).toHaveLength(3);
    const cortada = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/oraciones/${antes.oraciones[0].id}/dividir`).set(bearer(editora.token)).send({ posicion: 'Había una vez un zorro'.length }).expect(200);
    expect(cortada.body.oraciones).toHaveLength(5);
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/oraciones/${antes.oraciones[0].id}/unir`).set(bearer(editora.token)).expect(200);
  });

  it('actividades con anclaje, pistas y evidencias se guardan en sus tablas (RF-024, RF-025)', async () => {
    const d = (await t.http().get(`${API}/backoffice/lecturas/${lecturaId}`).set(bearer(editora.token))).body;
    const r = await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora.token)).send({ actividades: actividades(d.oraciones) }).expect(200);
    expect(r.body.problemas).toEqual([]);
    expect(await t.prisma.actividad.count({ where: { versionLecturaId: d.versionId } })).toBe(3);
    expect(await t.prisma.pista.count()).toBe(2);
    expect(await t.prisma.claveEvidencia.findMany()).toEqual([expect.objectContaining({ oracionId: d.oraciones[3].id })]);

    const sinAnclaje = actividades(d.oraciones);
    sinAnclaje[1]!.oracionAnclajeId = undefined as unknown as string;
    const error = await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora.token)).send({ actividades: sinAnclaje }).expect(400);
    expect(error.body.detail).toMatch(/oración donde aparece/);
  });

  it('subida firmada de una imagen WebP: se valida el archivo real y se guarda (RF-023)', async () => {
    const pedido = await t.http().post(`${API}/backoffice/recursos`).set(bearer(editora.token))
      .send({ lecturaId, tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: WEBP.length, textoAlternativo: 'Un zorro mira la luna' }).expect(201);
    recursoId = pedido.body.recursoId;
    const url: string = pedido.body.url.replace(API, '');
    const subir = (cuerpo: Buffer, ruta = url) =>
      t.http().put(`${API}${ruta}`).set(bearer(editora.token)).set('Content-Type', 'application/octet-stream').send(cuerpo);

    expect((await subir(Buffer.concat([Buffer.from('<svg'), Buffer.alloc(WEBP.length - 4)]))).body.detail).toMatch(/formato/);
    expect((await subir(WEBP, url.replace('token=', 'token=x'))).status).toBe(400);
    const r = await subir(WEBP).expect(200);
    expect(r.body).toMatchObject({ id: recursoId, tipo: 'IMAGEN', bytes: WEBP.length });
    expect(await t.prisma.recurso.findUniqueOrThrow({ where: { id: recursoId } })).toMatchObject({ tipoMime: 'image/webp', textoAlternativo: 'Un zorro mira la luna' });
    expect((await subir(WEBP)).status).toBe(409);

    const archivo = await t.http().get(`${API}/backoffice/recursos/${recursoId}/archivo`).set(bearer(revisor.token)).expect(200);
    expect(archivo.headers['content-type']).toBe('image/webp');
    // Sin publicar, la biblioteca no la entrega.
    await t.http().get(`${API}/biblioteca/recursos/${recursoId}`).set(bearer(editora.token)).expect(404);
  });

  it('enviar → rechazar con motivo → reenviar → aprobar; cada paso queda auditado (RF-026)', async () => {
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(409); // aún en borrador
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
    await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/borrador`).set(bearer(editora.token)).send({ texto: 'Otro texto.' }).expect(409);

    const rechazo = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/rechazar`).set(bearer(revisor.token)).send({ comentario: 'Agrega una pista P2 a la actividad 2.' }).expect(200);
    expect(rechazo.body).toMatchObject({ estado: 'BORRADOR' });
    expect((await t.prisma.versionLectura.findUniqueOrThrow({ where: { id: rechazo.body.versionId } })).comentarioRevision).toBe('Agrega una pista P2 a la actividad 2.');

    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
    const aprobada = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(200);
    expect(aprobada.body).toMatchObject({ estado: 'PUBLICADO', permisos: { archivar: true } });
    expect(await t.prisma.lectura.findUniqueOrThrow({ where: { id: lecturaId } })).toMatchObject({ versionPublicadaId: aprobada.body.versionId });
    expect(await t.prisma.versionLectura.findUniqueOrThrow({ where: { id: aprobada.body.versionId } })).toMatchObject({ revisorId: revisor.id, comentarioRevision: null });

    const auditoria = await t.prisma.auditoria.findMany({ where: { recursoId: lecturaId }, orderBy: { ocurridoEn: 'asc' } });
    expect(auditoria.map((a) => [a.accion, a.actorRol])).toEqual([
      ['LECTURA_ENVIADA_A_REVISION', 'EDITOR'],
      ['LECTURA_RECHAZADA', 'REVISOR'],
      ['LECTURA_ENVIADA_A_REVISION', 'EDITOR'],
      ['LECTURA_PUBLICADA', 'REVISOR'],
    ]);
  });
});

describe('Biblioteca y asignaciones (RF-028, RF-018)', () => {
  let docente: string;
  let ninoR2: string;

  it('docentes y familias ven lo publicado sin respuestas, y la imagen se entrega', async () => {
    docente = await adulto('DOCENTE');
    const r = await t.http().get(`${API}/biblioteca`).set(bearer(docente)).expect(200);
    expect(r.body.lecturas).toEqual([expect.objectContaining({ lecturaId, titulo: 'El zorro y la luna', totalActividades: 3 })]);
    const d = await t.http().get(`${API}/biblioteca/${lecturaId}`).set(bearer(docente)).expect(200);
    expect(d.body.imagenes).toEqual([{ id: recursoId, url: `${API}/biblioteca/recursos/${recursoId}`, textoAlternativo: 'Un zorro mira la luna' }]);
    expect(JSON.stringify(d.body)).not.toMatch(/indice|pistas|explicacion|claves/i);
    const imagen = await t.http().get(`${API}/biblioteca/recursos/${recursoId}`).set(bearer(docente)).expect(200);
    expect(imagen.headers['cache-control']).toMatch(/immutable/);
    await t.http().get(`${API}/biblioteca?nivel=9`).set(bearer(docente)).expect(400);
  });

  it('la lectura publicada aparece en el catálogo para asignar del aula (Módulo 2)', async () => {
    const aula = (await t.http().post(`${API}/aulas`).set(bearer(docente)).send({
      nombre: '3.° B', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body;
    const catalogo = await t.http().get(`${API}/aulas/${aula.id}/asignaciones/catalogo`).set(bearer(docente)).expect(200);
    expect(catalogo.body.lecturas).toEqual([{ id: lecturaId, tipo: 'LECTURA', titulo: 'El zorro y la luna', detalle: '8–9 años · nivel 2' }]);

    // Un niño de 9 años (R2) ve la lectura; otro de 6 años (R1), no.
    const crear = async (alias: string, anioNacimiento: number) => {
      const m = (await t.http().post(`${API}/aulas/${aula.id}/matriculas`).set(bearer(docente)).send({ alias, anioNacimiento, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(docente)).send({ pinNuevo: '4826' }).expect(200);
      return m.estudianteId as string;
    };
    const anio = new Date().getFullYear();
    const mayor = await crear('Mateo', anio - 9);
    const menor = await crear('Lía', anio - 6);
    const tablet = (await t.http().post(`${API}/aulas/${aula.id}/dispositivos`).set(bearer(docente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const entrar = async (perfilId: string) => (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId, pin: '4826' }).expect(200)).body.accessToken as string;
    ninoR2 = await entrar(mayor);
    const ninoR1 = await entrar(menor);

    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR2)).expect(200)).body).toMatchObject({ lecturas: [{ lecturaId }], alcance: { rangoEdad: 'R2', niveles: [1, 2, 3] } });
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR1)).expect(200)).body.lecturas).toEqual([]);
    await t.http().get(`${API}/biblioteca/${lecturaId}`).set(bearer(ninoR1)).expect(404);
    await t.http().get(`${API}/backoffice/lecturas`).set(bearer(ninoR2)).expect(403);
  });

  it('RF-027: una versión nueva no toca la publicada ni sus oraciones; al aprobarse la reemplaza', async () => {
    const v1 = (await t.prisma.lectura.findUniqueOrThrow({ where: { id: lecturaId } })).versionPublicadaId as string;
    const oracionesV1 = await t.prisma.oracion.findMany({ where: { versionLecturaId: v1 }, orderBy: { orden: 'asc' } });

    const v2 = await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/nueva-version`).set(bearer(editora.token)).expect(201);
    expect(v2.body).toMatchObject({ numero: 2, estado: 'BORRADOR', publicada: { versionId: v1, numero: 1 } });
    await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/borrador`).set(bearer(editora.token)).send({ metadatos: metadatos({ titulo: 'El zorro y la luna llena' }) }).expect(200);
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR2))).body.lecturas[0].titulo).toBe('El zorro y la luna');

    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(200);
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(ninoR2))).body.lecturas[0].titulo).toBe('El zorro y la luna llena');
    expect(await t.prisma.versionLectura.findUniqueOrThrow({ where: { id: v1 } })).toMatchObject({ estado: 'ARCHIVADO' });
    expect(await t.prisma.oracion.findMany({ where: { versionLecturaId: v1 }, orderBy: { orden: 'asc' } })).toEqual(oracionesV1);
  });

  it('archivar la saca de la biblioteca y del catálogo de asignaciones', async () => {
    await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/archivar`).set(bearer(revisor.token)).expect(200);
    expect((await t.http().get(`${API}/biblioteca`).set(bearer(docente))).body.lecturas).toEqual([]);
    await t.http().get(`${API}/biblioteca/${lecturaId}`).set(bearer(docente)).expect(404);
    expect(await t.prisma.auditoria.count({ where: { recursoId: lecturaId, accion: 'LECTURA_ARCHIVADA' } })).toBe(1);
  });
});
```

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

```ts
import { expect, Page, test as base } from '@playwright/test';

import { cuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada } from '../../support/contenido';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/** PNG válido de 2×2 px (con su CRC y zlib correctos): el navegador lo convierte a WebP antes de subirlo (RF-023). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP438MgZ1MBwv97GAAibgS7vSRLaQAAAABJRU5ErkJggg==', 'base64');

/**
 * Nivel 3 — Biblioteca y contenido de punta a punta (RF-021 a RF-028) en escritorio, tablet y
 * celular: la editora escribe en la web real, el revisor la devuelve y la publica, y la lectura
 * llega a la biblioteca de docentes, familias y niños.
 */
test.describe('Biblioteca y gestión de contenido (RF-021 a RF-028)', () => {
  test.setTimeout(150_000);

  async function abrirLectura(page: Page, titulo: string) {
    await page.getByRole('link', { name: 'Lecturas', exact: true }).first().click();
    await page.getByRole('link', { name: `Abrir ${titulo}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
  }

  test('la editora escribe y envía; el revisor la devuelve, luego la publica y llega a la biblioteca', async ({ page, request }) => {
    const editora = await cuentaBackoffice('EDITOR');
    const revisor = await cuentaBackoffice('REVISOR');
    const sufijo = Date.now().toString(36);
    const titulo = `El zorro curioso ${sufijo}`;

    // RF-021, RF-022: crear el borrador; el texto se divide solo en oraciones.
    await ingresarBackoffice(page, editora);
    await page.getByRole('link', { name: 'Escribir y editar lecturas' }).click();
    await page.getByRole('link', { name: '+ Nueva lectura' }).click();
    await page.getByLabel('Título').fill(titulo);
    await page.getByLabel('Temática').fill(`Animales ${sufijo}`);
    await page.getByRole('checkbox', { name: 'Inferencia' }).check();
    await page.getByLabel('Licencia').fill('CC BY 4.0');
    await page.getByLabel('Texto de la lectura').fill('Había una vez un zorro curioso. Quería tocar la luna.\nSubió al cerro. Pero la luna seguía lejos.');
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Oraciones (4)' })).toBeVisible();
    await expect(page.getByText('Agrega al menos una actividad para después de leer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled();

    // RF-023: la imagen se convierte a WebP en el navegador; sin descripción no se puede subir.
    await page.getByLabel('Descripción de la imagen (texto alternativo)').fill('Un zorro mira la luna llena');
    await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'zorro.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText(/Imagen subida/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Un zorro mira la luna llena' })).toBeVisible();

    // RF-024, RF-025: una actividad "después" de selección, con P1 y explicación.
    await page.getByRole('button', { name: '+ Actividad después de leer' }).click();
    const actividad = page.getByRole('region', { name: 'Después de leer' }).getByRole('article');
    await actividad.getByLabel('Enunciado').fill('¿Qué quería el zorro?');
    await actividad.getByLabel('Opción 1', { exact: true }).fill('Tocar la luna');
    await actividad.getByLabel('Opción 2', { exact: true }).fill('Dormir');
    await actividad.getByLabel('P1 — dónde buscar en el texto').fill('Relee el primer párrafo.');
    await actividad.getByLabel('Explicación modelada').fill('El texto dice que quería tocar la luna.');
    await page.getByRole('button', { name: 'Guardar actividades' }).click();
    await expect(page.getByText('Actividades guardadas.')).toBeVisible();
    await expect(page.getByText('Está completa: ya se puede enviar a revisión.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(page.locator('.cabecera-aula').getByText('En revisión')).toBeVisible();
    await salirDelPanel(page);

    // RF-026: el revisor la devuelve con comentarios.
    await ingresarBackoffice(page, revisor);
    await abrirLectura(page, titulo);
    await page.getByRole('button', { name: 'Devolver con comentarios' }).click();
    await page.getByLabel('¿Qué hay que corregir?').fill('Agrega una pista P2 a la pregunta.');
    await page.getByRole('button', { name: 'Devolver a la autora' }).click();
    await expect(page.locator('.cabecera-aula').getByText('Borrador')).toBeVisible();
    await salirDelPanel(page);

    // La autora ve el motivo, corrige y la reenvía.
    await ingresarBackoffice(page, editora);
    await abrirLectura(page, titulo);
    await expect(page.getByText('El revisor la devolvió:')).toBeVisible();
    await expect(page.getByText('Agrega una pista P2 a la pregunta.')).toBeVisible();
    const pregunta = page.getByRole('region', { name: 'Después de leer' }).getByRole('article');
    await pregunta.getByLabel('P2 — qué párrafo mirar').fill('Mira qué quería hacer con la luna.');
    await page.getByRole('button', { name: 'Guardar actividades' }).click();
    await expect(page.getByText('Actividades guardadas.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(page.locator('.cabecera-aula').getByText('En revisión')).toBeVisible();
    await salirDelPanel(page);

    // El revisor la aprueba: queda publicada.
    await ingresarBackoffice(page, revisor);
    await abrirLectura(page, titulo);
    await expect(page.getByText('Correcta')).toBeVisible();
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await expect(page.getByText('Publicada: está en la biblioteca y se puede asignar a las aulas.')).toBeVisible();
    await salirDelPanel(page);

    // RF-028: una docente la encuentra en la biblioteca y la abre (sin respuestas).
    const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
    await ingresarComoAdulto(page, docente.email, docente.contrasena);
    await page.getByRole('link', { name: 'Biblioteca' }).first().click();
    await filtrarPorTema(page, `animales ${sufijo}`);
    await page.getByRole('link', { name: `Abrir ${titulo}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByText('Pero la luna seguía lejos.', { exact: false })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Un zorro mira la luna llena' })).toBeVisible();
    // Sin respuestas: ni la opción correcta, ni la pista, ni la explicación (el texto sí dice «tocar la luna»).
    await expect(page.getByText('Tocar la luna', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Relee el primer párrafo.')).toHaveCount(0);
    await expect(page.getByText('El texto dice que quería tocar la luna.')).toHaveCount(0);
  });

  test('el estudiante ve en su biblioteca solo lo de su edad y su nivel', async ({ page, request }) => {
    const sufijo = Date.now().toString(36);
    const tematica = `Cuentos ${sufijo}`;
    const paraEl = await lecturaPublicada(request, { titulo: `Cuento para 8–9 años ${sufijo}`, rangoEdad: 'R2', nivelDificultad: 2, tematica });
    const otra = await lecturaPublicada(request, { titulo: `Cuento para 10–12 años ${sufijo}`, rangoEdad: 'R3', nivelDificultad: 4, tematica });

    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017: 8–9 años
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Mateo');

    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Biblioteca' }).click();
    await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
    await filtrarPorTema(page, tematica);
    await expect(page.getByRole('link', { name: `Abrir ${paraEl.titulo}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Abrir ${otra.titulo}` })).toHaveCount(0);
    await page.getByRole('link', { name: `Abrir ${paraEl.titulo}` }).click();
    // El resumen de la ficha repite el comienzo del texto: se espera el detalle y se busca dentro de él.
    const lectura = page.getByRole('article');
    await expect(lectura.getByRole('heading', { level: 1, name: paraEl.titulo })).toBeVisible();
    await expect(lectura.getByText('Había una vez un zorro que miraba la luna cada noche.', { exact: false })).toBeVisible();
    await expect(page.getByText('¡Muy pronto podrás responder sus actividades y ganar estrellas!')).toBeVisible();
  });

  test('la lectura publicada aparece para asignar en el aula (Módulo 2)', async ({ page, request }) => {
    const { titulo } = await lecturaPublicada(request, { titulo: `Para asignar ${Date.now().toString(36)}` });
    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await page.getByRole('link', { name: 'Abrir 3.° B' }).click();
    await page.getByRole('button', { name: '+ Nueva asignación' }).click();
    await expect(page.getByLabel('Lectura', { exact: true }).locator('option', { hasText: titulo })).toHaveCount(1);
    await salirDelPanel(page);
  });
});
```

`tests/e2e/support/contenido.ts`:

```ts
import { resolve } from 'node:path';

import { APIRequestContext, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authenticator } from 'otplib';

import { CONTRASENA_E2E, correoUnico } from './iam';

export interface CuentaBackoffice {
  email: string;
  contrasena: string;
  /** Secreto TOTP de su app autenticadora (RF-011), para calcular el código como lo haría su celular. */
  secreto: string;
}

/**
 * Cuenta de editor o revisor con MFA activo. Las crea el administrador (RF-076, Módulo 12); mientras
 * tanto la prueba la siembra en la base, en el dominio de pruebas que la limpieza final borra.
 */
export async function cuentaBackoffice(rol: 'EDITOR' | 'REVISOR'): Promise<CuentaBackoffice> {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  const prisma = new PrismaClient();
  try {
    const email = correoUnico(rol.toLowerCase());
    const secreto = authenticator.generateSecret();
    const cuenta = await prisma.cuenta.create({
      data: {
        nombre: rol === 'EDITOR' ? 'Elena Editora' : 'Raúl Revisor',
        email,
        rol,
        estado: 'ACTIVA',
        hashContrasena: await argon2.hash(CONTRASENA_E2E, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      },
    });
    await prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
    return { email, contrasena: CONTRASENA_E2E, secreto };
  } finally {
    await prisma.$disconnect();
  }
}

/** Ingreso al backoffice: correo, contraseña y el código de 6 dígitos de la app autenticadora. */
export async function ingresarBackoffice(page: Page, cuenta: CuentaBackoffice): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(cuenta.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByLabel('Código de 6 dígitos').fill(authenticator.generate(cuenta.secreto));
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/backoffice$/);
}

export async function sesionBackoffice(request: APIRequestContext, cuenta: CuentaBackoffice): Promise<Record<string, string>> {
  const login = await request.post('/api/v1/auth/login', {
    data: { email: cuenta.email, contrasena: cuenta.contrasena, codigoMfa: authenticator.generate(cuenta.secreto) },
  });
  expect(login.status(), await login.text()).toBe(200);
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

export const TEXTO_E2E = [
  'Había una vez un zorro que miraba la luna cada noche. Quería tocarla con su nariz.',
  'Una tarde subió al cerro más alto. ¡Qué cerca parecía! Pero la luna seguía lejos.',
].join('\n');

/** Lectura completa publicada por la API (editora escribe, revisor aprueba): para preparar escenarios. */
export async function lecturaPublicada(
  request: APIRequestContext,
  metadatos: Partial<{ titulo: string; rangoEdad: string; nivelDificultad: number; tematica: string }>,
): Promise<{ lecturaId: string; titulo: string }> {
  const editora = await sesionBackoffice(request, await cuentaBackoffice('EDITOR'));
  const revisor = await sesionBackoffice(request, await cuentaBackoffice('REVISOR'));
  const datos = {
    titulo: 'El zorro y la luna', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO',
    habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0', ...metadatos,
  };
  const creada = await request.post('/api/v1/backoffice/lecturas', { headers: editora, data: { metadatos: datos, texto: TEXTO_E2E } });
  expect(creada.status(), await creada.text()).toBe(201);
  const { lecturaId, oraciones } = await creada.json();
  const actividades = await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/actividades`, {
    headers: editora,
    data: {
      actividades: [{
        momento: 'DESPUES', tipo: 'EVIDENCIA',
        items: [{
          habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca dónde se ve que la luna estaba lejos',
          clavesEvidencia: [oraciones[4].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }],
        }],
      }],
    },
  });
  expect(actividades.status(), await actividades.text()).toBe(200);
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/enviar-revision`, { headers: editora })).status()).toBe(200);
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/aprobar`, { headers: revisor })).status()).toBe(200);
  return { lecturaId, titulo: datos.titulo };
}

/**
 * La biblioteca muestra 12 lecturas por página en orden alfabético: con las que publican otras
 * pruebas, una lectura concreta puede quedar en la página 2. Cada prueba le da una temática única
 * y filtra por ella.
 */
export async function filtrarPorTema(page: Page, tema: string): Promise<void> {
  await page.getByLabel('Temática').fill(tema);
  await page.getByRole('button', { name: 'Buscar' }).click();
}
```

`tests/load/scenarios/biblioteca.js`:

```js
import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de la biblioteca (k6).
 *   RNF-001: lecturas → p95 < 300 ms y p99 < 800 ms.
 *     · docente: lista (12 por página), lista filtrada por temática y nivel, y detalle (RF-028);
 *     · niño: su biblioteca, limitada a su edad y su nivel ± 1.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa) y lecturas publicadas:
 *             node tests/load/sembrar-biblioteca.mjs
 * Ejecutar:   k6 run tests/load/scenarios/biblioteca.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 -e DURACION=30s tests/load/scenarios/biblioteca.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    biblioteca_docente: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'explorarComoDocente',
      tags: { escenario: 'biblioteca_docente' },
    },
    biblioteca_nino: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'abrirBibliotecaDelNino',
      tags: { escenario: 'biblioteca_nino' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /biblioteca}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /biblioteca?filtros}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /biblioteca/{id}}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /biblioteca (niño)}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Docente con un aula, un niño de 9 años con sesión en la tablet y una lectura para el detalle. */
export function setup() {
  const email = `carga.biblioteca.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const lista = http.get(`${BASE}/biblioteca`, { headers: docente }).json();
  if (!lista.lecturas || lista.lecturas.length === 0) fail('No hay lecturas publicadas: ejecuta antes node tests/load/sembrar-biblioteca.mjs');

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '3.° Carga', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const matricula = http.post(`${BASE}/aulas/${aula.id}/matriculas`, JSON.stringify({
    alias: 'Niño Carga', anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 1, avatar: 'zorro',
  }), { headers: docente }).json();
  http.post(`${BASE}/estudiantes/${matricula.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
  const { tokenDispositivo } = http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: 'Tablet carga' }), { headers: docente }).json();
  const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: matricula.estudianteId, pin: '4826' }), cabeceras).json();

  return {
    docente,
    estudiante: { Authorization: `Bearer ${ingreso.accessToken}` },
    lecturaId: lista.lecturas[0].lecturaId,
  };
}

export function explorarComoDocente(datos) {
  const lista = http.get(`${BASE}/biblioteca`, { headers: datos.docente, tags: { nombre: 'GET /biblioteca' } });
  check(lista, { 'biblioteca: hasta 12 por página': (r) => r.status === 200 && r.json('lecturas').length <= 12 });
  const filtrada = http.get(`${BASE}/biblioteca?tema=animales&nivel=2`, { headers: datos.docente, tags: { nombre: 'GET /biblioteca?filtros' } });
  check(filtrada, { 'biblioteca filtrada 200': (r) => r.status === 200 });
  const detalle = http.get(`${BASE}/biblioteca/${datos.lecturaId}`, { headers: datos.docente, tags: { nombre: 'GET /biblioteca/{id}' } });
  check(detalle, { 'detalle sin respuestas': (r) => r.status === 200 && !r.body.includes('indiceCorrecto') && !r.body.includes('clavesEvidencia') });
}

export function abrirBibliotecaDelNino(datos) {
  const res = http.get(`${BASE}/biblioteca`, { headers: datos.estudiante, tags: { nombre: 'GET /biblioteca (niño)' } });
  check(res, {
    'el niño ve solo su edad': (r) => r.status === 200 && r.json('lecturas').every((l) => l.rangoEdad === 'R2'),
  });
}
```

`tests/load/sembrar-biblioteca.mjs`:

```js
// Siembra lecturas publicadas para el escenario k6 de la biblioteca (scenarios/biblioteca.js).
// SOLO para desarrollo y CI (ver sembrado.mjs).
//
// Uso (con la API en marcha):  node tests/load/sembrar-biblioteca.mjs [cantidad]   (por defecto 30)
import { conPrisma, cuentaBackoffice, exigirEntornoLocal, publicarLecturas } from './sembrado.mjs';

const CANTIDAD = Math.min(Math.max(Number(process.argv[2] ?? 30) || 30, 1), 200);

exigirEntornoLocal();
await conPrisma(async (prisma) => {
  const editora = await cuentaBackoffice(prisma, 'EDITOR');
  const revisor = await cuentaBackoffice(prisma, 'REVISOR');
  await publicarLecturas(editora, revisor, CANTIDAD);
});
console.log(`✔ ${CANTIDAD} lecturas publicadas para la prueba de carga de la biblioteca.`);
```

---

# 7. NIVEL 4: PRUEBAS DE ACEPTACIÓN (UAT / BDD)

## 7.1 Escenarios de negocio en Gherkin

```gherkin
# language: es
@contenido
Característica: Biblioteca y gestión de contenido
  Como equipo de contenidos de LectoAventura
  Quiero escribir, revisar y publicar lecturas con sus actividades
  Para que lleguen a la biblioteca de los niños y las docentes puedan asignarlas

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-021 @RN-15
  Escenario: Una lectura sin licencia no puede enviarse a revisión
    Dado que soy una editora con mi cuenta y la verificación en dos pasos
    Cuando escribo una lectura completa pero sin licencia
    Entonces el panel de revisión dice "Declara la licencia del texto"
    Y no puedo enviarla a revisión

  @RF-026 @camino-feliz
  Escenario: El revisor devuelve una lectura con comentarios y la autora los ve
    Dado que una editora envió a revisión la lectura "El zorro y la luna"
    Cuando el revisor la devuelve con el comentario "Agrega una pista P2"
    Entonces la autora ve la lectura en borrador con el comentario "Agrega una pista P2"

  @RF-026 @RF-028 @RF-018 @camino-feliz @smoke
  Escenario: El revisor aprueba y la lectura llega a la biblioteca y a las aulas
    Dado que una editora envió a revisión la lectura "El zorro y la luna"
    Cuando el revisor la aprueba
    Entonces una docente encuentra "El zorro y la luna" en la biblioteca
    Y puede elegirla al crear una asignación para su aula

  @RF-027
  Escenario: Editar una lectura publicada crea una versión nueva sin tocar la publicada
    Dado que la lectura "Volcanes del Perú" está publicada
    Cuando una editora crea una versión nueva y le cambia el título a "Volcanes del Perú y del mundo"
    Entonces la biblioteca sigue mostrando "Volcanes del Perú" hasta que se apruebe la versión nueva

  @RF-028
  Escenario: El estudiante solo ve lecturas de su edad
    Dado que hay una lectura publicada para 8–9 años y otra para 10–12 años
    Cuando un niño de 9 años abre su biblioteca
    Entonces ve solo la lectura para 8–9 años
```

## 7.2 Automatización (Step Definitions)

```ts
import { expect } from '@playwright/test';

import { cuentaBackoffice, CuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada, sesionBackoffice, TEXTO_E2E } from '../support/contenido';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, ingresarComoAdulto, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de Biblioteca y contenido (RF-021 a RF-028). */

interface Estado {
  editora?: CuentaBackoffice;
  revisor?: CuentaBackoffice;
  lecturaId?: string;
  titulo?: string;
  /** Temática única: la biblioteca pagina de a 12 y se filtra por ella (ver filtrarPorTema). */
  tema?: string;
  titulos?: { paraEl: string; otra: string };
}
const estado = new WeakMap<object, Estado>();
const de = (mundo: object): Estado => {
  if (!estado.has(mundo)) estado.set(mundo, {});
  return estado.get(mundo) as Estado;
};
const unico = (titulo: string) => `${titulo} · ${Date.now().toString(36)}`;

async function abrirComo(page: import('@playwright/test').Page, cuenta: CuentaBackoffice, titulo: string) {
  await ingresarBackoffice(page, cuenta);
  await page.goto('/backoffice/lecturas');
  await page.getByRole('link', { name: `Abrir ${titulo}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
}

// ── RF-021: sin licencia no se envía ──────────────────────────────────────

Dado('que soy una editora con mi cuenta y la verificación en dos pasos', async ({ page, mundo }) => {
  de(mundo).editora = await cuentaBackoffice('EDITOR');
  await ingresarBackoffice(page, de(mundo).editora!);
});

Cuando('escribo una lectura completa pero sin licencia', async ({ page, request, mundo }) => {
  const e = de(mundo);
  e.titulo = unico('Sin licencia');
  const sesion = await sesionBackoffice(request, e.editora!);
  const creada = await request.post('/api/v1/backoffice/lecturas', {
    headers: sesion,
    data: { metadatos: { titulo: e.titulo, rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: null }, texto: TEXTO_E2E },
  });
  const { lecturaId, oraciones } = await creada.json();
  await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/actividades`, {
    headers: sesion,
    data: { actividades: [{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la evidencia', clavesEvidencia: [oraciones[4].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }] }] }] },
  });
  await page.goto(`/backoffice/lecturas/${lecturaId}`);
  await expect(page.getByRole('heading', { level: 1, name: e.titulo })).toBeVisible();
});

Entonces('el panel de revisión dice {string}', async ({ page }, problema: string) => {
  await expect(page.getByText('Antes de enviar a revisión falta:')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: problema })).toBeVisible();
});

Entonces('no puedo enviarla a revisión', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled();
});

// ── RF-026: devolver y aprobar ────────────────────────────────────────────

Dado('que una editora envió a revisión la lectura {string}', async ({ request, mundo }, titulo: string) => {
  const e = de(mundo);
  e.editora = await cuentaBackoffice('EDITOR');
  e.revisor = await cuentaBackoffice('REVISOR');
  e.titulo = unico(titulo);
  e.tema = unico('Animales');
  const sesion = await sesionBackoffice(request, e.editora);
  const creada = await request.post('/api/v1/backoffice/lecturas', {
    headers: sesion,
    data: { metadatos: { titulo: e.titulo, rangoEdad: 'R2', nivelDificultad: 2, tematica: e.tema, tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: 'CC BY 4.0' }, texto: TEXTO_E2E },
  });
  const { lecturaId, oraciones } = await creada.json();
  e.lecturaId = lecturaId;
  await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/actividades`, {
    headers: sesion,
    data: { actividades: [{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la evidencia', clavesEvidencia: [oraciones[4].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }] }] }] },
  });
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/enviar-revision`, { headers: sesion })).status()).toBe(200);
});

Cuando('el revisor la devuelve con el comentario {string}', async ({ page, mundo }, comentario: string) => {
  const e = de(mundo);
  await abrirComo(page, e.revisor!, e.titulo!);
  await page.getByRole('button', { name: 'Devolver con comentarios' }).click();
  await page.getByLabel('¿Qué hay que corregir?').fill(comentario);
  await page.getByRole('button', { name: 'Devolver a la autora' }).click();
  await expect(page.locator('.cabecera-aula').getByText('Borrador')).toBeVisible();
  await salirDelPanel(page);
});

Entonces('la autora ve la lectura en borrador con el comentario {string}', async ({ page, mundo }, comentario: string) => {
  const e = de(mundo);
  await abrirComo(page, e.editora!, e.titulo!);
  await expect(page.locator('.cabecera-aula').getByText('Borrador')).toBeVisible();
  await expect(page.getByText('El revisor la devolvió:')).toBeVisible();
  await expect(page.getByText(comentario)).toBeVisible();
});

Cuando('el revisor la aprueba', async ({ page, mundo }) => {
  const e = de(mundo);
  await abrirComo(page, e.revisor!, e.titulo!);
  await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
  await expect(page.getByText('Publicada: está en la biblioteca y se puede asignar a las aulas.')).toBeVisible();
  await salirDelPanel(page);
});

Entonces('una docente encuentra {string} en la biblioteca', async ({ page, request, mundo }, _titulo: string) => {
  // El título real lleva un sufijo único por escenario (ver "unico").
  const e = de(mundo);
  mundo.aula = await docenteConAula(request, [{ alias: 'Lucía', avatar: 'zorro' }]);
  await ingresarComoAdulto(page, mundo.aula.docente.email, mundo.aula.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/); // ingresarComoAdulto no espera: sin esto, el goto cortaría el ingreso
  await page.goto('/docente/biblioteca');
  await filtrarPorTema(page, e.tema!);
  await page.getByRole('link', { name: `Abrir ${e.titulo}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: e.titulo })).toBeVisible();
});

Entonces('puede elegirla al crear una asignación para su aula', async ({ page, mundo }) => {
  const e = de(mundo);
  await page.goto('/docente');
  await page.getByRole('link', { name: 'Abrir 3.° B' }).click();
  await page.getByRole('button', { name: '+ Nueva asignación' }).click();
  await expect(page.getByLabel('Lectura', { exact: true }).locator('option', { hasText: e.titulo })).toHaveCount(1);
});

// ── RF-027: versiones ─────────────────────────────────────────────────────

Dado('que la lectura {string} está publicada', async ({ request, mundo }, titulo: string) => {
  const e = de(mundo);
  e.titulo = unico(titulo);
  e.tema = unico('Ciencia');
  e.lecturaId = (await lecturaPublicada(request, { titulo: e.titulo, tematica: e.tema })).lecturaId;
});

Cuando('una editora crea una versión nueva y le cambia el título a {string}', async ({ page, mundo }, nuevo: string) => {
  const e = de(mundo);
  e.editora = await cuentaBackoffice('EDITOR');
  await abrirComo(page, e.editora, e.titulo!);
  await page.getByRole('button', { name: 'Crear una versión nueva' }).click();
  await expect(page.getByText(/La versión 1 sigue publicada/)).toBeVisible();
  await page.getByLabel('Título').fill(nuevo);
  await page.getByRole('button', { name: 'Guardar datos y texto' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await salirDelPanel(page);
});

Entonces('la biblioteca sigue mostrando {string} hasta que se apruebe la versión nueva', async ({ page, request, mundo }, _titulo: string) => {
  const e = de(mundo);
  const aula = await docenteConAula(request, [{ alias: 'Leo', avatar: 'koala' }]);
  await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto('/docente/biblioteca');
  await filtrarPorTema(page, e.tema!);
  await expect(page.getByRole('link', { name: `Abrir ${e.titulo}` })).toBeVisible();
});

// ── RF-028: alcance del estudiante ────────────────────────────────────────

Dado('que hay una lectura publicada para 8–9 años y otra para 10–12 años', async ({ request, mundo }) => {
  const e = de(mundo);
  e.tema = unico('Cuentos');
  e.titulos = {
    paraEl: (await lecturaPublicada(request, { titulo: unico('Para 8–9 años'), rangoEdad: 'R2', nivelDificultad: 2, tematica: e.tema })).titulo,
    otra: (await lecturaPublicada(request, { titulo: unico('Para 10–12 años'), rangoEdad: 'R3', nivelDificultad: 4, tematica: e.tema })).titulo,
  };
});

Cuando('un niño de 9 años abre su biblioteca', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await tabletDelAulaActivada(page, request, mundo.aula);
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
});

Entonces('ve solo la lectura para 8–9 años', async ({ page, mundo }) => {
  const { titulos, tema } = de(mundo);
  await filtrarPorTema(page, tema!);
  await expect(page.getByRole('link', { name: `Abrir ${titulos!.paraEl}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Abrir ${titulos!.otra}` })).toHaveCount(0);
});
```

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
