/**
 * Los sonidos de la lectura, creados con la Web Audio API del navegador: no hay archivos que descargar
 * (RNF-006). Una melodía alegre al acertar, un tono suave cuando le falta poco, uno para la pista y una
 * fanfarria al terminar. Solo suenan tras un toque del niño (los navegadores no dejan sonar antes) y se
 * pueden apagar; la preferencia queda guardada en este dispositivo.
 */
export type Sonido = 'acierto' | 'enviado' | 'casi' | 'pista' | 'final';

/** [frecuencia en Hz, inicio en segundos, duración en segundos] */
type Nota = [number, number, number];

export const MELODIAS: Record<Sonido, { forma: OscillatorType; notas: Nota[] }> = {
  // Do, mi, sol: un acorde que sube.
  acierto: { forma: 'triangle', notas: [[523.25, 0, 0.16], [659.25, 0.1, 0.16], [783.99, 0.2, 0.32]] },
  // Re, la: "¡listo!".
  enviado: { forma: 'triangle', notas: [[587.33, 0, 0.14], [880, 0.1, 0.26]] },
  // La, sol: baja suave, sin sonar a error.
  casi: { forma: 'sine', notas: [[440, 0, 0.18], [392, 0.16, 0.3]] },
  // Mi, sol, mi: un guiño.
  pista: { forma: 'sine', notas: [[659.25, 0, 0.12], [783.99, 0.1, 0.12], [659.25, 0.2, 0.2]] },
  // Do, mi, sol y do agudo: fanfarria.
  final: { forma: 'triangle', notas: [[523.25, 0, 0.14], [659.25, 0.13, 0.14], [783.99, 0.26, 0.14], [1046.5, 0.4, 0.6]] },
};

const CLAVE = 'lectoaventura.sonido';

export function sonidoActivo(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) !== 'no';
  } catch {
    return true;
  }
}

export function guardarSonido(activo: boolean): void {
  try {
    window.localStorage.setItem(CLAVE, activo ? 'si' : 'no');
  } catch {
    // Sin almacenamiento (ventana privada): la preferencia vale solo mientras la página esté abierta.
  }
}

let contexto: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  contexto ??= new Constructor();
  if (contexto.state === 'suspended') void contexto.resume();
  return contexto;
}

/** Toca la melodía, si el sonido está activo y el navegador puede (si no, no pasa nada). */
export function sonar(nombre: Sonido): void {
  if (!sonidoActivo()) return;
  try {
    const c = audio();
    if (!c) return;
    const { forma, notas } = MELODIAS[nombre];
    for (const [frecuencia, inicio, duracion] of notas) {
      const t = c.currentTime + inicio;
      const oscilador = c.createOscillator();
      const volumen = c.createGain();
      oscilador.type = forma;
      oscilador.frequency.value = frecuencia;
      volumen.gain.setValueAtTime(0.0001, t);
      volumen.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
      oscilador.connect(volumen).connect(c.destination);
      oscilador.start(t);
      oscilador.stop(t + duracion + 0.05);
    }
  } catch {
    // Un navegador sin audio no debe interrumpir la lectura.
  }
}
