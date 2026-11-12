# Caja negra y cobertura al 100 %: maestría y nivel CNEB de LectoAventura (Semana 12, C7.I2)

Sesión 12: criterios de cobertura y pruebas de caja negra con IA. Los números salen de ejecuciones reales del 12 de noviembre de 2026, rama `semana-12-caja-negra`.

**Componente bajo prueba:**

| Archivo | Qué hace |
| :--- | :--- |
| `apps/api/src/modules/progreso/domain/services/maestria.ts` | Calcula la maestría de cada habilidad (RN-07), decide qué habilidades están "a reforzar" (RF-054) y el nivel de lectura (RN-20) |
| `apps/api/src/modules/shared-kernel/domain/value-objects/nivel-cneb.ts` | Escala CNEB C, B, A y AD, y el nivel "declarado" con 5 ítems (RN-08) |

**Por qué este componente:** es el equivalente del `CalificacionService` de la guía, porque convierte respuestas en una nota con tramos. De él depende lo que la docente y la familia ven del niño.

---

## Lista de cotejo (sección 8 de la guía)

| # | Punto | Estado | Dónde está la evidencia |
| :--- | :--- | :--- | :--- |
| 1 | Entorno configurado | ✅ Vitest 3.2 con `@vitest/coverage-v8`, ya instalados; sin dependencias nuevas | Sección 1 |
| 2 | Casos de caja negra documentados | ✅ 34 casos con partición de equivalencia y valores límite, diseñados solo con el SRS | Secciones 2 y 3 |
| 3 | Contraste con IA realizado | ✅ 12 escenarios propuestos: 5 aplican (4 nuevos y 1 que ya estaba) y 7 no | Sección 5 |
| 4 | Cobertura de sentencias al 100 % | ✅ 58 de 58 | Sección 6 |
| 5 | Cobertura de ramas y condiciones al 100 % | ✅ Ramas 27 de 27; condiciones 24 de 24 | Sección 6 |
| 6 | Captura y análisis del reporte | ✅ Reporte HTML, capturas e interpretación | Secciones 6 y 8 |

---

# 1. Entorno y comandos

No hubo que instalar nada: el proyecto ya tenía Vitest y `@vitest/coverage-v8`, que es la fila "React / Node / TS" de la tabla de la guía. Desde la carpeta `apps/api`:

```bash
npx vitest run test/unit/progreso/dominio/maestria-caja-negra.spec.ts
```

Cobertura de sentencias y ramas, con el reporte HTML en `apps/api/reports/caja-negra/final/index.html`:

```bash
npx vitest run test/unit/progreso/dominio/maestria-caja-negra.spec.ts --coverage --coverage.include=src/modules/progreso/domain/services/maestria.ts --coverage.include=src/modules/shared-kernel/domain/value-objects/nivel-cneb.ts --coverage.reporter=text --coverage.reporter=html --coverage.reportsDirectory=reports/caja-negra/final --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```

Cobertura de condiciones, con el medidor propio de la sección 6.3:

```bash
npm run test:condiciones
```

Solo los casos de caja negra:

```bash
npm run test:condiciones -- --filtro "Caja negra"
```

`apps/api/reports/` no se sube al repositorio, así que el reporte HTML se genera en cada equipo. Las capturas de la sección 6 sí están en el repositorio.

---

# 2. Requisitos y partición de equivalencia

**Requisitos usados, tal como los dice el SRS:**

| ID | Texto |
| :--- | :--- |
| RN-07 | Puntaje del ítem: sin pista 1,0 · con P1 0,75 · con P2 0,5 · con P3 0,25 · explicación 0. Maestría = EMA (α = 0,3) del puntaje ponderado por dificultad (factor 0,8 + 0,1 × dificultad) × 100, acotada a 0–100 |
| RN-08 | Un nivel CNEB se declara con ≥ 5 ítems respondidos en la habilidad; con menos se muestra "Aún descubriendo" |
| RF-054 | Habilidad con maestría < 40 y ≥ 5 ítems se marca "a reforzar" |
| §6 `NivelDificultad` | Entero 1–5 |
| §6 `NivelCNEB` | C (0–39) · B (40–64) · A (65–84) · AD (85–100) |

**Clases de equivalencia y valores límite:**

