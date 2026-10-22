import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento del reto inicial (k6): un aula de 40 niños de 9 años lo hace a la vez, de
 * a 10 en paralelo, con sus 15 preguntas cada uno.
 *   RNF-002: enviar y corregir una respuesta → p95 < 300 ms.
 *   RNF-001: pedir la pregunta siguiente → p95 < 300 ms y p99 < 800 ms.
 *   RF-035: finalizar (calcula el nivel y ubica al niño en su mundo) sin errores.
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa). El banco de ítems lo carga la migración.
 * Ejecutar:   k6 run tests/load/scenarios/diagnostico-reto.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NINOS = 40;
const POR_TABLET = 20;
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

export const options = {
  scenarios: {
    reto: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: NINOS,
      maxDuration: '5m',
      exec: 'hacerReto',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:POST /diagnosticos/{id}/respuestas}': ['p(95)<300'],
    'http_req_duration{nombre:GET /diagnosticos/{id}/siguiente-item}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{nombre:POST /diagnosticos/{id}/finalizar}': ['p(95)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Docente con un aula de 40 niños de 9 años, cada uno con su sesión en la tablet del aula. */
export function setup() {
  const email = `carga.reto.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Reto', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${AVATARES[i % AVATARES.length]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  // Como en un aula real, varias tablets: RNF-019 limita a 30 ingresos por minuto en cada una.
  const tablets = Array.from({ length: Math.ceil(NINOS / POR_TABLET) }, (_, i) =>
    http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: `Tablet carga ${i + 1}` }), { headers: docente }).json('tokenDispositivo'),
  );
  return {
    ninos: matriculados.map((m, i) => {
      http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
      const tokenDispositivo = tablets[Math.floor(i / POR_TABLET)];
      const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo, perfilId: m.estudianteId, pin: '4826' }), { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } }).json();
      if (!ingreso.accessToken) fail(`Un niño de carga no pudo ingresar: ${JSON.stringify(ingreso)}`);
      return { ...JSON_HEADERS, Authorization: `Bearer ${ingreso.accessToken}` };
    }),
  };
}

/** Cada iteración es un niño distinto haciendo su reto completo. */
export function hacerReto(datos) {
  const yo = datos.ninos[exec.scenario.iterationInTest];
  const reto = http.post(`${BASE}/diagnosticos`, null, { headers: yo, tags: { nombre: 'POST /diagnosticos' } });
  check(reto, { 'reto empezado': (r) => r.status === 201 });
  const id = reto.json('id');
  for (let i = 0; i < 20; i++) {
    const siguiente = http.get(`${BASE}/diagnosticos/${id}/siguiente-item`, { headers: yo, tags: { nombre: 'GET /diagnosticos/{id}/siguiente-item' } });
    check(siguiente, { 'pregunta sin respuesta correcta': (r) => r.status === 200 && !r.body.includes('indiceCorrecto') });
    const item = siguiente.json('item');
    if (!item) break;
    const respuesta = http.post(`${BASE}/diagnosticos/${id}/respuestas`, JSON.stringify({ itemId: item.itemId, indice: i % item.opciones.length }), {
      headers: yo,
      tags: { nombre: 'POST /diagnosticos/{id}/respuestas' },
    });
    check(respuesta, { 'respuesta guardada': (r) => r.status === 200 });
  }
  const fin = http.post(`${BASE}/diagnosticos/${id}/finalizar`, null, { headers: yo, tags: { nombre: 'POST /diagnosticos/{id}/finalizar' } });
  check(fin, { 'nivel por habilidad': (r) => r.status === 200 && r.json('habilidades').length === 5 });
}
