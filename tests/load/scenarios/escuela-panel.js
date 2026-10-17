import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del modo escuela (k6).
 *   RNF-003: panel docente con un aula de 40 estudiantes → p95 < 1,5 s.
 *   RNF-001: lecturas (lista de aulas, "Misión del docente") → p95 < 300 ms y p99 < 800 ms.
 *   RF-017: imprimir una hoja de 8 tarjetas (8 PIN nuevos con Argon2id + PDF) sin errores.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa, sin SMTP).
 * Ejecutar:   k6 run tests/load/scenarios/escuela-panel.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 -e DURACION=30s tests/load/scenarios/escuela-panel.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

export const options = {
  scenarios: {
    panel_docente: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'consultarPanel',
      tags: { escenario: 'panel_docente' },
    },
    mision_estudiante: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'abrirInicioDelNino',
      tags: { escenario: 'mision_estudiante' },
    },
    tarjetas: {
      executor: 'constant-arrival-rate',
      rate: 12,
      timeUnit: '1m',
      duration: __ENV.DURACION || '1m',
      preAllocatedVUs: 2,
      maxVUs: 4,
      exec: 'imprimirTarjetas',
      tags: { escenario: 'tarjetas' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /aulas/{id}}': ['p(95)<1500'],
    'http_req_duration{nombre:GET /aulas}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /yo/asignaciones}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Docente con un aula de 40 estudiantes, tablet activada y un niño con sesión. */
export function setup() {
  const email = `carga.escuela.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '5.° Carga', grado: '5', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const csv = Array.from({ length: 40 }, (_, i) => `Niño ${i + 1},2016,${(i % 12) + 1},${AVATARES[i % 12]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== 40) fail('No se matricularon los 40 estudiantes de carga');

  const { tokenDispositivo } = http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: 'Tablet carga' }), { headers: docente }).json();
  const nino = matriculados[0].estudianteId;
  http.post(`${BASE}/estudiantes/${nino}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
  const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: nino, pin: '4826' }), cabeceras).json();

  return {
    aulaId: aula.id,
    docente,
    estudiante: { Authorization: `Bearer ${ingreso.accessToken}` },
    paraTarjetas: matriculados.slice(1, 9).map((m) => m.estudianteId),
  };
}

export function consultarPanel(datos) {
  const detalle = http.get(`${BASE}/aulas/${datos.aulaId}`, { headers: datos.docente, tags: { nombre: 'GET /aulas/{id}' } });
  check(detalle, { 'detalle con 40 estudiantes': (r) => r.status === 200 && r.json('estudiantes').length === 40 });
  const lista = http.get(`${BASE}/aulas`, { headers: datos.docente, tags: { nombre: 'GET /aulas' } });
  check(lista, { 'lista de aulas 200': (r) => r.status === 200 });
  const asignaciones = http.get(`${BASE}/aulas/${datos.aulaId}/asignaciones`, { headers: datos.docente, tags: { nombre: 'GET /aulas/{id}/asignaciones' } });
  check(asignaciones, { 'asignaciones 200': (r) => r.status === 200 });
}

export function abrirInicioDelNino(datos) {
  const res = http.get(`${BASE}/yo/asignaciones`, { headers: datos.estudiante, tags: { nombre: 'GET /yo/asignaciones' } });
  check(res, { 'misiones del docente 200': (r) => r.status === 200 });
}

export function imprimirTarjetas(datos) {
  const res = http.post(`${BASE}/aulas/${datos.aulaId}/tarjetas-acceso.pdf`, JSON.stringify({ estudianteIds: datos.paraTarjetas }), {
    headers: datos.docente,
    tags: { nombre: 'POST /aulas/{id}/tarjetas-acceso.pdf' },
  });
  check(res, {
    'PDF de tarjetas': (r) => r.status === 200 && r.headers['Content-Type'] === 'application/pdf',
    'sin caché': (r) => r.headers['Cache-Control'] === 'no-store',
  });
}
