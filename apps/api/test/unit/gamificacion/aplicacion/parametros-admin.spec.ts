import { beforeEach, describe, expect, it } from 'vitest';

import type { ParametrosRepository, VersionParametros } from '../../../../src/modules/gamificacion/application/ports/parametros.repository';
import { ParametrosAdminUseCase } from '../../../../src/modules/gamificacion/application/use-cases/parametros-admin.use-case';
import { EVENTOS_GAMIFICACION } from '../../../../src/modules/gamificacion/domain/events/eventos-gamificacion';
import { leerParametros, PARAMETROS_POR_DEFECTO } from '../../../../src/modules/gamificacion/domain/services/parametros';
import { aJsonParametros, ParametrosInvalidosError, validarParametros } from '../../../../src/modules/gamificacion/domain/services/parametros-editables';
import { aplicarUmbrales } from '../../../../src/modules/gamificacion/domain/services/reglas-insignia';
import { CATALOGO, crearEntornoGamificacion, EntornoGamificacion } from '../dobles';

/** Nivel 1 — RF-078 (Módulo 12): la administración publica versiones nuevas de los parámetros. */
const NINO = 'nino-9';
const ADMIN = 'admin-1';
const CON_UMBRAL = ['PRIMERA_LECTURA', 'DETECTIVE_EVIDENCIAS', 'LECTOR_PERSEVERANTE'];

/** Una versión completa y válida (la del SRS, con un umbral ajustado). */
const editables = () => {
  const { version: _version, ...p } = structuredClone(PARAMETROS_POR_DEFECTO);
  return { ...p, nivelLector: { base: 100 }, insignias: { DETECTIVE_EVIDENCIAS: 3 } };
};

/** Las versiones guardadas, como `parametro_gamificacion`; el repositorio de juego lee la última. */
class VersionesEnMemoria implements ParametrosRepository {
  readonly filas: VersionParametros[] = [{ version: 1, vigenteDesde: new Date('2026-10-01T00:00:00Z'), creadoPor: null, creadoEn: new Date('2026-10-01T00:00:00Z'), parametros: aJsonParametros(editables()) }];
  async versiones() {
    return [...this.filas].sort((a, b) => b.version - a.version);
  }
  async publicar(p: { parametros: Record<string, unknown>; creadoPor: string; ahora: Date }) {
    const version = Math.max(...this.filas.map((f) => f.version)) + 1;
    this.filas.push({ version, vigenteDesde: p.ahora, creadoPor: p.creadoPor, creadoEn: p.ahora, parametros: p.parametros });
    return version;
  }
}

