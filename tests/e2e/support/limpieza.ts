import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { borrarCatalogoE2E } from './escuela';
import { DOMINIO_E2E } from './iam';

/**
 * Teardown global: borra las cuentas creadas por las pruebas (dominio e2e.lectoaventura.test)
 * y todo lo que depende de ellas, para no ensuciar la base del entorno. Las aulas arrastran sus
 * matrículas, asignaciones e invitaciones; las cuentas, sus vínculos familiares. La auditoría
 * (admin.auditoria) no se borra: es de solo agregar por diseño (RF-077). Las misiones con lecturas de
 * prueba, el mapa, los retos, las sesiones de lectura, el perfil lector y la racha y retos del día de los
 * niños de prueba también se borran.
 */
export default async function limpieza(): Promise<void> {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  const prisma = new PrismaClient();
  try {
    const cuentas = await prisma.cuenta.findMany({ where: { email: { endsWith: `@${DOMINIO_E2E}` } }, select: { id: true } });
    const idsCuentas = cuentas.map((c) => c.id);
    const perfiles = await prisma.perfilEstudiante.findMany({ where: { cuentaResponsableId: { in: idsCuentas } }, select: { id: true } });
    const idsPerfiles = perfiles.map((p) => p.id);
    const sujetos = [...idsCuentas, ...idsPerfiles];
    const sesiones = await prisma.sesion.findMany({ where: { sujetoId: { in: sujetos } }, select: { id: true } });
    await prisma.refreshTokenUsado.deleteMany({ where: { sesionId: { in: sesiones.map((s) => s.id) } } });
    await prisma.sesion.deleteMany({ where: { sujetoId: { in: sujetos } } });
    await prisma.exportacion.deleteMany({ where: { perfilId: { in: idsPerfiles } } });
    await prisma.aula.deleteMany({ where: { docenteId: { in: idsCuentas } } });
    // Aventura: misiones armadas con lecturas de prueba (arrastran su progreso) y el mapa de los niños
    // de prueba (sin llave foránea entre schemas, SRS §7).
    const idsLecturas = (await prisma.lectura.findMany({ where: { autorId: { in: idsCuentas } }, select: { id: true } })).map((l) => l.id);
    await prisma.mision.deleteMany({ where: { lecturas: { some: { lecturaId: { in: idsLecturas } } } } });
    await prisma.progresoMision.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    await prisma.progresoMundo.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    // Diagnóstico: los retos de los niños de prueba (arrastran sus respuestas).
    await prisma.diagnostico.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    // Progreso: el perfil lector de los niños de prueba (maestría, historial y recomendaciones).
    await prisma.historialMaestria.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    await prisma.maestriaHabilidad.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    await prisma.recomendacion.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    // Gamificación: racha, retos del día y avances. El libro de puntos, las insignias otorgadas y los
    // canjes no se borran: son de solo agregar por diseño (RN-13, RF-062), como la auditoría.
    await prisma.racha.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    await prisma.retoDiario.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    await prisma.avanceInsignia.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    await prisma.eventoAplicado.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    // Lectura: las sesiones de los niños de prueba (arrastran respuestas, pistas, defensas, decisiones y valoraciones).
    await prisma.sesionLectura.deleteMany({ where: { estudianteId: { in: idsPerfiles } } });
    // Lecturas escritas por cuentas de prueba (arrastran versiones, oraciones, actividades y recursos).
    await prisma.lectura.deleteMany({ where: { autorId: { in: idsCuentas } } });
    // Seguimiento docente y familiar: resúmenes semanales registrados y preferencias de las cuentas de prueba.
    await prisma.resumenSemanalEnviado.deleteMany({ where: { docenteId: { in: idsCuentas } } });
    await prisma.resumenFamiliarEnviado.deleteMany({ where: { cuentaId: { in: idsCuentas } } });
    await prisma.preferenciaFamiliar.deleteMany({ where: { cuentaId: { in: idsCuentas } } });
    await prisma.cuenta.deleteMany({ where: { id: { in: idsCuentas } } });
    await borrarCatalogoE2E(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
