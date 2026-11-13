/**
 * Los sonidos de la lectura, creados con la Web Audio API del navegador: no hay archivos que descargar
 * (RNF-006). Cada nota suma unos pocos parciales que se apagan solos, como los instrumentos de verdad:
 * una campanita (celesta) para acertar y para la pista, una marimba para "¡listo!" y un soplo suave para
 * cuando le falta poco (sin sonar a error). Un eco corto y cálido los une. Solo suenan tras un toque del
 * niño (los navegadores no dejan sonar antes) y se pueden apagar; la preferencia queda en este dispositivo.
 */
export type Sonido = 'acierto' | 'enviado' | 'casi' | 'pista' | 'final';
export type Timbre = 'campanita' | 'marimba' | 'soplo';

/** [frecuencia en Hz, inicio en segundos, duración en segundos, volumen relativo (1 si se omite)] */
export type Nota = [number, number, number, number?];

/** Parciales de cada timbre: [múltiplo de la frecuencia, volumen, fracción de la duración que suena]. */
export const TIMBRES: Record<Timbre, [number, number, number][]> = {
  // Celesta: fundamental limpia y un brillo agudo que se apaga antes.
  campanita: [[1, 1, 1], [2, 0.3, 0.55], [3, 0.1, 0.3], [4.2, 0.05, 0.18]],
  // Marimba: golpe de madera cálido, con su armónico 4 característico que dura muy poco.
  marimba: [[1, 1, 1], [4, 0.22, 0.22], [9.2, 0.04, 0.08]],
  // Soplo: redondo como una flauta dulce.
  soplo: [[1, 1, 1], [2, 0.1, 0.8]],
};

const DO = 523.25;
const MI = 659.25;
const SOL = 783.99;
const DO_AGUDO = 1046.5;

export const MELODIAS: Record<Sonido, { timbre: Timbre; notas: Nota[] }> = {
  // Do, mi, sol y do agudo que suben como una escalera de campanitas: "¡lo lograste!".
  acierto: { timbre: 'campanita', notas: [[DO, 0, 0.5], [MI, 0.09, 0.5], [SOL, 0.18, 0.55], [DO_AGUDO, 0.27, 1.1]] },
  // Dos golpecitos de marimba: "¡listo!".
  enviado: { timbre: 'marimba', notas: [[SOL, 0, 0.35], [DO_AGUDO, 0.11, 0.6]] },
  // Mi y do suaves, como un "mmm… casi": invita a intentarlo otra vez.
  casi: { timbre: 'soplo', notas: [[MI, 0, 0.35, 0.8], [DO, 0.2, 0.55, 0.8]] },
  // Destellos de varita mágica: tres notas agudas y bajitas que suben.
  pista: { timbre: 'campanita', notas: [[1318.51, 0, 0.3, 0.45], [1567.98, 0.07, 0.3, 0.45], [2093, 0.14, 0.5, 0.4]] },
  // Fanfarria: sol, do, mi, sol… y un acorde de do mayor que queda sonando.
  final: {
    timbre: 'campanita',
    notas: [
      [392, 0, 0.3], [DO, 0.12, 0.3], [MI, 0.24, 0.3], [SOL, 0.36, 0.4], [MI, 0.52, 0.25], [SOL, 0.62, 0.3],
      [DO_AGUDO, 0.74, 1.3], [SOL, 0.74, 1.3, 0.5], [MI, 0.74, 1.3, 0.5],
    ],
  },
};

/** Volumen de cada nota antes del volumen general: con acordes de tres notas no satura. */
const VOLUMEN_NOTA = 0.22;
const VOLUMEN_GENERAL = 0.6;
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

let audio: { contexto: AudioContext; salida: AudioNode } | null = null;

/** Un solo AudioContext con su salida: volumen general y un eco corto, cálido (sin agudos) y que se apaga. */
function prepararAudio(): { contexto: AudioContext; salida: AudioNode } | null {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  if (!audio) {
    const contexto = new Constructor();
    const salida = contexto.createGain();
    salida.gain.value = VOLUMEN_GENERAL;
    salida.connect(contexto.destination);
    const eco = contexto.createDelay(1);
    eco.delayTime.value = 0.16;
    const repite = contexto.createGain();
    repite.gain.value = 0.28;
    const calido = contexto.createBiquadFilter();
    calido.type = 'lowpass';
    calido.frequency.value = 2400;
    salida.connect(eco);
    eco.connect(calido);
    calido.connect(repite);
    repite.connect(eco);
    repite.connect(contexto.destination);
    audio = { contexto, salida };
  }
  if (audio.contexto.state === 'suspended') void audio.contexto.resume();
  return audio;
}

/** Toca la melodía, si el sonido está activo y el navegador puede (si no, no pasa nada). */
export function sonar(nombre: Sonido): void {
  if (!sonidoActivo()) return;
  try {
    const a = prepararAudio();
    if (!a) return;
    const { timbre, notas } = MELODIAS[nombre];
    for (const [frecuencia, inicio, duracion, volumen = 1] of notas) {
      const t = a.contexto.currentTime + inicio;
      for (const [multiplo, parcial, fraccion] of TIMBRES[timbre]) {
        const oscilador = a.contexto.createOscillator();
        const envolvente = a.contexto.createGain();
        const fin = t + Math.max(0.05, duracion * fraccion);
        oscilador.type = 'sine';
        oscilador.frequency.value = frecuencia * multiplo;
        // Ataque casi inmediato (como un golpe suave) y caída exponencial, natural para el oído.
        envolvente.gain.setValueAtTime(0.0001, t);
        envolvente.gain.exponentialRampToValueAtTime(VOLUMEN_NOTA * volumen * parcial, t + 0.008);
        envolvente.gain.exponentialRampToValueAtTime(0.0001, fin);
        oscilador.connect(envolvente).connect(a.salida);
        oscilador.start(t);
        oscilador.stop(fin + 0.05);
      }
    }
  } catch {
    // Un navegador sin audio no debe interrumpir la lectura.
  }
}
