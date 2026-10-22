import { describe, expect, it } from 'vitest';

import { Diagnostico } from '../../../../src/modules/diagnostico/domain/entities/diagnostico';
import {
  DiagnosticoIncompletoError,
  ItemFueraDeOrdenError,
  RespuestaInvalidaError,
  TransicionDiagnosticoError,
} from '../../../../src/modules/diagnostico/domain/errors/errores-diagnostico';
import { calcularResultado, factorDificultad, maestriasDe } from '../../../../src/modules/diagnostico/domain/services/calculo-nivel';
import { formaDe, ITEMS_POR_RANGO } from '../../../../src/modules/diagnostico/domain/value-objects/plan-diagnostico';
import { generarBanco } from '../dobles';

/** Nivel 1 — Dominio del Diagnóstico (RF-034 a RF-037, RN-07, RN-08). */
const AHORA = new Date('2026-10-21T15:00:00Z');
const despues = (min: number) => new Date(AHORA.getTime() + min * 60_000);

describe('Plan y cálculo del nivel', () => {
  it('RF-034: 15 ítems (R1: 10); RF-037: la reevaluación alterna a la forma equivalente', () => {
    expect(ITEMS_POR_RANGO).toEqual({ R1: 10, R2: 15, R3: 15 });
    expect(formaDe('INICIAL', 1)).toBe('A');
    expect([1, 2, 3].map((s) => formaDe('REEVALUACION', s))).toEqual(['B', 'A', 'B']);
  });

  it('RN-07: cada ítem se pondera por su dificultad (0,8 + 0,1 × dificultad)', () => {
    expect([1, 3, 5].map(factorDificultad)).toEqual([0.9, 1.1, 1.3].map((x) => expect.closeTo(x, 10)));
  });

  it('RF-035: valor 0–100 por habilidad, nivel CNEB inicial y, con menos de 5 ítems, sin nivel declarado (RN-08)', () => {
    const r = calcularResultado([
      { habilidad: 'LIT', nivelDificultad: 1, esCorrecta: false },
      { habilidad: 'LIT', nivelDificultad: 2, esCorrecta: true },
      { habilidad: 'LIT', nivelDificultad: 3, esCorrecta: true },
      { habilidad: 'VOC', nivelDificultad: 4, esCorrecta: true },
      { habilidad: 'VOC', nivelDificultad: 5, esCorrecta: true },
      { habilidad: 'INF', nivelDificultad: 2, esCorrecta: false },
      ...Array.from({ length: 5 }, () => ({ habilidad: 'CRI' as const, nivelDificultad: 1, esCorrecta: true })),
    ]);
    expect(r.LIT).toEqual({ valor: 70, nivel: 'A', items: 3, nivelDeclarado: null }); // (0 + 100 + 110) / 3
    expect(r.VOC).toMatchObject({ valor: 100, nivel: 'AD' }); // (120 + 130) / 2, acotado a 100
    expect(r.INF).toMatchObject({ valor: 0, nivel: 'C' });
    expect(r.CRI).toEqual({ valor: 90, nivel: 'AD', items: 5, nivelDeclarado: 'AD' });
    expect(r.ARG).toEqual({ valor: 0, nivel: 'C', items: 0, nivelDeclarado: null }); // sin ítems
    expect(maestriasDe(r)).toEqual({ LIT: 70, INF: 0, VOC: 100, CRI: 90, ARG: 0 });
  });

  it('redondea a un decimal', () => {
    const r = calcularResultado([
      { habilidad: 'ARG', nivelDificultad: 1, esCorrecta: true },
      { habilidad: 'ARG', nivelDificultad: 1, esCorrecta: false },
      { habilidad: 'ARG', nivelDificultad: 2, esCorrecta: false },
    ]);
    expect(r.ARG.valor).toBe(30); // 90 / 3
    expect(calcularResultado([{ habilidad: 'INF', nivelDificultad: 3, esCorrecta: true }, ...Array.from({ length: 2 }, () => ({ habilidad: 'INF' as const, nivelDificultad: 2, esCorrecta: false }))]).INF.valor).toBe(36.7);
  });
});

