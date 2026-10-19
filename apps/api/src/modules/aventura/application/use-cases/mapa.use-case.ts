import {
  FuenteFichasLectura,
  NOMBRE_HABILIDAD,
  NoEncontradoError,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorMaestria,
} from '../../../shared-kernel/public-api';
import { DiagnosticoPendienteError, MundoBloqueadoError } from '../../domain/errors/errores-aventura';
import { MISIONES_PARA_DESBLOQUEAR } from '../../domain/services/politica-progresion';
import { MapaVista, MisionesDeMundoVista } from '../dto/aventura.dto';
import { AventuraRepository, MundoCatalogo } from '../ports/aventura.repository';
import { IdentidadEstudiantes } from '../ports/identidad-estudiantes';
import { Posicionamiento } from '../services/posicionamiento';

/** Casos de uso del estudiante: mapa de aventuras (RF-030, RF-031) y misiones de un mundo (RF-032). */
export class MapaUseCase {
  constructor(
    private readonly repo: AventuraRepository,
    private readonly identidad: IdentidadEstudiantes,
    private readonly posicionamiento: Posicionamiento,
    private readonly maestria: ResolutorMaestria,
    private readonly avance: ResolutorAvanceLecturas,
    private readonly fichas: FuenteFichasLectura,
    private readonly ahora: () => Date,
  ) {}

  /** RF-030: los 5 mundos con su estado; la primera vez ubica al estudiante (RF-033). */
  async mapa(estudianteId: string): Promise<MapaVista> {
    const rango = await this.rangoDe(estudianteId);
    const mundos = await this.repo.mundos();
    const progreso = await this.posicionamiento.progresoDe(estudianteId, mundos);
    const maestrias = await this.maestria.maestriasDe(estudianteId);
    const [totales, completadas] = await Promise.all([
      this.repo.contarMisiones(rango),
      progreso ? this.repo.completadasPorMundo(estudianteId, rango) : Promise.resolve(new Map<string, number>()),
    ]);
    const porCelebrar = new Set((progreso?.porCelebrar() ?? []).map((m) => m.mundoId));
    return {
      diagnosticoPendiente: progreso === null,
      mundoActual: progreso?.actual?.numero ?? null,
      mundos: mundos.map((m) => ({
        id: m.id,
        numero: m.numero,
        nombre: m.nombre,
        descripcion: m.descripcion,
        estado: progreso?.estadoDe(m.id)?.estado ?? 'BLOQUEADO',
        habilidadesFoco: m.habilidadesFoco.map((h) => ({ codigo: h, nombre: NOMBRE_HABILIDAD[h], maestria: maestrias?.[h] ?? null })),
        misiones: { completadas: completadas.get(m.id) ?? 0, total: totales.get(m.id) ?? 0, necesarias: MISIONES_PARA_DESBLOQUEAR },
        celebrar: porCelebrar.has(m.id),
      })),
    };
  }

  /** RF-032: las misiones del mundo para la edad del estudiante, con sus lecturas publicadas. */
  async misiones(estudianteId: string, mundoId: string): Promise<MisionesDeMundoVista> {
    const rango = await this.rangoDe(estudianteId);
    const mundos = await this.repo.mundos();
    const mundo = mundos.find((m) => m.id === mundoId);
    if (!mundo) throw new NoEncontradoError('Mundo');
    const progreso = await this.posicionamiento.progresoDe(estudianteId, mundos);
    if (!progreso) throw new DiagnosticoPendienteError();
    const estado = progreso.estadoDe(mundo.id)?.estado ?? 'BLOQUEADO';
    if (estado === 'BLOQUEADO') throw new MundoBloqueadoError();

    const misiones = await this.repo.misiones(mundo.id, rango);
    const ids = [...new Set(misiones.flatMap((m) => m.lecturaIds))];
    const [fichas, avance, estados] = await Promise.all([
      this.fichas.fichas(ids),
      this.avance.avanceDe(estudianteId, ids),
      this.repo.estadosMision(estudianteId, misiones.map((m) => m.id)),
    ]);
    const porId = new Map(fichas.map((f) => [f.id, f]));
    return {
      mundo: vistaMundo(mundo, estado),
      misiones: misiones.map((m) => ({
        id: m.id,
        orden: m.orden,
        titulo: m.titulo,
        descripcion: m.descripcion,
        estado: estados.get(m.id) ?? 'PENDIENTE',
        lecturas: m.lecturaIds
          .map((id) => porId.get(id))
          .filter((f) => f !== undefined)
          .map((f) => ({ id: f.id, titulo: f.titulo, nivelDificultad: f.nivelDificultad, avance: avance.get(f.id) ?? 'PENDIENTE' })),
      })),
    };
  }

  /** RF-031: el niño cerró la celebración; no se vuelve a mostrar. */
  async marcarCelebrado(estudianteId: string, mundoId: string): Promise<void> {
    await this.repo.marcarCelebrado(estudianteId, mundoId, this.ahora());
  }

  private async rangoDe(estudianteId: string): Promise<RangoEdad> {
    const rango = await this.identidad.rangoEdad(estudianteId);
    if (!rango) throw new NoEncontradoError('Estudiante');
    return rango;
  }
}

function vistaMundo(m: MundoCatalogo, estado: MisionesDeMundoVista['mundo']['estado']): MisionesDeMundoVista['mundo'] {
  return { id: m.id, numero: m.numero, nombre: m.nombre, descripcion: m.descripcion, estado };
}
