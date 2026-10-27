import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del acompañamiento familiar (k6), con una familia de 6 hijos:
 *   RF-068, RF-069 / RNF-001: panel de un hijo (su semana, su avance, sus habilidades y los consejos con
 *   lectura sugerida) → p95 < 300 ms y p99 < 800 ms.
 *   RF-070: su preferencia del resumen semanal → p95 < 300 ms.
 *
 * Requisitos: API en marcha y la familia sembrada (sembrar-familia.mjs imprime su correo).
 * Ejecutar:   k6 run -e EMAIL=$(node tests/load/sembrar-familia.mjs) tests/load/scenarios/familia-panel.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const HIJOS = 6;

export const options = {
  scenarios: {
    panel_familia: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'acompanar',
      tags: { escenario: 'panel_familia' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /familia/estudiantes/{id}/panel}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /familia/preferencias-notificacion}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** La familia sembrada inicia sesión una vez; los ids de sus hijos salen de su lista. */
export function setup() {
  if (!__ENV.EMAIL) fail('Falta EMAIL: siembra la familia con node tests/load/sembrar-familia.mjs');
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email: __ENV.EMAIL, contrasena: CONTRASENA }), {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipDispositivo() },
  });
  if (sesion.status !== 200) fail(`La familia de carga no pudo ingresar: ${sesion.status}`);
  const familia = { Authorization: `Bearer ${sesion.json('accessToken')}` };
  const hijos = http.get(`${BASE}/familia/estudiantes`, { headers: familia });
  if (hijos.status !== 200 || hijos.json().length !== HIJOS) fail(`La familia sembrada no tiene ${HIJOS} hijos`);
  return { familia, hijos: hijos.json().map((h) => h.id) };
}

/** La familia abre el avance de uno de sus hijos y revisa su preferencia del resumen. */
export function acompanar(datos) {
  const id = datos.hijos[Math.floor(Math.random() * datos.hijos.length)];
  const panel = http.get(`${BASE}/familia/estudiantes/${id}/panel`, { headers: datos.familia, tags: { nombre: 'GET /familia/estudiantes/{id}/panel' } });
  check(panel, {
    'panel con 5 habilidades': (r) => r.status === 200 && r.json('habilidades').length === 5,
    'consejos para las habilidades a reforzar': (r) => r.status === 200 && r.json('aReforzar').every((a) => a.consejos.length >= 1),
  });
  const prefs = http.get(`${BASE}/familia/preferencias-notificacion`, { headers: datos.familia, tags: { nombre: 'GET /familia/preferencias-notificacion' } });
  check(prefs, { 'preferencia del resumen': (r) => r.status === 200 && typeof r.json('resumenSemanal') === 'boolean' });
}
