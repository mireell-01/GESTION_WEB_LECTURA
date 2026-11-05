<!-- Generado con node docs/pruebas/construir.mjs desde 13-suites-priorizadas.plantilla.md. No editar a mano. -->
# Suites de pruebas priorizadas: LectoAventura (Semana 9, C7.I2)

Capacidad UC2.C7, indicador C7.I2. Todo lo que aparece aquí está en el repositorio (rama `main`, pull request #17). Los tiempos y registros salen de ejecuciones reales del 5 de noviembre de 2026 y de las ejecuciones 41557778002 y 42042625851 de GitHub Actions.

---

# 1. Radiografía de tu código actual

## 1.1 Lenguaje, framework y motor de pruebas

| Capa | Tecnología | Motor de pruebas |
| :--- | :--- | :--- |
| Backend | TypeScript, NestJS 10, Prisma 5, PostgreSQL 16 | Vitest 3.2 (Nivel 1), Vitest con Supertest y PostgreSQL real (Nivel 2) |
| Frontend | TypeScript, Next.js 15, React 19 | Vitest 3.2 sin navegador (Nivel 1, nuevo) y Playwright (Nivel 3) |
| Sistema y aceptación | Navegador real sobre la API y la web compiladas | Playwright, playwright-bdd con Gherkin en español (Nivel 4), k6 para carga |

Como es Node y Next.js, corresponde la fila de **Vitest** de la tabla de la guía: prefijos en `describe`, archivos barril y `vitest run -t`.

## 1.2 Inventario del código analizado

| Archivo o clase | Ruta | Qué hace | Riesgo | ¿Tiene tests? |
| :--- | :--- | :--- | :--- | :--- |
| `AutenticarEstudianteUseCase` | `apps/api/src/modules/iam/application/use-cases/autenticar-estudiante.use-case.ts` | Ingreso del niño con avatar y PIN; exige el contexto del dispositivo y bloquea tras 5 PIN incorrectos (RN-03, RN-04) | Core | Sí, niveles 1 a 4 |
| `RegistrarConsentimientoUseCase` | `apps/api/src/modules/iam/application/use-cases/registrar-consentimiento.use-case.ts` | Consentimiento del adulto, sin el cual no existe el perfil del menor (RN-01) | Core | Sí, niveles 1 a 4 |
| `Argon2HashService`, `JwtTokenService` | `apps/api/src/modules/iam/infrastructure/crypto/` | Hash de contraseñas y PIN; firma y verificación de tokens | Core | Sí, Nivel 1 |
| `RolesGuard`, `LimiteTasaGuard` | `apps/api/src/modules/iam/interface/http/guards.ts`, `apps/api/src/modules/shared-kernel/interface/limite-tasa.ts` | Acceso por rol y límite de intentos | Core | Sí, niveles 1 y 2 |
| `puntajeItem`, `PUNTAJE_POR_PISTAS` | `apps/api/src/modules/lectura/domain/services/politica-pistas.ts` | Cuánto vale una respuesta según las pistas que usó: 1 · 0,75 · 0,5 · 0,25 (RN-07) | Core | Sí, niveles 1 a 4 |
| `SesionLectura` | `apps/api/src/modules/lectura/domain/entities/sesion-lectura.ts` | La sesión de lectura: predicción, preguntas, pistas, decisiones y cierre | Core | Sí, niveles 1 a 4 |
| `VersionLectura` | `apps/api/src/modules/contenido/domain/entities/version-lectura.ts` | Flujo de publicación; el revisor no puede ser el autor (RN-14, RN-15) | Core | Sí, niveles 1 a 4 |
| `mediacion-socratica.ts`, `filtro-salida.ts`, `moderacion-entrada.ts` | `apps/api/src/modules/asistente/domain/services/` | El asistente guía sin dar la respuesta y filtra datos personales (RN-16) | Core | Sí, niveles 1 a 4 |
| `maestria.ts` | `apps/api/src/modules/progreso/domain/services/maestria.ts` | Calcula la maestría que ven la docente y la familia | Core | Sí, niveles 1 a 4 |
| `politica-puntos.ts`, `racha.ts` | `apps/api/src/modules/gamificacion/domain/services/` | Puntos y racha del niño: motivan, pero no califican | Menor | Sí, niveles 1 a 4 |
| `PdfLibTarjetas` | `apps/api/src/modules/escuela/infrastructure/pdf/pdf-lib-tarjetas.ts` | Distribución de las tarjetas de acceso en una hoja A4 | Menor | Sí, niveles 1 y 2 |
| `IlustracionLectura.tsx` | `apps/web/src/features/lectura/IlustracionLectura.tsx` | Elige y dibuja la escena animada de cada párrafo | Menor | Sí: Nivel 1 nuevo (14 casos) y Nivel 3 |
| `SesionLectura.tsx`, `PreguntaLectura.tsx` | `apps/web/src/features/lectura/` | La pantalla de lectura del niño | Core | Solo niveles 3 y 4: **no tienen prueba de componente** |

Las pruebas están en `apps/api/test/unit` (Nivel 1), `apps/api/test/integration` (Nivel 2), `tests/e2e/specs` (Nivel 3) y `tests/e2e/features` (Nivel 4). La web no tenía ninguna prueba de Nivel 1 hasta esta entrega.

**Cuántas pruebas hay hoy:**

| Nivel | Pruebas | Core | Menor | Fast | Slow |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 1. API (sin contar la guardia) | 666 | 477 | 189 | 577 | 89 |
| 1. Guardia de etiquetas | 7 | 7 | 0 | 7 | 0 |
| 1. Web | 14 | 0 | 14 | 14 | 0 |
| 2. Integración | 207 | 165 | 42 | 0 | 207 |
| 3. Sistema (63 por cada uno de 3 dispositivos) | 189 | 105 | 84 | 0 | 189 |
| 4. Aceptación (escenarios) | 70 | sin etiquetar | | | |
| **Total** | **1153** | | | | |

El 72 % del Nivel 1 de la API es Core porque el producto guarda datos de menores y gran parte de sus pruebas son de seguridad, entre ellas 71 casos del conjunto adversario del asistente.

**Criterio de riesgo.** Una prueba es Core si, cuando falla, se expone a un menor, se le califica mal o le llega contenido sin aprobar:

- seguridad y privacidad: ingreso, sesiones, PIN, MFA, consentimiento, acceso por rol (RN-01 a RN-04, RN-17) y auditoría;
- calificación: corrección, puntaje (RN-06, RN-07), maestría y nivel diagnóstico;
- contenido: flujo de publicación (RN-14, RN-15), filtro de palabras y asistente sin fugas (RN-16).

Lo demás es Menor: gamificación, mapa, PDF, CSV, consejos y aspecto visual.

**Criterio de tiempo.** En el Nivel 1 es Slow un `describe` con algún caso de 100 ms o más medido en una ejecución real: criptografía, PDF y conjuntos grandes. Todo el Nivel 2 y el Nivel 3 son Slow porque usan base de datos real o navegador.

## 1.3 Diagnóstico del cuello de botella

La guía pregunta qué pasaría al llegar a 200 o más pruebas. Este proyecto ya pasó ese punto, con 1153. Lo medido en la ejecución 41557778002 de GitHub Actions, con los trabajos en serie:

| Trabajo | Minutos | Parte del total |
| :--- | ---: | ---: |
| Lint, arquitectura y tipos | 1,0 | 5 % |
| Nivel 1: unitarias y cobertura | 1,4 | 7 % |
| Nivel 2: integración | 2,6 | 13 % |
| Niveles 3 y 4: E2E 6,4, aceptación 2,1, carga 4,0 y preparación | 14,6 | 75 % |
| **Total** | **19,6** | |

Hay tres problemas concretos:

1. **Todo o nada.** No se podía preguntar "¿sigue bien lo crítico?" sin esperar 19,6 minutos.
2. **El orden no respondía al riesgo.** Playwright corre por orden alfabético de carpeta: `lectura`, el centro del producto, corre después de `administracion`, `aventura` y `gamificacion`.
3. **Filtrar por nombre no bastaba.** Con `-t "Core"` sobre todo el Nivel 1 tarda igual o más que sin filtro (32,2 s frente a 29,0 s), porque Vitest carga los 39 archivos antes de filtrar. En la ejecución completa, cargar archivos suma 113 s repartidos entre los procesos y correr las pruebas, 6,5 s. Por eso hacen falta los barriles: cargan solo sus archivos.

Lo que estas suites **no** resuelven: el Nivel 1 ya era rápido y el 75 % del tiempo está en los niveles 3 y 4. Con todo en verde, el tiempo total no baja. Lo que baja es el tiempo hasta enterarse de que se rompió algo crítico.

---

# 2. ¿Qué tienes que hacer? (plan de acción)

Los 8 pasos ya están hechos: la rama se fusionó con el pull request #17, con las 5 comprobaciones en verde.

1. **Etiquetar** los 182 `describe` de primer nivel de la API y los 17 bloques E2E con `[Componente][Core|Menor][Fast|Slow]`. Solo cambian los títulos; ninguna aserción.
2. **Crear los barriles** en `apps/api/test/suites/`: uno por riesgo, dos por tiempo y uno por cada uno de los 11 componentes.
3. **Crear `apps/api/vitest.suites.config.ts`**, para que la ejecución completa y su cobertura no cuenten dos veces cada prueba.
4. **Crear la guardia** `apps/api/test/unit/suites/etiquetas.spec.ts`, que falla si un archivo queda fuera de su suite o si una regla crítica deja de ser Core.
5. **Agregar el Nivel 1 de la web**: `apps/web/vitest.config.ts` y `apps/web/test/lectura/ilustracion-lectura.spec.tsx`.
6. **Agregar los comandos** a `package.json`: `test:core`, `test:core:fast`, `test:fast`, `test:slow`, `test:suite`, `test:int:core`, `test:e2e:core`, `test:e2e:resto` y `test:web`.
7. **Reordenar CI** en `.github/workflows/calidad.yml`: puerta rápida al inicio y, en E2E, primero lo crítico.
8. **Abrir el pull request** y confirmar en GitHub los tiempos nuevos de CI (sección 6.4).

---

# 3. Estructura de carpetas

```text
G.W_PROYECTO/
├── .github/workflows/calidad.yml          ← puerta rápida y E2E con lo crítico primero
├── package.json                           ← comandos de las suites
├── apps/
│   ├── api/
│   │   ├── vitest.config.ts               (Nivel 1 completo y cobertura, sin cambios)
│   │   ├── vitest.integration.config.ts   (Nivel 2, sin cambios)
│   │   ├── vitest.suites.config.ts        ← NUEVO
│   │   └── test/
│   │       ├── suites/                    ← NUEVO: archivos organizadores
│   │       │   ├── core.suite.test.ts     (por riesgo)
│   │       │   ├── fast.suite.test.ts     (por tiempo)
│   │       │   ├── slow.suite.test.ts     (por tiempo)
│   │       │   └── componentes/           (por componente: 11 archivos)
│   │       │       ├── iam.suite.test.ts
│   │       │       ├── lectura.suite.test.ts
│   │       │       └── …
│   │       ├── unit/
│   │       │   ├── suites/etiquetas.spec.ts  ← NUEVO: la guardia
│   │       │   └── lectura/dominio/dominio-lectura.spec.ts   (títulos etiquetados)
│   │       └── integration/lectura/lectura-http.int-spec.ts  (títulos etiquetados)
│   └── web/
│       ├── vitest.config.ts               ← NUEVO
│       └── test/lectura/ilustracion-lectura.spec.tsx  ← NUEVO
└── tests/e2e/specs/lectura/lectura.spec.ts           (título etiquetado)
```

---

# 4. Laboratorio ABP, paso 1: mapeo de las suites

| ID | Componente o función real | Por componente | Por riesgo | Por tiempo | Etiqueta |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CP-01 | `puntajeItem()`: 1 · 0,75 · 0,5 · 0,25 según las pistas (RN-07) | Lectura | Core | Fast | `[Lectura][Core][Fast]` |
| CP-02 | `SesionLectura`: acertar tras una pista vale 0,75 | Lectura | Core | Fast | `[Lectura][Core][Fast]` |
| CP-03 | `AutenticarEstudianteUseCase`: bloqueo por PIN y contexto de ingreso (RN-03, RN-04) | IAM | Core | Fast | `[IAM][Core][Fast]` |
| CP-04 | `Argon2HashService`: hash real con sal | IAM | Core | Slow | `[IAM][Core][Slow]` |
| CP-05 | Conjunto adversario del asistente: 71 casos, 0 fugas (RN-16) | Asistente | Core | Slow | `[Asistente][Core][Slow]` |
| CP-06 | `VersionLectura`: flujo de publicación (RN-14, RN-15) | Contenido | Core | Fast | `[Contenido][Core][Fast]` |
| CP-07 | `PdfLibTarjetas`: 9 estudiantes ocupan 2 hojas A4 | Escuela | Menor | Slow | `[Escuela][Menor][Slow]` |
| CP-08 | Política de puntos de la gamificación (RN-10 a RN-12) | Gamificacion | Menor | Fast | `[Gamificacion][Menor][Fast]` |
| CP-09 | `escenaDe()` en la web: el zorro aparece aunque el párrafo no lo nombre | Lectura | Menor | Fast | `[Lectura][Menor][Fast]` |
| CP-10 | API con PostgreSQL real: la lectura de punta a punta guarda 0,75 | Lectura | Core | Slow | `[Lectura][Core][Slow]` |
| CP-11 | Navegador real: el niño predice, lee, usa una pista y cierra | Lectura | Core | Slow | `[Lectura][Core][Slow]` |

El orden de las etiquetas es fijo, y por eso se pueden combinar: `-t "\[Core\]\[Fast\]"`.

**Por qué el riesgo en integración va por archivo.** Allí los `describe` dependen de un bloque "Preparación" y del estado que deja el anterior. Si un mismo archivo mezclara Core y Menor, el filtro saltaría la preparación y las pruebas fallarían sin motivo. La guardia lo impide. La prueba real: con el filtro `[Core]`, los 165 casos pasan.

---

# 5. Laboratorio ABP, paso 2: código

## 5.1 Configuración del motor

`apps/api/vitest.suites.config.ts`

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Suites priorizadas del Nivel 1 (test/suites): por riesgo, por componente y por tiempo. Corren en un
 * archivo aparte de vitest.config.ts para que la ejecución completa y su cobertura no cuenten dos veces
 * cada prueba. Cada barril carga solo sus archivos: filtrar con -t sobre todo el Nivel 1 también selecciona
 * las pruebas, pero igual carga los 39 archivos, y la carga es la mayor parte del tiempo.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/suites/**/*.suite.test.ts'],
    environment: 'node',
  },
});
```

`apps/web/vitest.config.ts`

```ts
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Nivel 1 de la web: la lógica de los componentes y su HTML, sin navegador (renderToStaticMarkup de
 * react-dom/server, ya instalado). Lo que depende del navegador lo cubre el Nivel 3 con Playwright.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
});
```

Comandos en `apps/api/package.json`:

```json
"test:int:core": "vitest run -c vitest.integration.config.ts -t \"\\[Core\\]\"",
"test:core": "vitest run -c vitest.suites.config.ts test/suites/core -t \"\\[Core\\]\"",
"test:core:fast": "vitest run -c vitest.suites.config.ts test/suites/core -t \"\\[Core\\]\\[Fast\\]\"",
"test:fast": "vitest run -c vitest.suites.config.ts test/suites/fast -t \"\\[Fast\\]\"",
"test:slow": "vitest run -c vitest.suites.config.ts test/suites/slow -t \"\\[Slow\\]\"",
"test:suite": "vitest run -c vitest.suites.config.ts"
```

## 5.2 Pruebas etiquetadas

Una prueba Core del backend, en `apps/api/test/unit/lectura/dominio/dominio-lectura.spec.ts`:

```ts
describe('[Lectura][Core][Fast] Puntaje del ítem (RN-07) y rúbrica (RF-051)', () => {
  it('1 · 0,75 · 0,5 · 0,25 según las pistas; 0 con la explicación', () => {
    expect([0, 1, 2, 3].map((p) => puntajeItem(p, false))).toEqual([1, 0.75, 0.5, 0.25]);
    expect(puntajeItem(3, true)).toBe(0);
    expect([1, 2, 3].map(puntajeDeRubrica)).toEqual([0.33, 0.67, 1]);
  });
});
```

Una prueba Slow del backend, en `apps/api/test/unit/iam/infraestructura/seguridad.spec.ts`: `describe('[IAM][Core][Slow] Argon2HashService', …)`.

Las pruebas Menor del frontend, en `apps/web/test/lectura/ilustracion-lectura.spec.tsx`. Dejan fija la falla que se vio en la lectura del zorro, donde salía la luna sin el zorro:

```
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EscenaAnimada, escenaDe, IlustracionParrafo, repartoDe } from '@/features/lectura/IlustracionLectura';

