import {
  BusEventos,
  crearEvento,
  DatosDiagnosticoFinalizado,
  DatosItemRespondido,
  DatosRespuestaAbiertaValorada,
  esHabilidad,
  EventoDominio,
  Maestrias,
  NoEncontradoError,
  ResolutorDiagnosticoInicial,
} from '../../../shared-kernel/public-api';
import { nivelSubio, OrigenCambio, PerfilLector } from '../../domain/entities/perfil-lector';
import { MaestriaDesactualizadaError } from '../../domain/errors/errores-progreso';
import { EVENTOS_PROGRESO } from '../../domain/events/eventos-progreso';
import { nivelLectura } from '../../domain/services/maestria';
import { PerfilVista, vistaPerfil } from '../dto/progreso.dto';
import { IdentidadEstudiantes, PerfilRepository } from '../ports/progreso.ports';

const REINTENTOS = 3;

/**
 * Perfil lector y maestría (RF-052 a RF-054). Lo inicializa el reto inicial (SAD §6:
 * DiagnosticoFinalizado) y lo mueve cada ítem cerrado de una lectura (ItemRespondido, RF-053) y cada
 * respuesta abierta valorada por la docente (RN-19). Cada origen se aplica una sola vez, aunque el
 * evento se reintente; si otro cambio guardó antes, se vuelve a calcular (bloqueo optimista).
 */
export class PerfilLectorUseCase {
  constructor(
    private readonly repo: PerfilRepository,
    private readonly diagnostico: ResolutorDiagnosticoInicial,
    private readonly identidad: IdentidadEstudiantes,
    private readonly bus: BusEventos,
    private readonly ahora: () => Date,
  ) {}

  /** RF-052, RF-054: el perfil del niño. Si aún no existía, parte de su reto inicial. */
  async perfil(estudianteId: string): Promise<PerfilVista> {
    const rango = await this.identidad.rangoDe(estudianteId);
    if (!rango) throw new NoEncontradoError('Estudiante');
    return vistaPerfil(await this.perfilDe(estudianteId), rango);
  }

  /** El perfil (guardado, o iniciado ahora con el reto inicial). */
  async perfilDe(estudianteId: string): Promise<PerfilLector> {
    return this.conReintento(async () => {
      const perfil = await this.cargar(estudianteId);
      if (perfil.cambios().length > 0) await this.guardarYPublicar(perfil);
      return perfil;
    });
  }

  /** Para Aventura (RN-09): la maestría actual, o la del reto inicial si aún no hay perfil. */
  async maestriasDe(estudianteId: string): Promise<Maestrias | null> {
    const perfil = await this.repo.buscar(estudianteId);
    if (perfil) return perfil.valores();
    const d = await this.diagnostico.resultadoDe(estudianteId);
    return d.estado === 'FINALIZADO' ? d.maestrias : null;
  }

  /** Para la biblioteca (RF-028) y las recomendaciones (RN-20): la dificultad en que lee hoy. */
  async nivelDe(estudianteId: string): Promise<number | null> {
    const [rango, perfil] = await Promise.all([
      this.identidad.rangoDe(estudianteId),
      this.cargar(estudianteId),
    ]);
    return rango && perfil.tieneHistoria ? nivelLectura(rango, perfil.promedio()) : null;
  }

  /** SAD §6: el reto inicial inicializa el perfil (las reevaluaciones solo se comparan, RF-037). */
  async alDiagnostico(d: DatosDiagnosticoFinalizado): Promise<void> {
    if (d.tipo && d.tipo !== 'INICIAL') return;
    await this.conReintento(async () => {
      if (d.diagnosticoId && (await this.repo.yaAplicado('DIAGNOSTICO', d.diagnosticoId))) return;
      const perfil = (await this.repo.buscar(d.estudianteId)) ?? PerfilLector.nuevo(d.estudianteId);
      if (
        !perfil.iniciarConDiagnostico({
          maestrias: d.maestrias,
          items: d.items ?? {},
          diagnosticoId: d.diagnosticoId ?? null,
          ahora: this.ahora(),
        })
      )
        return;
      await this.guardarYPublicar(perfil);
    });
  }

