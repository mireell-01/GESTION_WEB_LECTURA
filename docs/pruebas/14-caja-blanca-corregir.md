<!-- Generado con node docs/pruebas/construir.mjs desde 14-caja-blanca-corregir.plantilla.md. No editar a mano. -->
# Caja blanca y complejidad ciclomática de `corregir()`: LectoAventura (Semana 11, C7.I2)

Capacidad UC2.C7, indicador C7.I2. Los números salen de ejecuciones reales del 5 de noviembre de 2026 sobre el código del proyecto, rama `semana-11-caja-blanca`.

---

# 1. Análisis de caja blanca y grafo de flujo de la función

## 1.1 Inventario de la función analizada

| Dato | Valor |
| :--- | :--- |
| Función | `corregir(item, entrada, ctx): Correccion` |
| Ruta | `apps/api/src/modules/lectura/domain/services/correccion.ts` |
| Lenguaje y entorno | TypeScript en NestJS 10; Vitest 3.2 con cobertura v8 |
| Propósito en el negocio | Decide si la respuesta de un niño es correcta. Valida la entrada según la modalidad del ítem (selección única o múltiple, ordenamiento, evidencia, escritura, voz) y aplica el filtro de palabras (RF-040 a RF-043, RF-049) |
| Por qué importa | Su resultado alimenta el puntaje (RN-07), la maestría y lo que ven la docente y la familia |

**Cómo se eligió.** Se midieron las 1143 funciones de `apps/api`, `apps/web` y `packages/ui` con la regla `complexity` de ESLint. De ellas, 918 tienen V(G) de 1 a 5, 163 de 6 a 10, 56 de 11 a 20, 5 de 21 a 50 y 1 más de 50. Las cinco más altas:

| Puesto | V(G) | Función | ¿Se eligió? |
| ---: | ---: | :--- | :--- |
| 1 | 54 | `SesionLectura` (componente React) | No: son condicionales de pantalla, sin lógica de negocio propia; la cubren los niveles 3 y 4 |
| 2 | 36 | Función anónima dentro de `construirActividades` | No: valida lo que escribe la editora, y su peor caso es rechazar un formulario |
| **3** | **28** | **`corregir`** | **Sí: es la lógica de negocio con nombre propio más compleja, y si falla, un niño queda mal calificado** |
| 4 | 27 | `EscenaAnimada` (componente React) | No: es un dibujo decorativo |
| 5 | 24 | `filtroAuditoria` | No: arma un filtro de consulta |

**El código analizado** es la versión original del commit `8722b77`. Su forma actual está en la sección 6.2.

```ts
79  export function corregir(item: ItemLectura, entrada: EntradaRespuesta, ctx: { claveOrden: string; oracionesValidas: Set<string> }): Correccion {
80    switch (item.modalidad) {
81      case 'SELECCION': {
82        const n = item.opciones.length;
83        if (item.multiple) {
84          const indices = [...new Set(entrada.indices ?? [])].sort((a, b) => a - b);
85          if (indices.length === 0 || !indices.every((i) => esEntero(i, 0, n - 1))) throw new RespuestaInvalidaError('Elige una o más opciones');
86          const correctos = [...item.indicesCorrectos].sort((a, b) => a - b);
87          const esCorrecta = indices.length === correctos.length && indices.every((v, i) => v === correctos[i]);
88          return { contenido: { indices }, esCorrecta: item.esCerrado ? esCorrecta : null, filtrado: false };
89        }
90        if (!esEntero(entrada.indice, 0, n - 1)) throw new RespuestaInvalidaError('Elige una de las opciones');
91        return { contenido: { indice: entrada.indice }, esCorrecta: item.esCerrado ? item.indicesCorrectos.includes(entrada.indice) : null, filtrado: false };
92      }
93      case 'ORDENAMIENTO': {
94        const n = item.elementos.length;
95        const orden = entrada.orden ?? [];
96        if (orden.length !== n || new Set(orden).size !== n || !orden.every((i) => esEntero(i, 0, n - 1))) {
97          throw new RespuestaInvalidaError('Ordena todos los elementos');
98        }
99        const mostrado = ordenMostrado(n, ctx.claveOrden);
100       return { contenido: { orden }, esCorrecta: orden.every((posicion, k) => mostrado[posicion] === k), filtrado: false };
101     }
102     case 'EVIDENCIA': {
103       const oraciones = [...new Set(entrada.oraciones ?? [])];
104       if (oraciones.length === 0) throw new RespuestaInvalidaError('Toca las oraciones del texto que respaldan tu respuesta');
105       if (oraciones.some((id) => !ctx.oracionesValidas.has(id))) throw new RespuestaInvalidaError('Elige oraciones del texto que estás leyendo');
106       return { contenido: { oraciones }, esCorrecta: evidenciaCorrecta(oraciones, item.clavesEvidencia), filtrado: false };
107     }
108     case 'ESCRITURA':
109     case 'VOZ': {
110       const texto = String(entrada.texto ?? '').trim();
111       if (texto.length === 0) throw new RespuestaInvalidaError(item.modalidad === 'VOZ' ? 'Di o escribe tu respuesta' : 'Escribe tu respuesta');
112       if (texto.length > MAX_CARACTERES_RESPUESTA) throw new RespuestaInvalidaError(`Tu respuesta puede tener hasta ${MAX_CARACTERES_RESPUESTA} letras`);
113       if (item.minPalabras && palabrasDe(texto) < item.minPalabras) {
114         throw new RespuestaInvalidaError(`Escribe un poco más: al menos ${item.minPalabras} ${item.minPalabras === 1 ? 'palabra' : 'palabras'}`);
115       }
116       const filtro = filtrarPalabras(texto);
117       // RF-049: solo llega el texto que el niño confirmó; el audio nunca sale de su dispositivo.
118       return { contenido: { texto: filtro.texto, porVoz: entrada.porVoz === true }, esCorrecta: null, filtrado: filtro.filtrado };
119     }
120   }
121 }
```

## 1.2 Modelo del grafo de control

**Cómo leerlo.** `D` es un predicado, con dos salidas (`s` si se cumple, `n` si no). `B` es un bloque de código en secuencia. `T` es un `throw`, `R` es un `return` y `FIN` es la salida única. Las funciones flecha pasadas a `every`, `some` y `sort` cuentan aparte, porque son funciones propias.

**Los 27 predicados:**

