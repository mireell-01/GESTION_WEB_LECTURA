import { ReactNode } from 'react';

/**
 * El mensaje del cuento: el último párrafo de las lecturas que dejan un valor para la vida, en una sola
 * oración que empieza con «Moraleja:» (cuentos y fábulas) o «Para reflexionar:» (textos informativos). Se
 * lee y se escucha como el resto del texto, pero se muestra destacado, con un corazón, para que el niño
 * lo reconozca y lo recuerde.
 */
const MENSAJE = /^(Moraleja|Para reflexionar)\s*:\s*/i;

export function esMensaje(texto: string): boolean {
  return MENSAJE.test(texto.trim());
}

/** El mensaje sin su etiqueta y con mayúscula inicial: «Moraleja: cuidar…» → «Cuidar…». */
export function textoDelMensaje(texto: string): string {
  const t = texto.trim().replace(MENSAJE, '');
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}

/** El mensaje de una lectura: su último párrafo, si es una sola oración con la etiqueta. */
export function mensajeDe(parrafos: { oraciones: { texto: string }[] }[]): string | null {
  const ultimo = parrafos[parrafos.length - 1];
  const oracion = ultimo?.oraciones.length === 1 ? ultimo.oraciones[0]?.texto : undefined;
  return oracion && esMensaje(oracion) ? oracion : null;
}

export function Corazon({ tamano = 28 }: { tamano?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} aria-hidden="true" focusable="false" className="mensaje-cuento__corazon">
      <path d="M12 21s-8-4.8-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6.2-8 11-8 11z" fill="#ff5c8a" />
      <path d="M8 8.2a2.4 2.4 0 0 1 2.2-1.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".8" />
    </svg>
  );
}

/** El recuadro del mensaje dentro del texto: guarda las oraciones tal cual (para la voz y las evidencias). */
export function RecuadroMensaje({ children }: { children: ReactNode }) {
  return (
    <div className="mensaje-cuento">
      <Corazon />
      <div className="mensaje-cuento__cuerpo">
        <p className="mensaje-cuento__titulo" aria-hidden="true">
          El mensaje del cuento
        </p>
        {children}
      </div>
    </div>
  );
}
