'use client';

/**
 * Voz en el navegador, sin enviar audio a ningún servidor:
 *  - RF-050: lectura en voz alta (síntesis), oración por oración, a 0,75×, 1× o 1,25×.
 *  - RF-049: dictado (reconocimiento): el niño ve el texto y lo confirma antes de enviarlo; el audio
 *    nunca se guarda ni se envía.
 */

export const VELOCIDADES = [0.75, 1, 1.25] as const;

export function puedeLeerEnVozAlta(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Lee los textos en orden; avisa cuál empieza y cuándo termina. Devuelve cómo detenerlo. */
export function leerEnVozAlta(textos: string[], p: { velocidad: number; alEmpezar?: (i: number) => void; alTerminar?: () => void }): () => void {
  const voz = window.speechSynthesis;
  voz.cancel();
  let detenido = false;
  const leer = (i: number) => {
    if (detenido) return;
    if (i >= textos.length) {
      p.alTerminar?.();
      return;
    }
    const frase = new SpeechSynthesisUtterance(textos[i]);
    frase.lang = 'es-PE';
    frase.rate = p.velocidad;
    frase.onstart = () => p.alEmpezar?.(i);
    frase.onend = () => leer(i + 1);
    frase.onerror = () => leer(i + 1);
    voz.speak(frase);
  };
  leer(0);
  return () => {
    detenido = true;
    voz.cancel();
  };
}

interface Reconocimiento {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type ConstructorReconocimiento = new () => Reconocimiento;

function constructorReconocimiento(): ConstructorReconocimiento | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocimiento; webkitSpeechRecognition?: ConstructorReconocimiento };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function puedeDictar(): boolean {
  return constructorReconocimiento() !== null;
}

/** Escucha una frase y entrega su transcripción. Devuelve cómo detener la escucha. */
export function dictar(p: { alTexto: (texto: string) => void; alError: (mensaje: string) => void; alTerminar: () => void }): () => void {
  const Constructor = constructorReconocimiento();
  if (!Constructor) {
    p.alError('Tu dispositivo no permite dictar. Escribe tu respuesta.');
    p.alTerminar();
    return () => {};
  }
  const r = new Constructor();
  r.lang = 'es-PE';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const texto = Array.from(e.results)
      .map((res) => res[0]?.transcript ?? '')
      .join(' ')
      .trim();
    if (texto) p.alTexto(texto);
  };
  r.onerror = (e) => p.alError(e.error === 'not-allowed' ? 'Para dictar, permite el uso del micrófono.' : 'No te escuchamos bien. Inténtalo otra vez.');
  r.onend = p.alTerminar;
  r.start();
  return () => r.stop();
}
