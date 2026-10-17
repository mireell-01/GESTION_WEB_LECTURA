import http from 'k6/http';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de la biblioteca (k6).
 *   RNF-001: lecturas → p95 < 300 ms y p99 < 800 ms.
 *     · docente: lista (12 por página), lista filtrada por temática y nivel, y detalle (RF-028);
 *     · niño: su biblioteca, limitada a su edad y su nivel ± 1.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa) y lecturas publicadas:
 *             node tests/load/sembrar-biblioteca.mjs
 * Ejecutar:   k6 run tests/load/scenarios/biblioteca.js
 *             k6 run -e API_URL=http://localhost:3001/api/v1 -e DURACION=30s tests/load/scenarios/biblioteca.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    biblioteca_docente: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'explorarComoDocente',
      tags: { escenario: 'biblioteca_docente' },
    },
    biblioteca_nino: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURACION || '1m',
      exec: 'abrirBibliotecaDelNino',
      tags: { escenario: 'biblioteca_nino' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:GET /biblioteca}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /biblioteca?filtros}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /biblioteca/{id}}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:GET /biblioteca (niño)}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Docente con un aula, un niño de 9 años con sesión en la tablet y una lectura para el detalle. */
export function setup() {
  const email = `carga.biblioteca.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const lista = http.get(`${BASE}/biblioteca`, { headers: docente }).json();
  if (!lista.lecturas || lista.lecturas.length === 0) fail('No hay lecturas publicadas: ejecuta antes node tests/load/sembrar-biblioteca.mjs');

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '3.° Carga', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const matricula = http.post(`${BASE}/aulas/${aula.id}/matriculas`, JSON.stringify({
    alias: 'Niño Carga', anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 1, avatar: 'zorro',
  }), { headers: docente }).json();
  http.post(`${BASE}/estudiantes/${matricula.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
  const { tokenDispositivo } = http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: 'Tablet carga' }), { headers: docente }).json();
  const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: matricula.estudianteId, pin: '4826' }), cabeceras).json();

  return {
    docente,
    estudiante: { Authorization: `Bearer ${ingreso.accessToken}` },
    lecturaId: lista.lecturas[0].lecturaId,
  };
}

export function explorarComoDocente(datos) {
  const lista = http.get(`${BASE}/biblioteca`, { headers: datos.docente, tags: { nombre: 'GET /biblioteca' } });
  check(lista, { 'biblioteca: hasta 12 por página': (r) => r.status === 200 && r.json('lecturas').length <= 12 });
  const filtrada = http.get(`${BASE}/biblioteca?tema=animales&nivel=2`, { headers: datos.docente, tags: { nombre: 'GET /biblioteca?filtros' } });
  check(filtrada, { 'biblioteca filtrada 200': (r) => r.status === 200 });
  const detalle = http.get(`${BASE}/biblioteca/${datos.lecturaId}`, { headers: datos.docente, tags: { nombre: 'GET /biblioteca/{id}' } });
  check(detalle, { 'detalle sin respuestas': (r) => r.status === 200 && !r.body.includes('indiceCorrecto') && !r.body.includes('clavesEvidencia') });
}

export function abrirBibliotecaDelNino(datos) {
  const res = http.get(`${BASE}/biblioteca`, { headers: datos.estudiante, tags: { nombre: 'GET /biblioteca (niño)' } });
  check(res, {
    'el niño ve solo su edad': (r) => r.status === 200 && r.json('lecturas').every((l) => l.rangoEdad === 'R2'),
  });
}
