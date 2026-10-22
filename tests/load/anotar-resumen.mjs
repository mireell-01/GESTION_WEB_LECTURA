// Publica en GitHub Actions, como anotación visible en el resumen de la ejecución, los tiempos de cada
// métrica con umbral de un escenario k6 (archivo de `k6 run --summary-export`). Así se ve qué umbral
// no se cumplió sin abrir los registros. Fuera de GitHub Actions solo imprime el resumen.
//
// Uso: node tests/load/anotar-resumen.mjs <resumen.json> <nombre del escenario>
import { existsSync, readFileSync } from 'node:fs';

const [archivo, nombre = 'k6'] = process.argv.slice(2);
if (!archivo || !existsSync(archivo)) {
  console.log(`::warning title=k6 ${nombre}::No se generó el resumen (¿falló antes de terminar?)`);
  process.exit(0);
}

const { metrics } = JSON.parse(readFileSync(archivo, 'utf8'));
const ms = (v) => (typeof v === 'number' ? `${Math.round(v)} ms` : '—');
const lineas = [];
let fallidos = 0;
for (const [metrica, m] of Object.entries(metrics)) {
  if (!m.thresholds) continue;
  // En el resumen de k6, cada umbral vale `true` si NO se cumplió.
  const noCumplidos = Object.entries(m.thresholds).filter(([, fallo]) => fallo === true).map(([u]) => u);
  fallidos += noCumplidos.length;
  const valores = 'p(95)' in m ? `p95 ${ms(m['p(95)'])} · p99 ${ms(m['p(99)'])}` : `valor ${m.value ?? m.rate ?? '—'}`;
  lineas.push(`${noCumplidos.length ? '✗' : '✓'} ${metrica}: ${valores} (umbral ${Object.keys(m.thresholds).join(', ')})`);
}
const tipo = fallidos ? 'error' : 'notice';
console.log(`::${tipo} title=k6 ${nombre}::${lineas.join('%0A')}`);
