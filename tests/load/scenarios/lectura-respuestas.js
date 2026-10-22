import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';

/**
 * Nivel 3 — Rendimiento de la lectura interactiva (k6): un aula de 40 niños de 9 años lee "Killa y
 * la llama" a la vez, de a 10 en paralelo, con todas sus actividades (una con error y pista).
 *   RF-040: corrección en el servidor → p95 < 300 ms.
 *   RF-046: reanudar la sesión (GET) → p95 < 300 ms.
 *   RF-047: cerrar la lectura sin errores.
 *   RF-052, RF-055 (Módulo 7): al terminar ve su perfil lector y sus próximas lecturas → p95 < 300 ms
 *   (RNF-001), con la maestría ya movida por cada respuesta (RF-053).
 *
 * Requisitos: API en modo desarrollo (bandeja de correos activa) y la lectura publicada:
 *   LECTURA=$(node tests/load/sembrar-lectura.mjs)
 *   k6 run -e LECTURA_ID=$LECTURA tests/load/scenarios/lectura-respuestas.js
 */
const BASE = __ENV.API_URL || 'http://localhost:3001/api/v1';
const LECTURA = __ENV.LECTURA_ID;
const CONTRASENA = 'Carga-Lectora-2026-k6';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NINOS = 40;
const POR_TABLET = 20;
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

export const options = {
  scenarios: {
    lectura: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: NINOS,
      maxDuration: '5m',
      exec: 'leer',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    'http_req_duration{nombre:POST /sesiones-lectura/{id}/respuestas}': ['p(95)<300'],
    'http_req_duration{nombre:GET /sesiones-lectura/{id}}': ['p(95)<300'],
    'http_req_duration{nombre:POST /sesiones-lectura/{id}/finalizar}': ['p(95)<800'],
    'http_req_duration{nombre:GET /yo/perfil-lector}': ['p(95)<300'],
    'http_req_duration{nombre:GET /yo/recomendaciones}': ['p(95)<300'],
    checks: ['rate>0.995'],
  },
};

function ipDispositivo() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
}