const REPARTO_ZORRO = repartoDe('El zorro y la luna');

describe('[Lectura][Menor][Fast] Qué escena pinta cada párrafo', () => {
  it('la portada de "El zorro y la luna" es de noche y sale el zorro', () => {
    const escena = escenaDe('El zorro y la luna', REPARTO_ZORRO);
    expect(escena.cielo).toBe('noche');
    expect(escena.animales).toContain('zorro');
  });

  it('el protagonista acompaña aunque el párrafo no lo nombre', () => {
    expect(escenaDe('Una tarde subió muy alto.', REPARTO_ZORRO).animales).toEqual(['zorro']);
  });

  it('el reparto también se toma del primer párrafo, no solo del título', () => {
    const reparto = repartoDe('Una tarde especial', 'Cada mañana Killa cuidaba a su llama Pancho.');
    expect(escenaDe('Un día no quiso comer.', reparto).animales).toEqual(['llama']);
  });

  it('el cielo y el lugar se eligen por separado: "subió al cerro… la luna" es un cerro de noche', () => {
    const escena = escenaDe('Una tarde subió al cerro más alto. Pero la luna seguía lejos.', REPARTO_ZORRO);
    expect(escena.cielo).toBe('noche');
    expect(escena.lugar).toBe('montana');
  });

  it('los que nombra el párrafo van primero; entre ellos, el del reparto', () => {
    const reparto = repartoDe('La rana y sus amigos');
    expect(escenaDe('El zorro miró a la rana.', reparto).animales.slice(0, 2)).toEqual(['rana', 'zorro']);
  });

  it('los peces solo aparecen junto al agua, aunque el primer párrafo los nombre', () => {
    const reparto = repartoDe('El pescador', 'Mira cómo saltan los peces.');
    expect(escenaDe('Volvió a su casa por el camino.', reparto).animales).not.toContain('peces');
    expect(escenaDe('En el lago saltan los peces.', reparto).animales).toContain('peces');
  });

  it('no confunde palabras parecidas: "gatillo" no es un gato ni "rancho" una rana', () => {
    expect(escenaDe('Apretó el gatillo en el rancho.').animales).toEqual(['mariposa']);
  });

  it('dos párrafos seguidos no salen iguales: la escena se mira desde el otro lado', () => {
    const texto = 'Un día muy tranquilo.';
    expect(escenaDe(texto, REPARTO_ZORRO, 1).espejo).not.toBe(escenaDe(texto, REPARTO_ZORRO, 2).espejo);
  });

  it('el mismo párrafo siempre pinta la misma escena', () => {
    expect(escenaDe('Había una vez.', REPARTO_ZORRO)).toEqual(escenaDe('Había una vez.', REPARTO_ZORRO));
  });

  it('un párrafo alegre trae arcoíris y uno neutro no', () => {
    expect(escenaDe('Pancho comió feliz.').alegre).toBe(true);
    expect(escenaDe('Pancho caminó.').alegre).toBe(false);
  });
});

