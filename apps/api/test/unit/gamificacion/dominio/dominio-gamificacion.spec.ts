import { describe, expect, it } from 'vitest';

import { CuentaGamificacion, EstadoCuenta } from '../../../../src/modules/gamificacion/domain/entities/cuenta-gamificacion';
import { habilidadDelReto, RetoDiario } from '../../../../src/modules/gamificacion/domain/entities/reto-diario';
import { MonedasInsuficientesError, RecompensaYaCanjeadaError } from '../../../../src/modules/gamificacion/domain/errors/errores-gamificacion';
import { idDeterminista } from '../../../../src/modules/gamificacion/domain/services/id-origen';
import { monedasDisponibles, validarCanje } from '../../../../src/modules/gamificacion/domain/services/monedas';
import { avanceNivel, nivelLector, umbralNivel } from '../../../../src/modules/gamificacion/domain/services/nivel-lector';
import { leerParametros, PARAMETROS_POR_DEFECTO } from '../../../../src/modules/gamificacion/domain/services/parametros';
import { bonoRacha, conRepeticion, dentroDelTope, palabrasMinimas, puntosDeItem } from '../../../../src/modules/gamificacion/domain/services/politica-puntos';
import { comodinDeEstaSemana, RACHA_VACIA, rachaVigente, registrarDia } from '../../../../src/modules/gamificacion/domain/services/racha';
import { alcanzaNivel, leerRegla, metaDe, ordenarCatalogo } from '../../../../src/modules/gamificacion/domain/services/reglas-insignia';
import { CATALOGO } from '../dobles';

/** Nivel 1 — Dominio de Gamificación (RF-056 a RF-062, RN-10 a RN-13, RN-18, RN-19). */
const P = PARAMETROS_POR_DEFECTO;
const AHORA = new Date('2026-10-21T15:00:00Z');
const HOY = '2026-10-21'; // miércoles

function cuenta(e: Partial<EstadoCuenta> = {}) {
  const estado: EstadoCuenta = {
    estudianteId: 'nino',
    hoy: HOY,
    puntosTotales: 0,
    puntosHoy: 0,
    ganadas: new Set(),
    avances: new Map(),
    racha: { ...RACHA_VACIA },
    reto: null,
    ...e,
  };
  return new CuentaGamificacion(estado, CATALOGO, P, AHORA);
}

const reto = (p: Partial<{ fecha: string; habilidad: 'INF' | 'LIT' }> = {}) =>
  RetoDiario.proponer({ id: 'reto-1', estudianteId: 'nino', fecha: p.fecha ?? HOY, habilidad: p.habilidad ?? 'INF', lectura: null });

describe('Parámetros versionados (RF-078)', () => {
  it('la versión 1 sembrada por la migración da los valores del SRS', () => {
    const v1 = leerParametros(1, {
      puntos: { lecturaCompletada: 20, itemCorrecto: 10, correctoTrasPista: 6, subidaNivelCneb: 50, retoDelDia: 15, racha: { '3': 10, '7': 30, '30': 100 } },
      antiFarming: { porcentajeRepeticion: 25, topeDiario: 300 },
      nivelLector: { umbral: '100 * n * (n + 1) / 2' },
      respuestasAbiertas: { palabrasMinimasR2: 5, palabrasMinimasR3: 10 },
    });
    expect(v1).toEqual(P);
  });

  it('un cambio del administrador se toma; lo ausente o inválido vuelve al valor del SRS', () => {
    const v2 = leerParametros(2, { puntos: { itemCorrecto: 12, retoDelDia: -3, racha: { '5': 20, cero: 3 } }, antiFarming: { porcentajeRepeticion: 150, topeDiario: 500 }, nivelLector: { umbral: '50 * n * (n + 1) / 2' } });
    expect(v2).toMatchObject({ version: 2, puntos: { itemCorrecto: 12, retoDelDia: 15, lecturaCompletada: 20, racha: { '5': 20 } }, antiFarming: { porcentajeRepeticion: 25, topeDiario: 500 }, nivelLector: { base: 50 } });
    expect(leerParametros(3, 'basura')).toEqual({ ...P, version: 3 });
    expect(leerParametros(4, { nivelLector: { umbral: 'n ** 2' }, puntos: { racha: {} } })).toMatchObject({ nivelLector: { base: 100 }, puntos: { racha: P.puntos.racha } });
  });
});