| Entrada | Clases válidas | Clases inválidas | Valores límite probados |
| :--- | :--- | :--- | :--- |
| Dificultad | 1 a 5 | Menor que 1, mayor que 5, no entera | 1 y 5 (y 3 como valor típico) |
| Puntaje del ítem | 1 · 0,75 · 0,5 · 0,25 · 0 | Fuera de 0–1 | 0 y 1 |
| Ponderado | 0 a 100 | Más de 100 (dificultad ≥ 3 sin pista) | 100 (exacto) y 110, 130 (por encima) |
| Maestría | 0 a 100 | Menor que 0, mayor que 100 | 0, 100 y 105,5, que se acota a 100 |
| Ítems contados | 0 (sin historia) · 1 a 4 · 5 o más | Negativos | 0, 4 y 5 |
| Tramos CNEB | C · B · A · AD | | 0, 39 · 40, 64 · 65, 84 · 85, 100 y decimales entre tramos (39,9 · 64,99 · 84,5) |
| "A reforzar" | Maestría < 40 con ≥ 5 ítems · otro caso | | 39,99 y 40 · 4 y 5 ítems |

Las clases inválidas de dificultad y de puntaje no se prueban aquí: otros módulos las impiden antes de llegar (sección 5).

---

# 3. Matriz de casos de caja negra

Se diseñó **antes de leer el código**: solo con el SRS y las firmas de las funciones. "Resultado real" es lo que dio la primera ejecución.

| ID | Partición o límite | Entrada | Esperado según el SRS | Resultado real |
| :--- | :--- | :--- | :--- | :--- |
| CN-01 | Dificultad, límite inferior | `factorDificultad(1)` | 0,9 | ✅ |
| CN-02 | Dificultad, valor típico | `factorDificultad(3)` | 1,1 | ✅ |
| CN-03 | Dificultad, límite superior | `factorDificultad(5)` | 1,3 | ✅ |
| CN-04 | Ponderado mayor que 100 | `puntajeObservado(1, 3)` | 110 | ❌ **100** (hallazgo H-1) |
| CN-05 | Ponderado normal | `puntajeObservado(0.75, 3)` | 82,5 | ✅ |
| CN-06 | Ponderado, puntaje y dificultad mínimos | `puntajeObservado(0.25, 1)` | 22,5 | ✅ |
| CN-07 | Ponderado, puntaje 0 | `puntajeObservado(0, 5)` | 0 | ✅ |
| CN-08 | Ponderado máximo | `puntajeObservado(1, 5)` | 130 | ❌ **100** (hallazgo H-1) |
| CN-09 | EMA, clase normal | `siguienteMaestria(50, 3, 100)` | 65 | ✅ |
| CN-10 | EMA, un error | `siguienteMaestria(100, 8, 0)` | 70 | ✅ |
| CN-11 | Maestría sobre 100 | `siguienteMaestria(95, 5, 130)` | 100 (105,5 acotado) | ✅ |
| CN-12 | Maestría, límite inferior | `siguienteMaestria(0, 5, 0)` | 0 | ✅ |
| CN-13 | Primer ítem, sin historia | `siguienteMaestria(0, 0, 82.5)` | 82,5 | ✅ |
| CN-14 | Siempre entre 0 y 100 | 40 aciertos seguidos de dificultad 5 | Entre 0 y 100; termina en 100 | ✅ |
| CN-15 a CN-22 | Los 8 límites de los tramos CNEB | 0, 39, 40, 64, 65, 84, 85, 100 | C, C, B, B, A, A, AD, AD | ✅ |
| CN-23 a CN-25 | Decimales entre tramos | 39,9 · 64,99 · 84,5 | C · B · A | ✅ |
| CN-26 | RN-08, sin ítems | `nivelDeclarado(90, 0)` | Aún descubriendo (`null`) | ✅ |
| CN-27 | RN-08, límite inferior | `nivelDeclarado(90, 4)` | `null` | ✅ |
| CN-28 | RN-08, límite | `nivelDeclarado(90, 5)` | AD | ✅ |
| CN-29 | RN-08, más ítems | `nivelDeclarado(20, 12)` | C | ✅ |
| CN-30 | RF-054, dentro | `aReforzar(39.99, 5)` | Sí | ✅ |
| CN-31 | RF-054, límite de maestría | `aReforzar(40, 5)` | No | ✅ |
| CN-32 | RF-054, límite de ítems | `aReforzar(10, 4)` | No | ✅ |
| CN-33 | RF-054, maestría mínima | `aReforzar(0, 20)` | Sí | ✅ |
| CN-34 | RF-054, fuera | `aReforzar(90, 20)` | No | ✅ |