describe('[Lectura][Menor][Fast] Lo que se dibuja', () => {
  it('dibuja al zorro y es decorativa: los lectores de pantalla la saltan', () => {
    const html = renderToStaticMarkup(<EscenaAnimada texto="El zorro miraba la luna." reparto={REPARTO_ZORRO} />);
    expect(html).toContain('escena__animal--zorro');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-cielo="noche"');
  });

  it('en una escena caben hasta 3 animales que caminan', () => {
    const html = renderToStaticMarkup(<EscenaAnimada texto="El perro, el gato, el cuy, la oveja y el conejo." />);
    expect(html.match(/escena__animal--/g)).toHaveLength(3);
  });

  it('cada escena usa ids propios, para que dos en la misma pantalla no se pisen los colores', () => {
    const html = renderToStaticMarkup(
      <>
        <EscenaAnimada texto="Uno." />
        <EscenaAnimada texto="Dos." />
      </>,
    );
    const ids = [...html.matchAll(/id="(cielo-[^"]+)"/g)].map(([, id]) => id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('sin imagen del editor pinta la escena; con imagen no la pinta', () => {
    const sin = renderToStaticMarkup(<IlustracionParrafo imagen={null} texto="El zorro." reparto="" />);
    const con = renderToStaticMarkup(<IlustracionParrafo imagen={{ url: '/x', textoAlternativo: 'Un zorro' }} texto="El zorro." reparto="" />);
    expect(sin).toContain('class="escena"');
    expect(con).not.toContain('class="escena"');
  });
});
```

La guardia que mantiene ordenadas las suites, en `apps/api/test/unit/suites/etiquetas.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La guardia de las suites priorizadas. Las etiquetas y los barriles se escriben a mano, así que sin esta
 * prueba se desordenan en silencio: un archivo nuevo quedaría fuera de la suite Core y nadie lo notaría.
 * También impide "arreglar" la puerta rápida bajando a [Menor] una prueba de una regla crítica.
 */
