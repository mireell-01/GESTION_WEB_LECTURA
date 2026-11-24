import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TarjetaValor, textosDelValor } from '@/features/lectura/ValorDelDia';
import { diaEnPeru, valorDelDia, VALORES_DEL_DIA } from '@/features/lectura/valores-del-dia';

// Los mismos 20 valores de los cuentos (apps/api/prisma/contenido-inicial/valores.mjs).
const VALORES_DE_LOS_CUENTOS = [
  'Amistad', 'Autoestima', 'Bondad', 'Cuidado del ambiente', 'Empatía', 'Esfuerzo', 'Generosidad', 'Gratitud', 'Honestidad',
  'Humildad', 'Identidad cultural', 'Justicia', 'Paciencia', 'Perseverancia', 'Prudencia', 'Respeto', 'Responsabilidad',
  'Solidaridad', 'Trabajo en equipo', 'Valentía',
];

describe('[Lectura][Menor][Fast] El valor del día en el Inicio', () => {
  it('son los 20 valores de los cuentos, sin repetir, cada uno con dibujito, frase y acción para hoy', () => {
    expect(VALORES_DEL_DIA.map((v) => v.nombre).sort()).toEqual([...VALORES_DE_LOS_CUENTOS].sort());
    for (const v of VALORES_DEL_DIA) {
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(v.frase).toMatch(/^[A-ZÁÉÍÓÚÑ¡¿].*\.$/);
      expect(v.practica).toMatch(/^[A-ZÁÉÍÓÚÑ¡¿].*\.$/);
      // Frases cortas: caben en la franja y un niño de 6 años las lee o las escucha de una vez.
      expect(v.frase.length).toBeLessThanOrEqual(55);
      expect(v.practica.length).toBeLessThanOrEqual(60);
    }
  });

  it('cambia a medianoche de Lima (no a la del reloj del equipo) y es el mismo durante todo el día', () => {
    const lunesTemprano = new Date('2026-11-23T05:00:00Z'); // 00:00 en Lima
    const lunesNoche = new Date('2026-11-24T04:59:00Z'); // 23:59 en Lima
    const martes = new Date('2026-11-24T05:00:00Z'); // 00:00 del día siguiente en Lima
    expect(diaEnPeru(lunesNoche)).toBe(diaEnPeru(lunesTemprano));
    expect(diaEnPeru(martes)).toBe(diaEnPeru(lunesTemprano) + 1);
    expect(valorDelDia(lunesNoche)).toBe(valorDelDia(lunesTemprano));
    expect(valorDelDia(martes)).not.toBe(valorDelDia(lunesTemprano));
  });

  it('en 20 días seguidos pasan los 20 valores, uno por día', () => {
    const inicio = new Date('2026-11-24T15:00:00Z').getTime();
    const vistos = new Set(Array.from({ length: 20 }, (_, i) => valorDelDia(new Date(inicio + i * 86_400_000)).nombre));
    expect(vistos.size).toBe(20);
  });

  it('la tarjeta lleva el valor, su frase y «Hoy intenta», con el título «Valor del día» para lectores de pantalla', () => {
    const valor = VALORES_DEL_DIA[0]!;
    const html = renderToStaticMarkup(<TarjetaValor valor={valor} />);
    expect(html).toContain('aria-labelledby="valor-dia-titulo"');
    expect(html).toContain('<h2 id="valor-dia-titulo"');
    expect(html).toContain('Valor del día');
    expect(html).toContain(valor.nombre);
    expect(html).toContain(valor.frase);
    expect(html).toContain('Hoy intenta:');
    expect(html).toContain(valor.practica);
    // Sin voz en el equipo, no hay parlante.
    expect(html).not.toContain('<button');
  });

  it('con voz muestra el parlante («Escuchar») y, mientras habla, el botón para detenerla', () => {
    const valor = VALORES_DEL_DIA[0]!;
    expect(renderToStaticMarkup(<TarjetaValor valor={valor} conVoz />)).toContain('aria-label="Escuchar el valor del día"');
    const hablando = renderToStaticMarkup(<TarjetaValor valor={valor} conVoz hablando />);
    expect(hablando).toContain('aria-label="Detener la voz"');
    expect(hablando).toContain('valor-dia__voz--hablando');
    expect(textosDelValor(valor)).toEqual([`Valor del día: ${valor.nombre}.`, valor.frase, `Hoy intenta: ${valor.practica}`]);
  });
});