describe('Nivel lector (RF-057)', () => {
  it('el nivel n pide 100 × n × (n + 1) / 2 puntos', () => {
    expect([1, 2, 3, 4].map((n) => umbralNivel(n))).toEqual([100, 300, 600, 1000]);
    expect([0, 99, 100, 299, 300, 599, 600, 1000, 1499, 1500].map((p) => nivelLector(p))).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 4, 5]);
    expect(nivelLector(-5)).toBe(0);
    expect(nivelLector(150, 50)).toBe(2); // base del administrador: 50, 150, 300…
  });

  it('el avance muestra desde dónde viene y cuánto falta para el siguiente', () => {
    expect(avanceNivel(0)).toEqual({ actual: 0, desde: 0, hasta: 100, faltan: 100 });
    expect(avanceNivel(105)).toEqual({ actual: 1, desde: 100, hasta: 300, faltan: 195 });
  });
});

describe('Política de puntos (RN-10, RN-11, RN-12, RN-19)', () => {
  it('acertar a la primera vale 10, tras una pista 6; equivocarse no da ni quita (RN-10)', () => {
    expect(puntosDeItem({ esCorrecta: true, pistasUsadas: 0, palabras: null }, P, 'R2')).toEqual({ motivo: 'ITEM_CORRECTO', puntos: 10 });
    expect(puntosDeItem({ esCorrecta: true, pistasUsadas: 1, palabras: null }, P, 'R2')).toEqual({ motivo: 'CORRECTO_TRAS_PISTA', puntos: 6 });
    expect(puntosDeItem({ esCorrecta: false, pistasUsadas: 3, palabras: null }, P, 'R2')).toBeNull();
  });

  it('RN-19: la abierta da puntos de esfuerzo con ≥ 5 palabras en R2 y ≥ 10 en R3 (R1 como R2)', () => {
    const abierta = (palabras: number | null) => ({ esCorrecta: null, pistasUsadas: 0, palabras });
    expect(puntosDeItem(abierta(5), P, 'R2')).toEqual({ motivo: 'RESPUESTA_ABIERTA', puntos: 10 });
    expect(puntosDeItem(abierta(4), P, 'R2')).toBeNull();
    expect(puntosDeItem(abierta(9), P, 'R3')).toBeNull();
    expect(puntosDeItem(abierta(10), P, 'R3')).not.toBeNull();
    expect(puntosDeItem(abierta(null), P, null)).toBeNull();
    expect([palabrasMinimas('R1', P), palabrasMinimas(null, P)]).toEqual([5, 5]);
  });

  it('RN-12: repetir da el 25 % redondeado y el tope diario es 300', () => {
    expect([10, 6, 20].map((x) => conRepeticion(x, true, P))).toEqual([3, 2, 5]);
    expect(conRepeticion(10, false, P)).toBe(10);
    expect([dentroDelTope(10, 0, P), dentroDelTope(10, 295, P), dentroDelTope(10, 300, P), dentroDelTope(10, 320, P)]).toEqual([10, 5, 0, 0]);
  });

  it('RN-11: la racha da bono solo en sus hitos', () => {
    expect([1, 3, 5, 7, 30].map((d) => bonoRacha(d, P))).toEqual([null, 10, null, 30, 100]);
  });
});

