import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { RegistrarAuditoriaUseCase } from '../../../../src/modules/administracion/application/use-cases/registrar-auditoria.use-case';
import { Auditoria } from '../../../../src/modules/administracion/domain/entities/auditoria';
import { ajustarAlAncho, PdfLibTarjetas, TARJETAS_POR_HOJA } from '../../../../src/modules/escuela/infrastructure/pdf/pdf-lib-tarjetas';
import { pinesDelPdf, textosDelPdf } from '../../../support/pdf-texto';

/** Nivel 1 — Adaptadores: PDF de tarjetas con pdf-lib (RF-017) y registro de auditoría (RF-077). */
describe('PdfLibTarjetas (RF-017, CR-01)', () => {
  const tarjeta = (i: number) => ({ estudianteId: `e${i}`, alias: `Niño ${i}`, avatar: i % 2 ? 'leon' : 'buho', nombreAula: '3.° B', pin: `${4826 + i}` });

  it(`hoja A4 con ${TARJETAS_POR_HOJA} tarjetas: 9 estudiantes ocupan 2 hojas`, async () => {
    const pdf = await new PdfLibTarjetas().generar({ nombreAula: '3.° B', tarjetas: Array.from({ length: 9 }, (_, i) => tarjeta(i)) });
    const doc = await PDFDocument.load(pdf);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(doc.getTitle()).toBe('Tarjetas de acceso — 3.° B');
  });

  it('cada tarjeta lleva aula, avatar, alias y PIN; nada de código de aula', async () => {
    const pdf = await new PdfLibTarjetas().generar({
      nombreAula: '3.° B',
      tarjetas: [
        { estudianteId: 'e1', alias: 'Lucía', avatar: 'buho', nombreAula: '3.° B', pin: '4826' },
        { estudianteId: 'e2', alias: 'Mateo', avatar: 'leon', nombreAula: '3.° B', pin: '5739' },
      ],
    });
    const textos = textosDelPdf(pdf);

    expect(textos).toEqual(expect.arrayContaining(['Lucía', 'Mateo', 'Búho', 'León', '3.° B', 'Mi PIN']));
    expect(pinesDelPdf(pdf)).toEqual(['4826', '5739']);
    expect(textos.join(' ')).not.toMatch(/c[oó]digo/i);
    expect(textos).toContain('Toca tu avatar en la tablet del aula y escribe tu PIN.');
  });

  it('un alias o un aula con nombre largo se achican o recortan para no salirse de la tarjeta', async () => {
    const doc = await PDFDocument.create();
    const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

    const corto = ajustarAlAncho('Ana', negrita, 19, 11, 135);
    expect(corto).toEqual({ texto: 'Ana', tamano: 19 });

    const largo = ajustarAlAncho('Valentina Alejandra', negrita, 19, 11, 135);
    expect(largo.texto).toBe('Valentina Alejandra');
    expect(largo.tamano).toBeLessThan(19);
    expect(negrita.widthOfTextAtSize(largo.texto, largo.tamano)).toBeLessThanOrEqual(135);

    const imposible = ajustarAlAncho('MMMMMMMMMMMMMMMMMMMM', negrita, 19, 11, 135);
    expect(imposible.tamano).toBe(11);
    expect(imposible.texto).toMatch(/^M+\.\.\.$/);
    expect(negrita.widthOfTextAtSize(imposible.texto, 11)).toBeLessThanOrEqual(135);

    const pdf = await new PdfLibTarjetas().generar({
      nombreAula: 'Aula multigrado de 3.° y 4.° grado - turno tarde',
      tarjetas: [{ estudianteId: 'e1', alias: 'Valentina Alejandra', avatar: 'zorro', nombreAula: 'Aula multigrado de 3.° y 4.° grado - turno tarde', pin: '4826' }],
    });
    const textos = textosDelPdf(pdf);
    expect(textos).toContain('Valentina Alejandra');
    expect(textos.find((t) => t.startsWith('Aula multigrado'))).toMatch(/\.\.\.$/);
    expect(pinesDelPdf(pdf)).toEqual(['4826']);
  });

  it('los caracteres que la fuente del PDF no tiene no rompen la hoja', async () => {
    const pdf = await new PdfLibTarjetas().generar({
      nombreAula: 'Aula 🌟',
      tarjetas: [{ estudianteId: 'e1', alias: 'Zoë', avatar: 'desconocido', nombreAula: 'Aula 🌟', pin: '4826' }],
    });
    expect(textosDelPdf(pdf)).toEqual(expect.arrayContaining(['Zoë', 'Aula ??', 'desconocido']));
  });
});

describe('Auditoría (RF-077)', () => {
  it('registra actor, acción, recurso, fecha e IP; una IP inválida queda como desconocida', async () => {
    const guardados: Auditoria[] = [];
    const caso = new RegistrarAuditoriaUseCase({ agregar: async (r) => void guardados.push(r) }, () => 'aud-1');
    const base = {
      actorId: 'fam-1', actorRol: 'FAMILIAR', accion: 'FAMILIAR_VINCULADO', recursoTipo: 'perfil_estudiante',
      recursoId: 'est-1', datos: { aulaId: 'aula-1' }, ocurridoEn: new Date('2026-10-15T15:00:00Z'),
    };

    expect(await caso.ejecutar({ ...base, ip: '::ffff:127.0.0.1' })).toEqual({ id: 'aud-1' });
    await caso.ejecutar({ ...base, ip: 'desconocida' });
    expect(guardados.map((g) => g.propsSnapshot.ip)).toEqual(['::ffff:127.0.0.1', null]);
    expect(guardados[0]?.propsSnapshot).toMatchObject({ actorId: 'fam-1', accion: 'FAMILIAR_VINCULADO', recursoId: 'est-1', datos: { aulaId: 'aula-1' } });
  });

  it('exige la acción y el tipo de recurso', () => {
    expect(() =>
      Auditoria.registrar({ id: 'x', actorId: null, actorRol: null, accion: ' ', recursoTipo: 'aula', recursoId: null, ip: null, datos: {}, ocurridoEn: new Date() }),
    ).toThrow(/acción/);
  });
});
