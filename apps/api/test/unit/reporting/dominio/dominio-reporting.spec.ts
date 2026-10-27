import { describe, expect, it } from 'vitest';

import { celdasDe, habilidadesEnInicio } from '../../../../src/modules/reporting/domain/services/mapa-calor';
import { dificultadesCompartidas } from '../../../../src/modules/reporting/domain/services/refuerzo-grupal';
import { celdaCsv, reporteCsv, textoNivel } from '../../../../src/modules/reporting/domain/services/reporte-csv';
import { resumirSemana, semanaPorResumir, semanasDe } from '../../../../src/modules/reporting/domain/services/resumen-semanal';
import { evaluarRiesgo } from '../../../../src/modules/reporting/domain/services/riesgo';
import { tasaSinPista, tasasPorHabilidad } from '../../../../src/modules/reporting/domain/services/tasa-sin-pista';

/** Nivel 1 — Dominio del seguimiento docente (RF-063 a RF-067, RN-08). */
const AHORA = new Date('2026-10-21T15:00:00Z'); // miércoles 21, 10:00 en Lima
const medidas = (v: Record<string, number>, items = 6) => Object.entries(v).map(([habilidad, valor]) => ({ habilidad, valor, items }));
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

describe('Mapa de calor (RF-063, RN-08)', () => {
  it('5 celdas en el orden del SRS con su nivel CNEB declarado; sin medir, sin datos', () => {
    const c = celdasDe([...medidas({ INF: 20, LIT: 90, VOC: 64.996 }), { habilidad: 'CRI', valor: 70, items: 4 }]);
    expect(c.map((x) => `${x.habilidad}:${x.nivel}:${x.valor}`)).toEqual(['LIT:AD:90', 'INF:C:20', 'VOC:B:65', 'CRI:null:70', 'ARG:null:null']);
    expect(c.find((x) => x.habilidad === 'ARG')).toEqual({ habilidad: 'ARG', valor: null, items: 0, nivel: null });
    expect(habilidadesEnInicio(c)).toEqual(['INF']);
  });
});

describe('Estudiantes en riesgo (RF-065)', () => {
  const celdas = celdasDe(medidas({ INF: 20, ARG: 30, LIT: 80 }));

  it('7 días sin actividad o 2 habilidades en inicio', () => {
    expect(evaluarRiesgo({ ultimaActividad: dias(7), matriculadoEn: dias(30), celdas: celdasDe([]), ahora: AHORA })).toEqual({ enRiesgo: true, motivos: ['SIN_ACTIVIDAD'], diasSinActividad: 7, habilidadesEnInicio: [] });
    expect(evaluarRiesgo({ ultimaActividad: dias(6.9), matriculadoEn: dias(30), celdas: celdasDe([]), ahora: AHORA }).enRiesgo).toBe(false);
    expect(evaluarRiesgo({ ultimaActividad: dias(1), matriculadoEn: dias(30), celdas, ahora: AHORA })).toMatchObject({ motivos: ['HABILIDADES_EN_INICIO'], habilidadesEnInicio: ['INF', 'ARG'] });
    expect(evaluarRiesgo({ ultimaActividad: dias(9), matriculadoEn: dias(30), celdas, ahora: AHORA }).motivos).toEqual(['SIN_ACTIVIDAD', 'HABILIDADES_EN_INICIO']);
    expect(evaluarRiesgo({ ultimaActividad: dias(1), matriculadoEn: dias(30), celdas: celdasDe(medidas({ INF: 20 })), ahora: AHORA }).enRiesgo).toBe(false);
  });

  it('quien nunca empezó cuenta desde su matrícula (un aula nueva no aparece entera en riesgo)', () => {
    expect(evaluarRiesgo({ ultimaActividad: null, matriculadoEn: dias(2), celdas: celdasDe([]), ahora: AHORA }).enRiesgo).toBe(false);
    expect(evaluarRiesgo({ ultimaActividad: null, matriculadoEn: dias(10), celdas: celdasDe([]), ahora: AHORA })).toMatchObject({ motivos: ['SIN_ACTIVIDAD'], diasSinActividad: null });
  });
});

describe('Refuerzo grupal (RF-066)', () => {
  it('habilidades en inicio para el 30 % del aula o más, de la más extendida a la menos', () => {
    const e = (id: string, v: Record<string, number>) => ({ id, celdas: celdasDe(medidas(v)) });
    const aula = [e('a', { INF: 20, CRI: 30 }), e('b', { INF: 25, CRI: 30 }), e('c', { INF: 35 }), e('d', { CRI: 10 }), e('e', { INF: 90, ARG: 20 }), e('f', {}), e('g', {}), e('h', {}), e('i', {}), e('j', {})];
    expect(dificultadesCompartidas(aula)).toEqual([
      { habilidad: 'INF', estudianteIds: ['a', 'b', 'c'], porcentaje: 30 },
      { habilidad: 'CRI', estudianteIds: ['a', 'b', 'd'], porcentaje: 30 },
    ]);
    expect(dificultadesCompartidas(aula.slice(0, 2).concat(aula.slice(5)))).toEqual([]); // 2 de 7 = 29 %
    expect(dificultadesCompartidas([])).toEqual([]);
  });
});

