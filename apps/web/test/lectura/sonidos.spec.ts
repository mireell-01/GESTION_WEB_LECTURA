import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Modulo = typeof import('@/features/lectura/sonidos');

const nodo = () => ({ connect: (siguiente: unknown) => siguiente });
const parametro = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });

/** Un AudioContext de mentira: anota cada oscilador que suena (frecuencia, inicio y fin). */
class AudioFalso {
  static creados: AudioFalso[] = [];
  state = 'suspended';
  currentTime = 10;
  destination = {};
  osciladores: { frecuencia: number; inicio: number; fin: number }[] = [];
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  constructor() {
    AudioFalso.creados.push(this);
  }

  createOscillator() {
    const o = { frecuencia: 0, inicio: 0, fin: 0 };
    this.osciladores.push(o);
    return {
      ...nodo(),
      type: '',
      frequency: {
        set value(v: number) {
          o.frecuencia = v;
        },
      },
      start: (t: number) => {
        o.inicio = t;
      },
      stop: (t: number) => {
        o.fin = t;
      },
    };
  }

  createGain() {
    return { ...nodo(), gain: parametro() };
  }

  createDelay() {
    return { ...nodo(), delayTime: parametro() };
  }

  createBiquadFilter() {
    return { ...nodo(), type: '', frequency: parametro() };
  }
}

function almacenamiento(): Storage {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: () => null,
    get length() {
      return datos.size;
    },
  };
}

let sonidos: Modulo;

beforeEach(async () => {
  AudioFalso.creados = [];
  vi.stubGlobal('window', { localStorage: almacenamiento(), AudioContext: AudioFalso });
  vi.resetModules();
  sonidos = await import('@/features/lectura/sonidos');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('[Lectura][Menor][Fast] Los sonidos de la lectura', () => {
  it('cada melodía es corta y agradable: notas en el rango cómodo del oído y en poco más de dos segundos', () => {
    for (const { notas } of Object.values(sonidos.MELODIAS)) {
      expect(notas.length).toBeGreaterThan(0);
      for (const [frecuencia, inicio, duracion, volumen = 1] of notas) {
        expect(frecuencia).toBeGreaterThanOrEqual(200);
        expect(frecuencia).toBeLessThanOrEqual(2200);
        expect(inicio + duracion).toBeLessThanOrEqual(2.1);
        expect(volumen).toBeGreaterThan(0);
        expect(volumen).toBeLessThanOrEqual(1);
      }
    }
  });

  it('cada timbre tiene su nota principal entera y brillos más bajitos que se apagan antes', () => {
    for (const parciales of Object.values(sonidos.TIMBRES)) {
      expect(parciales[0]).toEqual([1, 1, 1]);
      for (const [, volumen, fraccion] of parciales.slice(1)) {
        expect(volumen).toBeLessThan(1);
        expect(fraccion).toBeLessThanOrEqual(1);
      }
    }
  });

  it('el acierto y la fanfarria suben (suenan a alegría); el «casi» baja suave, con soplo y no con campana', () => {
    const tonos = (n: keyof Modulo['MELODIAS']) => sonidos.MELODIAS[n].notas.map(([f]) => f);
    const acierto = tonos('acierto');
    expect(acierto).toEqual([...acierto].sort((a, b) => a - b));
    const fanfarria = tonos('final');
    expect(fanfarria[0]).toBeLessThan(fanfarria[fanfarria.length - 3] as number);
    const casi = tonos('casi');
    expect(casi[casi.length - 1]).toBeLessThan(casi[0] as number);
    expect(sonidos.MELODIAS.casi.timbre).toBe('soplo');
    expect(sonidos.MELODIAS.acierto.timbre).toBe('campanita');
  });

  it('al acertar toca do, mi, sol y do agudo, una nota tras otra, cada una con sus brillos, y despierta el audio', () => {
    sonidos.sonar('acierto');
    const [audio] = AudioFalso.creados;
    expect(audio?.resume).toHaveBeenCalled();
    const parciales = sonidos.TIMBRES.campanita.length;
    expect(audio?.osciladores).toHaveLength(4 * parciales);
    const fundamentales = audio?.osciladores.filter((_, i) => i % parciales === 0) ?? [];
    expect(fundamentales.map((o) => o.frecuencia)).toEqual([523.25, 659.25, 783.99, 1046.5]);
    expect(fundamentales.map((o) => o.inicio)).toEqual([10, 10.09, 10.18, 10.27].map((t) => expect.closeTo(t, 6)));
    for (const o of audio?.osciladores ?? []) expect(o.fin).toBeGreaterThan(o.inicio);
  });

  it('usa un solo AudioContext para todos los sonidos', () => {
    sonidos.sonar('acierto');
    sonidos.sonar('pista');
    sonidos.sonar('final');
    expect(AudioFalso.creados).toHaveLength(1);
  });

  it('el sonido viene prendido; si el niño lo apaga, queda apagado en este dispositivo y no suena nada', () => {
    expect(sonidos.sonidoActivo()).toBe(true);
    sonidos.guardarSonido(false);
    expect(sonidos.sonidoActivo()).toBe(false);
    sonidos.sonar('acierto');
    expect(AudioFalso.creados).toHaveLength(0);
    sonidos.guardarSonido(true);
    expect(sonidos.sonidoActivo()).toBe(true);
  });

  it('sin almacenamiento (ventana privada) el sonido sigue prendido y nada se rompe', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('bloqueado');
      },
      AudioContext: AudioFalso,
    });
    expect(sonidos.sonidoActivo()).toBe(true);
    expect(() => sonidos.guardarSonido(false)).not.toThrow();
  });

  it('un navegador sin audio, o que falla al crearlo, no interrumpe la lectura', () => {
    vi.stubGlobal('window', { localStorage: almacenamiento() });
    expect(() => sonidos.sonar('acierto')).not.toThrow();
    vi.stubGlobal('window', {
      localStorage: almacenamiento(),
      AudioContext: class {
        constructor() {
          throw new Error('sin audio');
        }
      },
    });
    expect(() => sonidos.sonar('final')).not.toThrow();
  });

  it('en el servidor (sin window) no hace nada', () => {
    vi.stubGlobal('window', undefined);
    expect(() => sonidos.sonar('acierto')).not.toThrow();
    expect(sonidos.sonidoActivo()).toBe(true);
  });
});
