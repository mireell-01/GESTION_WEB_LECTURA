import { describe, expect, it } from 'vitest';

import { CUENTOS } from '../../../api/prisma/contenido-inicial/index.mjs';
import { escenaDe, repartoDe } from '@/features/lectura/IlustracionLectura';

/**
 * Los cuentos del contenido inicial se ilustran solos (sin imágenes subidas): la escena sale de sus palabras.
 * Esta prueba cuida que la imagen tenga relación con el cuento: la portada no es la escena genérica de un día
 * en el campo, y cada párrafo muestra al personaje, el lugar o el momento del día que cuenta.
 */
interface Cuento {
  clave: string;
  titulo: string;
  texto: string[][];
}

const cuentos = CUENTOS as Cuento[];
const generica = (e: ReturnType<typeof escenaDe>) => e.cielo === 'dia' && e.lugar === 'campo' && e.animales.join() === 'mariposa';
const hablaDeMariposas = (t: string) => /mariposa|abeja|flor/i.test(t.normalize('NFD').replace(/\p{M}/gu, ''));

describe('[Lectura][Menor][Fast] Las escenas de los cuentos del contenido inicial', () => {
  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: la portada muestra algo del título', (_clave, c) => {
    const portada = escenaDe(c.titulo, repartoDe(c.titulo));
    expect(generica(portada) && !hablaDeMariposas(c.titulo), c.titulo).toBe(false);
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: ningún párrafo cae en la escena genérica', (_clave, c) => {
    const parrafos = c.texto.map((p) => p.join(' '));
    const reparto = repartoDe(c.titulo, parrafos[0]);
    for (const p of parrafos) {
      const escena = escenaDe(p, reparto);
      expect(generica(escena) && !hablaDeMariposas(`${c.titulo} ${p}`), `${c.titulo}: «${p.slice(0, 60)}…»`).toBe(false);
    }
  });
});