describe('Resumen semanal (RF-065)', () => {
  it('cuánto leyó el aula en la semana; activos = con al menos una sesión', () => {
    const semanal = [
      { estudianteId: 'a', semana: '2026-10-19', lecturas: 2, minutos: 12.4, respuestas: 10 },
      { estudianteId: 'b', semana: '2026-10-19', lecturas: 0, minutos: 3.3, respuestas: 2 },
      { estudianteId: 'a', semana: '2026-10-12', lecturas: 1, minutos: 5, respuestas: 4 },
    ];
    expect(resumirSemana('2026-10-19', semanal, 5)).toEqual({ semana: '2026-10-19', estudiantesActivos: 2, totalEstudiantes: 5, lecturasFinalizadas: 2, minutosLectura: 16, respuestas: 12 });
    expect(resumirSemana('2026-10-05', semanal, 5).estudiantesActivos).toBe(0);
  });

  it('semanas de Lima y el envío desde el lunes a las 07:00', () => {
    expect(semanasDe(AHORA)).toEqual({ actual: '2026-10-19', anterior: '2026-10-12' });
    expect(semanasDe(new Date('2026-10-19T04:59:00Z'))).toEqual({ actual: '2026-10-12', anterior: '2026-10-05' }); // aún domingo en Lima
    expect(semanaPorResumir(AHORA)).toBe('2026-10-12');
    expect(semanaPorResumir(new Date('2026-10-19T11:59:00Z'))).toBeNull(); // lunes 06:59 en Lima
    expect(semanaPorResumir(new Date('2026-10-19T12:00:00Z'))).toBe('2026-10-12'); // lunes 07:00 en Lima
  });
});

describe('Tasa de acierto sin pista (RF-064)', () => {
  const r = (habilidad: string, esCorrecta: boolean | null, pistasUsadas = 0) => ({ habilidad, esCorrecta, pistasUsadas });

  it('sobre las cerradas respondidas; las abiertas no cuentan', () => {
    expect(tasaSinPista([r('INF', true), r('INF', true, 1), r('LIT', false, 3), r('ARG', null)])).toEqual({ cerradas: 3, sinPista: 1, tasa: 33 });
    expect(tasaSinPista([r('ARG', null)])).toEqual({ cerradas: 0, sinPista: 0, tasa: null });
    const porHabilidad = tasasPorHabilidad([r('INF', true), r('INF', true, 2), r('LIT', true)]);
    expect([porHabilidad.INF, porHabilidad.LIT, porHabilidad.VOC]).toEqual([{ cerradas: 2, sinPista: 1, tasa: 50 }, { cerradas: 1, sinPista: 1, tasa: 100 }, { cerradas: 0, sinPista: 0, tasa: null }]);
  });
});

describe('Reporte CSV (RF-067)', () => {
  it('UTF-8 con BOM, una fila por estudiante y celdas seguras para la hoja de cálculo', () => {
    const csv = reporteCsv([
      { alias: 'Sofía', celdas: celdasDe(medidas({ LIT: 70, INF: 20 })), ultimaActividad: new Date('2026-10-20T20:00:00Z'), lecturasSemana: 2, motivosRiesgo: ['HABILIDADES_EN_INICIO'] },
      { alias: '=Luis, "el grande"', celdas: celdasDe([]), ultimaActividad: null, lecturasSemana: 0, motivosRiesgo: ['SIN_ACTIVIDAD', 'HABILIDADES_EN_INICIO'] },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [cabecera, sofia, luis] = csv.slice(1).trimEnd().split('\r\n');
    expect(cabecera).toBe(
      'Estudiante,Comprensión literal (maestría),Comprensión literal (nivel),Inferencias (maestría),Inferencias (nivel),Vocabulario (maestría),Vocabulario (nivel),Pensamiento crítico (maestría),Pensamiento crítico (nivel),Argumentación (maestría),Argumentación (nivel),Última actividad,Lecturas esta semana,En riesgo',
    );
    expect(sofia).toBe('Sofía,70,A (Logrado),20,C (En inicio),,Aún descubriendo,,Aún descubriendo,,Aún descubriendo,2026-10-20,2,Sí: 2 o más habilidades en inicio');
    expect(luis).toMatch(/^"'=Luis, ""el grande""",/);
    expect(luis).toContain('Sin actividad,0,Sí: 7 días o más sin actividad; 2 o más habilidades en inicio');
    expect(reporteCsv([])).toBe('\uFEFFEstudiante,Última actividad,Lecturas esta semana,En riesgo\r\n');
  });

  it('celdas: fórmulas neutralizadas, comillas dobladas y vacíos', () => {
    expect([celdaCsv('+1'), celdaCsv('-2'), celdaCsv('@x'), celdaCsv('a\nb'), celdaCsv(null), celdaCsv(7)]).toEqual(["'+1", "'-2", "'@x", '"a\nb"', '', '7']);
    expect([textoNivel('AD'), textoNivel(null)]).toEqual(['AD (Destacado)', 'Aún descubriendo']);
  });
});