describe('[Gamificacion][Menor][Fast] Validación de una versión nueva (RF-078)', () => {
  it('acepta una versión completa en rango y la guarda en el formato de la versión 1', () => {
    const p = validarParametros(editables(), CON_UMBRAL);
    expect(p.insignias).toEqual({ DETECTIVE_EVIDENCIAS: 3 });
    const json = aJsonParametros(p);
    expect(json['nivelLector']).toEqual({ umbral: '100 * n * (n + 1) / 2' });
    // Lo que se guarda se vuelve a leer igual.
    expect(leerParametros(2, json)).toEqual({ version: 2, ...p });
  });

  it('rechaza valores fuera de rango, faltantes o sin sentido y dice qué corregir', () => {
    const malo = {
      ...editables(),
      puntos: { ...editables().puntos, itemCorrecto: -5, lecturaCompletada: 2.5, racha: {} },
      antiFarming: { porcentajeRepeticion: 120, topeDiario: 5 },
      nivelLector: {},
      respuestasAbiertas: { palabrasMinimasR2: 8, palabrasMinimasR3: 4 },
      insignias: { RANGO_DETECTIVE: 2, PRIMERA_LECTURA: 0 },
    };
    const error = (() => {
      try {
        validarParametros(malo, CON_UMBRAL);
      } catch (e) {
        return e as ParametrosInvalidosError;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(ParametrosInvalidosError);
    expect(error?.detalle?.['errores']).toEqual([
      'los puntos por lectura completada debe ser un número entero entre 0 y 500',
      'los puntos por respuesta correcta debe ser un número entero entre 0 y 500',
      'la racha debe tener entre 1 y 6 bonos',
      'el porcentaje al repetir una lectura debe ser un número entero entre 0 y 100',
      'el tope de puntos por día debe ser un número entero entre 10 y 10000',
      'la base del nivel lector debe ser un número entero entre 10 y 10000',
      'a los 10–12 años se piden al menos tantas palabras como a los 6–9',
      'la insignia RANGO_DETECTIVE no se gana contando y no tiene umbral',
      'el umbral de la insignia PRIMERA_LECTURA debe ser un número entero entre 1 y 1000',
    ]);
    expect(() => validarParametros(null, CON_UMBRAL)).toThrow(ParametrosInvalidosError);
  });

  it('los días de la racha deben ser números', () => {
    const p = editables();
    expect(() => validarParametros({ ...p, puntos: { ...p.puntos, racha: { siete: 30 } } }, CON_UMBRAL)).toThrow('los días de cada bono de racha');
  });
});

describe('[Gamificacion][Menor][Fast] Umbrales de insignias (RF-078)', () => {
  it('cambian lecturas, evidencias o días de racha; las de nivel y de mundo no tienen umbral', () => {
    const ajustado = aplicarUmbrales(CATALOGO, { PRIMERA_LECTURA: 2, DETECTIVE_EVIDENCIAS: 3, LECTOR_PERSEVERANTE: 5, RANGO_DETECTIVE: 9, MAESTRO_INFERENCIAS: 1 });
    expect(ajustado.map((i) => i.regla)).toEqual([
      { tipo: 'LECTURAS', meta: 2 },
      { tipo: 'EVIDENCIAS', meta: 3 },
      { tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' },
      { tipo: 'RACHA', dias: 5 },
      { tipo: 'MUNDO', numero: 2 },
    ]);
    expect(aplicarUmbrales(CATALOGO, {})).toEqual(CATALOGO);
  });

  it('una versión mal guardada (umbral 0 o código raro) se ignora al leerla', () => {
    expect(leerParametros(3, { insignias: { PRIMERA_LECTURA: 0, 'x-y': 3, DETECTIVE_EVIDENCIAS: 4 } }).insignias).toEqual({ DETECTIVE_EVIDENCIAS: 4 });
  });
});

describe('[Gamificacion][Menor][Fast] Publicar parámetros (RF-078): aplica solo a lo que ocurre después', () => {
  let e: EntornoGamificacion;
  let versiones: VersionesEnMemoria;
  let caso: ParametrosAdminUseCase;

  beforeEach(() => {
    e = crearEntornoGamificacion();
    e.identidad.perfiles.set(NINO, { alias: 'Mateo', avatar: 'zorro', rangoEdad: 'R2' });
    versiones = new VersionesEnMemoria();
    caso = new ParametrosAdminUseCase(versiones, e.repo, e.bus, e.reloj.ahora);
    // El juego lee la última versión publicada (como el repositorio real).
    e.repo.parametros = async () => {
      const [ultima] = await versiones.versiones();
      return leerParametros((ultima as VersionParametros).version, ultima?.parametros);
    };
  });

  it('muestra la versión vigente con los umbrales del catálogo y los ajustados', async () => {
    const v = await caso.vigentes();
    expect(v).toMatchObject({ version: 1, creadoPor: null, vigenteDesde: '2026-10-01T00:00:00.000Z' });
    expect(v.parametros.puntos.lecturaCompletada).toBe(20);
    expect(v.insignias).toEqual([
      { codigo: 'PRIMERA_LECTURA', nombre: 'Primera lectura', tipo: 'LECTURAS', umbralCatalogo: 1, umbral: 1 },
      { codigo: 'DETECTIVE_EVIDENCIAS', nombre: 'Detective de Evidencias', tipo: 'EVIDENCIAS', umbralCatalogo: 5, umbral: 3 },
      { codigo: 'LECTOR_PERSEVERANTE', nombre: 'Lector Perseverante', tipo: 'RACHA', umbralCatalogo: 7, umbral: 7 },
    ]);
    expect(v.limites.puntos).toEqual({ min: 0, max: 500 });
  });

  it('cada publicación es una versión nueva, anunciada para la auditoría; lo ya otorgado no cambia', async () => {
    await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
    expect(e.repo.motivos(NINO)).toEqual(['LECTURA_COMPLETADA:20']);

    const p = editables();
    const v = await caso.publicar({ ...p, puntos: { ...p.puntos, lecturaCompletada: 30 } }, ADMIN);
    expect(v).toMatchObject({ version: 2, creadoPor: ADMIN, vigenteDesde: e.reloj.ahora().toISOString() });
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_GAMIFICACION.PARAMETROS_PUBLICADOS, agregadoId: '2', datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA', version: 2 } });
    expect((await caso.historial()).map((h) => [h.version, h.creadoPor])).toEqual([
      [2, ADMIN],
      [1, null],
    ]);

    await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-2', sesionId: 's-2' });
    expect(e.repo.motivos(NINO)).toEqual(['LECTURA_COMPLETADA:20', 'LECTURA_COMPLETADA:30']);
  });

  it('un umbral más bajo se aplica desde el siguiente logro (y el pasaporte lo muestra)', async () => {
    const p = editables();
    await caso.publicar({ ...p, insignias: { DETECTIVE_EVIDENCIAS: 2 } }, ADMIN);
    const evidencia = { estudianteId: NINO, sesionId: 's-1', lecturaId: 'l-1', itemId: 'i-1', habilidad: 'LIT' as const, nivelDificultad: 2, esCorrecta: true, pistasUsadas: 0, puntajeItem: 1, esRepeticion: false, palabras: null, modalidad: 'EVIDENCIA' as const };
    await e.logros.alItem({ ...evidencia, respuestaId: 'r-1' });
    await e.logros.alItem({ ...evidencia, respuestaId: 'r-2' });
    expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toContain('i-detective');
    const detective = (await e.pasaporte.pasaporte(NINO)).insignias.find((i) => i.codigo === 'DETECTIVE_EVIDENCIAS');
    expect(detective).toMatchObject({ ganada: true, meta: 2 });
  });

  it('una versión inválida no se publica', async () => {
    await expect(caso.publicar({ ...editables(), antiFarming: { porcentajeRepeticion: 25, topeDiario: 0 } }, ADMIN)).rejects.toThrow(ParametrosInvalidosError);
    expect(versiones.filas).toHaveLength(1);
    expect(e.bus.publicados).toHaveLength(0);
  });
});
