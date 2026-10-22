import { beforeEach, describe, expect, it } from 'vitest';

import { SinRetoPendienteError } from '../../../../src/modules/diagnostico/domain/errors/errores-diagnostico';
import { EVENTOS_DIAGNOSTICO } from '../../../../src/modules/diagnostico/domain/events/eventos-diagnostico';
import { EVENTOS_INTEGRACION, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoDiagnostico, EntornoDiagnostico, generarBanco } from '../dobles';

/** Nivel 1 — Casos de uso del Diagnóstico con dobles (RF-034 a RF-037, RN-05). */
const NINO = 'nino-9';
const DOCENTE = 'docente';

describe('Diagnóstico: reto del estudiante y reevaluación del docente', () => {
  let e: EntornoDiagnostico;

  beforeEach(() => {
    e = crearEntornoDiagnostico();
    e.identidad.agregar(NINO, 'Mateo', 'R2');
  });

  /** Responde todo el reto en curso; `acierta(i)` decide si la pregunta i (0-based) es correcta. */
  const completar = async (estudianteId = NINO, acierta: (i: number) => boolean = () => true) => {
    const { id } = await e.reto.comenzar(estudianteId);
    for (let i = 0; ; i++) {
      const item = await e.reto.siguiente(estudianteId, id as string);
      if (!item) break;
      await e.reto.responder(estudianteId, id as string, item.itemId, acierta(i) ? 1 : 0);
    }
    return { id: id as string, resultado: await e.reto.finalizar(estudianteId, id as string) };
  };

  describe('Reto inicial (RF-034, RF-036, RN-05)', () => {
    it('un niño nuevo tiene su reto inicial por empezar (10 preguntas a los 6–7 años, 15 después)', async () => {
      expect(await e.reto.actual(NINO)).toEqual({ inicialFinalizado: false, pendiente: { id: null, tipo: 'INICIAL', estado: 'NO_INICIADO', respondidos: 0, total: 15 } });
      e.identidad.agregar('pequena', 'Lía', 'R1');
      expect((await e.reto.actual('pequena')).pendiente?.total).toBe(10);
      expect(e.repo.filas.size).toBe(0); // consultar no crea nada
    });

    it('empezar crea el reto una sola vez; volver a entrar lo reanuda', async () => {
      const primero = await e.reto.comenzar(NINO);
      const segundo = await e.reto.comenzar(NINO);
      expect(segundo.id).toBe(primero.id);
      expect(primero).toMatchObject({ tipo: 'INICIAL', estado: 'EN_CURSO', respondidos: 0, total: 15 });
      expect(e.bus.nombres().filter((n) => n === EVENTOS_DIAGNOSTICO.INICIADO)).toHaveLength(1);
      expect((await e.reto.actual(NINO)).pendiente?.id).toBe(primero.id);
    });

    it('dos pedidos simultáneos la primera vez siguen con el mismo reto', async () => {
      const [a, b] = await Promise.all([e.reto.comenzar(NINO), e.reto.comenzar(NINO)]);
      expect(a.id).toBe(b.id);
      expect(e.repo.filas.size).toBe(1);
    });

    it('la pregunta llega sin habilidad ni respuesta, y con su lectura', async () => {
      const { id } = await e.reto.comenzar(NINO);
      const item = await e.reto.siguiente(NINO, id as string);
      expect(item).toEqual({ itemId: generarBanco('R2', 'A')[0]!.id, numero: 1, total: 15, lectura: { titulo: 'Lectura 1', texto: 'Había una vez…' }, enunciado: 'Pregunta 1 (A)', opciones: ['Primera', 'Correcta', 'Tercera'] });
      expect(JSON.stringify(item)).not.toMatch(/indiceCorrecto|habilidad|nivelDificultad/);
    });

    it('RF-036: pausar guarda lo respondido; al volver, sigue en la pregunta siguiente', async () => {
      const { id } = await e.reto.comenzar(NINO);
      for (let i = 0; i < 6; i++) {
        const item = await e.reto.siguiente(NINO, id as string);
        expect(await e.reto.responder(NINO, id as string, item!.itemId, 1)).toEqual({ respondidos: i + 1, total: 15, terminado: false });
      }
      expect(await e.reto.pausar(NINO, id as string)).toMatchObject({ estado: 'PAUSADO', respondidos: 6 });
      await expect(e.reto.responder(NINO, id as string, generarBanco('R2', 'A')[6]!.id, 1)).rejects.toThrow('Primero reanuda tu reto');
      expect(await e.reto.comenzar(NINO)).toMatchObject({ id, estado: 'EN_CURSO', respondidos: 6 });
      expect((await e.reto.siguiente(NINO, id as string))?.numero).toBe(7);
    });

    it('RF-035: al finalizar calcula el nivel por habilidad y publica DiagnosticoFinalizado para Aventura', async () => {
      // LIT y VOC aciertan las dos más difíciles de sus 3 preguntas: (0 + 100 + 110) / 3 = 70 y (0 + 100 + 110) / 3 = 70.
      const { id, resultado } = await completar(NINO, (i) => i >= 5);
      expect(resultado).toMatchObject({ diagnosticoId: id, tipo: 'INICIAL', aciertos: 10, total: 15 });
      expect(resultado.habilidades.find((h) => h.codigo === 'LIT')).toEqual({ codigo: 'LIT', nombre: 'Comprensión literal', valor: 70, nivel: 'A', etiquetaNivel: 'Logrado', nivelDeclarado: null });
      const evento = e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO);
      expect(evento?.datos).toMatchObject({ estudianteId: NINO, diagnosticoId: id, tipo: 'INICIAL', maestrias: { LIT: 70, VOC: 70, INF: 70, CRI: 70, ARG: 70 }, aciertos: 10, total: 15 });
      expect(await e.reto.actual(NINO)).toEqual({ inicialFinalizado: true, pendiente: null });
      expect(await e.reto.resultado(NINO, id)).toEqual(resultado);
    });

    it('RN-05: el inicial no se repite ni se omite; un reto ajeno o sin terminar no se muestra', async () => {
      const { id } = await e.reto.comenzar(NINO);
      await expect(e.reto.resultado(NINO, id as string)).rejects.toThrow('aún no termina');
      e.identidad.agregar('otro', 'Ana');
      await expect(e.reto.siguiente('otro', id as string)).rejects.toThrow(NoEncontradoError);
      await expect(e.reto.finalizar(NINO, id as string)).rejects.toThrow('Aún faltan 15 preguntas');
      await completar(NINO);
      await expect(e.reto.comenzar(NINO)).rejects.toThrow(SinRetoPendienteError);
      await expect(e.reto.siguiente(NINO, id as string)).rejects.toThrow('Este reto ya terminó');
    });

    it('un perfil desactivado no tiene reto', async () => {
      e.identidad.agregar('inactivo', 'Leo', 'R2', false);
      await expect(e.reto.comenzar('inactivo')).rejects.toThrow(NoEncontradoError);
      await expect(e.reto.actual('inactivo')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Reevaluación del docente (RF-037)', () => {
    const AULA = 'aula-4a';
    beforeEach(() => {
      e.identidad.agregar('ana', 'Ana', 'R3');
      e.identidad.agregar('leo', 'Leo', 'R2');
      e.aulas.aulas.set(AULA, { id: AULA, nombre: '4.° A', activa: true, docenteId: DOCENTE, estudiantes: [NINO, 'ana', 'leo'] });
    });

    it('asigna a quien terminó su reto inicial y explica por qué omite a los demás', async () => {
      await completar(NINO);
      await completar('ana');
      await e.reto.comenzar('leo'); // aún en su reto inicial
      const r = await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA });
      expect(r).toEqual({ asignados: 2, omitidos: [{ estudianteId: 'leo', alias: 'Leo', motivo: 'Aún no termina su reto inicial' }] });
      expect(e.bus.publicados.find((p) => p.nombreEvento === EVENTOS_DIAGNOSTICO.REEVALUACION_ASIGNADA)?.datos).toEqual({ actorId: DOCENTE, aulaId: AULA, cantidad: 2 });
      const pendiente = (await e.reto.actual(NINO)).pendiente;
      expect(pendiente).toMatchObject({ tipo: 'REEVALUACION', estado: 'NO_INICIADO', total: 15 });
      // Asignar otra vez: ya tienen una pendiente.
      expect((await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: [NINO] })).omitidos[0]?.motivo).toBe('Ya tiene un reto pendiente');
      e.identidad.agregar('sin-empezar', 'Sol');
      e.aulas.aulas.get(AULA)?.estudiantes.push('sin-empezar');
      expect((await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: ['sin-empezar'] })).omitidos[0]?.motivo).toBe('Aún no termina su reto inicial');
    });

    it('usa la forma equivalente y compara habilidad por habilidad con el inicial', async () => {
      await completar(NINO, (i) => i >= 10); // inicial: solo aciertan las más difíciles
      await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: [NINO] });
      const { id } = await e.reto.comenzar(NINO);
      expect((await e.reto.siguiente(NINO, id as string))?.enunciado).toBe('Pregunta 1 (B)');
      await completar(NINO); // reevaluación: acierta todo
      const [mateo] = (await e.reevaluaciones.resumen(DOCENTE, AULA)).filter((x) => x.estudianteId === NINO);
      expect(mateo?.inicial).toEqual({ estado: 'FINALIZADO', valores: { LIT: 36.7, INF: 36.7, VOC: 36.7, CRI: 36.7, ARG: 36.7 } });
      expect(mateo?.reevaluacion).toMatchObject({ secuencia: 1, estado: 'FINALIZADO', valores: { LIT: 100 } });
      expect(mateo?.cambios).toEqual({ LIT: 63.3, INF: 63.3, VOC: 63.3, CRI: 63.3, ARG: 63.3 });
      // Una segunda reevaluación vuelve a la forma A.
      await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: [NINO] });
      const segunda = await e.reto.comenzar(NINO);
      expect((await e.reto.siguiente(NINO, segunda.id as string))?.enunciado).toBe('Pregunta 1 (A)');
      expect((await e.reevaluaciones.resumen(DOCENTE, AULA)).find((x) => x.estudianteId === NINO)?.reevaluacion).toMatchObject({ secuencia: 2, estado: 'EN_CURSO', valores: null });
    });

    it('el resumen lista a todo el aula por alias, aunque no hayan empezado', async () => {
      const lista = await e.reevaluaciones.resumen(DOCENTE, AULA);
      expect(lista.map((x) => [x.alias, x.inicial.estado, x.reevaluacion, x.cambios])).toEqual([
        ['Ana', 'SIN_EMPEZAR', null, null],
        ['Leo', 'SIN_EMPEZAR', null, null],
        ['Mateo', 'SIN_EMPEZAR', null, null],
      ]);
    });

    it('RN-17: solo en su aula, activa, y con estudiantes de esa aula', async () => {
      await expect(e.reevaluaciones.asignar({ docenteId: 'otra-docente', aulaId: AULA })).rejects.toThrow(NoEncontradoError);
      await expect(e.reevaluaciones.resumen('otra-docente', AULA)).rejects.toThrow(NoEncontradoError);
      await expect(e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: ['de-otra-aula'] })).rejects.toThrow('matriculados en esta aula');
      e.aulas.aulas.set('vacia', { id: 'vacia', nombre: 'Vacía', activa: true, docenteId: DOCENTE, estudiantes: [] });
      await expect(e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: 'vacia' })).rejects.toThrow('matriculados en esta aula');
      e.aulas.aulas.set('archivada', { id: 'archivada', nombre: 'Archivada', activa: false, docenteId: DOCENTE, estudiantes: [NINO] });
      await expect(e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: 'archivada' })).rejects.toThrow('archivada');
    });

    it('omite perfiles desactivados', async () => {
      e.identidad.agregar('leo', 'Leo', 'R2', false);
      expect((await e.reevaluaciones.asignar({ docenteId: DOCENTE, aulaId: AULA, estudianteIds: ['leo'] })).omitidos[0]?.motivo).toBe('Su perfil está desactivado');
    });
  });
});