**Primera ejecución:** 34 casos, 32 pasan y 2 fallan.

```text
FALLA CN-04: sin pista, dificultad media :: AssertionError: expected 100 to be close to 110
FALLA CN-08: sin pista, dificultad máxima: el ponderado puede pasar de 100 :: AssertionError: expected 100 to be close to 130
```

---

# 4. Hallazgos de la caja negra

**H-1. El requisito RN-07 es ambiguo, y el código eligió una de dos lecturas.** El SRS dice "puntaje ponderado … × 100, acotada a 0–100". Se puede entender de dos maneras:

| Lectura | Qué se acota | Acierto sin pistas, dificultad 1 · 2 · 3 · 4 · 5 |
| :--- | :--- | :--- |
| A, la del código (Módulo 7) | Cada ítem, antes del promedio | 90 · 100 · 100 · 100 · 100 |
| B, con la que se diseñaron los casos | Solo la maestría final | 90 · 100 · 110 · 120 · 130 |

**Consecuencia de la lectura A:** sin pistas, acertar un ítem de dificultad 2 vale lo mismo que uno de dificultad 5, y la dificultad solo pesa en los ítems con pista o de dificultad 1. Con la lectura B, los ítems difíciles suben la maestría más rápido, pero nunca más de 100.

**Decisión:** no se cambia el código. Es una decisión de negocio que corresponde al dueño del producto, y la lectura A está documentada desde el Módulo 7. CN-04 y CN-08 quedan con la lectura A, con un comentario que remite a este hallazgo. Si se elige la lectura B, basta con quitar `acotar` en `puntajeObservado` y actualizar CN-04, CN-08 y la prueba del Módulo 7.

**H-2. El SRS no dice qué pasa con los decimales entre dos tramos.** Los tramos están escritos como enteros (C 0–39, B 40–64…), pero la maestría tiene decimales. El código usa umbrales (`≥ 40` es B), así que 39,9 es C (CN-23 a CN-25). Es la lectura natural; conviene escribirla en el SRS.

**H-3. El SRS no dice con qué valor empieza la EMA.** El código toma el primer valor tal cual cuando no hay historia (CN-13). Si existe un valor del reto inicial (RF-035), en cambio, promedia desde él (CB-01). Esto último no se podía deducir del SRS y lo encontró la caja blanca.

---

# 5. Contraste con IA

Se pidió a la IA (Claude) que propusiera escenarios adicionales con el prompt 1 de la guía. La columna "Decisión" es la propuesta de filtro; el equipo debe revisarla y confirmarla.

| ID | Escenario que propuso la IA | Decisión | Por qué |
| :--- | :--- | :--- | :--- |
| IA-01 | Maestría `NaN` | No aplica | Las entradas salen de la base, que guarda números; un `NaN` fallaría antes, al guardarlo |
| IA-02 | Dificultad 0, 6 o 2,5 | No aplica aquí | Contenido la valida entre 1 y 5 al publicar (`construirActividades`) y tiene su propia prueba |
| IA-03 | Puntaje de la rúbrica docente (0,33 · 0,67 · 1, RF-051) | **Aplica** | También es un puntaje de ítem y faltaba en las clases de la sección 2 |
| IA-04 | Maestría anterior negativa | No aplica | Siempre sale acotada de la EMA anterior; nunca se guarda negativa |
| IA-05 | Redondeo justo en el borde: 39,995 → 39,99 o 40 | No aplica | El SRS no fija decimales y la diferencia es menor que lo que se muestra, que es un entero en la barra |
| IA-06 | Ítems contados negativos | No aplica | Es un conteo de la base |
| IA-07 | Monotonía: acertar nunca baja la maestría y equivocarse nunca la sube | **Aplica** | Es una invariante del negocio que ningún caso puntual garantiza |
| IA-08 | "A reforzar" coincide con el nivel C cuando hay 5 ítems o más | **Aplica** | RF-054 y la escala CNEB comparten el umbral 40; si uno cambia sin el otro, la pantalla se contradice |
| IA-09 | Convergencia: muchos aciertos llevan a 100 | Ya cubierto | Es CN-14 |
| IA-10 | Etiquetas en lenguaje infantil (En inicio, En proceso, Logrado, Destacado) | **Aplica** | Es el criterio de verificación de RF-052 |
| IA-11 | Guardar en la misma transacción (RF-053) | No aplica al Nivel 1 | Lo prueba la integración con PostgreSQL |
| IA-12 | Probar muchas maestrías al azar | No aplica | IA-07 e IA-08 ya recorren la escala de 0 a 100 con un paso fijo, así que el resultado se puede repetir |

