import { describe, expect, it } from 'vitest';

import {
  CONSEJOS_FAMILIA,
  CONSEJOS_HABITO,
  consejosPara,
  habilidadesAReforzar,
  semanaFamiliarPorResumir,
} from '../../../../src/modules/reporting/domain/services/acompanamiento-familiar';
import { celdasDe } from '../../../../src/modules/reporting/domain/services/mapa-calor';
import { HmacFirmaBaja } from '../../../../src/modules/reporting/infrastructure/firma-baja';
import { HABILIDADES, RANGOS_EDAD } from '../../../../src/modules/shared-kernel/public-api';

/** Nivel 1 — Dominio del acompañamiento familiar (RF-068 a RF-070). */
const medidas = (v: Record<string, number>, items = 6) => Object.entries(v).map(([habilidad, valor]) => ({ habilidad, valor, items }));
const CUENTA = '0192f1c4-7a10-7c3e-9b2a-1f0e5d6c7b8a';

describe('Habilidades a reforzar (RF-068)', () => {
  it('las medidas por debajo de "Logrado" (65), de la más baja a la más alta, hasta 3', () => {
    const celdas = celdasDe(medidas({ LIT: 80, INF: 31, VOC: 48, CRI: 64.9, ARG: 20 }));
    expect(habilidadesAReforzar(celdas)).toEqual([
      { habilidad: 'ARG', valor: 20 },
      { habilidad: 'INF', valor: 31 },
      { habilidad: 'VOC', valor: 48 },
    ]);
  });

  it('se usan desde el reto inicial (aunque aún no haya nivel declarado); sin medir o desde 65, no', () => {
    const celdas = celdasDe(medidas({ LIT: 40, INF: 40, CRI: 65 }, 2));
    expect(celdas.find((c) => c.habilidad === 'LIT')!.nivel).toBeNull();
    // Empate: en el orden del SRS.
    expect(habilidadesAReforzar(celdas)).toEqual([
      { habilidad: 'LIT', valor: 40 },
      { habilidad: 'INF', valor: 40 },
    ]);
    expect(habilidadesAReforzar(celdasDe([]))).toEqual([]);
  });
});

describe('Consejos para casa (RF-069)', () => {
  it('al menos un consejo práctico por habilidad y edad, para no especialistas', () => {
    for (const h of HABILIDADES) {
      for (const r of RANGOS_EDAD) {
        const consejos = consejosPara(h, r);
        expect(consejos.length, `${h} ${r}`).toBeGreaterThanOrEqual(1);
        expect(consejos.length).toBeLessThanOrEqual(2);
        for (const c of consejos) {
          expect(c.length).toBeGreaterThan(40);
          // Sin tecnicismos del SRS ni siglas.
          expect(c).not.toMatch(/inferencia|CNEB|maestría|literal/i);
          expect(c).not.toMatch(/\b(LIT|INF|VOC|CRI|ARG)\b/);
        }
      }
    }
    expect(CONSEJOS_HABITO.length).toBeGreaterThanOrEqual(1);
  });

  it('según la edad: un consejo solo para los mayores no se da a un niño de 6–7 años', () => {
    const soloMayores = CONSEJOS_FAMILIA.CRI.find((c) => c.edades?.join() === 'R2,R3')!.texto;
    expect(consejosPara('CRI', 'R3', 5)).toContain(soloMayores);
    expect(consejosPara('CRI', 'R1', 5)).not.toContain(soloMayores);
    expect(consejosPara('ARG', 'R1', 5)).toContain(CONSEJOS_FAMILIA.ARG.find((c) => c.edades?.join() === 'R1')!.texto);
  });
});

describe('Semana del resumen (RF-070: domingos a las 18:00 de Lima)', () => {
  it('el domingo desde las 18:00 resume la semana en curso; antes, la anterior', () => {
    expect(semanaFamiliarPorResumir(new Date('2026-10-25T22:59:00Z'))).toBe('2026-10-12'); // domingo 25, 17:59
    expect(semanaFamiliarPorResumir(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-19'); // domingo 25, 18:00
    expect(semanaFamiliarPorResumir(new Date('2026-10-26T04:59:00Z'))).toBe('2026-10-19'); // domingo 25, 23:59
  });

  it('de lunes a sábado, la última que ya se pudo enviar', () => {
    expect(semanaFamiliarPorResumir(new Date('2026-10-26T15:00:00Z'))).toBe('2026-10-19'); // lunes 26
    expect(semanaFamiliarPorResumir(new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-19'); // sábado 31
  });
});

describe('Enlace de baja firmado (RF-070)', () => {
  const firma = new HmacFirmaBaja('secreto-de-prueba');

  it('lleva la cuenta y su firma; se verifica en tiempo constante', () => {
    const token = firma.token(CUENTA);
    expect(token.startsWith(`${CUENTA}.`)).toBe(true);
    expect(firma.cuentaDe(token)).toBe(CUENTA);
  });

  it('una firma alterada, la firma de otra cuenta, otro secreto o basura no sirven', () => {
    const token = firma.token(CUENTA);
    expect(firma.cuentaDe(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(firma.cuentaDe(`0192f1c4-7a10-7c3e-9b2a-000000000000.${token.split('.')[1]}`)).toBeNull();
    expect(new HmacFirmaBaja('otro-secreto').cuentaDe(token)).toBeNull();
    for (const basura of ['', 'x', `${token}.extra`, 'no-es-uuid.firma', undefined as unknown as string]) {
      expect(firma.cuentaDe(basura)).toBeNull();
    }
  });

  it('sin secreto no arranca (no se firman enlaces con una clave vacía)', () => {
    expect(() => new HmacFirmaBaja('')).toThrow('JWT_SECRET');
  });
});