const TEST = resolve(__dirname, '../..');
const ETIQUETA = /^\[([A-Za-z]+)\]\[(Core|Menor)\]\[(Fast|Slow)\] /;
const DESCRIBE = /^describe(?:\.\w+)?\('((?:[^'\\]|\\.)*)'/gm;
const ESTA_GUARDIA = 'unit/suites/etiquetas.spec.ts';

/** Las reglas de negocio que nunca salen de Core: privacidad y acceso de los menores, calificación y publicación. */
const REGLAS_CRITICAS = ['RN-01', 'RN-02', 'RN-03', 'RN-04', 'RN-06', 'RN-07', 'RN-14', 'RN-15', 'RN-16', 'RN-17'];

interface Bloque {
  archivo: string;
  titulo: string;
  componente: string | undefined;
  riesgo: string | undefined;
  tiempo: string | undefined;
}

function especificaciones(carpeta: string, sufijo: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return especificaciones(ruta, sufijo);
    return nombre.endsWith(sufijo) ? [relative(TEST, ruta).replace(/\\/g, '/')] : [];
  });
}

function bloques(archivo: string): Bloque[] {
  const texto = readFileSync(join(TEST, archivo), 'utf8');
  return [...texto.matchAll(DESCRIBE)].map(([, titulo = '']) => {
    const [, componente, riesgo, tiempo] = ETIQUETA.exec(titulo) ?? [];
    return { archivo, titulo, componente, riesgo, tiempo };
  });
}

