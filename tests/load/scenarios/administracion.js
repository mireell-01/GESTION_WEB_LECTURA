import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de la administración de la plataforma (k6), con 20 000 registros de auditoría:
 *   RF-077 / RNF-001: la auditoría (la primera página, filtrada por acción y por el último mes) → p95 < 300 ms.
 *   RF-076: las cuentas docentes con sus aulas y las instituciones → p95 < 300 ms.
 *
 * Requisitos: API en marcha y la administración sembrada (sembrar-administracion.mjs imprime su cabecera).
 * Ejecutar:   k6 run -e AUTH="$(node tests/load/sembrar-administracion.mjs)" tests/load/scenarios/administracion.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';

export const options = {
  scenarios: {
    panel_admin: {
      executor: 'constant-vus',
      vus: 5,
      duration: __ENV.DURACION || '1m',
      exec: 'administrar',
      tags: { escenario: 'panel_admin' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /admin/auditoria}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/auditoria?accion}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/auditoria?desde}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/docentes}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /admin/instituciones}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

export function setup() {
  if (!__ENV.AUTH) fail('Falta AUTH: siembra la administración con node tests/load/sembrar-administracion.mjs');
  return { cabeceras: { Authorization: __ENV.AUTH } };
}

function haceUnMes() {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}

/** La administración revisa la auditoría (sin filtro, por acción y por fecha) y las cuentas docentes. */
export function administrar(datos) {
  const pedir = (ruta, nombre) => http.get(`${BASE}${ruta}`, { headers: datos.cabeceras, tags: { nombre } });
  const pagina = pedir('/admin/auditoria', 'GET /admin/auditoria');
  check(pagina, { 'una página de 50 con la siguiente': (r) => r.status === 200 && r.json('registros').length === 50 && r.json('siguiente') !== null });
  const porAccion = pedir('/admin/auditoria?accion=PIN_RESTABLECIDO', 'GET /admin/auditoria?accion');
  check(porAccion, { 'solo esa acción': (r) => r.status === 200 && r.json('registros').every((x) => x.accion === 'PIN_RESTABLECIDO') });
  check(pedir(`/admin/auditoria?desde=${haceUnMes()}`, 'GET /admin/auditoria?desde'), { 'el último mes': (r) => r.status === 200 });
  check(pedir('/admin/docentes', 'GET /admin/docentes'), { 'docentes con sus aulas': (r) => r.status === 200 && Array.isArray(r.json()) });
  check(pedir('/admin/instituciones', 'GET /admin/instituciones'), { instituciones: (r) => r.status === 200 });
}
