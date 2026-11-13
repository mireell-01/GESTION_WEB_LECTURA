import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ArteMundo } from '@/features/aventura/ArteMundo';
import { temaDe, TemasBiblioteca, TEMAS_BIBLIOTECA } from '@/features/contenido/TemasBiblioteca';
import { EscenaAnimada, escenaDe } from '@/features/lectura/IlustracionLectura';
import { esMensaje, mensajeDe, RecuadroMensaje, textoDelMensaje } from '@/features/lectura/MensajeCuento';

const parrafo = (...oraciones: string[]) => ({ oraciones: oraciones.map((texto) => ({ texto })) });

describe('[Lectura][Menor][Fast] El mensaje del cuento (su moraleja)', () => {
  it('reconoce el último párrafo con «Moraleja:» o «Para reflexionar:» y lo muestra sin la etiqueta', () => {
    expect(esMensaje('Moraleja: compartir nos hace felices.')).toBe(true);
    expect(esMensaje('Para reflexionar: el agua viene de lejos.')).toBe(true);
    expect(esMensaje('La moraleja de Pancha era otra.')).toBe(false);
    expect(textoDelMensaje('Moraleja: compartir nos hace felices.')).toBe('Compartir nos hace felices.');
    expect(mensajeDe([parrafo('Había una vez una llama.'), parrafo('Moraleja: cuidar es querer.')])).toBe('Moraleja: cuidar es querer.');
  });

  it('sin moraleja (o si el último párrafo tiene más de una oración) no inventa un mensaje', () => {
    expect(mensajeDe([parrafo('Había una vez una llama.')])).toBeNull();
    expect(mensajeDe([parrafo('Moraleja: una.', 'Y otra oración.')])).toBeNull();
    expect(mensajeDe([])).toBeNull();
  });

  it('el recuadro lleva su título y su corazón decorativos y deja el texto tal cual', () => {
    const html = renderToStaticMarkup(
      <RecuadroMensaje>
        <p>Moraleja: cuidar es querer.</p>
      </RecuadroMensaje>,
    );
    expect(html).toContain('El mensaje del cuento');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<p>Moraleja: cuidar es querer.</p>');
  });
});

describe('[Lectura][Menor][Fast] Los personajes y lugares de los cuentos clásicos', () => {
  it('el castillo y el palacio de los clásicos tienen su escena, con banderas', () => {
    expect(escenaDe('El rey vivía en un castillo muy alto.').lugar).toBe('castillo');
    expect(escenaDe('La princesa salió del palacio.').lugar).toBe('castillo');
    expect(renderToStaticMarkup(<EscenaAnimada texto="El emperador y su palacio" />)).toContain('escena__bandera');
  });

  it('salen el lobo, los cerditos, los osos, el ratón, la tortuga, el león y el burro', () => {
    expect(escenaDe('El lobo sopló la casa de los cerditos.').animales).toEqual(expect.arrayContaining(['lobo', 'cerdo']));
    expect(escenaDe('Los tres osos y el osito').animales).toContain('oso');
    expect(escenaDe('La liebre y la tortuga').animales).toEqual(expect.arrayContaining(['conejo', 'tortuga']));
    expect(escenaDe('El león y el ratón').animales).toEqual(expect.arrayContaining(['leon', 'raton']));
    expect(escenaDe('Un burro viejo quería ser músico').animales).toContain('burro');
    expect(escenaDe('La golondrina y el ruiseñor').animales).toContain('aves');
  });

  it('lo de antes no cambia: el lago de Puno sigue siendo agua y los cerros, montaña', () => {
    expect(escenaDe('Killa vivía en Puno, junto al lago.').lugar).toBe('agua');
    expect(escenaDe('Subió al cerro nevado.').lugar).toBe('montana');
  });
});

describe('[Aventura][Menor][Fast] El dibujo de cada mundo', () => {
  it('cada uno de los 5 mundos tiene su propia escena', () => {
    const dibujos = [1, 2, 3, 4, 5].map((n) => renderToStaticMarkup(<ArteMundo numero={n} />));
    dibujos.forEach((html, i) => {
      expect(html).toContain(`data-mundo="${i + 1}"`);
      expect(html).toContain('aria-hidden="true"');
    });
    // Sin repetir: el Detective tiene su lupa, el Crítico su búho, el Maestro su libro…
    expect(dibujos[1]).toContain('arte__lupa');
    expect(dibujos[3]).toContain('arte__buho');
    expect(dibujos[4]).toContain('arte__libro');
    expect(new Set(dibujos.map((h) => h.replace(/data-mundo="\d"|arte-mundo--\d/g, ''))).size).toBe(5);
  });

  it('un mundo que no conoce se dibuja como el primero', () => {
    expect(renderToStaticMarkup(<ArteMundo numero={9} />)).toContain('arte__bandera');
  });
});

describe('[Contenido][Menor][Fast] Los temas de la biblioteca del niño', () => {
  it('cada temática cae en su tema con dibujo, sin importar mayúsculas', () => {
    expect(temaDe('Animales de los Andes')?.nombre).toBe('Animales');
    expect(temaDe('Cuentos clásicos')?.nombre).toBe('Cuentos clásicos');
    expect(temaDe('Fábulas andinas')?.nombre).toBe('Fábulas');
    expect(temaDe('Misterios')?.nombre).toBe('Misterios');
    expect(temaDe('Noticias')).toBeNull();
  });

  it('los temas se tocan (botones), el elegido queda marcado y «Todos» quita el filtro', () => {
    const html = renderToStaticMarkup(<TemasBiblioteca elegido="clásicos" alElegir={() => undefined} />);
    expect(html).toContain('¿De qué quieres leer hoy?');
    expect((html.match(/<button/g) ?? []).length).toBe(TEMAS_BIBLIOTECA.length + 1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Cuentos clásicos/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*?Todos/);
  });
});