  /** RF-053, RN-07: cada ítem cerrado de una lectura. Las abiertas esperan la valoración docente (RN-19). */
  async alItem(d: DatosItemRespondido): Promise<void> {
    if (d.puntajeItem === null || !esHabilidad(d.habilidad)) return;
    await this.registrar(d.estudianteId, {
      habilidad: d.habilidad,
      puntajeItem: d.puntajeItem,
      nivelDificultad: d.nivelDificultad,
      origen: 'ITEM',
      origenId: d.respuestaId,
    });
  }

  /** RN-19, RF-051: la valoración docente de una respuesta abierta. */
  async alValoracion(d: DatosRespuestaAbiertaValorada): Promise<void> {
    if (!esHabilidad(d.habilidad)) return;
    await this.registrar(d.estudianteId, {
      habilidad: d.habilidad,
      puntajeItem: d.puntajeItem,
      nivelDificultad: d.nivelDificultad,
      origen: 'VALORACION',
      origenId: d.respuestaId,
    });
  }

  private registrar(
    estudianteId: string,
    p: {
      habilidad: Parameters<PerfilLector['registrar']>[0]['habilidad'];
      puntajeItem: number;
      nivelDificultad: number;
      origen: OrigenCambio;
      origenId: string;
    },
  ) {
    return this.conReintento(async () => {
      if (await this.repo.yaAplicado(p.origen, p.origenId)) return;
      const perfil = await this.cargar(estudianteId);
      perfil.registrar({ ...p, ahora: this.ahora() });
      await this.guardarYPublicar(perfil);
    });
  }

  private async cargar(estudianteId: string): Promise<PerfilLector> {
    const guardado = await this.repo.buscar(estudianteId);
    if (guardado) return guardado;
    const perfil = PerfilLector.nuevo(estudianteId);
    const d = await this.diagnostico.resultadoDe(estudianteId);
    if (d.estado === 'FINALIZADO') {
      perfil.iniciarConDiagnostico({
        maestrias: d.maestrias,
        items: d.items ?? {},
        diagnosticoId: d.diagnosticoId ?? null,
        ahora: this.ahora(),
      });
    }
    return perfil;
  }

  private async guardarYPublicar(perfil: PerfilLector): Promise<void> {
    const cambios = [...perfil.cambios()];
    const nuevo = !perfil.estaPersistido;
    await this.repo.guardar(perfil);
    const ahora = this.ahora();
    const id = perfil.estudianteId;
    const eventos: EventoDominio<object>[] = [];
    if (nuevo)
      eventos.push(
        crearEvento(
          EVENTOS_PROGRESO.PERFIL_INICIADO,
          id,
          { estudianteId: id, maestrias: perfil.valores() },
          ahora,
        ),
      );
    for (const c of cambios.filter((x) => x.origen !== 'DIAGNOSTICO')) {
      eventos.push(
        crearEvento(
          EVENTOS_PROGRESO.MAESTRIA_ACTUALIZADA,
          id,
          {
            estudianteId: id,
            habilidad: c.habilidad,
            valorAnterior: c.anterior,
            valorNuevo: c.nuevo,
            itemsContados: c.itemsContados,
          },
          ahora,
        ),
      );
      if (nivelSubio(c))
        eventos.push(
          crearEvento(
            EVENTOS_PROGRESO.NIVEL_SUBIDO,
            id,
            {
              estudianteId: id,
              habilidad: c.habilidad,
              nivelAnterior: c.nivelAnterior,
              nivelNuevo: c.nivelNuevo,
            },
            ahora,
          ),
        );
    }
    if (eventos.length > 0) await this.bus.publicar(eventos);
  }

  private async conReintento<T>(tarea: () => Promise<T>): Promise<T> {
    for (let intento = 1; ; intento++) {
      try {
        return await tarea();
      } catch (error) {
        if (!(error instanceof MaestriaDesactualizadaError) || intento >= REINTENTOS) throw error;
      }
    }
  }
}