| Id | Línea | Condición | Si se cumple (`s`) | Si no (`n`) |
| :--- | ---: | :--- | :--- | :--- |
| D1 | 81 | `case 'SELECCION'` | B1 | D2 |
| D6 | 83 | `item.multiple` | D7 | D12 |
| D7 | 84 | `entrada.indices` tiene valor (`??`) | B2 | B3 usa `[]` |
| D8 | 85 | `indices.length === 0` | T1 | D9 |
| D9 | 85 | `!indices.every(esEntero…)` (`\|\|`) | T1 | B5 |
| D10 | 87 | `indices.length === correctos.length` (`&&`) | B6 compara cada uno | B7 |
| D11 | 88 | `item.esCerrado` (múltiple) | B8 | B9 da `null` |
| D12 | 90 | `!esEntero(entrada.indice…)` | T2 | D13 |
| D13 | 91 | `item.esCerrado` (única) | B10 | B11 da `null` |
| D2 | 93 | `case 'ORDENAMIENTO'` | B12 | D3 |
| D14 | 95 | `entrada.orden` tiene valor (`??`) | B13 | B14 usa `[]` |
| D15 | 96 | `orden.length !== n` | T3 | D16 |
| D16 | 96 | `new Set(orden).size !== n` (`\|\|`) | T3 | D17 |
| D17 | 96 | `!orden.every(esEntero…)` (`\|\|`) | T3 | R3 |
| D3 | 102 | `case 'EVIDENCIA'` | D18 | D4 |
| D18 | 103 | `entrada.oraciones` tiene valor (`??`) | B16 | B17 usa `[]` |
| D19 | 104 | `oraciones.length === 0` | T4 | D20 |
| D20 | 105 | alguna oración no es válida | T5 | R4 |
| D4 | 108 | `case 'ESCRITURA'` | D21 | D5 |
| D5 | 109 | `case 'VOZ'` | D21 | **FIN, sin `return`** |
| D21 | 110 | `entrada.texto` tiene valor (`??`) | B19 | B20 usa `''` |
| D22 | 111 | `texto.length === 0` | D23 | D24 |
| D23 | 111 | `item.modalidad === 'VOZ'` (ternario) | B22 | B23 |
| D24 | 112 | `texto.length > 500` | T7 | D25 |
| D25 | 113 | `item.minPalabras` tiene valor | D26 | R5 |
| D26 | 113 | `palabrasDe(texto) < item.minPalabras` (`&&`) | D27 | R5 |
| D27 | 114 | `item.minPalabras === 1` (ternario) | B24 | B25 |

**Todas las aristas.** Una línea `A → B` es una salida única y `A s:B n:C` es un predicado.

```text
ENTRADA → D1      D1 s:B1 n:D2      B1 → D6       D6 s:D7 n:D12      D7 s:B2 n:B3      B2 → B4
B3 → B4           B4 → D8           D8 s:T1 n:D9  D9 s:T1 n:B5       T1 → FIN          B5 → D10
D10 s:B6 n:B7     B6 → B7           B7 → D11      D11 s:B8 n:B9      B8 → R1           B9 → R1
R1 → FIN          D12 s:T2 n:D13    T2 → FIN      D13 s:B10 n:B11    B10 → R2          B11 → R2
R2 → FIN          D2 s:B12 n:D3     B12 → D14     D14 s:B13 n:B14    B13 → B15         B14 → B15
B15 → D15         D15 s:T3 n:D16    D16 s:T3 n:D17  D17 s:T3 n:R3    T3 → FIN          R3 → FIN
D3 s:D18 n:D4     D18 s:B16 n:B17   B16 → B18     B17 → B18          B18 → D19         D19 s:T4 n:D20
T4 → FIN          D20 s:T5 n:R4     T5 → FIN      R4 → FIN           D4 s:D21 n:D5     D5 s:D21 n:FIN
D21 s:B19 n:B20   B19 → B21         B20 → B21     B21 → D22          D22 s:D23 n:D24   D23 s:B22 n:B23
B22 → T6          B23 → T6          T6 → FIN      D24 s:T7 n:D25     T7 → FIN          D25 s:D26 n:R5
D26 s:D27 n:R5    D27 s:B24 n:B25   B24 → T8      B25 → T8           T8 → FIN          R5 → FIN
```

**Vista general:**

```text
ENTRADA → D1 ─s→ selección ─ D6 ─s→ múltiple: D7 D8 D9 D10 D11 → T1 | R1 → FIN
          │                    └n→ única:    D12 D13           → T2 | R2 → FIN
          n
          D2 ─s→ ordenamiento: D14 D15 D16 D17                 → T3 | R3 → FIN
          n
          D3 ─s→ evidencia:    D18 D19 D20                     → T4 | T5 | R4 → FIN
          n
          D4 ─s─┐
          n     ├→ abierta:    D21 D22 D23 D24 D25 D26 D27     → T6 | T7 | T8 | R5 → FIN
          D5 ─s─┘
          n → FIN sin return (modalidad desconocida)
```

---

# 2. Cálculo de la complejidad ciclomática (fórmula de McCabe)

| Fórmula | Datos | Resultado |
| :--- | :--- | ---: |
| `V(G) = E − N + 2C` | 93 aristas, 67 nodos, 1 componente: 93 − 67 + 2 | **28** |
| `V(G) = P + 1` | 27 predicados + 1 | **28** |
| ESLint, regla `complexity` | Medición automática de la función | **28** |
| Rango de los vectores de aristas de los 28 casos | Eliminación gaussiana sobre sus 93 aristas | **28** |

**El conteo de los 27 predicados:**

| Tipo | Líneas | Cantidad |
| :--- | :--- | ---: |
| `case` | 81, 93, 102, 108, 109 | 5 |
| `if` | 83, 85, 90, 96, 104, 105, 111, 112, 113 | 9 |
| Ternarios | 88, 91, 111, 114 | 4 |
| `&&` y `\|\|` | 85, 87, 96 (dos), 113 | 5 |
| `??` | 84, 95, 103, 110 | 4 |
| **Total** | | **27** |

**Hay exactamente 28 caminos linealmente independientes.** Esa es la cantidad mínima de casos en una base de caminos, y los casos CB-01 a CB-28 de la sección 3 la forman: recorren las 93 aristas y sus vectores tienen rango 28, así que ninguno se puede obtener combinando los demás.

**Por qué se cuentan `&&`, `||` y `??`.** Contando solo `if`, `case` y ternarios saldría 19 y quedarían sin exigir 9 caminos reales. Por ejemplo, `new Set(orden).size !== n` sería parte de un solo `if`, y nadie estaría obligado a probar un orden con elementos repetidos.

**Lectura del valor.** El umbral habitual de McCabe es 10, y 28 es casi el triple.

---

# 3. Diseño de la matriz de casos de prueba (caja blanca)

**Base de caminos.** La columna "Camino" indica el predicado que cada caso invierte o la salida que recorre.

