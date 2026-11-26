import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FRASES, GloboFestejo, unaDe } from '@/features/gamificacion/Festejo';
import { lograsteEn } from '@/features/gamificacion/LogrosDeLectura';
import { Pasaporte } from '@/features/gamificacion/tipos';
import { MELODIAS } from '@/features/lectura/sonidos';

const sinMarcas = (html: string) => html.replace(/<!-- -->/g, '');

describe('[Gamificacion][Menor][Fast] La celebración con brillitos y sonido', () => {
  it('la estrellita aparece con su globito, su emoji y 12 brillitos de adorno, y avisa a los lectores de pantalla', () => {
    const html = sinMarcas(renderToStaticMarkup(<GloboFestejo festejo={{ titulo: '¡Ganaste la insignia «Primera lectura»!', texto: '¡Lo lograste leyendo!', emoji: '📖' }} />));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('¡Ganaste la insignia «Primera lectura»!');
    expect(html).toContain('¡Lo lograste leyendo!');
    expect(html).toContain('📖');
    expect(html.match(/--angulo:/g)).toHaveLength(12);
    expect(html).toContain('class="festejo__quien" aria-hidden="true"');
  });

  it('al ponerse algo aparece su avatar luciéndolo (de adorno: no repite «Tu avatar» para los lectores de pantalla)', () => {
    const html = renderToStaticMarkup(
      <GloboFestejo festejo={{ titulo: '¡Te ves genial con tu Lupa de detective!', avatar: { avatar: 'panda', accesorio: 'LUPA', personaje: null } }} saliendo />,
    );
    expect(html).toContain('festejo--sale');
    expect(html).not.toContain('Tu avatar');
  });

  it('sin nada que celebrar no muestra nada', () => {
    expect(renderToStaticMarkup(<GloboFestejo festejo={null} />)).toBe('');
  });

  it('las frases nombran lo que ganó y cambian entre varias', () => {
    expect(FRASES.accesorio('Gorro de explorador').every((f) => f.includes('Gorro de explorador'))).toBe(true);
    expect(FRASES.personaje('Dragón lector').every((f) => f.includes('Dragón lector'))).toBe(true);
    expect(FRASES.canje('Lupa').some((f) => f.includes('ya es tuya'))).toBe(false); // no repite el aviso de la tienda
    const opciones = FRASES.insignia('Primera lectura');
    expect(opciones).toContain(unaDe(opciones));
  });

  it('los sonidos de premio suben (suenan a alegría): la moneda, los destellos al ponerse algo y la medalla', () => {
    for (const nombre of ['moneda', 'vestir', 'insignia'] as const) {
      const primeras = MELODIAS[nombre].notas.filter(([, inicio]) => inicio < 0.3).map(([f]) => f);
      expect(primeras).toEqual([...primeras].sort((a, b) => a - b));
      expect(MELODIAS[nombre].timbre).toBe('campanita');
    }
  });

  it('al terminar una lectura sabe qué ganó: puntos, insignias nuevas y si subió de nivel', () => {
    const base = { puntos: { total: 100, hoy: 0, topeDiario: 300 }, nivel: { actual: 1, desde: 80, hasta: 200, faltan: 100 } } as Partial<Pasaporte>;
    const insignia = (codigo: string, ganada: boolean) => ({ codigo, nombre: codigo, descripcion: '', ganada, otorgadaEn: null, avance: null, meta: null });
    const antes = { ...base, insignias: [insignia('PRIMERA_LECTURA', false), insignia('OTRA', true)] } as Pasaporte;
    const ahora = { ...base, puntos: { total: 230, hoy: 130, topeDiario: 300 }, nivel: { actual: 2, desde: 200, hasta: 350, faltan: 120 }, insignias: [insignia('PRIMERA_LECTURA', true), insignia('OTRA', true)] } as Pasaporte;
    const r = lograsteEn(antes, ahora);
    expect(r.puntos).toBe(130);
    expect(r.subio).toBe(true);
    expect(r.nuevas.map((i) => i.codigo)).toEqual(['PRIMERA_LECTURA']);
  });
});
