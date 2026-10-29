import { beforeEach, describe, expect, it } from 'vitest';

import { EnlaceBajaInvalidoError } from '../../../../src/modules/reporting/application/use-cases/preferencias-familia.use-case';
import { parrafoHijo } from '../../../../src/modules/reporting/application/use-cases/resumen-familiar.use-case';
import { CONSEJOS_FAMILIA, CONSEJOS_HABITO } from '../../../../src/modules/reporting/domain/services/acompanamiento-familiar';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoFamilia, EntornoFamilia } from '../dobles-familia';

/** Nivel 1 — Casos de uso del acompañamiento familiar con dobles (RF-068 a RF-070, RN-17). */
const CARMEN = '0192f1c4-7a10-7c3e-9b2a-00000000000a';
const JOSE = '0192f1c4-7a10-7c3e-9b2a-00000000000b';
const ELENA = '0192f1c4-7a10-7c3e-9b2a-00000000000c';
const MATEO = 'est-mateo';
const LUCIA = 'est-lucia';
const PEDRO = 'est-pedro';
const BENJA = 'est-benja';
const DOMINGO_1830 = new Date('2026-10-25T23:30:00Z'); // domingo 25, 18:30 en Lima

describe('Acompañamiento familiar: panel por hijo, preferencias y resumen semanal', () => {
  let e: EntornoFamilia;

  beforeEach(() => {
    e = crearEntornoFamilia();
    e.hijos.porCuenta.set(CARMEN, [
      { id: LUCIA, alias: 'Lucía', avatar: 'koala', rangoEdad: 'R2', activo: true, relacion: 'RESPONSABLE' },
      { id: MATEO, alias: 'Mateo', avatar: 'leon', rangoEdad: 'R2', activo: true, relacion: 'VINCULADO' },
    ]);
    e.hijos.porCuenta.set(JOSE, [{ id: PEDRO, alias: 'Pedro', avatar: 'panda', rangoEdad: 'R1', activo: false, relacion: 'RESPONSABLE' }]);
    e.hijos.porCuenta.set(ELENA, [{ id: BENJA, alias: 'Benja', avatar: 'tigre', rangoEdad: 'R3', activo: true, relacion: 'RESPONSABLE' }]);
    e.repo.familias.set(CARMEN, [MATEO, LUCIA]);
    e.repo.familias.set(JOSE, [PEDRO]);
    e.repo.familias.set(ELENA, [BENJA]);

    e.repo.maestria(MATEO, { LIT: 80, INF: 31, VOC: 48, CRI: 70, ARG: 66 });
    e.repo.avances.set(MATEO, { lecturasTerminadas: 3, mundosCompletados: 1, mundoActual: { numero: 2, nombre: 'Detective' }, puntos: 120, insignias: 2 });
    e.repo.actividad.set(MATEO, new Date('2026-10-20T20:00:00Z'));
    e.repo.semanal.push(
      { estudianteId: MATEO, semana: '2026-10-19', lecturas: 2, minutos: 25.4, respuestas: 14 },
      { estudianteId: MATEO, semana: '2026-10-12', lecturas: 0, minutos: 0.3, respuestas: 2 },
    );
    e.realizadas.porEstudiante.set(MATEO, [{ lecturaId: 'l-killa', finalizadaEn: new Date('2026-10-20T20:00:00Z') }]);
    e.fichas.lista.push(
      { id: 'l-killa', titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', habilidadesObjetivo: ['INF', 'ARG'] },
      { id: 'l-condor', titulo: 'El cóndor', rangoEdad: 'R2', nivelDificultad: 3, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
      { id: 'l-r3', titulo: 'Para grandes', rangoEdad: 'R3', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['INF', 'VOC'] },
    );
  });

  describe('Panel por hijo (RF-068, RF-069)', () => {
    it('RN-17: un niño que no está vinculado a la cuenta responde como si no existiera', async () => {
      await expect(e.panel.panel(CARMEN, PEDRO)).rejects.toBeInstanceOf(NoEncontradoError);
      await expect(e.panel.panel(JOSE, MATEO)).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('su semana, su avance, sus habilidades y cómo acompañar en casa las que necesitan refuerzo', async () => {
      const p = await e.panel.panel(CARMEN, MATEO);
      expect(p.estudiante).toEqual({ id: MATEO, alias: 'Mateo', avatar: 'leon', rangoEdad: 'R2', activo: true, relacion: 'VINCULADO' });
      expect(p.actualizadoEn).toBe('2026-10-21T14:55:00.000Z');
      // Si leyó algo, al menos 1 minuto.
      expect(p.semana).toEqual({
        actual: { semana: '2026-10-19', minutos: 25, lecturas: 2, respuestas: 14 },
        anterior: { semana: '2026-10-12', minutos: 1, lecturas: 0, respuestas: 2 },
      });
      expect(p.avance).toEqual({
        lecturasTerminadas: 3,
        mundosCompletados: 1,
        mundoActual: { numero: 2, nombre: 'Detective' },
        puntos: 120,
        insignias: 2,
        ultimaActividad: '2026-10-20T20:00:00.000Z',
      });
      expect(p.habilidades.map((h) => [h.habilidad, h.valor, h.nivel])).toEqual([
        ['LIT', 80, 'A'],
        ['INF', 31, 'C'],
        ['VOC', 48, 'B'],
        ['CRI', 70, 'A'],
        ['ARG', 66, 'A'],
      ]);
      // RF-069: 2 consejos de su edad por habilidad; la lectura de su edad que la trabaja y no terminó.
      expect(p.aReforzar).toEqual([
        { habilidad: 'INF', valor: 31, consejos: CONSEJOS_FAMILIA.INF.slice(0, 2).map((c) => c.texto), lectura: { id: 'l-condor', titulo: 'El cóndor' } },
        { habilidad: 'VOC', valor: 48, consejos: CONSEJOS_FAMILIA.VOC.slice(0, 2).map((c) => c.texto), lectura: null },
      ]);
      expect(p.habito).toEqual(CONSEJOS_HABITO);
    });

    it('un hijo que aún no empieza: todo en cero, sin mundo ni habilidades por reforzar', async () => {
      const p = await e.panel.panel(CARMEN, LUCIA);
      expect(p.semana.actual).toEqual({ semana: '2026-10-19', minutos: 0, lecturas: 0, respuestas: 0 });
      expect(p.avance).toEqual({ lecturasTerminadas: 0, mundosCompletados: 0, mundoActual: null, puntos: 0, insignias: 0, ultimaActividad: null });
      expect(p.habilidades.every((h) => h.valor === null)).toBe(true);
      expect(p.aReforzar).toEqual([]);
    });
  });

  describe('Preferencias (RF-070)', () => {
    it('recibe el resumen salvo que se dé de baja; lo cambia desde su panel', async () => {
      expect(await e.preferencias.consultar(CARMEN)).toEqual({ resumenSemanal: true });
      expect(await e.preferencias.cambiar(CARMEN, false)).toEqual({ resumenSemanal: false });
      expect(await e.preferencias.consultar(CARMEN)).toEqual({ resumenSemanal: false });
    });

    it('baja con un clic con el enlace firmado del correo, y deshacerla desde la misma página', async () => {
      const token = e.firma.token(CARMEN);
      expect(await e.preferencias.porEnlace(token, false)).toEqual({ resumenSemanal: false });
      expect(e.repo.prefs.get(CARMEN)).toBe(false);
      expect(await e.preferencias.porEnlace(token, true)).toEqual({ resumenSemanal: true });
    });

    it('un enlace alterado o incompleto no cambia nada (400)', async () => {
      const token = e.firma.token(CARMEN);
      for (const malo of [`${token.slice(0, -1)}x`, '', 'cualquier-cosa']) {
        const error = await e.preferencias.porEnlace(malo, false).catch((x: unknown) => x);
        expect(error).toBeInstanceOf(EnlaceBajaInvalidoError);
        expect((error as EnlaceBajaInvalidoError).tipo).toBe('VALIDACION');
      }
      expect(e.repo.prefs.size).toBe(0);
    });
  });

  describe('Resumen semanal (RF-070)', () => {
    beforeEach(() => {
      e.reloj.actual = DOMINGO_1830;
    });

    it('el domingo desde las 18:00, una vez por familia y semana, con cada hijo activo', async () => {
      e.repo.prefs.set(ELENA, false); // se dio de baja
      expect(await e.resumen.enviarPendientes()).toBe(1); // José: su único hijo está desactivado
      expect(await e.resumen.enviarPendientes()).toBe(0);
      expect(e.correo.enviados.map((c) => c.cuentaId)).toEqual([CARMEN]);

      const correo = e.correo.enviados[0]!;
      expect(correo.asunto).toBe('Resumen semanal: así leyeron Lucía y Mateo');
      expect(correo.texto).toContain('Hola. Así leyeron Lucía y Mateo en LectoAventura en la semana del 19 de octubre:');
      expect(correo.texto).toContain('Mateo\n• Esta semana: 25 min de lectura y 2 lecturas terminadas (la semana anterior: 1 min).');
      expect(correo.texto).toContain('• Va en el mundo 2 · Detective; lleva 3 lecturas terminadas y 120 puntos.');
      expect(correo.texto).toContain(`• Para acompañar en casa inferencias: ${CONSEJOS_FAMILIA.INF[0]!.texto}`);
      expect(correo.texto).toContain(`Lucía\n• Esta semana no leyó en LectoAventura. Una idea para la próxima: ${CONSEJOS_HABITO[0]}`);
      expect(correo.texto).toContain('• Aún no empieza su aventura: cuando haga su reto inicial verás aquí su avance.');
      expect(correo.enlace).toBe('https://lectoaventura.pe/familia');

      // Baja con un clic: el enlace del texto (página web) y el del programa de correo (RFC 8058).
      const token = decodeURIComponent(/resumen-familiar\/baja\?token=(\S+)/.exec(correo.texto)![1]!);
      expect(e.firma.cuentaDe(token)).toBe(CARMEN);
      expect(correo.bajaUrl).toBe(`https://lectoaventura.pe/api/v1/familia/preferencias-notificacion/baja?token=${encodeURIComponent(token)}`);
    });

    it('si el correo de una familia falla, las demás lo reciben y el suyo se reintenta en el próximo ciclo', async () => {
      e.correo.fallaPara.add(CARMEN);
      await expect(e.resumen.enviarPendientes()).rejects.toThrow('No salió el resumen semanal de 1 familia(s); se reintentará');
      expect(e.correo.enviados.map((c) => c.cuentaId)).toEqual([ELENA]);
      expect(e.repo.resumenes.has(`${CARMEN}:2026-10-19`)).toBe(false);
      e.correo.fallaPara.clear();
      expect(await e.resumen.enviarPendientes()).toBe(1);
      expect(e.correo.enviados.map((c) => c.cuentaId)).toEqual([ELENA, CARMEN]);
    });

    it('sin familias no hace nada; se puede correr como si fuera otro momento', async () => {
      e.repo.familias.clear();
      expect(await e.resumen.enviarPendientes()).toBe(0);
      e.repo.familias.set(ELENA, [BENJA]);
      expect(await e.resumen.enviarPendientes(new Date('2026-10-18T23:30:00Z'))).toBe(1); // domingo 18
      expect(e.repo.resumenes.has(`${ELENA}:2026-10-12`)).toBe(true);
    });
  });

  it('el párrafo de un hijo con puntos pero sin mapa todavía', async () => {
    e.repo.avances.set(LUCIA, { lecturasTerminadas: 1, mundosCompletados: 0, mundoActual: null, puntos: 1, insignias: 0 });
    const texto = parrafoHijo(await e.panel.panel(CARMEN, LUCIA));
    expect(texto).toContain('• Lleva 1 lectura terminada y 1 punto.');
  });
});
