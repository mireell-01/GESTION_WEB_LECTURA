import { beforeEach, describe, expect, it } from 'vitest';

import {
  DatoMisionInvalidoError,
  DiagnosticoPendienteError,
  LimiteMisionesError,
  MundoBloqueadoError,
} from '../../../../src/modules/aventura/domain/errors/errores-aventura';
import { EVENTOS_AVENTURA } from '../../../../src/modules/aventura/domain/events/eventos-aventura';
import { NoEncontradoError, RangoEdad } from '../../../../src/modules/shared-kernel/public-api';
import { uuidV7 } from '../../../../src/modules/shared-kernel/infrastructure/uuid';
import { crearEntornoAventura, EntornoAventura } from '../dobles';

/** Nivel 1 — Casos de uso de Aventura con dobles (RF-030 a RF-033, RN-05, RN-09). */
const NINO = 'nino-9-anios';
const EDITORA = 'editora';

describe('Aventura: mapa, misiones, progreso y backoffice', () => {
  let e: EntornoAventura;

  beforeEach(() => {
    e = crearEntornoAventura();
    e.identidad.rangos.set(NINO, 'R2');
  });

  /** Una misión de la edad indicada con lecturas nuevas publicadas; devuelve sus ids. */
  const mision = async (mundo: number, lecturas = 1, rangoEdad: RangoEdad = 'R2', titulo = `Misión ${mundo}.${Math.random().toString(36).slice(2, 6)}`) => {
    const lecturaIds = Array.from({ length: lecturas }, (_, i) => e.fichas.publicar(`${titulo} · lectura ${i + 1}`, rangoEdad));
    const m = await e.misiones.crear({ editorId: EDITORA, mundoId: `mundo-${mundo}`, rangoEdad, titulo, descripcion: '', lecturaIds });
    return { misionId: m.id, lecturaIds };
  };
  const terminar = async (lecturaId: string) => {
    e.avance.marcar(NINO, lecturaId, 'FINALIZADA');
    await e.progreso.registrarAvance(NINO, lecturaId);
  };
  const estadosDelMapa = async () => (await e.mapa.mapa(NINO)).mundos.map((m) => m.estado);

  describe('Mapa (RF-030, RF-033, RN-05)', () => {
    it('sin el Módulo 5 todavía, el niño empieza en el Explorador con el resto bloqueado; se posiciona una sola vez', async () => {
      const mapa = await e.mapa.mapa(NINO);
      expect(mapa.diagnosticoPendiente).toBe(false);
      expect(mapa.mundoActual).toBe(1);
      expect(mapa.mundos.map((m) => [m.numero, m.estado])).toEqual([[1, 'DISPONIBLE'], [2, 'BLOQUEADO'], [3, 'BLOQUEADO'], [4, 'BLOQUEADO'], [5, 'BLOQUEADO']]);
      expect(mapa.mundos.some((m) => m.celebrar)).toBe(false);
      await e.mapa.mapa(NINO);
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.ESTUDIANTE_POSICIONADO)).toHaveLength(1);
      expect(e.bus.publicados[0]?.datos).toEqual({ estudianteId: NINO, mundoInicial: 1, origen: 'SIN_DIAGNOSTICO' });
    });

    it('RN-05: con el diagnóstico pendiente no hay mapa ni misiones, y no se guarda nada', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'PENDIENTE' });
      const mapa = await e.mapa.mapa(NINO);
      expect(mapa.diagnosticoPendiente).toBe(true);
      expect(mapa.mundoActual).toBeNull();
      expect(new Set(mapa.mundos.map((m) => m.estado))).toEqual(new Set(['BLOQUEADO']));
      await expect(e.mapa.misiones(NINO, 'mundo-1')).rejects.toThrow(DiagnosticoPendienteError);
      expect(e.repo.progresos.size).toBe(0);
    });

    it('RF-033: con LIT 70 y VOC 68 en el diagnóstico empieza en el Detective y el Explorador aparece completado', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 70, VOC: 68, INF: 40, CRI: 30, ARG: 20 } });
      expect(await estadosDelMapa()).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
      expect(e.bus.publicados[0]?.datos).toMatchObject({ mundoInicial: 2, origen: 'DIAGNOSTICO' });
    });

    it('muestra la maestría de las habilidades foco cuando el perfil lector la conoce, y las misiones de su edad', async () => {
      await mision(1);
      await mision(1);
      await mision(1, 1, 'R3'); // de otra edad: no cuenta para este niño
      e.maestria.valores.set(NINO, { LIT: 72.5, INF: 50 });
      const [explorador] = (await e.mapa.mapa(NINO)).mundos;
      expect(explorador?.habilidadesFoco).toEqual([
        { codigo: 'LIT', nombre: 'Comprensión literal', maestria: 72.5 },
        { codigo: 'VOC', nombre: 'Vocabulario', maestria: null },
      ]);
      expect(explorador?.misiones).toEqual({ completadas: 0, total: 2, necesarias: 3 });
    });

    it('dos pedidos simultáneos la primera vez ven el mismo mapa y se posiciona una sola vez', async () => {
      const [a, b] = await Promise.all([e.mapa.mapa(NINO), e.mapa.mapa(NINO)]);
      expect(a.mundos.map((m) => m.estado)).toEqual(b.mundos.map((m) => m.estado));
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.ESTUDIANTE_POSICIONADO)).toHaveLength(1);
    });

    it('un perfil inexistente o desactivado no tiene mapa', async () => {
      await expect(e.mapa.mapa('otro')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Misiones de un mundo (RF-032)', () => {
    it('lista las misiones de su edad en orden, con sus lecturas publicadas y el avance de cada una', async () => {
      const primera = await mision(1, 2, 'R2', 'La cueva');
      await mision(1, 1, 'R2', 'El río');
      await mision(1, 1, 'R1', 'Para los pequeños');
      e.avance.marcar(NINO, primera.lecturaIds[0] as string, 'EN_CURSO');
      e.fichas.archivar(primera.lecturaIds[1] as string); // retirada: el niño ya no la ve
      const { mundo, misiones } = await e.mapa.misiones(NINO, 'mundo-1');
      expect(mundo).toMatchObject({ numero: 1, estado: 'DISPONIBLE' });
      expect(misiones.map((m) => [m.orden, m.titulo, m.estado])).toEqual([[1, 'La cueva', 'PENDIENTE'], [2, 'El río', 'PENDIENTE']]);
      expect(misiones[0]?.lecturas).toEqual([{ id: primera.lecturaIds[0], titulo: 'La cueva · lectura 1', nivelDificultad: 2, avance: 'EN_CURSO' }]);
    });

    it('RF-030: un mundo bloqueado no se abre; uno que no existe da 404', async () => {
      await expect(e.mapa.misiones(NINO, 'mundo-2')).rejects.toThrow(MundoBloqueadoError);
      await expect(e.mapa.misiones(NINO, 'mundo-9')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Progreso por eventos (RF-031, RF-032, RF-033)', () => {
    it('RF-033: el diagnóstico posiciona una sola vez (si ya tenía mapa, no cambia)', async () => {
      await e.progreso.posicionarTrasDiagnostico(NINO, { LIT: 80, VOC: 80 });
      await e.progreso.posicionarTrasDiagnostico(NINO, { LIT: 10, VOC: 10 });
      expect(await estadosDelMapa()).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    });

    it('RF-032: la misión pasa a en curso y luego a completada cuando terminó todas sus lecturas; nunca retrocede', async () => {
      await e.mapa.mapa(NINO);
      const { misionId, lecturaIds } = await mision(1, 2);
      e.avance.marcar(NINO, lecturaIds[0] as string, 'EN_CURSO');
      await e.progreso.registrarAvance(NINO, lecturaIds[0] as string);
      expect((await e.repo.estadosMision(NINO, [misionId])).get(misionId)).toBe('EN_CURSO');
      await terminar(lecturaIds[0] as string);
      await terminar(lecturaIds[1] as string);
      expect((await e.repo.estadosMision(NINO, [misionId])).get(misionId)).toBe('COMPLETADA');
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.MISION_COMPLETADA)).toHaveLength(1);
      // Agregar una lectura nueva a una misión ya completada no le quita lo logrado.
      const otra = e.fichas.publicar('Una más');
      await e.misiones.actualizar({ editorId: EDITORA, misionId, titulo: 'Misión ampliada', descripcion: '', lecturaIds: [...lecturaIds, otra] });
      await e.progreso.registrarAvance(NINO, lecturaIds[0] as string);
      expect((await e.repo.estadosMision(NINO, [misionId])).get(misionId)).toBe('COMPLETADA');
    });

    it('sin mapa (RN-05) o en un mundo bloqueado, leer no avanza misiones', async () => {
      const bloqueada = await mision(3);
      await terminar(bloqueada.lecturaIds[0] as string); // aún sin mapa
      expect(e.repo.estados.size).toBe(0);
      await e.mapa.mapa(NINO);
      await terminar(bloqueada.lecturaIds[0] as string); // mundo 3 bloqueado
      expect(e.repo.estados.size).toBe(0);
    });

    it('RF-031, RN-09: con LIT y VOC ≥ 65 y 3 misiones completadas se abre el Detective, con celebración', async () => {
      await e.mapa.mapa(NINO);
      const misiones = [await mision(1), await mision(1), await mision(1)];
      for (const m of misiones.slice(0, 2)) await terminar(m.lecturaIds[0] as string);
      e.maestria.valores.set(NINO, { LIT: 70, VOC: 66 });
      await e.progreso.evaluarDesbloqueo(NINO);
      expect((await estadosDelMapa())[1]).toBe('BLOQUEADO'); // faltaba una misión
      await terminar(misiones[2]?.lecturaIds[0] as string);
      const mapa = await e.mapa.mapa(NINO);
      expect(mapa.mundos.map((m) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
      expect(mapa.mundos[1]?.celebrar).toBe(true);
      expect(e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO)?.datos).toEqual({
        estudianteId: NINO, mundoCompletado: 1, mundoDesbloqueado: 2,
      });
      await e.mapa.marcarCelebrado(NINO, 'mundo-2');
      expect((await e.mapa.mapa(NINO)).mundos[1]?.celebrar).toBe(false);
    });

    it('RN-09: sin maestría conocida (Módulo 7 aún no) o con una habilidad foco bajo 65, no se desbloquea', async () => {
      await e.mapa.mapa(NINO);
      for (let i = 0; i < 3; i++) await terminar((await mision(1)).lecturaIds[0] as string);
      await e.progreso.evaluarDesbloqueo(NINO);
      e.maestria.valores.set(NINO, { LIT: 90, VOC: 64 });
      await e.progreso.evaluarDesbloqueo(NINO);
      expect((await estadosDelMapa())[1]).toBe('BLOQUEADO');
      expect(e.bus.nombres()).not.toContain(EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO);
    });

    it('lo ya leído cuenta al abrir el mundo nuevo: puede abrir dos mundos seguidos', async () => {
      await e.mapa.mapa(NINO);
      const delDos = [await mision(2), await mision(2), await mision(2)];
      for (const m of delDos) e.avance.marcar(NINO, m.lecturaIds[0] as string, 'FINALIZADA'); // leídas antes, p. ej. asignadas por la docente
      for (let i = 0; i < 3; i++) await terminar((await mision(1)).lecturaIds[0] as string);
      e.maestria.valores.set(NINO, { LIT: 70, VOC: 70, INF: 70 });
      await e.progreso.evaluarDesbloqueo(NINO);
      expect(await estadosDelMapa()).toEqual(['COMPLETADO', 'COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO']);
      expect(e.bus.nombres().filter((n) => n === EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO)).toHaveLength(2);
    });

    it('completar el último mundo no abre otro; un evento simultáneo no desbloquea dos veces', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 99, VOC: 99 } });
      await e.mapa.mapa(NINO);
      e.maestria.valores.set(NINO, { LIT: 99, VOC: 99, INF: 99, CRI: 99, ARG: 99 });
      const delDetective: string[] = [];
      for (const numero of [2, 3, 4, 5]) {
        for (let i = 0; i < 3; i++) {
          const lectura = (await mision(numero)).lecturaIds[0] as string;
          e.avance.marcar(NINO, lectura, 'FINALIZADA');
          if (numero === 2) delDetective.push(lectura);
        }
      }
      // Otro evento del mismo niño completa el mundo al mismo tiempo: este no desbloquea otra vez.
      e.repo.otroEventoGanaElAvance = true;
      for (const lectura of delDetective) await e.progreso.registrarAvance(NINO, lectura);
      expect(e.bus.nombres()).not.toContain(EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO);
      expect((await estadosDelMapa())[1]).toBe('DISPONIBLE');
      e.repo.otroEventoGanaElAvance = false;
      await e.progreso.evaluarDesbloqueo(NINO);
      expect(new Set(await estadosDelMapa())).toEqual(new Set(['COMPLETADO']));
      const desbloqueos = e.bus.publicados.filter((p) => p.nombreEvento === EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO);
      expect(desbloqueos).toHaveLength(4);
      expect(desbloqueos.at(-1)?.datos).toMatchObject({ mundoCompletado: 5, mundoDesbloqueado: null });
      expect((await e.mapa.mapa(NINO)).mundoActual).toBeNull();
    });
  });

  describe('Backoffice de misiones', () => {
    it('crea misiones en orden por mundo y edad, auditadas con quién las hizo', async () => {
      const a = await mision(1, 1, 'R2', 'Primera');
      const b = await mision(1, 1, 'R2', 'Segunda');
      await mision(1, 1, 'R1', 'De otra edad');
      expect((await e.misiones.misiones('mundo-1', 'R2')).map((m) => [m.orden, m.id])).toEqual([[1, a.misionId], [2, b.misionId]]);
      expect(e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_AVENTURA.MISION_CREADA)?.datos).toMatchObject({ actorId: EDITORA, mundoId: 'mundo-1', rangoEdad: 'R2' });
      const mundos = await e.misiones.mundos();
      expect(mundos[0]?.misionesPorEdad).toEqual({ R1: 1, R2: 2, R3: 0 });
      expect(mundos.map((m) => m.numero)).toEqual([1, 2, 3, 4, 5]);
    });

    it('solo admite lecturas publicadas de la misma edad que la misión', async () => {
      const deOtraEdad = e.fichas.publicar('El volcán', 'R3');
      await expect(e.misiones.crear({ editorId: EDITORA, mundoId: 'mundo-1', rangoEdad: 'R2', titulo: 'Volcanes', descripcion: '', lecturaIds: [deOtraEdad] })).rejects.toThrow(
        '"El volcán" es para 10–12 años y la misión es para 8–9 años',
      );
      await expect(e.misiones.crear({ editorId: EDITORA, mundoId: 'mundo-1', rangoEdad: 'R2', titulo: 'Fantasma', descripcion: '', lecturaIds: [uuidV7()] })).rejects.toThrow('no están publicadas');
      await expect(e.misiones.crear({ editorId: EDITORA, mundoId: 'mundo-9', rangoEdad: 'R2', titulo: 'Sin mundo', descripcion: '', lecturaIds: [deOtraEdad] })).rejects.toThrow(NoEncontradoError);
      expect(e.repo.misionesGuardadas.size).toBe(0);
    });

    it('SRS §7: hasta 20 misiones por mundo y edad', async () => {
      for (let i = 0; i < 20; i++) await mision(4, 1, 'R1');
      await expect(mision(4, 1, 'R1')).rejects.toThrow(LimiteMisionesError);
      await expect(mision(4, 1, 'R2')).resolves.toBeDefined();
    });

    it('actualiza una misión y marca las lecturas que se retiraron de la biblioteca', async () => {
      const { misionId, lecturaIds } = await mision(1, 2);
      e.fichas.archivar(lecturaIds[1] as string);
      const [vista] = await e.misiones.misiones('mundo-1', 'R2');
      expect(vista?.lecturas[1]).toEqual({ id: lecturaIds[1], titulo: 'Lectura retirada de la biblioteca', nivelDificultad: null, publicada: false });
      await expect(e.misiones.actualizar({ editorId: EDITORA, misionId, titulo: 'Igual', descripcion: '', lecturaIds })).rejects.toThrow('no están publicadas');
      const actualizada = await e.misiones.actualizar({ editorId: EDITORA, misionId, titulo: 'Solo la primera', descripcion: 'Corta', lecturaIds: [lecturaIds[0] as string] });
      expect(actualizada).toMatchObject({ titulo: 'Solo la primera', descripcion: 'Corta', lecturas: [{ id: lecturaIds[0], publicada: true }] });
      await expect(e.misiones.actualizar({ editorId: EDITORA, misionId: 'no-existe', titulo: 'X y Z', descripcion: '', lecturaIds })).rejects.toThrow(NoEncontradoError);
      expect(e.bus.nombres()).toContain(EVENTOS_AVENTURA.MISION_ACTUALIZADA);
    });

    it('reordena con todas las misiones del mundo y edad, una vez cada una', async () => {
      const [a, b, c] = [await mision(2), await mision(2), await mision(2)];
      const nuevo = [c?.misionId, a?.misionId, b?.misionId] as string[];
      const vista = await e.misiones.reordenar({ editorId: EDITORA, mundoId: 'mundo-2', rangoEdad: 'R2', misionIds: nuevo });
      expect(vista.map((m) => m.id)).toEqual(nuevo);
      expect(vista.map((m) => m.orden)).toEqual([1, 2, 3]);
      await expect(e.misiones.reordenar({ editorId: EDITORA, mundoId: 'mundo-2', rangoEdad: 'R2', misionIds: nuevo.slice(0, 2) })).rejects.toThrow(DatoMisionInvalidoError);
      await expect(e.misiones.reordenar({ editorId: EDITORA, mundoId: 'mundo-2', rangoEdad: 'R2', misionIds: [nuevo[0], nuevo[0], nuevo[1]] as string[] })).rejects.toThrow('una vez cada una');
      expect(e.bus.nombres()).toContain(EVENTOS_AVENTURA.MISIONES_REORDENADAS);
    });

    it('las lecturas disponibles son las publicadas de esa edad, por título', async () => {
      e.fichas.publicar('Zorro', 'R1');
      e.fichas.publicar('Abeja', 'R1');
      e.fichas.publicar('Volcán', 'R3');
      expect((await e.misiones.lecturasDisponibles('R1')).map((f) => f.titulo)).toEqual(['Abeja', 'Zorro']);
    });
  });
});