/** Lo que importa un barril, como ruta relativa a test/ con la extensión del archivo. */
function importados(barril: string): string[] {
  const ruta = join(TEST, 'suites', barril);
  const texto = readFileSync(ruta, 'utf8');
  return [...texto.matchAll(/^import '([^']+)';/gm)]
    .map(([, destino = '']) => `${relative(TEST, resolve(dirname(ruta), destino)).replace(/\\/g, '/')}.ts`)
    .sort();
}

const UNITARIAS = especificaciones(join(TEST, 'unit'), '.spec.ts');
const INTEGRACION = especificaciones(join(TEST, 'integration'), '.int-spec.ts');
const carpetaDe = (archivo: string) => archivo.split('/')[1];
const conEtiqueta = (pred: (b: Bloque) => boolean) => UNITARIAS.filter((a) => a !== ESTA_GUARDIA && bloques(a).some(pred));

describe('[Suites][Core][Fast] Etiquetas y barriles de las suites priorizadas', () => {
  it('cada describe de primer nivel lleva [Componente][Core|Menor][Fast|Slow], con el componente de su carpeta', () => {
    for (const archivo of [...UNITARIAS, ...INTEGRACION]) {
      const lista = bloques(archivo);
      expect(lista.length, `Sin describe de primer nivel: ${archivo}`).toBeGreaterThan(0);
      for (const b of lista) {
        expect(b.componente, `Sin etiqueta válida en ${archivo}: ${b.titulo}`).toBeDefined();
        expect(b.componente?.toLowerCase(), `Componente distinto a su carpeta: ${b.titulo}`).toBe(carpetaDe(archivo));
      }
    }
  });

  it('todas las pruebas de integración son [Slow] y un archivo no mezcla riesgos (sus describe dependen de la Preparación)', () => {
    for (const archivo of INTEGRACION) {
      const lista = bloques(archivo);
      expect(new Set(lista.map((b) => b.tiempo)), archivo).toEqual(new Set(['Slow']));
      expect(new Set(lista.map((b) => b.riesgo)).size, archivo).toBe(1);
    }
  });

  it('la suite Core importa exactamente los archivos con algún describe [Core], y a esta guardia', () => {
    expect(importados('core.suite.test.ts')).toEqual([...conEtiqueta((b) => b.riesgo === 'Core'), ESTA_GUARDIA].sort());
  });

  it('la suite Fast importa exactamente los archivos con algún describe [Fast], y a esta guardia', () => {
    expect(importados('fast.suite.test.ts')).toEqual([...conEtiqueta((b) => b.tiempo === 'Fast'), ESTA_GUARDIA].sort());
  });

  it('la suite Slow importa exactamente los archivos con algún describe [Slow]', () => {
    expect(importados('slow.suite.test.ts')).toEqual(conEtiqueta((b) => b.tiempo === 'Slow').sort());
  });

  it('cada componente tiene su suite con todos sus archivos', () => {
    const carpetas = [...new Set(UNITARIAS.map(carpetaDe))].filter((c) => c !== 'suites');
    for (const carpeta of carpetas) {
      const suyos = UNITARIAS.filter((a) => carpetaDe(a) === carpeta).sort();
      expect(importados(`componentes/${carpeta}.suite.test.ts`), carpeta).toEqual(suyos);
    }
  });

  it('anti-degradación: toda prueba que nombra una regla crítica sigue en [Core]', () => {
    const todos = [...UNITARIAS, ...INTEGRACION].flatMap(bloques);
    for (const regla of REGLAS_CRITICAS) {
      const conLaRegla = todos.filter((b) => b.titulo.includes(regla));
      expect(conLaRegla.length, `Ningún describe nombra ${regla}`).toBeGreaterThan(0);
      for (const b of conLaRegla) expect(b.riesgo, `${regla} en ${b.archivo}: ${b.titulo}`).toBe('Core');
    }
  });
});
```

## 5.3 Suites organizadoras

**Suite 1, por riesgo crítico:** `apps/api/test/suites/core.suite.test.ts`

```ts
// Suite por RIESGO: los archivos con algún describe [Core] (seguridad y privacidad de los niños, calificación y
// contenido que les llega). Se corre con -t para dejar afuera los [Menor] de esos archivos:
//   npm run test:core        (toda la suite Core)
//   npm run test:core:fast   (Core y Fast: la puerta rápida de CI)
// La guardia etiquetas.spec.ts falla si esta lista queda desactualizada o si una regla crítica deja de ser Core.
import '../unit/administracion/administracion.spec';
import '../unit/asistente/aplicacion/asistente-casos-de-uso.spec';
import '../unit/asistente/dominio/conjunto-adversarial.spec';
import '../unit/asistente/dominio/dominio-asistente.spec';
import '../unit/contenido/aplicacion/contenido-casos-de-uso.spec';
import '../unit/contenido/dominio/dominio-contenido.spec';
import '../unit/contenido/infraestructura/almacen-y-firma.spec';
import '../unit/diagnostico/aplicacion/diagnostico-casos-de-uso.spec';
import '../unit/diagnostico/dominio/dominio-diagnostico.spec';
import '../unit/escuela/aplicacion/aulas-y-matriculas.spec';
import '../unit/escuela/aplicacion/instituciones.spec';
import '../unit/escuela/aplicacion/invitaciones.spec';
import '../unit/escuela/dominio/dominio-escuela.spec';
import '../unit/escuela/infraestructura/tarjetas-y-auditoria.spec';
import '../unit/iam/aplicacion/administrar-docentes.spec';
import '../unit/iam/aplicacion/autenticacion.spec';
import '../unit/iam/aplicacion/cuentas-y-perfiles.spec';
import '../unit/iam/aplicacion/vinculos-familiares.spec';
import '../unit/iam/dominio/entidades.spec';
import '../unit/iam/dominio/value-objects.spec';
import '../unit/iam/infraestructura/exportacion-y-logs.spec';
import '../unit/iam/infraestructura/seguridad.spec';
import '../unit/iam/interface/guards.spec';
import '../unit/iam/interface/limite-tasa.spec';
import '../unit/lectura/aplicacion/lectura-casos-de-uso.spec';
import '../unit/lectura/dominio/correccion-caja-blanca.spec';
import '../unit/lectura/dominio/dominio-lectura.spec';
import '../unit/progreso/aplicacion/progreso-casos-de-uso.spec';
import '../unit/progreso/dominio/dominio-progreso.spec';
import '../unit/reporting/aplicacion/familia-casos-de-uso.spec';
import '../unit/reporting/aplicacion/reporting-casos-de-uso.spec';
import '../unit/reporting/dominio/dominio-familia.spec';
import '../unit/reporting/dominio/dominio-reporting.spec';
import '../unit/suites/etiquetas.spec';
```

**Suite 2, por componente:** `apps/api/test/suites/componentes/lectura.suite.test.ts`. Hay una por cada uno de los 11 componentes.

```ts
// Suite por COMPONENTE: todo el Nivel 1 de Lectura, aislado del resto.
//   npm run test:suite -- componentes/lectura
import '../../unit/lectura/aplicacion/lectura-casos-de-uso.spec';
import '../../unit/lectura/dominio/correccion-caja-blanca.spec';
import '../../unit/lectura/dominio/dominio-lectura.spec';
```

**Suite 3, por tiempo:** `apps/api/test/suites/slow.suite.test.ts`. La suite `fast.suite.test.ts` tiene la misma forma, con los archivos que tienen algún `describe` Fast.

```ts
// Suite por TIEMPO: los archivos con algún describe [Slow] del Nivel 1 (criptografía real, PDF y conjuntos grandes).
//   npm run test:slow
// Las pruebas de integración son [Slow] por definición (PostgreSQL real): npm run test:int
import '../unit/asistente/dominio/conjunto-adversarial.spec';
import '../unit/contenido/dominio/dominio-contenido.spec';
import '../unit/escuela/infraestructura/tarjetas-y-auditoria.spec';
import '../unit/iam/infraestructura/exportacion-y-logs.spec';
import '../unit/iam/infraestructura/seguridad.spec';
```

**En CI**, `.github/workflows/calidad.yml`:

```yaml
puerta-core:
  name: 'Puerta rápida: suite Core y Fast'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '${{ env.NODE_VERSION }}', cache: npm }
    - run: npm ci
    - run: npx prisma generate --schema apps/api/prisma/schema.prisma
    - run: npm run test:core:fast

