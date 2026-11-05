import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EscenaAnimada, escenaDe, IlustracionParrafo, repartoDe } from '@/features/lectura/IlustracionLectura';

const REPARTO_ZORRO = repartoDe('El zorro y la luna');

describe('[Lectura][Menor][Fast] Qué escena pinta cada párrafo', () => {
  it('la portada de "El zorro y la luna" es de noche y sale el zorro', () => {
    const escena = escenaDe('El zorro y la luna', REPARTO_ZORRO);
    expect(escena.cielo).toBe('noche');
    expect(escena.animales).toContain('zorro');
  });

  it('el protagonista acompaña aunque el párrafo no lo nombre', () => {
    expect(escenaDe('Una tarde subió muy alto.', REPARTO_ZORRO).animales).toEqual(['zorro']);
  });

  it('el reparto también se toma del primer párrafo, no solo del título', () => {
    const reparto = repartoDe('Una tarde especial', 'Cada mañana Killa cuidaba a su llama Pancho.');
    expect(escenaDe('Un día no quiso comer.', reparto).animales).toEqual(['llama']);
  });

  it('el cielo y el lugar se eligen por separado: "subió al cerro… la luna" es un cerro de noche', () => {
    const escena = escenaDe('Una tarde subió al cerro más alto. Pero la luna seguía lejos.', REPARTO_ZORRO);
    expect(escena.cielo).toBe('noche');
    expect(escena.lugar).toBe('montana');
  });

  it('los que nombra el párrafo van primero; entre ellos, el del reparto', () => {
    const reparto = repartoDe('La rana y sus amigos');
    expect(escenaDe('El zorro miró a la rana.', reparto).animales.slice(0, 2)).toEqual(['rana', 'zorro']);
  });

  it('los peces solo aparecen junto al agua, aunque el primer párrafo los nombre', () => {
    const reparto = repartoDe('El pescador', 'Mira cómo saltan los peces.');
    expect(escenaDe('Volvió a su casa por el camino.', reparto).animales).not.toContain('peces');
    expect(escenaDe('En el lago saltan los peces.', reparto).animales).toContain('peces');
  });

  it('no confunde palabras parecidas: "gatillo" no es un gato ni "rancho" una rana', () => {
    expect(escenaDe('Apretó el gatillo en el rancho.').animales).toEqual(['mariposa']);
  });

  it('dos párrafos seguidos no salen iguales: la escena se mira desde el otro lado', () => {
    const texto = 'Un día muy tranquilo.';
    expect(escenaDe(texto, REPARTO_ZORRO, 1).espejo).not.toBe(escenaDe(texto, REPARTO_ZORRO, 2).espejo);
  });

  it('el mismo párrafo siempre pinta la misma escena', () => {
    expect(escenaDe('Había una vez.', REPARTO_ZORRO)).toEqual(escenaDe('Había una vez.', REPARTO_ZORRO));
  });

  it('un párrafo alegre trae arcoíris y uno neutro no', () => {
    expect(escenaDe('Pancho comió feliz.').alegre).toBe(true);
    expect(escenaDe('Pancho caminó.').alegre).toBe(false);
  });
});

describe('[Lectura][Menor][Fast] Lo que se dibuja', () => {
  it('dibuja al zorro y es decorativa: los lectores de pantalla la saltan', () => {
    const html = renderToStaticMarkup(<EscenaAnimada texto="El zorro miraba la luna." reparto={REPARTO_ZORRO} />);
    expect(html).toContain('escena__animal--zorro');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-cielo="noche"');
  });

  it('en una escena caben hasta 3 animales que caminan', () => {
    const html = renderToStaticMarkup(<EscenaAnimada texto="El perro, el gato, el cuy, la oveja y el conejo." />);
    expect(html.match(/escena__animal--/g)).toHaveLength(3);
  });

  it('cada escena usa ids propios, para que dos en la misma pantalla no se pisen los colores', () => {
    const html = renderToStaticMarkup(
      <>
        <EscenaAnimada texto="Uno." />
        <EscenaAnimada texto="Dos." />
      </>,
    );
    const ids = [...html.matchAll(/id="(cielo-[^"]+)"/g)].map(([, id]) => id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('sin imagen del editor pinta la escena; con imagen no la pinta', () => {
    const sin = renderToStaticMarkup(<IlustracionParrafo imagen={null} texto="El zorro." reparto="" />);
    const con = renderToStaticMarkup(<IlustracionParrafo imagen={{ url: '/x', textoAlternativo: 'Un zorro' }} texto="El zorro." reparto="" />);
    expect(sin).toContain('class="escena"');
    expect(con).not.toContain('class="escena"');
  });
});
