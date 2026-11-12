import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Modulo = typeof import('@/features/lectura/sonidos');

/** Un AudioContext de mentira: anota cada nota que se toca. */
class AudioFalso {
  static creados: AudioFalso[] = [];
  state = 'suspended';
  currentTime = 10;
  destination = {};
  notas: { forma: string; frecuencia: number; inicio: number; fin: number }[] = [];
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  constructor() {
    AudioFalso.creados.push(this);
  }

  createOscillator() {
    const nota = { forma: '', frecuencia: 0, inicio: 0, fin: 0 };
    this.notas.push(nota);
    return {
      set type(v: string) {
        nota.forma = v;
      },
      frequency: {
        set value(v: number) {
          nota.frecuencia = v;
        },
      },
      connect: (siguiente: unknown) => siguiente,
      start: (t: number) => {
        nota.inicio = t;
      },
      stop: (t: number) => {
        nota.fin = t;
      },
    };
  }

  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (siguiente: unknown) => siguiente };
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
  it('cada melodía es corta y suave para el oído: notas audibles y en menos de un segundo y medio', () => {
    for (const { notas } of Object.values(sonidos.MELODIAS)) {
      expect(notas.length).toBeGreaterThan(0);
      for (const [frecuencia, inicio, duracion] of notas) {
        expect(frecuencia).toBeGreaterThanOrEqual(200);
        expect(frecuencia).toBeLessThanOrEqual(1200);
        expect(inicio + duracion).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('el acierto y la fanfarria suben (suenan a alegría); el «casi» baja suave, sin sonar a error', () => {
    const tonos = (n: keyof Modulo['MELODIAS']) => sonidos.MELODIAS[n].notas.map(([f]) => f);
    for (const n of ['acierto', 'final'] as const) {
      const t = tonos(n);
      expect(t).toEqual([...t].sort((a, b) => a - b));
    }
    const casi = tonos('casi');
    expect(casi[casi.length - 1]).toBeLessThan(casi[0] as number);
    expect(sonidos.MELODIAS.casi.forma).toBe('sine');
  });

  it('al acertar toca do, mi y sol, una nota tras otra, y despierta el audio del navegador', () => {
    sonidos.sonar('acierto');
    const [audio] = AudioFalso.creados;
    expect(audio?.resume).toHaveBeenCalled();
    expect(audio?.notas.map((n) => n.frecuencia)).toEqual([523.25, 659.25, 783.99]);
    expect(audio?.notas.map((n) => n.inicio)).toEqual([10, 10.1, 10.2]);
    for (const n of audio?.notas ?? []) expect(n.fin).toBeGreaterThan(n.inicio);
  });

  it('usa un solo AudioContext para todos los sonidos', () => {
    sonidos.sonar('acierto');
    sonidos.sonar('pista');
    sonidos.sonar('final');
    expect(AudioFalso.creados).toHaveLength(1);
    expect(AudioFalso.creados[0]?.notas).toHaveLength(3 + 3 + 4);
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
