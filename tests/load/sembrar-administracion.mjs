// Una cuenta de administración con MFA y 20 000 registros de auditoría repartidos en 2 años (como una
// plataforma en uso), para el escenario k6 de la administración (scenarios/administracion.js, RF-076,
// RF-077, RNF-001). SOLO para desarrollo y CI (ver sembrado.mjs). Imprime solo la cabecera de su
// sesión (un token de prueba de 15 minutos, de una cuenta del dominio de pruebas que la limpieza borra).
//
// Uso (con la API en marcha):  node tests/load/sembrar-administracion.mjs
import { randomUUID } from 'node:crypto';

import { conPrisma, cuentaBackoffice, exigirEntornoLocal } from './sembrado.mjs';

const REGISTROS = 20_000;
const ACCIONES = ['LECTURA_PUBLICADA', 'PIN_RESTABLECIDO', 'CONSENTIMIENTO_OTORGADO', 'FAMILIAR_VINCULADO', 'DETALLE_ESTUDIANTE_CONSULTADO', 'MISION_CREADA'];
const RECURSO = { LECTURA_PUBLICADA: 'lectura', PIN_RESTABLECIDO: 'perfil_estudiante', CONSENTIMIENTO_OTORGADO: 'consentimiento', FAMILIAR_VINCULADO: 'perfil_estudiante', DETALLE_ESTUDIANTE_CONSULTADO: 'perfil_estudiante', MISION_CREADA: 'mision' };
const DOS_ANIOS = 2 * 365 * 86_400_000;

exigirEntornoLocal();
const cabecera = await conPrisma(async (prisma) => {
  const admin = await cuentaBackoffice(prisma, 'ADMIN_PLATAFORMA');
  const ahora = Date.now();
  for (let inicio = 0; inicio < REGISTROS; inicio += 5000) {
    await prisma.auditoria.createMany({
      data: Array.from({ length: 5000 }, (_, k) => {
        const i = inicio + k;
        const accion = ACCIONES[i % ACCIONES.length];
        return {
          id: randomUUID(),
          actorId: randomUUID(),
          actorRol: 'DOCENTE',
          accion,
          recursoTipo: RECURSO[accion],
          recursoId: randomUUID(),
          ip: `198.51.100.${(i % 250) + 1}`,
          ocurridoEn: new Date(ahora - Math.floor((i / REGISTROS) * (DOS_ANIOS - 86_400_000))),
        };
      }),
    });
  }
  return admin.Authorization;
});
console.log(cabecera);
