import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Escenario de carga: sesión de lectura (responder ítems).
 * Ejecutar: npm run test --workspace @lectoaventura/tests-load
 */
export const options = {
  vus: 25,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE = __ENV.API_URL ?? 'http://localhost:3001/api';

export default function () {
  const res = http.post(`${BASE}/lectura/demo`, JSON.stringify({ item: 'demo' }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'estado es 200': (r) => r.status === 200,
    'devuelve el módulo': (r) => r.json('modulo') === 'lectura',
  });

  sleep(1);
}