unitarias:
  needs: [estatico, puerta-core]
```

---

# 6. Laboratorio ABP, paso 3: cómo ejecutar las pruebas

## 6.1 Instalación

No hay que instalar nada nuevo: Vitest ya estaba en el proyecto. La web solo lo declara, con la misma versión. Con el repositorio recién clonado:

```bash
npm ci
```

```bash
npx prisma generate --schema apps/api/prisma/schema.prisma
```

## 6.2 Ejecución selectiva

Todos se escriben en PowerShell o en la terminal, desde la carpeta raíz del proyecto.

Solo la suite Core (riesgo alto):

```bash
npm run test:core
```

Solo Core y Fast (la puerta rápida):

```bash
npm run test:core:fast
```

Solo un componente, cambiando `lectura` por `iam`, `escuela`, etc.:

```bash
npm run test:suite -- componentes/lectura
```

Solo las rápidas, sin las lentas:

```bash
npm run test:fast
```

Solo las lentas del Nivel 1:

```bash
npm run test:slow
```

Solo las de la web:

```bash
npm run test:web
```

Integración crítica (necesita PostgreSQL en marcha):

```bash
npm run test:int:core
```

Sistema, primero lo crítico y luego el resto (necesita PostgreSQL; Playwright reutiliza la API y la web si ya están en marcha, o las arranca):

```bash
npm run test:e2e:core
```

```bash
npm run test:e2e:resto
```

## 6.3 Registros y tiempos reales

Mediana de 3 ejecuciones en la laptop de desarrollo (Windows 11), con los archivos ya en caché. La primera ejecución en frío del Nivel 1 tardó 81 s. El Nivel 2 y el Nivel 3 se midieron una sola vez porque tardan minutos.

| Suite | Comando | Pasan | Omitidas | Tiempo | Frente al nivel completo |
| :--- | :--- | ---: | ---: | ---: | ---: |
| Nivel 1 completo | `npx vitest run` | 673 | 0 | 29,0 s | base |
| Nivel 1 solo con `-t` | `npx vitest run -t "\[Core\]"` | 484 | 189 | 32,2 s | +11 % |
| **Core** | `npm run test:core` | 484 | 102 | 15,7 s | −46 % |
| **Core y Fast** | `npm run test:core:fast` | 406 | 180 | 13,3 s | −54 % |
| **Fast** | `npm run test:fast` | 584 | 18 | 20,0 s | −31 % |
| **Slow** | `npm run test:slow` | 89 | 59 | 9,5 s | −67 % |
| **Componente Lectura** | `npm run test:suite -- componentes/lectura` | 42 | 0 | 7,2 s | −75 % |
| **Componente IAM** | `npm run test:suite -- componentes/iam` | 162 | 0 | 8,8 s | −70 % |
| Web | `npm run test:web` | 14 | 0 | 5,3 s | nueva |
| Nivel 2 completo | `npm run test:int` | 207 | 0 | 199,9 s | base |
| **Nivel 2 Core** | `npm run test:int:core` | 165 | 42 | 129,8 s | −35 % |
| Nivel 3 Core, escritorio | `playwright test --project=escritorio --grep "\[Core\]"` | 35 | 0 | 4,9 min | 53 % del nivel |
| Nivel 3 resto, escritorio | `playwright test --project=escritorio --grep-invert "\[Core\]"` | 28 | 0 | 4,3 min | 47 % del nivel |

Una de las tres ejecuciones de la suite Fast tardó 60,9 s, frente a 18,7 y 20,0 de las otras. Se trata como ruido de la laptop, y por eso se usa la mediana. Los conteos de Core, Core y Fast y Fast incluyen los 7 casos de la guardia.

Registro real de la suite Core y Fast. **Esta es la captura que puedes guardar para tu entregable:**

```text
> vitest run -c vitest.suites.config.ts test/suites/core -t "\[Core\]\[Fast\]"

 ✓ test/suites/core.suite.test.ts (586 tests | 180 skipped) 1187ms

 Test Files  1 passed (1)
      Tests  406 passed | 180 skipped (586)
   Duration  11.96s (transform 3.04s, setup 0ms, collect 9.63s, tests 1.19s, environment 1ms, prepare 361ms)
