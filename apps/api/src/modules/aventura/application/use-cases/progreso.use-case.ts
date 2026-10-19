import {
  BusEventos,
  crearEvento,
  FuenteFichasLectura,
  Maestrias,
  ResolutorAvanceLecturas,
  ResolutorMaestria,
} from '../../../shared-kernel/public-api';
import { Mision } from '../../domain/entities/mision';
import { EVENTOS_AVENTURA } from '../../domain/events/eventos-aventura';
import { avanzarEstado, estadoSegunAvance, evaluarUmbral, mundoInicial } from '../../domain/services/politica-progresion';
import { AventuraRepository } from '../ports/aventura.repository';
import { IdentidadEstudiantes } from '../ports/identidad-estudiantes';
import { Posicionamiento } from '../services/posicionamiento';

/**
 * Progreso en la aventura, movido por eventos de otros módulos (SAD §6):
 *  - DiagnosticoFinalizado → posición inicial (RF-033);
 *  - SesionLectura iniciada/finalizada → estado de las misiones (RF-032);
 *  - MaestriaActualizada y misión completada → desbloqueo del mundo siguiente (RF-031, RN-09).
 */
export class ProgresoUseCase {
  constructor(
    private readonly repo: AventuraRepository,
    private readonly identidad: IdentidadEstudiantes,
    private readonly posicionamiento: Posicionamiento,
    private readonly maestria: ResolutorMaestria,
    private readonly avance: ResolutorAvanceLecturas,
    private readonly fichas: FuenteFichasLectura,
    private readonly bus: BusEventos,
    private readonly ahora: () => Date,
  ) {}

  /** RF-033. Solo hay un diagnóstico inicial: si el estudiante ya tiene mapa, no cambia nada. */
  async posicionarTrasDiagnostico(estudianteId: string, maestrias: Maestrias): Promise<void> {
    if (await this.repo.progreso(estudianteId)) return;
    await this.posicionamiento.posicionar(estudianteId, await this.repo.mundos(), mundoInicial(maestrias), 'DIAGNOSTICO');
  }

  /** RF-032: una sesión de lectura empezó o terminó; se actualizan las misiones que la contienen. */
  async registrarAvance(estudianteId: string, lecturaId: string): Promise<void> {
    const rango = await this.identidad.rangoEdad(estudianteId);
    const progreso = await this.repo.progreso(estudianteId);
    if (!rango || !progreso) return; // sin mapa todavía (RN-05): no hay misiones que avanzar
    const misiones = (await this.repo.misionesConLectura(lecturaId, rango)).filter(
      (m) => progreso.estadoDe(m.mundoId)?.estado !== 'BLOQUEADO',
    );
    await this.actualizarMisiones(estudianteId, misiones);
    await this.evaluarDesbloqueo(estudianteId);
  }

  /**
   * RF-031, RN-09: si el mundo actual cumple el umbral, se completa y se abre el siguiente. Lo ya
   * leído cuenta en el mundo nuevo, así que puede abrir varios mundos seguidos.
   */
  async evaluarDesbloqueo(estudianteId: string): Promise<void> {
    const [rango, maestrias, mundos] = await Promise.all([
      this.identidad.rangoEdad(estudianteId),
      this.maestria.maestriasDe(estudianteId),
      this.repo.mundos(),
    ]);
    let progreso = await this.repo.progreso(estudianteId);
    if (!rango || !progreso || !maestrias) return; // sin perfil lector (Módulo 7) no hay maestría que evaluar

    for (let vuelta = 0; vuelta < mundos.length; vuelta++) {
      const actual = progreso.actual;
      const mundo = mundos.find((m) => m.id === actual?.mundoId);
      if (!actual || !mundo) return;
      const completadas = (await this.repo.completadasPorMundo(estudianteId, rango)).get(mundo.id) ?? 0;
      if (!evaluarUmbral(mundo.habilidadesFoco, maestrias, completadas).cumple) return;

      const ahora = this.ahora();
      const { completado, desbloqueado } = progreso.completarActual(ahora);
      const avanzo = await this.repo.avanzarMundo(
        estudianteId,
        { mundoId: completado.mundoId, completadoEn: ahora },
        desbloqueado ? { mundoId: desbloqueado.mundoId, desbloqueadoEn: ahora } : null,
      );
      if (!avanzo) return; // otro evento simultáneo ya lo desbloqueó
      await this.bus.publicar([
        crearEvento(
          EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO,
          estudianteId,
          { estudianteId, mundoCompletado: completado.numero, mundoDesbloqueado: desbloqueado?.numero ?? null },
          ahora,
        ),
      ]);
      if (!desbloqueado) return; // completó el último mundo
      await this.actualizarMisiones(estudianteId, await this.repo.misiones(desbloqueado.mundoId, rango));
      progreso = (await this.repo.progreso(estudianteId)) ?? progreso;
    }
  }

  /** Recalcula el estado de las misiones con el avance de lectura; nunca retroceden. */
  private async actualizarMisiones(estudianteId: string, misiones: Mision[]): Promise<void> {
    if (misiones.length === 0) return;
    const ids = [...new Set(misiones.flatMap((m) => m.lecturaIds))];
    const [fichas, avance, estados] = await Promise.all([
      this.fichas.fichas(ids),
      this.avance.avanceDe(estudianteId, ids),
      this.repo.estadosMision(estudianteId, misiones.map((m) => m.id)),
    ]);
    // Solo cuentan las lecturas que siguen publicadas.
    const publicadas = new Set(fichas.map((f) => f.id));
    for (const m of misiones) {
      const actual = estados.get(m.id) ?? 'PENDIENTE';
      const nuevo = avanzarEstado(actual, estadoSegunAvance(m.lecturaIds.filter((id) => publicadas.has(id)), avance));
      if (nuevo === actual) continue;
      const ahora = this.ahora();
      await this.repo.guardarEstadoMision(estudianteId, m.id, nuevo, ahora);
      if (nuevo === 'COMPLETADA') {
        await this.bus.publicar([crearEvento(EVENTOS_AVENTURA.MISION_COMPLETADA, m.id, { estudianteId, misionId: m.id, mundoId: m.mundoId }, ahora)]);
      }
    }
  }
}