| ID | Camino / rama evaluada | Valores de entrada | Condición evaluada | Resultado esperado |
| :--- | :--- | :--- | :--- | :--- |
| CB-01 | D1s D6n D12n D13s | Única, clave `[1]`; `{ indice: 1 }` | Índice válido, ítem cerrado | `esCorrecta: true`, `contenido: { indice: 1 }` |
| CB-02 | D13n | Igual con `esCerrado: false` | Ítem abierto | `esCorrecta: null` |
| CB-03 | D12s | `{ indice: 9 }` | Índice fuera de las opciones | Error "Elige una de las opciones" |
| CB-04 | D6s D7s D8n D9n D10s D11s | Múltiple, clave `[0,2]`; `{ indices: [2,0] }` | Mismas opciones, otro orden | `esCorrecta: true`, guarda `[0,2]` |
| CB-05 | D7n D8s | `{}` | Sin el campo | Error "Elige una o más opciones" |
| CB-06 | D7s D8s | `{ indices: [] }` | Lista vacía | Error "Elige una o más opciones" |
| CB-07 | D9s | `{ indices: [0,9] }` | Un índice inválido | Error "Elige una o más opciones" |
| CB-08 | D10n | `{ indices: [0] }` | Menos que las correctas | `esCorrecta: false` |
| CB-09 | D11n | `{ indices: [0,2] }`, `esCerrado: false` | Ítem abierto | `esCorrecta: null` |
| CB-10 | D1n D2s D14s D15n D16n D17n | Las posiciones correctas | Orden válido | `esCorrecta: true` |
| CB-11 | D14n D15s | `{}` | Sin el campo | Error "Ordena todos los elementos" |
| CB-12 | D14s D15s | `{ orden: [0,1] }`, 3 elementos | Faltan elementos | Error "Ordena todos los elementos" |
| CB-13 | D16s | `{ orden: [0,0,1] }` | Elemento repetido | Error "Ordena todos los elementos" |
| CB-14 | D17s | `{ orden: [0,1,7] }` | Posición inválida | Error "Ordena todos los elementos" |
| CB-15 | D2n D3s D18s D19n D20n | `{ oraciones: ['o1'] }` | Oración de la clave | `esCorrecta: true` |
| CB-16 | D18n D19s | `{}` | Sin el campo | Error "Toca las oraciones…" |
| CB-17 | D18s D19s | `{ oraciones: [] }` | Lista vacía | Error "Toca las oraciones…" |
| CB-18 | D20s | `{ oraciones: ['o1','o99'] }` | Oración ajena al texto | Error "Elige oraciones del texto…" |
| CB-19 | D3n D4s D21s D22n D24n D25n | `{ texto: '  Porque tenía una espina ' }` | Sin mínimo de palabras | `esCorrecta: null`, texto sin espacios, `porVoz: false` |
| CB-20 | D21n D22s D23n | `{}` | Sin el campo | Error "Escribe tu respuesta" |
| CB-21 | D21s D22s D23n | `{ texto: '   ' }` | Solo espacios | Error "Escribe tu respuesta" |
| CB-22 | D24s | 501 letras | Sobre el tope | Error "hasta 500 letras" |
| CB-23 | D25s D26n | `minPalabras: 3`, 3 palabras | Exactamente el mínimo | Se acepta |
| CB-24 | D26s D27n | `minPalabras: 3`, 2 palabras | Bajo el mínimo | Error "al menos 3 palabras" |
| CB-25 | D27s | `minPalabras: 1`, `'¡¡!!'` | Texto sin palabras | Error "al menos 1 palabra" |
| CB-26 | D4n D5s | Voz, `{ texto, porVoz: true }` | Texto dictado | `porVoz: true` |
| CB-27 | D23s | Voz, `{ texto: ' ' }` | Vacío en voz | Error "Di o escribe tu respuesta" |
| CB-28 | D5n | `modalidad: 'DIBUJO'` | Modalidad desconocida | Error del sistema, no de la respuesta |

**Límites numéricos e invariantes.** No agregan caminos. Se agregaron porque cubrir una rama no comprueba sus límites.

| ID | Qué fija | Valores de entrada | Resultado esperado |
| :--- | :--- | :--- | :--- |
| LIM-01 | Índices de 0 a n−1, enteros | 0 y 3 válidos; −1, 4, 1.5, NaN y `'1'` no | Acepta los dos primeros y rechaza el resto |
| LIM-02 | Repetir una opción no cambia el resultado | `[0,0,2]` | `esCorrecta: true`, guarda `[0,2]` |
| LIM-03 | Misma cantidad con una mal, o de más | `[0,1]` y `[0,1,2]` | `esCorrecta: false` |
| LIM-04 | Orden al revés y posición no entera | El orden invertido; `[0,1,1.5]` | `false`; error |
| LIM-05 | Como mucho 1 oración ajena, sin contar repetidas | `o1,o3` · `o1,o3,o4` · `o3` · `o1,o3,o3` | `true` · `false` · `false` · `true` |
| LIM-06 | El tope de 500 cuenta sin los espacios de los extremos | 500 letras; 500 con espacios | Se aceptan |
| LIM-07 | `porVoz` solo con el booleano `true` | `'true'`, `false` | `porVoz: false` |
| LIM-08 | Un texto que no es string no rompe la corrección | `123` | Guarda `'123'` |
| LIM-09 | `minPalabras: 0` equivale a no tener mínimo | `'sí'` | Se acepta |
| LIM-10 | El filtro de palabras se aplica | `'eres un idiota pancho'` | `filtrado: true`, sin la palabra |
| LIM-11 | `ordenMostrado` con una clave de hash 0 | `'qzs0UD'` | Permutación válida, no ordenada |

---

# 4. Código completo de las pruebas

`apps/api/test/unit/lectura/dominio/correccion-caja-blanca.spec.ts`