/** RF-046: cada envío lleva su clave de idempotencia (UUID v4). */
function clave() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Docente con un aula de 40 niños de 9 años, cada uno con su sesión en una de las tablets del aula. */
export function setup() {
  if (!LECTURA) fail('Falta -e LECTURA_ID (node tests/load/sembrar-lectura.mjs)');
  const email = `carga.lectura.${Date.now()}@e2e.lectoaventura.test`;
  const cabeceras = { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } };
  const registro = http.post(`${BASE}/auth/registro`, JSON.stringify({ nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' }), cabeceras);
  if (registro.status !== 201) fail(`No se pudo registrar la cuenta de carga: ${registro.status} ${registro.body}`);
  const correo = http.get(`${BASE}/dev/correos`).json().find((c) => c.para === email);
  http.post(`${BASE}/auth/verificar-correo`, JSON.stringify({ codigo: correo.enlace.split('codigo=')[1] }), cabeceras);
  const sesion = http.post(`${BASE}/auth/login`, JSON.stringify({ email, contrasena: CONTRASENA }), cabeceras).json();
  const docente = { ...JSON_HEADERS, Authorization: `Bearer ${sesion.accessToken}` };

  const aula = http.post(`${BASE}/aulas`, JSON.stringify({
    nombre: '4.° Lectura', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga',
    autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true,
  }), { headers: docente }).json();
  const anio = new Date().getFullYear() - 9;
  const csv = Array.from({ length: NINOS }, (_, i) => `Niño ${i + 1},${anio},1,${AVATARES[i % AVATARES.length]}`).join('\n');
  const { matriculados } = http.post(`${BASE}/aulas/${aula.id}/matriculas/importacion`, JSON.stringify({ csv }), { headers: docente }).json();
  if (!matriculados || matriculados.length !== NINOS) fail('No se matricularon los niños de carga');
  // RNF-019: hasta 30 ingresos por minuto en cada tablet, como en un aula real con varias tablets.
  const tablets = Array.from({ length: Math.ceil(NINOS / POR_TABLET) }, (_, i) =>
    http.post(`${BASE}/aulas/${aula.id}/dispositivos`, JSON.stringify({ nombre: `Tablet carga ${i + 1}` }), { headers: docente }).json('tokenDispositivo'),
  );
  return {
    ninos: matriculados.map((m, i) => {
      http.post(`${BASE}/estudiantes/${m.estudianteId}/pin/restablecer`, JSON.stringify({ pinNuevo: '4826' }), { headers: docente });
      const ingreso = http.post(`${BASE}/acceso-estudiante/login`, JSON.stringify({ tokenDispositivo: tablets[Math.floor(i / POR_TABLET)], perfilId: m.estudianteId, pin: '4826' }), { headers: { ...JSON_HEADERS, 'X-Forwarded-For': ipDispositivo() } }).json();
      if (!ingreso.accessToken) fail(`Un niño de carga no pudo ingresar: ${JSON.stringify(ingreso)}`);
      return { ...JSON_HEADERS, Authorization: `Bearer ${ingreso.accessToken}` };
    }),
  };
}

/** Lo que responde el niño en cada pregunta de la lectura de ejemplo (ver sembrar-lectura.mjs). */
function respuesta(sesion, p, primerIntento) {
  const oracion = (texto) => sesion.texto.parrafos.flatMap((x) => x.oraciones).find((x) => x.texto === texto).id;
  switch (p.enunciado) {
    case '¿Por qué Pancho no quiso comer?':
      return { indice: p.opciones.indexOf(primerIntento ? 'Estaba feliz' : 'Le dolía algo') }; // primero se equivoca: P1
    case 'Toca la oración que dice qué tenía Pancho.':
      return { oraciones: [oracion('Killa vio que tenía una espina en la pata.')] };
    case 'Ordena lo que pasó.':
      return { orden: ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'].map((t) => p.elementos.indexOf(t)) };
    case '¿Qué hizo bien Killa? Marca todas.':
      return { indices: [p.opciones.indexOf('Miró con atención'), p.opciones.indexOf('Lo ayudó con cuidado')] };
    case '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?':
      return { texto: 'Sí, porque así encontró la espina y lo curó' };
    default:
      return { indice: 0 };
  }
}

/** Cada iteración es un niño distinto leyendo la lectura completa. */
export function leer(datos) {
  const yo = datos.ninos[exec.scenario.iterationInTest];
  const inicio = http.post(`${BASE}/sesiones-lectura`, JSON.stringify({ lecturaId: LECTURA }), { headers: yo, tags: { nombre: 'POST /sesiones-lectura' } });
  check(inicio, { 'lectura abierta': (r) => r.status === 201 });
  const id = inicio.json('id');
  http.put(`${BASE}/sesiones-lectura/${id}/prediccion`, JSON.stringify({ texto: 'Creo que la llama se enfermará' }), { headers: yo, tags: { nombre: 'PUT /sesiones-lectura/{id}/prediccion' } });

  const vistos = {};
  for (let paso = 0; paso < 20; paso++) {
    const ver = http.get(`${BASE}/sesiones-lectura/${id}`, { headers: yo, tags: { nombre: 'GET /sesiones-lectura/{id}' } });
    check(ver, { 'sesión sin claves': (r) => r.status === 200 && !r.body.includes('indicesCorrectos') && !r.body.includes('explicacionModelada') });
    const sesion = ver.json();
    if (sesion.fase === 'HISTORIA') {
      http.post(`${BASE}/sesiones-lectura/${id}/decisiones`, JSON.stringify({ nodoId: sesion.historia.nodo.id, opcion: 0 }), { headers: yo, tags: { nombre: 'POST /sesiones-lectura/{id}/decisiones' } });
      continue;
    }
    if (!sesion.pregunta) break;
    const p = sesion.pregunta;
    const cuerpo = { itemId: p.itemId, idempotencyKey: clave(), ...respuesta(sesion, p, !vistos[p.itemId]) };
    vistos[p.itemId] = true;
    const r = http.post(`${BASE}/sesiones-lectura/${id}/respuestas`, JSON.stringify(cuerpo), { headers: yo, tags: { nombre: 'POST /sesiones-lectura/{id}/respuestas' } });
    check(r, { 'respuesta corregida': (x) => x.status === 200 && ['CORRECTA', 'INCORRECTA', 'ENVIADA'].includes(x.json('resultado')) });
  }
  const fin = http.post(`${BASE}/sesiones-lectura/${id}/finalizar`, JSON.stringify({ reflexion: 'Pensé que se enfermaba y era una espina' }), { headers: yo, tags: { nombre: 'POST /sesiones-lectura/{id}/finalizar' } });
  check(fin, { 'lectura terminada': (r) => r.status === 200 && r.json('fase') === 'FINALIZADA' });

  const perfil = http.get(`${BASE}/yo/perfil-lector`, { headers: yo, tags: { nombre: 'GET /yo/perfil-lector' } });
  check(perfil, { 'perfil con 5 habilidades medidas': (r) => r.status === 200 && r.json('habilidades').length === 5 && r.json('conDatos') === true });
  const recomendaciones = http.get(`${BASE}/yo/recomendaciones`, { headers: yo, tags: { nombre: 'GET /yo/recomendaciones' } });
  check(recomendaciones, { 'entre 0 y 3 recomendaciones': (r) => r.status === 200 && r.json().length <= 3 });
}