```

Registro real del Nivel 1 completo, para comparar. Aquí se ve la causa: `collect 113.39s` frente a `tests 6.48s`.

```text
      Tests  673 passed (673)
   Duration  27.44s (transform 7.30s, setup 0ms, collect 113.39s, tests 6.48s, environment 44ms, prepare 20.49s)
```

`collect` suma lo que tarda cada proceso, y por eso puede ser mayor que `Duration`, que es el tiempo real de espera. La tabla usa el tiempo total del comando, que incluye el arranque de `npm`, y por eso es algo mayor que `Duration`.

## 6.4 Tiempos reales en GitHub Actions

Ejecución 42042625851 del pull request #17, en la que los 5 trabajos pasaron:

| Trabajo o paso | Antes (41557778002) | Después (42042625851) |
| :--- | ---: | ---: |
| Puerta rápida: suite Core y Fast (trabajo nuevo) | no existía | 1,1 min |
| Lint, arquitectura y tipos | 1,0 min | 1,6 min |
| Nivel 1: unitarias y cobertura | 1,4 min | 0,9 min |
| Nivel 2: integración | 2,6 min | 1,6 min |
| Niveles 3 y 4: sistema, aceptación y carga | 14,6 min | 16,9 min |
| · dentro de ese trabajo: E2E | 6,4 min | 8,2 min (Core 4,4 y resto 3,8) |
| **De principio a fin** | **cerca de 19,6 min** | **21,2 min** |

- **La puerta rápida avisa en 1,1 minutos.** Sin ella, una prueba unitaria rota se conocía al terminar lo estático y el Nivel 1: 2,4 minutos en la ejecución de antes y 2,5 con los tiempos de esta.
- **El E2E crítico termina en 4,4 de sus 8,2 minutos.** Si falla, el resto del E2E, la aceptación y la carga no se ejecutan.
- **El recorrido completo no bajó, sino que subió 1,6 minutos.** Una sola comparación no separa el efecto del cambio de la variación normal de GitHub; aun así, dividir el E2E en dos pasos no ahorra tiempo cuando todo pasa.

---

# 7. Punto de control obligatorio: auditoría IA (self-healing testing)

**Qué fue real y qué fue simulado.** No se usó ninguna herramienta comercial de self-healing. Se simuló a mano lo que haría un agente así. El error, las ejecuciones y los resultados son reales, sobre el código del proyecto, y al terminar los archivos quedaron idénticos al original (comprobado con SHA-256).

## 7.1 El fallo real y las trampas

**El error de negocio.** Un cambio hace que pedir la primera pista ya no baje el puntaje, en `apps/api/src/modules/lectura/domain/services/politica-pistas.ts`:

```diff
- export const PUNTAJE_POR_PISTAS = [1, 0.75, 0.5, 0.25] as const;
+ export const PUNTAJE_POR_PISTAS = [1, 1, 0.5, 0.25] as const;
```

Un niño que necesitó ayuda queda con la misma maestría que uno que no la necesitó, y la docente deja de ver quién requiere apoyo.

**La suite Core y Fast lo detecta en 11,5 s:**

```text
FAIL  test/suites/core.suite.test.ts > [Lectura][Core][Fast] Puntaje del ítem (RN-07) y rúbrica (RF-051) > 1 · 0,75 · 0,5 · 0,25 según las pistas; 0 con la explicación
AssertionError: expected [ 1, 1, 0.5, 0.25 ] to deeply equal [ 1, 0.75, 0.5, 0.25 ]

FAIL  test/suites/core.suite.test.ts > [Lectura][Core][Fast] SesionLectura > acertar tras una pista vale 0,75
AssertionError: expected 1 to be 0.75 // Object.is equality

Tests  3 failed | 403 passed | 180 skipped (586)
```

**Trampa A: el agente reescribe las aserciones.** Ve que el valor recibido es 1 y lo copia como esperado:

```diff
  it('acertar tras una pista vale 0,75', () => {
-   expect(s.respuestaDe('it-sel')?.puntajeItem).toBe(0.75);
+   expect(s.respuestaDe('it-sel')?.puntajeItem).toBe(1);
  });
