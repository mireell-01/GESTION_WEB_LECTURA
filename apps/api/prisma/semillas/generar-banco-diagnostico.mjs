// Genera la migración que carga el banco de ítems del diagnóstico (RF-034, RF-037) desde
// banco-diagnostico.json. Uso: node apps/api/prisma/semillas/generar-banco-diagnostico.mjs
//
// En el JSON la primera opción de cada pregunta es la correcta (así es fácil de revisar); aquí se
// cambia de lugar con una regla fija para que la respuesta correcta no esté siempre primera.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const banco = JSON.parse(readFileSync(resolve(aqui, 'banco-diagnostico.json'), 'utf8'));
const destino = resolve(aqui, '../migrations/20261022000000_banco_diagnostico/migration.sql');

const HABILIDADES = ['LIT', 'VOC', 'INF', 'CRI', 'ARG'];
const POR_RANGO = { R1: 10, R2: 15, R3: 15 };
const sql = (texto) => `'${String(texto).replace(/'/g, "''")}'`;

/** Posición fija pero variada de la respuesta correcta (depende solo del texto de la pregunta). */
function posicion(enunciado, n) {
  let h = 0;
  for (const c of enunciado) h = (h * 31 + c.codePointAt(0)) % 9973;
  return h % n;
}

const filas = [];
for (const [forma, rangos] of Object.entries(banco.formas)) {
  for (const [rango, lecturas] of Object.entries(rangos)) {
    let orden = 0;
    for (const lectura of lecturas) {
      if (lectura.preguntas.map((p) => p.habilidad).join() !== HABILIDADES.join()) {
        throw new Error(`${lectura.clave}: cada lectura lleva una pregunta por habilidad en el orden ${HABILIDADES.join(', ')}`);
      }
      for (const p of lectura.preguntas) {
        orden += 1;
        const correcta = p.opciones[0];
        const resto = p.opciones.slice(1);
        const indice = posicion(p.enunciado, p.opciones.length);
        const opciones = [...resto.slice(0, indice), correcta, ...resto.slice(indice)];
        const contenido = { orden, lectura: { clave: lectura.clave, titulo: lectura.titulo, texto: lectura.texto }, opciones };
        filas.push(
          `  (${sql(rango)}, ${sql(p.habilidad)}, ${p.dificultad}, ${sql(forma)}, ${sql(p.enunciado)}, ${sql(JSON.stringify(contenido))}::jsonb, ${sql(JSON.stringify({ indice }))}::jsonb)`,
        );
      }
    }
    if (orden !== POR_RANGO[rango]) throw new Error(`Forma ${forma}, ${rango}: hay ${orden} ítems y se esperan ${POR_RANGO[rango]}`);
  }
}

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(
  destino,
  `-- Módulo 5 · Diagnóstico (RF-034, RF-037): banco inicial de ítems, formas A y B, para las tres edades.
-- Generado con apps/api/prisma/semillas/generar-banco-diagnostico.mjs desde banco-diagnostico.json
-- (borrador para validación del líder pedagógico). No editar a mano.

-- Segunda barrera: forma A o B, contenido con su orden y opciones, y respuesta correcta como índice.
ALTER TABLE "diagnostico"."banco_item_diagnostico"
  ADD CONSTRAINT "ck_banco_forma" CHECK ("forma" IN ('A', 'B')),
  ADD CONSTRAINT "ck_banco_contenido" CHECK (
    jsonb_typeof("contenido" -> 'orden') = 'number'
    AND jsonb_typeof("contenido" -> 'opciones') = 'array'
    AND jsonb_array_length("contenido" -> 'opciones') BETWEEN 2 AND 5
  ),
  ADD CONSTRAINT "ck_banco_respuesta" CHECK (
    jsonb_typeof("respuesta_correcta" -> 'indice') = 'number'
    AND ("respuesta_correcta" ->> 'indice')::int >= 0
    AND ("respuesta_correcta" ->> 'indice')::int < jsonb_array_length("contenido" -> 'opciones')
  );

-- Un mismo orden no se repite dentro de una forma y una edad.
CREATE UNIQUE INDEX "banco_item_diagnostico_rango_forma_orden_key"
  ON "diagnostico"."banco_item_diagnostico" ("rango_edad", "forma", (("contenido" ->> 'orden')::int));

-- Un estudiante no tiene dos diagnósticos sin terminar a la vez (RF-036: se reanuda el mismo).
CREATE UNIQUE INDEX "diagnostico_un_pendiente_por_estudiante"
  ON "diagnostico"."diagnostico" ("estudiante_id") WHERE "estado" <> 'FINALIZADO';

INSERT INTO "diagnostico"."banco_item_diagnostico"
  ("rango_edad", "habilidad", "nivel_dificultad", "forma", "enunciado", "contenido", "respuesta_correcta")
VALUES
${filas.join(',\n')};
`,
);
console.log(`Migración generada con ${filas.length} ítems: ${destino}`);