describe('Diagnóstico', () => {
  const banco = generarBanco('R2', 'A');
  const nuevo = () => Diagnostico.crearInicial({ id: 'd1', estudianteId: 'nino', rangoEdad: 'R2' });
  const responderTodo = (d: Diagnostico, acierta: (i: number) => boolean = () => true) => {
    for (let i = 0; d.siguiente(banco); i++) {
      const item = d.siguiente(banco)!;
      d.responder(banco, item.id, acierta(i) ? item.indiceCorrecto : 0, despues(i + 1));
    }
  };

  it('RF-034: nace sin empezar, con 15 preguntas para 8–9 años y 10 para 6–7', () => {
    const d = nuevo();
    expect(d.snapshot).toMatchObject({ estado: 'NO_INICIADO', tipo: 'INICIAL', secuencia: 1, totalItems: 15, respuestas: [] });
    expect(Diagnostico.crearInicial({ id: 'x', estudianteId: 'n', rangoEdad: 'R1' }).totalItems).toBe(10);
    expect(() => Diagnostico.crearInicial({ id: 'x', estudianteId: 'n', rangoEdad: 'R7' as never })).toThrow('Rango de edad');
  });

  it('se responde en orden: la pregunta que sigue, con una opción válida', () => {
    const d = nuevo();
    expect(() => d.responder(banco, banco[0]!.id, 1, AHORA)).toThrow(TransicionDiagnosticoError); // aún no empezó
    d.comenzar(AHORA);
    expect(d.siguiente(banco)?.orden).toBe(1);
    expect(() => d.responder(banco, banco[1]!.id, 1, AHORA)).toThrow(ItemFueraDeOrdenError);
    expect(() => d.responder(banco, banco[0]!.id, 3, AHORA)).toThrow(RespuestaInvalidaError);
    expect(() => d.responder(banco, banco[0]!.id, 0.5, AHORA)).toThrow(RespuestaInvalidaError);
    d.responder(banco, banco[0]!.id, 1, AHORA);
    expect(() => d.responder(banco, banco[0]!.id, 1, AHORA)).toThrow(ItemFueraDeOrdenError); // no se responde dos veces
    expect(d.snapshot.respuestas).toEqual([{ itemId: banco[0]!.id, indice: 1, esCorrecta: true, respondidaEn: AHORA }]);
    expect(d.siguiente(banco)?.orden).toBe(2);
  });

  it('RF-036: pausar y reanudar continúa en la pregunta siguiente sin perder lo respondido', () => {
    const d = nuevo();
    d.comenzar(AHORA);
    for (const item of banco.slice(0, 4)) d.responder(banco, item.id, 1, AHORA);
    d.pausar(despues(5));
    expect(d.snapshot).toMatchObject({ estado: 'PAUSADO', pausadoEn: despues(5) });
    expect(() => d.pausar(despues(6))).toThrow('Solo se puede pausar un reto en curso');
    expect(() => d.responder(banco, banco[4]!.id, 1, despues(6))).toThrow('Primero reanuda tu reto');
    d.comenzar(despues(60));
    expect(d.snapshot).toMatchObject({ estado: 'EN_CURSO', iniciadoEn: AHORA, pausadoEn: null });
    expect(d.respondidos).toBe(4);
    expect(d.siguiente(banco)?.orden).toBe(5);
    d.comenzar(despues(61)); // ya en curso: no cambia nada
    expect(d.estado).toBe('EN_CURSO');
  });

  it('RF-035: solo finaliza completo, calcula el nivel y ya no se puede retomar', () => {
    const d = nuevo();
    d.comenzar(AHORA);
    d.responder(banco, banco[0]!.id, 1, AHORA);
    expect(() => d.finalizar(banco, despues(1))).toThrow(DiagnosticoIncompletoError);
    expect(() => d.finalizar(banco, despues(1))).toThrow('Aún faltan 14 preguntas');
    responderTodo(d, (i) => i % 2 === 0);
    expect(d.siguiente(banco)).toBeNull();
    const resultado = d.finalizar(banco, despues(30));
    expect(resultado.total).toBe(15);
    expect(resultado.aciertos).toBe(d.snapshot.respuestas.filter((r) => r.esCorrecta).length);
    expect(Object.keys(resultado.habilidades).sort()).toEqual(['ARG', 'CRI', 'INF', 'LIT', 'VOC']);
    expect(Object.values(resultado.habilidades).every((h) => h.items === 3 && h.valor >= 0 && h.valor <= 100)).toBe(true);
    expect(d.snapshot).toMatchObject({ estado: 'FINALIZADO', finalizadoEn: despues(30) });
    expect(() => d.comenzar(despues(31))).toThrow('Este reto ya terminó');
    expect(() => d.finalizar(banco, despues(31))).toThrow('Primero reanuda tu reto');
  });

  it('con el banco incompleto no avanza (error de configuración, no del niño)', () => {
    const d = nuevo();
    d.comenzar(AHORA);
    expect(() => d.siguiente(banco.slice(0, 14))).toThrow('tiene 14 ítems y se esperan 15');
  });

  it('RF-037: la reevaluación usa la forma B y numera su secuencia', () => {
    const r = Diagnostico.crearReevaluacion({ id: 'r1', estudianteId: 'nino', rangoEdad: 'R3', secuencia: 1, asignadoPor: 'docente' });
    expect(r.snapshot).toMatchObject({ tipo: 'REEVALUACION', secuencia: 1, asignadoPor: 'docente', totalItems: 15 });
    expect(r.forma).toBe('B');
    r.comenzar(AHORA);
    expect(r.siguiente(generarBanco('R3', 'B'))?.forma).toBe('B');
    expect(() => r.siguiente(generarBanco('R3', 'A'))).toThrow('forma B');
    expect(() => Diagnostico.crearReevaluacion({ id: 'r0', estudianteId: 'nino', rangoEdad: 'R3', secuencia: 0, asignadoPor: 'd' })).toThrow('empieza en 1');
  });
});