```ts
import { describe, expect, it } from 'vitest';

import { RespuestaInvalidaError } from '../../../../src/modules/lectura/domain/errors/errores-lectura';
import { corregir, EntradaRespuesta, ordenMostrado } from '../../../../src/modules/lectura/domain/services/correccion';
import { ItemLectura } from '../../../../src/modules/lectura/domain/value-objects/contenido-lectura';

/**
 * Nivel 1 — Caja blanca de corregir(), la función que decide si el niño acertó (RF-040 a RF-043).
 * Los casos CB-01 a CB-28 son una base de caminos linealmente independientes: V(G) = 27 predicados + 1 = 28,
 * calculado cuando era una sola función. Al dividirla por modalidad, los mismos 28 caminos siguen existiendo.
 * Los LIM-xx no agregan caminos: fijan los límites numéricos que una simplificación suele romper.
 * El análisis está en docs/pruebas/14-caja-blanca-corregir.md.
 */
const BASE: ItemLectura = {
  id: 'it-1',
  orden: 1,
  habilidad: 'INF',
  nivelDificultad: 2,
  modalidad: 'SELECCION',
  esCerrado: true,
  enunciado: '¿Qué pasó con Pancho?',
  opciones: [],
  indicesCorrectos: [],
  multiple: false,
  elementos: [],
  minPalabras: null,
  explicacionModelada: 'El texto lo dice en el segundo párrafo.',
  pistas: [],
  clavesEvidencia: [],
};
const item = (cambios: Partial<ItemLectura>): ItemLectura => ({ ...BASE, ...cambios });

const OPCIONES = ['Estaba feliz', 'Le dolía algo', 'Tenía sueño', 'Quería jugar'];
const UNICA = item({ opciones: OPCIONES, indicesCorrectos: [1] });
const MULTIPLE = item({ opciones: OPCIONES, indicesCorrectos: [0, 2], multiple: true });
const ORDENAR = item({ modalidad: 'ORDENAMIENTO', elementos: ['Primero', 'Después', 'Al final'] });
const EVIDENCIA = item({ modalidad: 'EVIDENCIA', clavesEvidencia: ['o1', 'o2'] });
const ESCRITURA = item({ modalidad: 'ESCRITURA', esCerrado: false });
const VOZ = item({ modalidad: 'VOZ', esCerrado: false });

const CTX = { claveOrden: 'ses-1:it-ord', oracionesValidas: new Set(['o1', 'o2', 'o3', 'o4']) };
const corrige = (i: ItemLectura, entrada: EntradaRespuesta) => corregir(i, entrada, CTX);

function rechaza(i: ItemLectura, entrada: EntradaRespuesta, mensaje: string | RegExp) {
  expect(() => corrige(i, entrada)).toThrow(RespuestaInvalidaError);
  expect(() => corrige(i, entrada)).toThrow(mensaje);
}

/** Lo que responde un niño que acierta: las posiciones de cada elemento en la lista mezclada que vio. */
const ORDEN_BIEN = [0, 1, 2].map((k) => ordenMostrado(3, CTX.claveOrden).indexOf(k));

describe('[Lectura][Core][Fast] corregir: caja blanca de los 28 caminos (RF-040 a RF-043)', () => {
  describe('selección única', () => {
    it('CB-01: acierta', () => {
      expect(corrige(UNICA, { indice: 1 })).toEqual({ contenido: { indice: 1 }, esCorrecta: true, filtrado: false });
    });

    it('CB-02: un ítem abierto no se corrige', () => {
      expect(corrige({ ...UNICA, esCerrado: false }, { indice: 1 }).esCorrecta).toBeNull();
    });

    it('CB-03: índice fuera de las opciones', () => {
      rechaza(UNICA, { indice: 9 }, 'Elige una de las opciones');
    });
  });

  describe('selección múltiple', () => {
    it('CB-04: acierta, en cualquier orden, y se guarda ordenada', () => {
      expect(corrige(MULTIPLE, { indices: [2, 0] })).toEqual({ contenido: { indices: [0, 2] }, esCorrecta: true, filtrado: false });
    });

    it('CB-05: sin el campo indices', () => {
      rechaza(MULTIPLE, {}, 'Elige una o más opciones');
    });

    it('CB-06: lista vacía', () => {
      rechaza(MULTIPLE, { indices: [] }, 'Elige una o más opciones');
    });

    it('CB-07: un índice fuera de las opciones', () => {
      rechaza(MULTIPLE, { indices: [0, 9] }, 'Elige una o más opciones');
    });

    it('CB-08: marca solo una parte de las correctas: no es acierto', () => {
      expect(corrige(MULTIPLE, { indices: [0] }).esCorrecta).toBe(false);
    });

    it('CB-09: un ítem abierto no se corrige', () => {
      expect(corrige({ ...MULTIPLE, esCerrado: false }, { indices: [0, 2] }).esCorrecta).toBeNull();
    });
  });

  describe('ordenamiento', () => {
    it('CB-10: acierta con las posiciones de la lista mezclada', () => {
      expect(corrige(ORDENAR, { orden: ORDEN_BIEN })).toEqual({ contenido: { orden: ORDEN_BIEN }, esCorrecta: true, filtrado: false });
    });

    it('CB-11: sin el campo orden', () => {
      rechaza(ORDENAR, {}, 'Ordena todos los elementos');
    });

    it('CB-12: faltan elementos', () => {
      rechaza(ORDENAR, { orden: [0, 1] }, 'Ordena todos los elementos');
    });

    it('CB-13: un elemento repetido', () => {
      rechaza(ORDENAR, { orden: [0, 0, 1] }, 'Ordena todos los elementos');
    });

    it('CB-14: una posición fuera de la lista', () => {
      rechaza(ORDENAR, { orden: [0, 1, 7] }, 'Ordena todos los elementos');
    });
  });

  describe('evidencia', () => {
    it('CB-15: acierta con una oración de la clave', () => {
      expect(corrige(EVIDENCIA, { oraciones: ['o1'] })).toEqual({ contenido: { oraciones: ['o1'] }, esCorrecta: true, filtrado: false });
    });

    it('CB-16: sin el campo oraciones', () => {
      rechaza(EVIDENCIA, {}, 'Toca las oraciones del texto');
    });

    it('CB-17: lista vacía', () => {
      rechaza(EVIDENCIA, { oraciones: [] }, 'Toca las oraciones del texto');
    });

    it('CB-18: una oración que no es del texto que está leyendo', () => {
      rechaza(EVIDENCIA, { oraciones: ['o1', 'o99'] }, 'Elige oraciones del texto que estás leyendo');
    });
  });

  describe('escritura', () => {
    it('CB-19: la abierta no se corrige: la valora la docente (RF-051)', () => {
      expect(corrige(ESCRITURA, { texto: '  Porque tenía una espina ' })).toEqual({
        contenido: { texto: 'Porque tenía una espina', porVoz: false },
        esCorrecta: null,
        filtrado: false,
      });
    });

    it('CB-20: sin el campo texto', () => {
      rechaza(ESCRITURA, {}, 'Escribe tu respuesta');
    });

    it('CB-21: solo espacios', () => {
      rechaza(ESCRITURA, { texto: '   ' }, 'Escribe tu respuesta');
    });

    it('CB-22: más de 500 caracteres', () => {
      rechaza(ESCRITURA, { texto: 'a'.repeat(501) }, 'hasta 500 letras');
    });

    it('CB-23: exactamente el mínimo de palabras alcanza', () => {
      expect(corrige({ ...ESCRITURA, minPalabras: 3 }, { texto: 'tenía una espina' }).contenido).toMatchObject({ texto: 'tenía una espina' });
    });

    it('CB-24: una palabra menos que el mínimo, en plural', () => {
      rechaza({ ...ESCRITURA, minPalabras: 3 }, { texto: 'una espina' }, /al menos 3 palabras$/);
    });

    it('CB-25: mínimo de 1 con texto sin palabras, en singular', () => {
      // Parece inalcanzable (un texto no vacío ya tendría una palabra), pero los signos no cuentan como palabras.
      rechaza({ ...ESCRITURA, minPalabras: 1 }, { texto: '¡¡!!' }, /al menos 1 palabra$/);
    });
  });

  describe('voz', () => {
    it('CB-26: el texto dictado se marca como tal (RF-049)', () => {
      expect(corrige(VOZ, { texto: 'tenía una espina', porVoz: true })).toEqual({
        contenido: { texto: 'tenía una espina', porVoz: true },
        esCorrecta: null,
        filtrado: false,
      });
    });

    it('CB-27: vacío, con el mensaje de quien dicta', () => {
      rechaza(VOZ, { texto: ' ' }, 'Di o escribe tu respuesta');
    });
  });

  it('CB-28: una modalidad desconocida es un error del sistema, no una respuesta mal escrita del niño', () => {
    const rara = item({ modalidad: 'DIBUJO' as never });
    expect(() => corrige(rara, {})).toThrow('Modalidad desconocida: DIBUJO');
    expect(() => corrige(rara, {})).not.toThrow(RespuestaInvalidaError);
  });
});

describe('[Lectura][Core][Fast] corregir: límites numéricos e invariantes', () => {
  it('LIM-01: los índices válidos van de 0 a n−1, enteros', () => {
    expect(corrige(item({ opciones: OPCIONES, indicesCorrectos: [0] }), { indice: 0 }).esCorrecta).toBe(true);
    expect(corrige(item({ opciones: OPCIONES, indicesCorrectos: [3] }), { indice: 3 }).esCorrecta).toBe(true);
    for (const malo of [-1, 4, 1.5, Number.NaN, '1' as never]) rechaza(UNICA, { indice: malo }, 'Elige una de las opciones');
    for (const malo of [-1, 4, 1.5]) rechaza(MULTIPLE, { indices: [0, malo] }, 'Elige una o más opciones');
  });

  it('LIM-02: múltiple: repetir una opción no cambia el resultado', () => {
    expect(corrige(MULTIPLE, { indices: [0, 0, 2] })).toMatchObject({ contenido: { indices: [0, 2] }, esCorrecta: true });
  });

  it('LIM-03: múltiple: la misma cantidad con una equivocada, o marcar de más, no es acierto', () => {
    expect(corrige(MULTIPLE, { indices: [0, 1] }).esCorrecta).toBe(false);
    expect(corrige(MULTIPLE, { indices: [0, 1, 2] }).esCorrecta).toBe(false);
  });

  it('LIM-04: orden: al revés no es acierto y una posición no entera se rechaza', () => {
    expect(corrige(ORDENAR, { orden: [...ORDEN_BIEN].reverse() }).esCorrecta).toBe(false);
    rechaza(ORDENAR, { orden: [0, 1, 1.5] }, 'Ordena todos los elementos');
  });

  it('LIM-05: evidencia: como mucho 1 oración ajena; repetir una oración no cuenta dos veces (RF-043)', () => {
    expect(corrige(EVIDENCIA, { oraciones: ['o1', 'o3'] }).esCorrecta).toBe(true);
    expect(corrige(EVIDENCIA, { oraciones: ['o1', 'o3', 'o4'] }).esCorrecta).toBe(false);
    expect(corrige(EVIDENCIA, { oraciones: ['o3'] }).esCorrecta).toBe(false);
    expect(corrige(EVIDENCIA, { oraciones: ['o1', 'o3', 'o3'] })).toMatchObject({ contenido: { oraciones: ['o1', 'o3'] }, esCorrecta: true });
  });

  it('LIM-06: el tope de 500 cuenta después de quitar los espacios de los extremos', () => {
    expect(corrige(ESCRITURA, { texto: 'a'.repeat(500) }).esCorrecta).toBeNull();
    expect(corrige(ESCRITURA, { texto: `  ${'a'.repeat(500)}  ` }).esCorrecta).toBeNull();
  });

  it('LIM-07: porVoz solo es verdadero con el booleano true', () => {
    expect(corrige(VOZ, { texto: 'hola', porVoz: 'true' as never }).contenido).toMatchObject({ porVoz: false });
    expect(corrige(VOZ, { texto: 'hola', porVoz: false }).contenido).toMatchObject({ porVoz: false });
  });

  it('LIM-08: un texto que no es string se convierte, no rompe la corrección', () => {
    expect(corrige(ESCRITURA, { texto: 123 as never }).contenido).toMatchObject({ texto: '123' });
  });

  it('LIM-09: sin mínimo de palabras (null o 0) alcanza con una sola', () => {
    expect(corrige({ ...ESCRITURA, minPalabras: 0 }, { texto: 'sí' }).esCorrecta).toBeNull();
  });

  it('LIM-10: el filtro de palabras se aplica y se avisa (RF-041)', () => {
    const r = corrige(ESCRITURA, { texto: 'eres un idiota pancho' });
    expect(r.filtrado).toBe(true);
    expect(JSON.stringify(r.contenido)).not.toContain('idiota');
  });

  it('LIM-11: ordenMostrado también mezcla con la clave cuyo hash FNV-1a es 0', () => {
    const orden = ordenMostrado(5, 'qzs0UD');
    expect([...orden].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(orden).not.toEqual([0, 1, 2, 3, 4]);
  });
});
```

