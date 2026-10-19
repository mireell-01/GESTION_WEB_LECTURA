import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del mapa de aventuras (k6).
 *   RNF-001: lecturas → p95 < 300 ms y p99 < 800 ms.
 *     · GET /aventura/mapa: los 5 mundos con su estado y las misiones de la edad del niño (RF-030);
 *     · GET /aventura/mundos/{id}/misiones: misiones con sus lecturas y el avance (RF-032).
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa) y misiones sembradas:
 *             node tests/load/sembrar-aventura.mjs
 * Ejecutar:   k6 run tests/load/scenarios/aventura-mapa.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 -e DURACION=30s tests/load/scenarios/aventura-mapa.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NINOS = 10;

export const options = {
  scenarios: {
    mapa: {
      executor: 'constant-vus',
      vus: NINOS,
      duration: __ENV.DURACION || '1m',
      exec: 'recorrerMapa',
      tags: { escenario: 'mapa' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /aventura/mapa}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /aventura/mundos/{id}/misiones}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Una docente con un aula de 10 niños de 9 años, cada uno con su sesión en la tablet del aula. */
export function setup() {
  const email = `carga.aventura.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Carga', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${['zorro', 'panda', 'leon', 'rana', 'pulpo'][i % 5]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  const { tokenDispositivo } = http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: 'Tablet carga' }), { headers: docente }).json();

  const ninos = matriculados.map((m) => {
    http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
    const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: m.estudianteId, pin: '4826' }), cabeceras).json();
    return { Authorization: `Bearer ${ingreso.accessToken}` };
  });
  // La primera visita ubica a cada niño en su mundo inicial (RF-033); se mide el uso de todos los días.
  const mapa = http.get(`${BASE}/aventura/mapa`, { headers: ninos[0] }).json();
  for (const n of ninos.slice(1)) http.get(`${BASE}/aventura/mapa`, { headers: n });
  if (!mapa.mundos || mapa.mundos[0].misiones.total === 0) fail('No hay misiones: ejecuta antes node tests/load/sembrar-aventura.mjs');
  return { ninos, mundoActual: mapa.mundos[0].id };
}

export function recorrerMapa(datos) {
  const yo = datos.ninos[(__VU - 1) % datos.ninos.length];
  const mapa = http.get(`${BASE}/aventura/mapa`, { headers: yo, tags: { nombre: 'GET /aventura/mapa' } });
  check(mapa, { 'mapa con 5 mundos': (r) => r.status === 200 && r.json('mundos').length === 5 });
  const misiones = http.get(`${BASE}/aventura/mundos/${datos.mundoActual}/misiones`, { headers: yo, tags: { nombre: 'GET /aventura/mundos/{id}/misiones' } });
  check(misiones, { 'misiones del mundo actual': (r) => r.status === 200 && r.json('misiones').length >= 3 });
}