describe('Racha con comodín semanal (RF-061)', () => {
  const r = (ultimaFecha: string, dias: number, comodinSemana: string | null = null) => ({ dias, mejor: dias, ultimaFecha, comodinSemana });

  it('empieza en 1, suma un día seguido e ignora un segundo logro el mismo día o uno atrasado', () => {
    expect(registrarDia(RACHA_VACIA, HOY)).toEqual({ racha: { dias: 1, mejor: 1, ultimaFecha: HOY, comodinSemana: null }, cambio: 'REINICIO' });
    expect(registrarDia(r('2026-10-20', 2), HOY)).toMatchObject({ racha: { dias: 3, mejor: 3 }, cambio: 'SUMA' });
    expect(registrarDia(r(HOY, 3), HOY).cambio).toBe('IGUAL');
    expect(registrarDia(r(HOY, 3), '2026-10-19').cambio).toBe('IGUAL');
  });

  it('el comodín cubre un día perdido una vez por semana (lunes a domingo); sin comodín se reinicia', () => {
    // Leyó el lunes 19, no el martes 20: el comodín de esa semana lo cubre.
    expect(registrarDia(r('2026-10-19', 4), HOY)).toMatchObject({ racha: { dias: 5, comodinSemana: '2026-10-19' }, cambio: 'COMODIN' });
    // Ya lo usó esta semana: se reinicia, pero la mejor racha se conserva.
    expect(registrarDia({ dias: 4, mejor: 9, ultimaFecha: '2026-10-19', comodinSemana: '2026-10-19' }, HOY)).toMatchObject({ racha: { dias: 1, mejor: 9 }, cambio: 'REINICIO' });
    // Dos días sin leer: ningún comodín alcanza.
    expect(registrarDia(r('2026-10-18', 4), HOY).cambio).toBe('REINICIO');
    // El día perdido fue el domingo 18: cuenta el comodín de la semana anterior.
    expect(registrarDia(r('2026-10-17', 2, '2026-10-19'), '2026-10-19')).toMatchObject({ racha: { dias: 3, comodinSemana: '2026-10-12' }, cambio: 'COMODIN' });
  });

  it('la racha visible hoy es 0 si ya se cortó; el comodín de esta semana se ve disponible o usado', () => {
    expect(rachaVigente(RACHA_VACIA, HOY)).toBe(0);
    expect(rachaVigente(r(HOY, 4), HOY)).toBe(4);
    expect(rachaVigente(r('2026-10-20', 4), HOY)).toBe(4);
    expect(rachaVigente(r('2026-10-19', 4), HOY)).toBe(4); // aún puede salvarla el comodín
    expect(rachaVigente(r('2026-10-19', 4, '2026-10-19'), HOY)).toBe(0);
    expect(rachaVigente(r('2026-10-18', 4), HOY)).toBe(0);
    expect(comodinDeEstaSemana(r(HOY, 1), HOY)).toBe(true);
    expect(comodinDeEstaSemana(r(HOY, 1, '2026-10-19'), HOY)).toBe(false);
  });
});