**Cómo ejecutarlas.** Desde `apps/api`:

```bash
npx vitest run test/unit/lectura/dominio/correccion-caja-blanca.spec.ts
```

Para ver la cobertura de ramas de este archivo:

```bash
npx vitest run test/unit/lectura/dominio/correccion-caja-blanca.spec.ts --coverage --coverage.include=src/modules/lectura/domain/services/correccion.ts --coverage.reporter=text --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```

**Reporte de cobertura real:**

| Momento | Pruebas | Sentencias | Ramas | Funciones | Líneas |
| :--- | :--- | ---: | ---: | ---: | ---: |
| Antes, sin los casos nuevos | 42 de Lectura | 100 % | **84,21 %** (48 de 57) | 100 % | 100 % |
| Con los casos nuevos, código original | 39 de caja blanca (falla CB-28, sección 5.1) | 100 % | **100 %** (63 de 63) | 100 % | 100 % |
| Con los casos nuevos, código refactorizado | 39 de caja blanca | 100 % | 100 % | 100 % | 100 % |

El total de ramas sube de 57 a 63 porque v8 cuenta las ramas de los bloques que llegan a ejecutarse.

**El hallazgo principal:** antes ya se recorría el 100 % de las líneas, y aun así el 16 % de las ramas nunca se había probado. En una línea como `esCorrecta: item.esCerrado ? esCorrecta : null`, la cobertura de líneas se cumple sin haber probado nunca el `null`.

---

# 5. Análisis estático y asistencia de IA

**Qué fue real y qué fue simulado.** Las herramientas, las pruebas y las consultas son reales. No se usó ningún bot comercial: el papel de "agente autónomo" lo hizo Claude, que redactó a propósito la propuesta de la sección 5.2 con simplificaciones arriesgadas para auditarlas después.

## 5.1 Hallazgos

**Herramientas automáticas sobre la versión original.** `tsc` con `--noUnusedLocals --noUnusedParameters --noImplicitReturns --allowUnreachableCode false --noFallthroughCasesInSwitch` dio 0 errores en todo el backend. ESLint con `no-unreachable`, `no-fallthrough`, `no-constant-condition`, `no-self-compare`, `no-dupe-else-if`, `no-unused-vars`, `no-unnecessary-condition` y `switch-exhaustiveness-check` dio un solo aviso: la complejidad de 28. Los demás hallazgos aparecieron al leer el código, escribir las pruebas y consultar los datos.