**Resultado:** 4 escenarios nuevos (IA-03, IA-07, IA-08 e IA-10) más uno que ya estaba cubierto (IA-09). La IA no propuso el hallazgo H-1, que salió de la caja negra.

---

# 6. Cobertura: sentencias, ramas y condiciones

## 6.1 Las tres métricas en tres momentos

| Momento | Pruebas | Sentencias | Ramas (v8) | Funciones | Condiciones |
| :--- | :--- | ---: | ---: | ---: | ---: |
| Antes: las pruebas que ya existían | 712 (todo el Nivel 1) | 100 % (58/58) | 100 % (30/30) | 100 % (9/9) | 100 % (24/24) |
| Solo caja negra | CN-01 a CN-34 | **93,10 %** (54/58) | **100 % (20/20)** ⚠ | 88,88 % (8/9) | **70,83 %** (17/24) |
| Final: caja negra, caja blanca y contraste con IA | 49 | 100 % (58/58) | 100 % (27/27) | 100 % (9/9) | 100 % (24/24) |

**Fórmulas aplicadas a la caja negra sola:**

- C<sub>sentencias</sub> = 54 / 58 × 100 = **93,10 %**: las 4 sentencias de `nivelLectura` (líneas 49 a 52) nunca se ejecutaron.
- C<sub>ramas</sub> según v8 = 20 / 20 × 100 = **100 %**: este número engaña (sección 6.2).
- C<sub>condiciones</sub> = 17 / (12 × 2) × 100 = **70,83 %**.

## 6.2 Por qué el 100 % de ramas de v8 engaña

v8 solo cuenta las ramas de las funciones que llegaron a ejecutarse. Como `nivelLectura` nunca corrió, sus 3 ternarios no entraron en el total: el denominador fue 20 y no 27, aunque había 7 ramas sin probar. La cobertura de sentencias y la de condiciones sí lo mostraron.

![Resumen del reporte HTML con solo la caja negra: 93,1 % de sentencias y 100 % de ramas](img/15-cobertura-caja-negra-resumen.png)

![maestria.ts con solo la caja negra: las líneas 48 a 52 de nivelLectura en rojo](img/15-cobertura-caja-negra-maestria.png)

## 6.3 Cómo se midió la cobertura de condiciones

Vitest con v8 no mide condiciones. Por eso se agregó un medidor, `apps/api/test/herramientas/condiciones/`, que funciona así:

1. Al cargar los archivos medidos, envuelve cada condición atómica en `__cond(id, valor)`. Una condición atómica es cada operando de un `&&` o `||` y cada condición simple de un `if` o de un ternario.
2. Durante las pruebas, cuenta cuántas veces salió verdadera y cuántas falsa.
3. Al final calcula la fórmula de la guía.

Hay 12 condiciones y 24 salidas posibles. Lo que no cubría la caja negra:

| Condición | Verdadero | Falso | Qué faltaba |
| :--- | ---: | ---: | :--- |
| `maestria.ts:30` `anterior === 0` | 2 | **0** | Por el cortocircuito de `&&`, solo se evalúa si `itemsContados === 0`, y la caja negra nunca combinó 0 ítems con una maestría anterior distinta de 0 |
| `maestria.ts:50` `maestriaPromedio >= 85` | **0** | **0** | `nivelLectura` no estaba en los requisitos elegidos |
| `maestria.ts:50` `maestriaPromedio >= 65` | **0** | **0** | Igual que la anterior |
| `maestria.ts:50` `maestriaPromedio >= 40` | **0** | **0** | Igual que la anterior |

**Casos de caja blanca que lo completaron:**

| ID | Entrada | Lo que cubre | Resultado |
| :--- | :--- | :--- | :--- |
| CB-01 | `siguienteMaestria(70, 0, 100)` | `anterior === 0` en falso: hay valor del reto inicial aunque no haya ítems | 79 |
| CB-02 a CB-05 | `nivelLectura('R2', 90 · 70 · 50 · 30)` | Los tres umbrales en verdadero y en falso | 4 · 3 · 2 · 1 |
| CB-06 y CB-07 | `nivelLectura('R1', 10)` y `nivelLectura('R3', 95)` | Los límites de 1 y 5 | 1 y 5 |
| CB-08 a CB-11 | `nivelLectura('R2', 85 · 65 · 40 · 39.99)` | Los umbrales exactos; los agregó la siembra de errores (sección 7) | 4 · 3 · 2 · 1 |

