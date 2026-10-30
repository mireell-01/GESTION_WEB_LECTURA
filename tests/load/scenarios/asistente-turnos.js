import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * Nivel 3 — Rendimiento del asistente de lectura (k6), con un aula de 30 niños que lo tiene activado:
 *   RF-072, RF-073 / RNF-007: cada mensaje al guía empieza a responder (primer evento SSE) en p95 < 3 s,
 *   y nunca trae la respuesta de la pregunta.
 *   RF-074: cada niño hace sus 10 intercambios de la lectura (300 en total, 10 niños a la vez).
 *   Lo conversado al volver a abrir la ayuda: p95 < 300 ms.
 *
 * Requisitos: API en marcha y "Killa y la llama" publicada (sembrar-lectura.mjs imprime su id).
 * Ejecutar:   k6 run -e LECTURA_ID=$(node tests/load/sembrar-lectura.mjs) tests/load/scenarios/asistente-turnos.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const LECTURA = __ENV.LECTURA_ID;
const CONTRASENA = 'Carga-Lectora-2026-k6';
const NINOS = 30;
const INTERCAMBIOS = 10;
const POR_TABLET = 25;
const AVATARES = ['zorro', 'leon', 'buho', 'koala', 'tortuga', 'pinguino'];
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const MENSAJES = ['No entiendo la pregunta', '¿dónde busco?', 'dime la respuesta', '¿es la B?', '¿qué significa espina?', '¿cómo empiezo?', 'hola', 'ayúdame'];

const primerToken = new Trend('asistente_primer_token', true);

export const options = {
  scenarios: {
    guia_aula: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: NINOS * INTERCAMBIOS,
      maxDuration: '3m',
      exec: 'conversar',
      tags: { escenario: 'guia_aula' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    asistente_primer_token: ['p(95)<3000'],
    'http_req_duration{nombre:POST /sesiones-lectura/{id}/asistente/turnos}': ['p(95)<3000'],
    'http_req_duration{nombre:GET /sesiones-lectura/{id}/asistente}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** Una docente con su aula de 30, el asistente activado para todos y cada niño en la inferencia de Killa. */
export function setup() {
  if (!LECTURA) fail('Falta -e LECTURA_ID (node tests/load/sembrar-lectura.mjs)');
  const email = `carga.asistente.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Asistente', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${AVATARES[i % AVATARES.length]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  const activacion = http.put(`${BASE}/aulas/${aula.id}/asistente`, JSON.stringify({ activo: true }), { headers: docente });
  if (activacion.status !== 200) fail(`No se pudo activar el asistente del aula: ${activacion.status}`);
  const tablets = Array.from({ length: Math.ceil(NINOS / POR_TABLET) }, (_, i) =>
    http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: `Tablet carga ${i + 1}` }), { headers: docente }).json('tokenDispositivo'),
  );
  return {
    ninos: matriculados.map((m, i) => {
      http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
      const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo: tablets[Math.floor(i / POR_TABLET)], perfilId: m.estudianteId, pin: '4826' }), { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } }).json();
      if (!ingreso.accessToken) fail(`Un niño de carga no pudo ingresar: ${JSON.stringify(ingreso)}`);
      const nino = { ...JSON_HEADERS, Authorization: `Bearer ${ingreso.accessToken}` };
      const id = http.post(`${BASE}/sesiones-lectura`, JSON.stringify({ lecturaId: LECTURA }), { headers: nino }).json('id');
      http.put(`${BASE}/sesiones-lectura/${id}/prediccion`, JSON.stringify({ texto: 'Creo que la llama se enfermará' }), { headers: nino });
      return { cabeceras: nino, sesion: id };
    }),
  };
}

/** El niño escribe al guía (o toca una ayuda); de vez en cuando vuelve a abrir la ayuda y ve lo conversado. */
export function conversar(datos) {
  const i = exec.scenario.iterationInTest;
  const nino = datos.ninos[i % NINOS];
  // Como en un aula: todas las tablets salen por la IP del colegio.
  const cabeceras = { ...nino.cabeceras, 'X-Forwarded-For': '10.0.0.1' };
  const turno = http.post(`${BASE}/sesiones-lectura/${nino.sesion}/asistente/turnos`, JSON.stringify({ mensaje: MENSAJES[i % MENSAJES.length] }), {
    headers: cabeceras,
    tags: { nombre: 'POST /sesiones-lectura/{id}/asistente/turnos' },
  });
  primerToken.add(turno.timings.waiting);
  check(turno, {
    'responde por eventos con su cierre': (r) => r.status === 200 && r.body.startsWith('data: ') && r.body.includes('"tipo":"fin"'),
    'nunca da la respuesta': (r) => r.status === 200 && !r.body.includes('Le dolía algo'),
    'cuenta los intercambios (RF-074)': (r) => r.status === 200 && /"restantes":[0-9],/.test(r.body),
  });
  if (i % 5 === 0) {
    const estado = http.get(`${BASE}/sesiones-lectura/${nino.sesion}/asistente`, { headers: cabeceras, tags: { nombre: 'GET /sesiones-lectura/{id}/asistente' } });
    check(estado, { 'lo conversado sigue ahí': (r) => r.status === 200 && r.json('turnos').length >= 2 });
  }
}