| ID | Hallazgo | Evidencia | Veredicto |
| :--- | :--- | :--- | :--- |
| H-1 | Complejidad de 28, frente a un umbral de 10 | ESLint `complexity` | **Real.** Se corrige en la sección 6.2 |
| H-2 | Con una modalidad desconocida, la función termina sin `return` y devuelve `undefined`, aunque declara devolver `Correccion` | CB-28 falló en el código original: `expected [Function] to throw an error` | **Real, pero protegida:** TypeScript exige cubrir la unión de tipos y la base lo impide con `ck_item_modalidad`. Se corrige con un `default` |
| H-3 | `item.esCerrado ? … : null` en selección parece inútil | `construirActividades` siempre marca como cerrada la selección, y los 3 ítems de selección de la base local tienen `es_cerrado = true` | **Ruta muerta por datos, no por código.** Ninguna restricción de la base lo garantiza, así que se conserva y se prueba con CB-02 y CB-09 |
| H-4 | `semilla(clave) \|\| 1` parece inalcanzable | Solo actúa si el hash vale 0. Se buscó una clave por fuerza bruta y salió `qzs0UD` tras 15 963 177 788 intentos (346 s) | **Alcanzable y redundante:** mulberry32 no necesita una semilla distinta de 0. Es inofensiva y quitarla cambiaría el orden para esa clave, así que se conserva |
| H-5 | El singular "1 palabra" parece inalcanzable, porque un texto no vacío ya tendría una palabra | `palabrasDe` cuenta letras y números: `'¡¡!!'` no está vacío y tiene 0 palabras | **Falso positivo.** CB-25 recorre esa rama |
| H-6 | `new Set(5)` lanzaría `TypeError`, y `String({})` guardaría `[object Object]` | `RespuestaRequestDto` valida `@IsArray`, `@IsInt` y demás, y `ValidationPipe` rechaza lo que no cumple | **Falso positivo** por HTTP: no llega a `corregir` |
| H-7 | ¿Se filtra la clave de respuesta? | `Correccion` solo devuelve `contenido`, `esCorrecta` y `filtrado` | **Sin hallazgo** |

## 5.2 Propuesta de refactorización de la IA

Reduce la complejidad, pero mezcla una mejora real con simplificaciones que cambian el negocio. Mantiene la firma de `corregir`.

```ts
const enRango = (v: unknown, n: number): v is number => (v as number) >= 0 && (v as number) < n;

function seleccion(item: ItemLectura, entrada: EntradaRespuesta): Correccion {
  if (item.multiple) {
    const indices = [...(entrada.indices ?? [])].sort((a, b) => a - b);
    if (!indices.length || !indices.every((i) => enRango(i, item.opciones.length))) throw new RespuestaInvalidaError('Elige una o más opciones');
    return { contenido: { indices }, esCorrecta: indices.every((v) => item.indicesCorrectos.includes(v)), filtrado: false };
  }
  if (!enRango(entrada.indice, item.opciones.length)) throw new RespuestaInvalidaError('Elige una de las opciones');
  return { contenido: { indice: entrada.indice }, esCorrecta: item.indicesCorrectos.includes(entrada.indice), filtrado: false };
}

function ordenamiento(item: ItemLectura, entrada: EntradaRespuesta, clave: string): Correccion {
  const n = item.elementos.length;
  const orden = entrada.orden ?? [];
  if (orden.length !== n || !orden.every((i) => enRango(i, n))) throw new RespuestaInvalidaError('Ordena todos los elementos');
  const mostrado = ordenMostrado(n, clave);
  return { contenido: { orden }, esCorrecta: orden.every((posicion, k) => mostrado[posicion] === k), filtrado: false };
}

function evidencia(item: ItemLectura, entrada: EntradaRespuesta, validas: Set<string>): Correccion {
  const oraciones = entrada.oraciones ?? [];
  if (!oraciones.length) throw new RespuestaInvalidaError('Toca las oraciones del texto que respaldan tu respuesta');
  if (oraciones.some((id) => !validas.has(id))) throw new RespuestaInvalidaError('Elige oraciones del texto que estás leyendo');
  return { contenido: { oraciones }, esCorrecta: evidenciaCorrecta(oraciones, item.clavesEvidencia), filtrado: false };
}

function abierta(item: ItemLectura, entrada: EntradaRespuesta): Correccion {
  const texto = (entrada.texto ?? '').trim();
  if (!texto) throw new RespuestaInvalidaError('Escribe tu respuesta');
  if (texto.length > MAX_CARACTERES_RESPUESTA) throw new RespuestaInvalidaError(`Tu respuesta puede tener hasta ${MAX_CARACTERES_RESPUESTA} letras`);
  if (palabrasDe(texto) < (item.minPalabras ?? 0)) throw new RespuestaInvalidaError(`Escribe un poco más: al menos ${item.minPalabras} palabras`);
  const filtro = filtrarPalabras(texto);
  return { contenido: { texto: filtro.texto, porVoz: Boolean(entrada.porVoz) }, esCorrecta: null, filtrado: filtro.filtrado };
}

export function corregir(item: ItemLectura, entrada: EntradaRespuesta, ctx: { claveOrden: string; oracionesValidas: Set<string> }): Correccion {
  const porModalidad = {
    SELECCION: () => seleccion(item, entrada),
    ORDENAMIENTO: () => ordenamiento(item, entrada, ctx.claveOrden),
    EVIDENCIA: () => evidencia(item, entrada, ctx.oracionesValidas),
    ESCRITURA: () => abierta(item, entrada),
    VOZ: () => abierta(item, entrada),
  };
  return porModalidad[item.modalidad]();
}
```

---

# 6. Punto de control obligatorio: auditoría de refactorizaciones autónomas por IA

## 6.1 Riesgos detectados en la propuesta de la IA

**Propuesta completa, ejecutada de verdad contra las pruebas y comparada con la original:**

| Comprobación | Resultado |
| :--- | :--- |
| Las 42 pruebas de Lectura que ya existían | Fallan solo 2 |
| Las pruebas de caja blanca | Fallan 12 |
| Comparación con el original en 300 000 entradas al azar | Distinta en **64 715 (21,6 %)** |

**Cada cambio por separado.** Se aplicó uno a la vez sobre el código original. M01, M02, M05 a M09 y M12 a M15 forman parte de la propuesta; los demás son errores típicos de límite, sembrados para medir las pruebas.

| ID | Qué se rompe | ¿Lo detectaban las 42 anteriores? | ¿Lo detecta caja blanca? |
| :--- | :--- | :--- | :--- |
| M01 | Marcar solo una parte de las correctas cuenta como acierto | Sí | Sí: CB-08 |
| M02 | Acepta índices no enteros, como 1,5 | **No** | Sí: LIM-01, LIM-04 |
| M03 | Selección única: acepta un índice de más | **No** | Sí: LIM-01 |
| M04 | Selección múltiple: acepta un índice de más | **No** | Sí: LIM-01 |
| M05 | Múltiple: repetir una opción cuenta dos veces | **No** | Sí: LIM-02 |
| M06 | Orden: acepta elementos repetidos | Sí | Sí: CB-13 |
| M07 | Evidencia: repetir una oración cuenta dos veces | **No** | Sí: LIM-05 |
| M08 | Múltiple: corrige también los ítems abiertos | **No** | Sí: CB-09 |
| M09 | Única: corrige también los ítems abiertos | **No** | Sí: CB-02 |
| M10 | Rechaza una respuesta de exactamente 500 caracteres | **No** | Sí: LIM-06 |
| M11 | Rechaza una respuesta con exactamente el mínimo de palabras | **No** | Sí: CB-23 |
| M12 | Quita el singular "1 palabra" creyéndolo inalcanzable | **No** | Sí: CB-25 |
| M13 | Quita el mensaje propio de quien dicta | **No** | Sí: CB-27 |
| M14 | `porVoz` verdadero con cualquier valor | **No** | Sí: LIM-07 |
| M15 | Un texto que no es string rompe la corrección | **No** | Sí: LIM-08 |
| M16 | Evidencia: ya no admite 1 oración ajena | Sí | Sí: LIM-05 |
| | **Detectados** | **3 de 16** | **16 de 16** |