![Resumen del reporte HTML final: 100 % en todo](img/15-cobertura-final-resumen.png)

![maestria.ts al final: todas las líneas cubiertas](img/15-cobertura-final-maestria.png)

---

# 7. ¿100 % de cobertura significa probado?

Antes de esta semana, las pruebas existentes ya tenían 100 % en las tres métricas. Para ver qué detecta cada conjunto de pruebas se sembraron 14 errores, uno a la vez, la mayoría de límite:

| ID | Error sembrado | Las 712 anteriores (con 100 % de cobertura) | Solo caja negra | Suite final nueva |
| :--- | :--- | :--- | :--- | :--- |
| K01 | El nivel AD empieza en 85,01 y no en 85 | **No** | Sí: CN-21 | Sí |
| K02 | El nivel A empieza en 65,01 | **No** | Sí: CN-19 | Sí |
| K03 | El nivel B empieza en 40,01 | Sí | Sí: CN-17 | Sí |
| K04 | El nivel se declara recién con 6 ítems | Sí | Sí: CN-28 | Sí |
| K05 | "A reforzar" también con maestría 40 | Sí | Sí: CN-31 | Sí |
| K06 | "A reforzar" recién con 6 ítems | Sí | Sí: CN-30 | Sí |
| K07 | α = 0,35 en vez de 0,3 | Sí | Sí: CN-09, CN-10 | Sí |
| K08 | Factor 0,7 + 0,1 × dificultad | Sí | Sí: CN-01 a CN-05 | Sí |
| K09 | "Sin historia" con `\|\|` en vez de `&&` | Sí | No | Sí: CB-01 |
| K10 | El puntaje del ítem ya no se acota a 100 | Sí | Sí: CN-04, CN-08 | Sí |
| K11 | La maestría ya no se acota a 0–100 | **No** | Sí: CN-11 | Sí |
| K12 | Nivel de lectura: +2 recién sobre 85 | **No** | No | Sí: CB-08 |
| K13 | El nivel de lectura puede bajar a 0 | Sí | No | Sí: CB-06 |
| K14 | La maestría ya no se redondea a 2 decimales | Sí | No | No |
| | **Detectados** | **10 de 14** | **10 de 14** | **13 de 14** |

Las 712 pruebas anteriores y la suite final, juntas, detectan los 14 errores.

**K12 se le escapó a todos en la primera ronda,** incluida la primera versión de la suite final. Por eso se agregaron CB-08 a CB-11 con los umbrales exactos de `nivelLectura`; en la segunda ronda, CB-08 lo detectó. K14 lo detectan solo las pruebas anteriores, porque el redondeo a 2 decimales no está en el SRS y la caja negra no tenía de dónde deducirlo.

---

# 8. Interpretación honesta de las métricas

1. **La caja negra no subió la cobertura, porque ya era del 100 %.** Su aporte fue otro: encontró un requisito ambiguo (H-1) y fijó los límites que el SRS exige (de los 4 errores de límite que se les escapaban a las 712 pruebas anteriores, la caja negra detecta 3: K01, K02 y K11. El cuarto, K12, lo detecta un caso de caja blanca que se agregó después).
2. **100 % de cobertura no significa probado.** Recorrer una línea no comprueba su resultado: un `>= 85` y un `> 85` ejecutan las mismas líneas.
3. **v8 puede marcar 100 % de ramas con una función completa sin probar** (sección 6.2). Conviene mirar siempre las sentencias, las funciones y las condiciones.
4. **La cobertura de condiciones no es MC/DC.** El medidor exige que cada operando salga verdadero y falso, pero no que cada uno cambie por sí solo el resultado de la decisión.
5. **Las cifras son del componente medido,** no de todo el sistema. El Nivel 1 completo de la API tiene 98,15 % de líneas y 94,3 % de ramas.
6. **Pendiente de una persona:** decidir la lectura de RN-07 (H-1) y confirmar el filtro de la sección 5.

---

# Anexo: código

Las pruebas, en `apps/api/test/unit/progreso/dominio/maestria-caja-negra.spec.ts`:

<<archivo:apps/api/test/unit/progreso/dominio/maestria-caja-negra.spec.ts>>

El medidor de condiciones, en `apps/api/test/herramientas/condiciones/medir.mjs`:

<<archivo:apps/api/test/herramientas/condiciones/medir.mjs>>
