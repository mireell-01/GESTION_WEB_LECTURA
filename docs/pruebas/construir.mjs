// Arma los informes de pruebas insertando el código real de cada archivo citado.
// Uso: node docs/pruebas/construir.mjs   (lee *.plantilla.md y escribe el .md final al lado)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const carpeta = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(carpeta, '../..');
const lenguaje = { '.ts': 'ts', '.js': 'js', '.mjs': 'js', '.yml': 'yaml', '.feature': 'gherkin', '.md': 'markdown' };

for (const plantilla of readdirSync(carpeta).filter((f) => f.endsWith('.plantilla.md'))) {
  const texto = readFileSync(join(carpeta, plantilla), 'utf8').replace(/^<<archivo:(.+)>>$/gm, (_, ruta) => {
    const codigo = readFileSync(join(raiz, ruta.trim()), 'utf8').trimEnd();
    const cerca = codigo.includes('```') ? '````' : '```';
    return `${cerca}${lenguaje[extname(ruta.trim())] ?? ''}\n${codigo}\n${cerca}`;
  });
  const destino = plantilla.replace('.plantilla.md', '.md');
  writeFileSync(join(carpeta, destino), `<!-- Generado con node docs/pruebas/construir.mjs desde ${plantilla}. No editar a mano. -->\n${texto}`);
  console.log(`Informe generado: docs/pruebas/${destino}`);
}