```

```text
--- suite Core y Fast con las aserciones "curadas": VERDE, 10,4 s, con el error todavía en el código
Tests  406 passed | 180 skipped (586)
```

La suite queda en verde y oculta el error. El título todavía dice "vale 0,75" mientras la aserción dice 1: esa contradicción es la pista para detectarlo en una revisión. Lo atrapó el nivel siguiente, porque el agente no había tocado esa prueba:

```text
FAIL  test/integration/lectura/lectura-http.int-spec.ts > [Lectura][Core][Slow] La lectura de Mateo de punta a punta
AssertionError: expected 1 to be 0.75 // Object.is equality
Tests  1 failed | 15 passed (16)
```

**Trampa B: una agrupación inviable.** El agente no toca las aserciones, sino que baja las pruebas a Menor para que la puerta quede en verde:

```diff
- describe('[Lectura][Core][Fast] Puntaje del ítem (RN-07) y rúbrica (RF-051)', () => {
+ describe('[Lectura][Menor][Fast] Puntaje del ítem (RN-07) y rúbrica (RF-051)', () => {
```

Esta trampa no pasa, porque la guardia la detiene en la misma puerta rápida:

```text
FAIL  test/suites/core.suite.test.ts > [Suites][Core][Fast] Etiquetas y barriles de las suites priorizadas > anti-degradación: toda prueba que nombra una regla crítica sigue en [Core]
AssertionError: RN-07 en unit/lectura/dominio/dominio-lectura.spec.ts: [Lectura][Menor][Fast] Puntaje del ítem (RN-07) y rúbrica (RF-051): expected 'Menor' to be 'Core'
Tests  2 failed | 371 passed | 213 skipped (586)
```

**Límite honesto.** La guardia detiene la trampa B, pero no la A: ninguna prueba automática puede saber si un valor esperado cambió con buena razón. Para eso sigue haciendo falta la revisión de una persona.

## 7.2 Validación manual (Beck, 2022) y defensa técnica

**La corrección manual.** Se corrige el código y no la prueba: la regla vuelve a `[1, 0.75, 0.5, 0.25]` y las pruebas quedan como estaban.

```text
--- corrección manual: VERDE, 13,4 s
Tests  406 passed | 180 skipped (586)
```

**Argumentos para defender el rechazo de la sugerencia:**

1. **La fuente de verdad es el requisito, no el código.** RN-07 dice "con P1 0,75". La prueba estaba bien y el código estaba mal. Si la prueba cambia para parecerse al código, ya no verifica nada.
2. **La propia prueba delata el cambio.** El título "acertar tras una pista vale 0,75" contradice la aserción `toBe(1)`. Un agente que mira solo el verde y el rojo no lee esa intención.
3. **El verde no era el objetivo.** La trampa A deja 406 pruebas en verde con un niño mal calificado. Una prueba sirve porque puede fallar cuando el negocio se rompe.
4. **El daño no se ve en pantalla.** Nada se cae. La maestría queda inflada en silencio y la docente toma decisiones con un dato falso, en una plataforma que atiende a menores.
5. **Bajar el riesgo de una prueba no cambia el riesgo del negocio.** RN-07 sigue siendo crítica aunque su etiqueta diga Menor.
6. **Regla para aceptar sugerencias de IA:** se puede aceptar la reparación de un selector o una espera en E2E. Un valor esperado de una regla de negocio solo cambia si cambió el requisito, y eso debe poder señalarse en el SRS y lo aprueba una persona.

**La cita:** "Beck, 2022" está tomada tal cual de la guía del curso. Confirma la referencia completa en tu material antes de entregar.

---

# 8. Resumen de entregables (C7.I2) y reflexión A.I.R.E.

## 8.1 Los 3 entregables de la sesión

| Entregable | Dónde está | Estado |
| :--- | :--- | :--- |
| Código de las suites | `apps/api/test/suites/` (14 archivos), `apps/api/vitest.suites.config.ts`, `apps/api/test/unit/suites/etiquetas.spec.ts`, `apps/web/test/lectura/` | Hecho y probado |
| Registros de ejecución selectiva | Secciones 6.3 (local) y 6.4 (GitHub Actions) de este documento | Hecho y medido |
| Auditoría IA | Sección 7 de este documento | Hecha con un experimento real; el agente de self-healing fue simulado |

## 8.2 Reflexión A.I.R.E.

**A (Aprendizaje).** Etiquetar no basta. En Vitest, `-t` selecciona pruebas, pero igual carga todos los archivos, y la medición lo mostró: 32,2 s con filtro frente a 29,0 s sin él. Lo que ahorra tiempo es cargar menos archivos con los barriles (13,3 s). También vimos que una lista hecha a mano se desordena sola, y por eso agregamos una prueba que vigila las suites. En integración, las pruebas dependen de su preparación, así que el riesgo se etiqueta por archivo.

**I (Interacción).** La IA propuso y construyó las suites, y su trabajo se auditó con un experimento: se metió un error real en la regla RN-07 y se simuló a un agente de self-healing. Reescribir las aserciones dejó la suite en verde con el error presente, y bajar las pruebas a Menor lo detuvo la guardia. La conclusión es que una aserción de negocio no se acepta porque una IA la "reparó": se contrasta con el requisito.

**R (Retorno).** En el Nivel 1, Core y Fast tarda 13,3 s frente a 29,0 s (−54 %). En el Nivel 2, Core tarda 129,8 s frente a 199,9 s (−35 %). En el Nivel 3, escritorio, lo crítico tarda 4,9 de 9,3 minutos. En CI, el recorrido completo en verde no bajó: pasó de cerca de 19,6 a 21,2 minutos, porque se corre lo mismo. Lo que mejora es cuándo llega el aviso: una regla crítica rota del Nivel 1 se detecta en 1,1 minutos en vez de 2,4, y el E2E crítico termina en 4,4 de sus 8,2 minutos.

**E (Entorno).** Cada prueba declara ahora qué protege y cuánto cuesta. Quien agrega un archivo sin etiquetar o lo deja fuera de su suite recibe un error inmediato, y las reglas críticas no se pueden degradar en silencio. La web ganó sus primeras pruebas de Nivel 1. Falta cubrir con pruebas de componente la pantalla de lectura, que hoy solo se prueba con navegador.
