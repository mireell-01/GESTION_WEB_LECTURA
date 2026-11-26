import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  cuandoFue,
  EstanteLecturas,
  META_SEMANAL,
  PuntosDeHoy,
} from '@/features/gamificacion/RecuerdosPasaporte';
import { Pasaporte } from '@/features/gamificacion/tipos';

// Martes 24 de noviembre de 2026, 10:00 en Lima (15:00 UTC).
// React separa los textos con «<!-- -->»; se quitan para leer las frases enteras.
const sinMarcas = (html: string) => html.replace(/<!-- -->/g, '');

const AHORA = new Date('2026-11-24T15:00:00Z');

const pasaporte = (cambios: Partial<Pasaporte>): Pasaporte =>
  ({
    alias: 'Sami',
    avatar: 'panda',
    puntos: { total: 300, hoy: 0, topeDiario: 120 },
    nivel: { actual: 2, desde: 200, hasta: 417, faltan: 117 },
    monedas: 30,
    racha: { dias: 1, mejor: 1, leyoHoy: false, comodinDisponible: true },
    insignias: [],
    mundos: [],
    lecturas: { total: 0, recientes: [] },
    ultimosPuntos: [],
    recompensas: [],
    puestas: { accesorio: null, personaje: null },
    ...cambios,
  }) as Pasaporte;

describe('[Gamificacion][Menor][Fast] Pasaporte: el estante y mis puntos', () => {
  it('dice «Hoy», «Ayer» o la fecha corta, con la medianoche de Lima', () => {
    expect(cuandoFue('2026-11-24T05:00:00Z', AHORA)).toBe('Hoy'); // 00:00 en Lima
    expect(cuandoFue('2026-11-24T04:59:00Z', AHORA)).toBe('Ayer'); // 23:59 del lunes en Lima
    expect(cuandoFue('2026-11-23T06:00:00Z', AHORA)).toBe('Ayer');
    expect(cuandoFue('2026-11-13T15:00:00Z', AHORA)).toBe('13 nov');
  });

  it('los puntos de otros días llevan su fecha: el anillo en 0 ya no choca con la lista', () => {
    const html = sinMarcas(
      renderToStaticMarkup(
        <PuntosDeHoy
          ahora={AHORA}
          p={pasaporte({
            ultimosPuntos: [
              { motivo: 'LECTURA_COMPLETADA', puntos: 5, creadoEn: '2026-11-13T15:10:00Z' },
              { motivo: 'ITEM_CORRECTO', puntos: 10, creadoEn: '2026-11-13T15:05:00Z' },
              { motivo: 'ITEM_CORRECTO', puntos: 10, creadoEn: '2026-11-13T15:04:00Z' },
            ],
          })}
        />,
      ),
    );
    expect(html).toContain('Mis puntos');
    expect(html).toContain('Lo último que ganaste');
    expect(html).toContain('<b>0</b>');
    expect(html).toContain('¡Hoy es un gran día para leer!');
    expect(html).toContain('Lectura terminada');
    expect(html).toContain('2 respuestas correctas');
    expect(html.match(/<b>13 nov<\/b>/g)).toHaveLength(2);
    expect(html).not.toContain('<b>Hoy</b>');
  });

  it('agrupa por motivo y por día (no suma los de hoy con los de ayer) y muestra solo los 4 grupos más nuevos', () => {
    const html = sinMarcas(
      renderToStaticMarkup(
        <PuntosDeHoy
          ahora={AHORA}
          p={pasaporte({
            puntos: { total: 300, hoy: 10, topeDiario: 120 },
            ultimosPuntos: [
              { motivo: 'ITEM_CORRECTO', puntos: 10, creadoEn: '2026-11-24T15:00:00Z' },
              { motivo: 'ITEM_CORRECTO', puntos: 10, creadoEn: '2026-11-23T15:00:00Z' },
              { motivo: 'RESPUESTA_ABIERTA', puntos: 3, creadoEn: '2026-11-23T14:00:00Z' },
              { motivo: 'LECTURA_COMPLETADA', puntos: 5, creadoEn: '2026-11-20T14:00:00Z' },
              { motivo: 'RETO_DEL_DIA', puntos: 15, creadoEn: '2026-11-19T14:00:00Z' },
            ],
          })}
        />,
      ),
    );
    expect(html.match(/class="logro"/g)).toHaveLength(4);
    expect(html).toContain('<b>Hoy</b>');
    expect(html.match(/<b>Ayer<\/b>/g)).toHaveLength(2);
    expect(html).toContain('<b>20 nov</b>');
    expect(html).not.toContain('Reto del día');
  });

  it('el estante dice cuántas lecturas hay, deja la repisa con sus adornos ocultos y pinta los libritos de la meta', () => {
    const recientes = [
      { id: 'l1', titulo: 'Killa y la llama', finalizadaEn: new Date().toISOString() },
      { id: 'l2', titulo: 'El cóndor que perdió una pluma', finalizadaEn: '2020-01-01T12:00:00Z' },
    ];
    const html = sinMarcas(
      renderToStaticMarkup(<EstanteLecturas lecturas={{ total: 6, recientes }} />),
    );
    expect(html).toContain('6 lecturas');
    expect(html).toContain('Tus últimos libros: toca uno para volver a leerlo.');
    expect(html).toContain('aria-label="Volver a leer Killa y la llama"');
    expect(html).toContain('class="estante__adorno estante__adorno--planta" aria-hidden="true"');
    expect(html).toContain('class="estante__tabla" aria-hidden="true"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain(`aria-valuemax="${META_SEMANAL}"`);
    expect(html).toContain('aria-valuenow="1"');
    expect(html.match(/mini-libro mini-libro--hecho/g)).toHaveLength(1);
    expect(html.match(/class="mini-libro"/g)).toHaveLength(META_SEMANAL - 1);
    expect(html).toContain('1 de 5 libros');
  });

  it('con una sola lectura dice «1 lectura»', () => {
    const html = sinMarcas(
      renderToStaticMarkup(<EstanteLecturas lecturas={{ total: 1, recientes: [] }} />),
    );
    expect(html).toContain('1 lectura<');
    expect(html).toContain('Cada cuento que termines se guardará aquí.');
  });
});