describe('Reglas de insignias (RF-058)', () => {
  it('lee las reglas del catálogo y descarta las mal formadas', () => {
    expect(leerRegla({ tipo: 'EVIDENCIAS', meta: 5 })).toEqual({ tipo: 'EVIDENCIAS', meta: 5 });
    expect(leerRegla({ tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' })).toEqual({ tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' });
    expect(leerRegla({ tipo: 'RACHA', dias: 7 })).toEqual({ tipo: 'RACHA', dias: 7 });
    expect(leerRegla({ tipo: 'MUNDO', numero: 3 })).toEqual({ tipo: 'MUNDO', numero: 3 });
    for (const mala of [null, 'x', { tipo: 'LECTURAS', meta: 0 }, { tipo: 'NIVEL_HABILIDAD', habilidad: 'XYZ', nivel: 'AD' }, { tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'Z' }, { tipo: 'RACHA' }, { tipo: 'MUNDO', numero: -1 }, { tipo: 'OTRA' }]) {
      expect(leerRegla(mala)).toBeNull();
    }
  });

  it('meta visible, niveles que incluyen a los menores y orden del pasaporte', () => {
    expect(CATALOGO.map((i) => metaDe(i.regla))).toEqual([1, 5, null, 7, null]);
    expect([alcanzaNivel('AD', 'A'), alcanzaNivel('A', 'AD'), alcanzaNivel('B', 'B')]).toEqual([true, false, true]);
    expect(ordenarCatalogo([...CATALOGO].reverse()).map((i) => i.codigo)).toEqual(CATALOGO.map((i) => i.codigo));
  });
});

describe('Identificador determinista y monedas (RF-062)', () => {
  it('el mismo logro da siempre el mismo UUID v8; otro logro, otro', () => {
    const a = idDeterminista('racha', 'nino', HOY);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idDeterminista('racha', 'nino', HOY)).toBe(a);
    expect(idDeterminista('racha', 'nino', '2026-10-22')).not.toBe(a);
  });

  it('1 moneda por cada 10 puntos; se canjea una vez y solo si alcanza', () => {
    expect(monedasDisponibles({ puntosTotales: 109, gastadas: 3 })).toBe(7);
    expect(monedasDisponibles({ puntosTotales: 10, gastadas: 5 })).toBe(0);
    expect(() => validarCanje({ puntosTotales: 100, gastadas: 0, yaEsTuya: true }, 5)).toThrow(RecompensaYaCanjeadaError);
    expect(() => validarCanje({ puntosTotales: 100, gastadas: 0, yaEsTuya: false }, 11)).toThrow(new MonedasInsuficientesError(1));
    expect(() => validarCanje({ puntosTotales: 100, gastadas: 0, yaEsTuya: false }, 10)).not.toThrow();
    expect(new MonedasInsuficientesError(3).message).toBe('Te faltan 3 monedas para esta recompensa');
  });
});

describe('Reto del día (RF-060, RN-18)', () => {
  it('apunta a la habilidad más débil; empate por el orden del SRS; sin perfil, comprensión literal', () => {
    expect(habilidadDelReto({ LIT: 70, INF: 30, VOC: 60, CRI: 50, ARG: 40 })).toBe('INF');
    expect(habilidadDelReto({ LIT: 70, INF: 0, VOC: 60, CRI: 0, ARG: 0 })).toBe('INF');
    expect(habilidadDelReto({ LIT: 70 })).toBe('INF');
    expect(habilidadDelReto(null)).toBe('LIT');
  });

  it('avanza con aciertos de su habilidad y se completa al llegar a 3; después ya no cambia', () => {
    const r = reto();
    expect(r.registrarAcierto('LIT', AHORA)).toBe('NADA');
    expect([r.registrarAcierto('INF', AHORA), r.registrarAcierto('INF', AHORA), r.registrarAcierto('INF', AHORA)]).toEqual(['AVANZO', 'AVANZO', 'COMPLETADO']);
    expect(r.datos).toMatchObject({ avance: 3, meta: 3, estado: 'COMPLETADO', completadoEn: AHORA });
    expect(r.registrarAcierto('INF', AHORA)).toBe('NADA');
  });
});

