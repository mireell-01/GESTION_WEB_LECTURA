import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { gruposDeInsignias, InsigniasDelLector, TarjetaInsignia } from '@/features/gamificacion/InsigniasPasaporte';
import { Insignia } from '@/features/gamificacion/tipos';

// React separa los textos con «<!-- -->»; se quitan para leer las frases enteras.
const sinMarcas = (html: string) => html.replace(/<!-- -->/g, '');

const insignia = (codigo: string, nombre: string, cambios: Partial<Insignia> = {}): Insignia => ({
  codigo,
  nombre,
  descripcion: `Descripción de ${nombre}.`,
  ganada: false,
  otorgadaEn: null,
  avance: null,
  meta: null,
  ...cambios,
});

const CATALOGO: Insignia[] = [
  insignia('PRIMERA_LECTURA', 'Primera lectura', { ganada: true, otorgadaEn: '2026-10-30T15:00:00Z', avance: 1, meta: 1 }),
  insignia('DETECTIVE_EVIDENCIAS', 'Detective de Evidencias', { avance: 4, meta: 5 }),
  insignia('MAESTRO_INFERENCIAS', 'Maestro de las Inferencias'),
  insignia('LECTOR_PERSEVERANTE', 'Lector Perseverante', { avance: 0, meta: 7 }),
  insignia('RANGO_DETECTIVE', 'Rango Detective'),
  insignia('MAESTRO_LECTURA', 'Maestro de la Lectura'),
  insignia('RANGO_EXPLORADOR', 'Rango Explorador', { ganada: true, otorgadaEn: '2026-11-23T15:00:00Z' }),
  insignia('RANGO_CRITICO', 'Rango Crítico'),
  insignia('RANGO_INVESTIGADOR', 'Rango Investigador'),
];

describe('[Gamificacion][Menor][Fast] Pasaporte: las insignias ordenadas en dos grupos', () => {
  it('separa los logros de lector y los rangos, estos en el orden de los mundos, y marca el siguiente rango', () => {
    const { logros, rangos, siguiente } = gruposDeInsignias(CATALOGO);
    expect(logros.map((i) => i.codigo)).toEqual(['PRIMERA_LECTURA', 'DETECTIVE_EVIDENCIAS', 'MAESTRO_INFERENCIAS', 'LECTOR_PERSEVERANTE']);
    expect(rangos.map((i) => i.codigo)).toEqual(['RANGO_EXPLORADOR', 'RANGO_DETECTIVE', 'RANGO_INVESTIGADOR', 'RANGO_CRITICO', 'MAESTRO_LECTURA']);
    expect(siguiente).toBe('RANGO_DETECTIVE');
    expect(gruposDeInsignias(CATALOGO.map((i) => ({ ...i, ganada: true }))).siguiente).toBeNull();
  });

  it('la tarjeta cuenta cuántas lleva y pone cada grupo en su lista', () => {
    const html = sinMarcas(renderToStaticMarkup(<InsigniasDelLector insignias={CATALOGO} />));
    expect(html).toContain('<h2 id="insignias-titulo">Tus insignias</h2>');
    expect(html).toContain('2 de 9');
    expect(html).toContain('aria-labelledby="logros-titulo"');
    expect(html).toContain('aria-labelledby="rangos-titulo"');
    expect(html.match(/<li class="insignia/g)).toHaveLength(9);
    expect(html.match(/¡La siguiente!/g)).toHaveLength(1);
    expect(html).toContain('Mundo 5');
  });

  it('una ganada dice «¡Ganada!» con su fecha; una casi lista anima con «¡Te falta 1!»; la que falta dice «Por ganar»', () => {
    const [primera, detective, inferencias] = CATALOGO;
    const ganada = sinMarcas(renderToStaticMarkup(<TarjetaInsignia i={primera!} />));
    expect(ganada).toContain('insignia--ganada');
    expect(ganada).toContain('✓ ¡Ganada!');
    expect(ganada).toContain('30 de octubre');
    expect(ganada).toContain('¿Cómo la gané?');
    expect(ganada).not.toContain('insignia__candado');

    const casi = sinMarcas(renderToStaticMarkup(<TarjetaInsignia i={detective!} />));
    expect(casi).toContain('insignia--avance');
    expect(casi).toContain('4 de 5 · ¡Te falta 1!');
    expect(casi).toContain('insignia__candado');

    const falta = sinMarcas(renderToStaticMarkup(<TarjetaInsignia i={inferencias!} />));
    expect(falta).toContain('Por ganar');
    expect(falta).toContain('¿Cómo se gana?');
    // La pista está escondida hasta tocarla.
    expect(falta).toMatch(/<p id="pista-MAESTRO_INFERENCIAS" class="insignia__pista" hidden="">/);
  });
});
