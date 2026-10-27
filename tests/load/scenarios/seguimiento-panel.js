import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del seguimiento docente (k6), con un aula de 40 estudiantes:
 *   RNF-003 / RF-063: panel del aula (mapa de calor, alertas y refuerzos) → p95 < 1,5 s.
 *   RF-064: detalle de un estudiante (sus últimas 20 sesiones) → p95 < 1,5 s.
 *   RF-067: reporte del aula en PDF y CSV → cada descarga en ≤ 30 s.
 *
 * Requisitos: API en marcha y el aula sembrada (sembrar-seguimiento.mjs imprime "aulaId email").
 * Ejecutar:   D=$(node tests/load/sembrar-seguimiento.mjs)
 *             k6 run -e AULA_ID="${D% *}" -e EMAIL="${D#* }" tests/load/scenarios/seguimiento-panel.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const ESTUDIANTES = 40;

export const options = {
  scenarios: {
    panel_docente: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'seguirAlAula',
      tags: { escenario: 'panel_docente' },
    },
    reporte: {
      executor: 'constant-arrival-rate',
      rate: 6,
      timeUnit: '1m',
      duration: __ENV.DURACION || '1m',
      preAllocatedVUs: 2,
      maxVUs: 4,
      exec: 'descargarReporte',
      tags: { escenario: 'reporte' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /aulas/{id}/panel}': ['p(95)<1500'],
    'http_req_duration{nombre:GET /aulas/{id}/estudiantes/{id}/detalle}': ['p(95)<1500'],
    'http_req_duration{nombre:GET /aulas/{id}/reporte}': ['max<30000'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** La docente del aula sembrada inicia sesión una vez; los ids de sus estudiantes salen del panel. */
export function setup() {
  if (!__ENV.AULA_ID || !__ENV.EMAIL) fail('Faltan AULA_ID y EMAIL: siembra el aula con node tests/load/sembrar-seguimiento.mjs');
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email: __ENV.EMAIL, contrasena: CONTRASENA }), {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipDispositivo() },
  });
  if (sesion.status !== 200) fail(`La docente de carga no pudo ingresar: ${sesion.status}`);
  const docente = { Authorization: `Bearer ${sesion.json('accessToken')}` };
  const panel = http.get(`${BASE}/aulas/${__ENV.AULA_ID}/panel`, { headers: docente });
  if (panel.status !== 200 || panel.json('estudiantes').length !== ESTUDIANTES) fail(`El aula sembrada no tiene ${ESTUDIANTES} estudiantes`);
  return { aulaId: __ENV.AULA_ID, docente, estudiantes: panel.json('estudiantes').map((e) => e.id) };
}

/** La docente abre el panel del aula y luego el detalle de uno de sus estudiantes. */
export function seguirAlAula(datos) {
  const panel = http.get(`${BASE}/aulas/${datos.aulaId}/panel`, { headers: datos.docente, tags: { nombre: 'GET /aulas/{id}/panel' } });
  check(panel, {
    'panel con 40 estudiantes': (r) => r.status === 200 && r.json('estudiantes').length === ESTUDIANTES,
    'panel con alertas y refuerzos': (r) => r.status === 200 && r.json('alertas').length > 0 && r.json('refuerzos').length > 0,
  });
  const estudianteId = datos.estudiantes[Math.floor(Math.random() * datos.estudiantes.length)];
  const detalle = http.get(`${BASE}/aulas/${datos.aulaId}/estudiantes/${estudianteId}/detalle`, {
    headers: datos.docente,
    tags: { nombre: 'GET /aulas/{id}/estudiantes/{id}/detalle' },
  });
  check(detalle, { 'detalle con sus 5 habilidades': (r) => r.status === 200 && r.json('habilidades').length === 5 });
}

/** Mitad PDF, mitad CSV. */
export function descargarReporte(datos) {
  const formato = Math.random() < 0.5 ? 'pdf' : 'csv';
  const res = http.get(`${BASE}/aulas/${datos.aulaId}/reporte?formato=${formato}`, {
    headers: datos.docente,
    responseType: 'binary',
    tags: { nombre: 'GET /aulas/{id}/reporte', formato },
  });
  check(res, {
    'reporte descargado': (r) => r.status === 200 && r.headers['Content-Type'].startsWith(formato === 'pdf' ? 'application/pdf' : 'text/csv'),
    'reporte sin caché': (r) => r.headers['Cache-Control'] === 'no-store',
  });
}