Esta medición es solo del Nivel 1. Los niveles 2 a 4 podrían detectar algunos de estos errores, pero más tarde.

**Respecto de lo que pide revisar la guía:**

- **Casos borde numéricos: sí los alteró.** `enRango` quita `Number.isInteger`, y por eso 1,5 pasaría como índice válido (M02). Reemplazar la comparación exacta por `includes` da como acierto una respuesta parcial (M01), que es la regresión más grave: un niño queda calificado como correcto sin serlo.
- **Falsos positivos: sí los usó como justificación.** Quita el singular porque "nunca corre" (H-5) y el `esCerrado` porque "siempre es verdadero" (H-3).
- **Firma del método: no la cambió,** y por eso compila sin errores. Eso es justamente lo peligroso: TypeScript no avisa de nada de lo anterior.

## 6.2 Validación humana estricta (Beck, 2022)

**La regla aplicada.** Una refactorización no cambia el comportamiento observable. Si un cambio altera el resultado de una sola entrada válida, no es refactorización, sino un cambio de negocio, y necesita su propio requisito.

| Parte de la propuesta | Decisión | Justificación |
| :--- | :--- | :--- |
| Dividir en una función por modalidad | **Aceptada** | Reduce el máximo de V(G) de 28 a 8 sin cambiar ninguna condición |
| Mapa `porModalidad` en lugar de `switch` | **Rechazada** | Con una modalidad desconocida fallaría con un `TypeError` confuso; el `switch` conserva la comprobación de exhaustividad de TypeScript |
| `enRango` sin `Number.isInteger` | **Rechazada** | Regresión numérica (M02) |
| `every` + `includes` en la múltiple | **Rechazada** | Da por acierto una respuesta parcial (M01) |
| Quitar los `new Set` | **Rechazada** | Repetir una opción o una oración cambia la nota (M05, M07) y el orden acepta repetidos (M06) |
| Quitar `item.esCerrado ?` | **Rechazada** | Es una invariante del dominio que ninguna restricción de la base garantiza (H-3) |
| Quitar el singular y el mensaje de voz | **Rechazada** | Son rutas vivas que el niño puede ver (H-5, M13) |
| `Boolean(entrada.porVoz)` y `(entrada.texto ?? '').trim()` | **Rechazada** | Relajan la validación defensiva (M14, M15) |
| **Corrección manual:** agregar `default` con comprobación `never` | **Agregada** | Cierra H-2: lanza un error del sistema en vez de devolver `undefined` |

**La versión final** está en `apps/api/src/modules/lectura/domain/services/correccion.ts`:

```ts
import { RespuestaInvalidaError } from '../errors/errores-lectura';
import { ItemLectura } from '../value-objects/contenido-lectura';
import { filtrarPalabras, palabrasDe } from './filtro-palabras';

/** RF-041: tope de una respuesta escrita (o dictada, RF-049). */
export const MAX_CARACTERES_RESPUESTA = 500;

/** Lo que envía el niño; según la modalidad del ítem se usa un campo u otro. */
export interface EntradaRespuesta {
  indice?: number;
  indices?: number[];
  orden?: number[];
  oraciones?: string[];
  texto?: string;
  porVoz?: boolean;
}

/** Lo que se guarda de la respuesta: en el formato de cada modalidad, ya validado. */
export type ContenidoRespuesta =
  | { indice: number }
  | { indices: number[] }
  | { orden: number[] }
  | { oraciones: string[] }
  | { texto: string; porVoz: boolean };

export interface Correccion {
  contenido: ContenidoRespuesta;
  /** null en las abiertas: las valora la docente (RF-051). */
  esCorrecta: boolean | null;
  /** RF-041: se aplicó el filtro de palabras no apropiadas. */
  filtrado: boolean;
}

/** Semilla reproducible a partir de un texto (FNV-1a de 32 bits). */
function semilla(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * RF-042: el orden en que se le muestran los elementos (posiciones del orden correcto), mezclado de
 * forma estable por sesión e ítem, y nunca ya ordenado. El niño responde con las posiciones de esa
 * lista, así la pantalla no revela el orden correcto.
 */
export function ordenMostrado(n: number, clave: string): number[] {
  const orden = Array.from({ length: n }, (_, i) => i);
  let s = semilla(clave) || 1;
  const azar = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j] as number, orden[i] as number];
  }
  if (n > 1 && orden.every((v, i) => v === i)) orden.push(orden.shift() as number);
  return orden;
}

/** RF-043: correcta si incluye al menos 1 oración de la clave y como mucho 1 ajena a ella. */
export function evidenciaCorrecta(seleccion: string[], clave: string[]): boolean {
  const enClave = seleccion.filter((id) => clave.includes(id)).length;
  return enClave >= 1 && seleccion.length - enClave <= 1;
}

const esEntero = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function corregirSeleccionUnica(item: ItemLectura, entrada: EntradaRespuesta): Correccion {
  if (!esEntero(entrada.indice, 0, item.opciones.length - 1)) throw new RespuestaInvalidaError('Elige una de las opciones');
  return { contenido: { indice: entrada.indice }, esCorrecta: item.esCerrado ? item.indicesCorrectos.includes(entrada.indice) : null, filtrado: false };
}

function corregirSeleccionMultiple(item: ItemLectura, entrada: EntradaRespuesta): Correccion {
  const n = item.opciones.length;
  const indices = [...new Set(entrada.indices ?? [])].sort((a, b) => a - b);
  if (indices.length === 0 || !indices.every((i) => esEntero(i, 0, n - 1))) throw new RespuestaInvalidaError('Elige una o más opciones');
  const correctos = [...item.indicesCorrectos].sort((a, b) => a - b);
  const esCorrecta = indices.length === correctos.length && indices.every((v, i) => v === correctos[i]);
  return { contenido: { indices }, esCorrecta: item.esCerrado ? esCorrecta : null, filtrado: false };
}

function corregirOrdenamiento(item: ItemLectura, entrada: EntradaRespuesta, claveOrden: string): Correccion {
  const n = item.elementos.length;
  const orden = entrada.orden ?? [];
  if (orden.length !== n || new Set(orden).size !== n || !orden.every((i) => esEntero(i, 0, n - 1))) {
    throw new RespuestaInvalidaError('Ordena todos los elementos');
  }
  const mostrado = ordenMostrado(n, claveOrden);
  return { contenido: { orden }, esCorrecta: orden.every((posicion, k) => mostrado[posicion] === k), filtrado: false };
}

function corregirEvidencia(item: ItemLectura, entrada: EntradaRespuesta, oracionesValidas: Set<string>): Correccion {
  const oraciones = [...new Set(entrada.oraciones ?? [])];
  if (oraciones.length === 0) throw new RespuestaInvalidaError('Toca las oraciones del texto que respaldan tu respuesta');
  if (oraciones.some((id) => !oracionesValidas.has(id))) throw new RespuestaInvalidaError('Elige oraciones del texto que estás leyendo');
  return { contenido: { oraciones }, esCorrecta: evidenciaCorrecta(oraciones, item.clavesEvidencia), filtrado: false };
}

function corregirAbierta(item: ItemLectura, entrada: EntradaRespuesta): Correccion {
  const texto = String(entrada.texto ?? '').trim();
  if (texto.length === 0) throw new RespuestaInvalidaError(item.modalidad === 'VOZ' ? 'Di o escribe tu respuesta' : 'Escribe tu respuesta');
  if (texto.length > MAX_CARACTERES_RESPUESTA) throw new RespuestaInvalidaError(`Tu respuesta puede tener hasta ${MAX_CARACTERES_RESPUESTA} letras`);
  if (item.minPalabras && palabrasDe(texto) < item.minPalabras) {
    throw new RespuestaInvalidaError(`Escribe un poco más: al menos ${item.minPalabras} ${item.minPalabras === 1 ? 'palabra' : 'palabras'}`);
  }
  const filtro = filtrarPalabras(texto);
  // RF-049: solo llega el texto que el niño confirmó; el audio nunca sale de su dispositivo.
  return { contenido: { texto: filtro.texto, porVoz: entrada.porVoz === true }, esCorrecta: null, filtrado: filtro.filtrado };
}

/**
 * Valida la respuesta según la modalidad del ítem y la corrige en el servidor (RF-040 a RF-043); en
 * las abiertas aplica el filtro de palabras (RF-041). La clave nunca sale de aquí.
 */
export function corregir(item: ItemLectura, entrada: EntradaRespuesta, ctx: { claveOrden: string; oracionesValidas: Set<string> }): Correccion {
  switch (item.modalidad) {
    case 'SELECCION':
      return item.multiple ? corregirSeleccionMultiple(item, entrada) : corregirSeleccionUnica(item, entrada);
    case 'ORDENAMIENTO':
      return corregirOrdenamiento(item, entrada, ctx.claveOrden);
    case 'EVIDENCIA':
      return corregirEvidencia(item, entrada, ctx.oracionesValidas);
    case 'ESCRITURA':
    case 'VOZ':
      return corregirAbierta(item, entrada);
    default: {
      // TypeScript exige cubrir todas las modalidades y la base las limita (ck_item_modalidad). Si aun así
      // llegara otra, es un error del sistema (500), no una respuesta mal escrita del niño.
      const desconocida: never = item.modalidad;
      throw new Error(`Modalidad desconocida: ${String(desconocida)}`);
    }
  }
}
```