describe('Cuenta de gamificación (RF-056, RF-058, RN-12, RN-13)', () => {
  it('cada otorgamiento es un asiento con motivo; el tope diario corta el último y no deja asientos en 0', () => {
    const c = cuenta({ puntosTotales: 1000, puntosHoy: 295 });
    expect(c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-1')).toBe(5);
    expect(c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-2')).toBe(0);
    expect(c.cambios().asientos).toEqual([{ motivo: 'ITEM_CORRECTO', puntos: 5, origenId: 'r-1', fechaLima: HOY }]);
    expect(c.puntosTotales).toBe(1005);
  });

  it('RF-057: al cruzar un umbral publica la subida de nivel lector', () => {
    const c = cuenta({ puntosTotales: 95 });
    c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-1');
    c.otorgarPuntos('ITEM_CORRECTO', 10, 'r-2');
    expect(c.eventosPendientes().map((e) => [e.nombreEvento, e.datos])).toEqual([
      ['gamificacion.NivelLectorSubido', { estudianteId: 'nino', nivelAnterior: 0, nivelNuevo: 1, puntos: 105 }],
    ]);
  });

  it('UAT-03: cada evidencia suma 1; a la quinta otorga "Detective de Evidencias" una sola vez (RN-13)', () => {
    const c = cuenta({ avances: new Map([['i-detective', 3]]) });
    c.contar('EVIDENCIAS', 'r-4');
    expect(c.cambios().avances).toEqual([{ insigniaId: 'i-detective', avance: 4 }]);
    c.contar('EVIDENCIAS', 'r-5');
    c.contar('EVIDENCIAS', 'r-6');
    expect(c.cambios().insignias.map((i) => [i.insignia.codigo, i.origenId])).toEqual([['DETECTIVE_EVIDENCIAS', 'r-5']]);
    expect(c.eventosPendientes().map((e) => e.datos)).toEqual([{ estudianteId: 'nino', insignia: 'DETECTIVE_EVIDENCIAS' }]);
    expect(cuenta({ ganadas: new Set(['i-detective']) }).cambios().insignias).toEqual([]);
  });

  it('RF-061, RN-11: al llegar a 7 días suma +30 y "Lector Perseverante"; el mismo día no suma dos veces', () => {
    const c = cuenta({ racha: { dias: 6, mejor: 6, ultimaFecha: '2026-10-20', comodinSemana: null } });
    c.registrarDiaLector('s-1');
    c.registrarDiaLector('s-2');
    const cambios = c.cambios();
    expect(cambios.racha).toEqual({ dias: 7, mejor: 7, ultimaFecha: HOY, comodinSemana: null });
    expect(cambios.asientos).toEqual([{ motivo: 'RACHA_7', puntos: 30, origenId: idDeterminista('racha', 'nino', HOY), fechaLima: HOY }]);
    expect(cambios.insignias.map((i) => i.insignia.codigo)).toEqual(['LECTOR_PERSEVERANTE']);
    expect(cuenta().cambios().racha).toBeNull();
  });

  it('RF-060: completar el reto da +15, cuenta para la racha y se publica; un reto de otro día no avanza', () => {
    const r = reto();
    r.registrarAcierto('INF', AHORA);
    r.registrarAcierto('INF', AHORA);
    const c = cuenta({ reto: r });
    c.avanzarReto('LIT');
    expect(c.cambios().reto).toBeNull();
    c.avanzarReto('INF');
    const cambios = c.cambios();
    expect(cambios.reto?.datos.estado).toBe('COMPLETADO');
    expect(cambios.asientos.map((a) => `${a.motivo}:${a.puntos}:${a.origenId}`)).toEqual(['RETO_DEL_DIA:15:reto-1']);
    expect(cambios.racha).toMatchObject({ dias: 1, ultimaFecha: HOY });
    expect(c.eventosPendientes().map((e) => e.nombreEvento)).toEqual(['gamificacion.RetoDelDiaCompletado']);

    const ayer = cuenta({ reto: reto({ fecha: '2026-10-20' }) });
    ayer.avanzarReto('INF');
    expect(ayer.cambios().reto).toBeNull();
    cuenta().avanzarReto('INF'); // sin reto no pasa nada
  });

  it('las insignias de nivel de habilidad y de rango se otorgan con su regla', () => {
    const c = cuenta();
    c.alcanzarNivelHabilidad('INF', 'A', 'm-1');
    c.alcanzarNivelHabilidad('LIT', 'AD', 'm-2');
    c.completarMundo(1, 'w-1');
    expect(c.cambios().insignias).toEqual([]);
    c.alcanzarNivelHabilidad('INF', 'AD', 'm-3');
    c.completarMundo(2, 'w-2');
    expect(c.cambios().insignias.map((i) => i.insignia.codigo)).toEqual(['MAESTRO_INFERENCIAS', 'RANGO_DETECTIVE']);
  });
});
