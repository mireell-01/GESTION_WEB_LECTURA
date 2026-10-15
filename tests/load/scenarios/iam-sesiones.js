import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de IAM (k6).
 *   RNF-008: pico de ingreso al inicio de la jornada escolar → 300 inicios de sesión/min con error < 0,5 %.
 *   RNF-001: endpoints de lectura (GET /iam/yo) con p95 < 300 ms y p99 < 800 ms.
 * Cada iteración simula un dispositivo distinto (X-Forwarded-For) para no mezclarse con el
 * límite de 10 ingresos/min por IP (RNF-019), como ocurriría con las tablets de un colegio.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa, sin SMTP).
 * Ejecutar:   k6 run tests/load/scenarios/iam-sesiones.js
 *             k6 run -e API_URL=http://localhost:3001/api tests/load/scenarios/iam-sesiones.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    pico_ingreso: {
      executor: 'constant-arrival-rate',
      rate: 300,
      timeUnit: '1m',
      duration: __ENV.DURACION || '2m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: 'ingresar',
      tags: { escenario: 'pico_ingreso' },
    },
    lectura_perfil: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '2m',
      exec: 'consultarPerfil',
      tags: { escenario: 'lectura_perfil' },
    },
  },
  thresholds: {
    'http_req_failed{escenario:pico_ingreso}': ['rate<0.005'],
    'http_req_duration{escenario:pico_ingreso}': ['p(95)<1000'],
    'http_req_duration{escenario:lectura_perfil}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Crea y verifica la cuenta de carga usando la bandeja de correos de desarrollo. */
export function setup() {
  const email = `carga.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/iam/cuentas`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);

  const correo = http.get(`${BASE}/iam/dev/correos`).json().find((c) => c.para === email);
  const codigo = correo.enlace.split('codigo=')[1];
  const verificacion = http.post(`${BASE}/iam/correo/verificar`, JSON.stringify({ codigo }), cabeceras);
  if (verificacion.status !== 200) fail('No se pudo verificar la cuenta de carga');

  const sesion = http.post(`${BASE}/iam/sesiones`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  return { email, accessToken: sesion.accessToken };
}

export function ingresar(datos) {
  const res = http.post(`${BASE}/iam/sesiones`, JSON.stringify({ email: datos.email, contrasena: CONTRASENA }), {
    headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() },
    tags: { nombre: 'POST /iam/sesiones' },
  });
  check(res, {
    'ingreso 200': (r) => r.status === 200,
    'entrega access token': (r) => !!r.json('accessToken'),
    'refresh en cookie httpOnly': (r) => /HttpOnly/i.test(r.headers['Set-Cookie'] || ''),
  });
}

export function consultarPerfil(datos) {
  const res = http.get(`${BASE}/iam/yo`, {
    headers: { Authorization: `Bearer ${datos.accessToken}` },
    tags: { nombre: 'GET /iam/yo' },
  });
  check(res, { 'perfil 200': (r) => r.status === 200 });
}