**Complejidad antes y después:**

| Función | V(G) |
| :--- | ---: |
| `corregir` original | **28** |
| `corregir` ahora | 7 |
| `corregirAbierta` | 8 |
| `corregirSeleccionMultiple` | 6 |
| `corregirOrdenamiento` | 5 |
| `corregirEvidencia` | 4 |
| `corregirSeleccionUnica` | 3 |

**Cómo se comprobó que no cambió el negocio:**

| Prueba | Resultado |
| :--- | :--- |
| Comparación entre la versión original y la final, con 300 000 entradas al azar (semilla fija, incluye valores inválidos y todos los resultados posibles) | **0 diferencias** |
| La misma comparación con la propuesta del bot, para confirmar que sí detecta errores | 64 715 diferencias |
| Las 39 pruebas de caja blanca, sin modificar ninguna al refactorizar | 39 de 39, incluida CB-28 |
| Todo el Nivel 1 | 712 de 712 en 40 archivos, con cobertura total de 98,15 % de líneas y 94,3 % de ramas |
| Integración de Lectura con PostgreSQL real | 16 de 16 |
| E2E de Lectura en navegador (escritorio) | 5 de 5 |
| Aceptación de Lectura | 6 de 6 |
| Lint y tipos | Sin errores; las reglas estrictas de la sección 5.1 no dan ningún aviso en la versión final |

El único cambio buscado de comportamiento es el camino CB-28, que no puede ocurrir con los datos actuales. Por eso la comparación al azar no incluye modalidades desconocidas.

**Quién valida.** La IA preparó esta evidencia, pero la decisión es humana: consiste en leer estas tablas, revisar el cambio en el pull request y fusionarlo solo si se está de acuerdo.

**La cita:** "Beck, 2022" está tomada tal cual de la guía del curso. Confirma la referencia completa en tu material antes de entregar.

---

# 7. Resumen de entregables y reflexión A.I.R.E. (Semana 11)

## 7.1 Verificación de evidencias

| Evidencia | Dónde está | Estado |
| :--- | :--- | :--- |
| Cálculo de McCabe | Secciones 1.2 y 2 | V(G) = 28 por cuatro vías que coinciden |
| Matriz de casos de caja blanca | Sección 3 | 28 caminos y 11 límites |
| Código de las pruebas | `apps/api/test/unit/lectura/dominio/correccion-caja-blanca.spec.ts` | Hecho; pertenece a las suites Core, Fast y Lectura |
| Reporte de cobertura de ramas | Sección 4 | De 84,21 % a 100 % |
| Informe de auditoría IA | Secciones 5 y 6 | Hecho con ejecuciones reales; el bot fue simulado |

## 7.2 Reflexión A.I.R.E.

**A (Aprendizaje).** Dibujar el grafo obligó a contar cada `&&`, `||` y `??`. Contando solo `if` y `case` habrían salido 19 caminos y no 28. También quedó claro que 100 % de líneas no es 100 % de ramas: `corregir` tenía todas sus líneas cubiertas y solo el 84,21 % de sus ramas. Y cubrir una rama tampoco basta: los límites de 500 caracteres y de 0 a n−1 necesitaron casos propios.

**I (Interacción).** La propuesta de refactorización de la IA compilaba sin errores y bajaba la complejidad, pero cambiaba el resultado en el 21,6 % de las entradas. De sus simplificaciones se aceptó solo la división por modalidad. Dos de sus justificaciones eran falsos positivos: el singular "1 palabra" sí se alcanza con `'¡¡!!'`. La conclusión es no aceptar una simplificación porque el código sea más corto, sino comprobarla con pruebas y datos.

**R (Retorno).** De 16 errores sembrados, las pruebas anteriores detectaban 3 y las de caja blanca detectan los 16, en segundos y sin base de datos. El análisis también encontró una salida sin `return` que el compilador no señalaba. La complejidad máxima bajó de 28 a 8, así que un cambio futuro en la corrección de una modalidad ya no toca el código de las demás.

**E (Entorno).** Una plataforma de lectura para instituciones educativas y familias depende de que su calificación sea correcta: si una respuesta parcial cuenta como acierto, la docente ve una maestría falsa y el niño deja de recibir el apoyo que necesita. Tener la función que califica verificada camino por camino da una base para confiar en esos datos. Queda pendiente aplicar el mismo análisis a las otras 61 funciones con V(G) mayor que 10.
