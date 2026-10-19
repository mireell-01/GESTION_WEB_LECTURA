import {
  BusEventos,
  crearEvento,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  NoEncontradoError,
  RangoEdad,
  RANGOS_EDAD,
} from '../../../shared-kernel/public-api';
import { DatosMision, MAX_MISIONES_POR_MUNDO, Mision } from '../../domain/entities/mision';
import { DatoMisionInvalidoError, LimiteMisionesError } from '../../domain/errors/errores-aventura';
import { EVENTOS_AVENTURA } from '../../domain/events/eventos-aventura';
import { MisionBackofficeVista, MundoBackofficeVista } from '../dto/aventura.dto';
import { AventuraRepository, MundoCatalogo } from '../ports/aventura.repository';

const EDADES: Record<RangoEdad, string> = { R1: '6–7 años', R2: '8–9 años', R3: '10–12 años' };

/**
 * Backoffice de misiones (RF-032): el equipo de contenidos arma las misiones de cada mundo y edad
 * con lecturas publicadas de esa edad, y las ordena. El SRS no definía su autoría (ver docs).
 */
export class MisionesBackofficeUseCase {
  constructor(
    private readonly repo: AventuraRepository,
    private readonly fichas: FuenteFichasLectura,
    private readonly bus: BusEventos,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  async mundos(): Promise<MundoBackofficeVista[]> {
    const [mundos, conteos] = await Promise.all([this.repo.mundos(), Promise.all(RANGOS_EDAD.map((r) => this.repo.contarMisiones(r)))]);
    return mundos.map((m) => ({
      id: m.id,
      numero: m.numero,
      nombre: m.nombre,
      descripcion: m.descripcion,
      habilidadesFoco: m.habilidadesFoco,
      misionesPorEdad: Object.fromEntries(RANGOS_EDAD.map((r, i) => [r, conteos[i]?.get(m.id) ?? 0])) as Record<RangoEdad, number>,
    }));
  }

  async misiones(mundoId: string, rangoEdad: RangoEdad): Promise<MisionBackofficeVista[]> {
    await this.mundo(mundoId);
    const misiones = await this.repo.misiones(mundoId, rangoEdad);
    const fichas = await this.fichas.fichas([...new Set(misiones.flatMap((m) => m.lecturaIds))]);
    return misiones.map((m) => vista(m, new Map(fichas.map((f) => [f.id, f]))));
  }

  /** Lecturas publicadas que se pueden poner en una misión de esa edad. */
  lecturasDisponibles(rangoEdad: RangoEdad): Promise<FichaLecturaPublicada[]> {
    return this.fichas.publicadas(rangoEdad);
  }

  async crear(e: { editorId: string; mundoId: string; rangoEdad: RangoEdad } & DatosMision): Promise<MisionBackofficeVista> {
    const mundo = await this.mundo(e.mundoId);
    const existentes = await this.repo.misiones(mundo.id, e.rangoEdad);
    if (existentes.length >= MAX_MISIONES_POR_MUNDO) throw new LimiteMisionesError(MAX_MISIONES_POR_MUNDO);
    const orden = Math.max(0, ...existentes.map((m) => m.orden)) + 1;
    const mision = Mision.crear({ id: this.generarId(), mundoId: mundo.id, rangoEdad: e.rangoEdad, orden, datos: e });
    const fichas = await this.validarLecturas(mision.lecturaIds, mision.rangoEdad);
    await this.repo.guardarMision(mision);
    await this.evento(EVENTOS_AVENTURA.MISION_CREADA, mision, e.editorId);
    return vista(mision, fichas);
  }

  async actualizar(e: { editorId: string; misionId: string } & DatosMision): Promise<MisionBackofficeVista> {
    const mision = await this.repo.mision(e.misionId);
    if (!mision) throw new NoEncontradoError('Misión');
    mision.actualizar(e);
    const fichas = await this.validarLecturas(mision.lecturaIds, mision.rangoEdad);
    await this.repo.guardarMision(mision);
    await this.evento(EVENTOS_AVENTURA.MISION_ACTUALIZADA, mision, e.editorId);
    return vista(mision, fichas);
  }

  /** El orden en que el niño encuentra las misiones del mundo. */
  async reordenar(e: { editorId: string; mundoId: string; rangoEdad: RangoEdad; misionIds: string[] }): Promise<MisionBackofficeVista[]> {
    const mundo = await this.mundo(e.mundoId);
    const actuales = await this.repo.misiones(mundo.id, e.rangoEdad);
    const porId = new Map(actuales.map((m) => [m.id, m]));
    const completa = e.misionIds.length === actuales.length && new Set(e.misionIds).size === actuales.length && e.misionIds.every((id) => porId.has(id));
    if (!completa) throw new DatoMisionInvalidoError('El orden debe incluir todas las misiones del mundo para esa edad, una vez cada una');
    const ordenadas = e.misionIds.map((id, i) => {
      const m = porId.get(id) as Mision;
      m.moverA(i + 1);
      return m;
    });
    await this.repo.reordenar(ordenadas);
    await this.bus.publicar([
      crearEvento(EVENTOS_AVENTURA.MISIONES_REORDENADAS, mundo.id, { actorId: e.editorId, mundoId: mundo.id, rangoEdad: e.rangoEdad }, this.ahora()),
    ]);
    return this.misiones(mundo.id, e.rangoEdad);
  }

  private async mundo(mundoId: string): Promise<MundoCatalogo> {
    const mundo = (await this.repo.mundos()).find((m) => m.id === mundoId);
    if (!mundo) throw new NoEncontradoError('Mundo');
    return mundo;
  }

  /** Cada lectura debe estar publicada y ser de la misma edad que la misión. */
  private async validarLecturas(ids: string[], rangoEdad: RangoEdad): Promise<Map<string, FichaLecturaPublicada>> {
    const fichas = new Map((await this.fichas.fichas(ids)).map((f) => [f.id, f]));
    for (const id of ids) {
      const f = fichas.get(id);
      if (!f) throw new DatoMisionInvalidoError('Hay lecturas que no están publicadas: solo se pueden usar lecturas de la biblioteca');
      if (f.rangoEdad !== rangoEdad) {
        throw new DatoMisionInvalidoError(`"${f.titulo}" es para ${EDADES[f.rangoEdad]} y la misión es para ${EDADES[rangoEdad]}`);
      }
    }
    return fichas;
  }

  private evento(nombre: string, m: Mision, actorId: string): Promise<void> {
    return this.bus.publicar([
      crearEvento(nombre, m.id, { actorId, mundoId: m.mundoId, rangoEdad: m.rangoEdad, titulo: m.titulo, lecturas: m.lecturaIds.length }, this.ahora()),
    ]);
  }
}

function vista(m: Mision, fichas: Map<string, FichaLecturaPublicada>): MisionBackofficeVista {
  return {
    id: m.id,
    mundoId: m.mundoId,
    rangoEdad: m.rangoEdad,
    orden: m.orden,
    titulo: m.titulo,
    descripcion: m.descripcion,
    lecturas: m.lecturaIds.map((id) => {
      const f = fichas.get(id);
      return f
        ? { id, titulo: f.titulo, nivelDificultad: f.nivelDificultad, publicada: true }
        : { id, titulo: 'Lectura retirada de la biblioteca', nivelDificultad: null, publicada: false };
    }),
  };
}
