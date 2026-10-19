import { BusEventos, crearEvento, ResolutorDiagnosticoInicial } from '../../../shared-kernel/public-api';
import { MundoRef, ProgresoAventura } from '../../domain/entities/progreso-aventura';
import { EVENTOS_AVENTURA } from '../../domain/events/eventos-aventura';
import { mundoInicial } from '../../domain/services/politica-progresion';
import { AventuraRepository } from '../ports/aventura.repository';

/**
 * RF-033: ubica al estudiante en su mundo inicial la primera vez.
 *  - Con diagnóstico finalizado: LIT y VOC ≥ 65 → mundo 2; si no, mundo 1.
 *  - Con diagnóstico pendiente (RN-05): todavía no hay mapa.
 *  - Mientras el Módulo 5 no exista en la plataforma: mundo 1 (decisión documentada).
 */
export class Posicionamiento {
  constructor(
    private readonly repo: AventuraRepository,
    private readonly diagnostico: ResolutorDiagnosticoInicial,
    private readonly bus: BusEventos,
    private readonly ahora: () => Date,
  ) {}

  /** El progreso del estudiante; lo crea si falta. null mientras el diagnóstico esté pendiente. */
  async progresoDe(estudianteId: string, mundos: MundoRef[]): Promise<ProgresoAventura | null> {
    const existente = await this.repo.progreso(estudianteId);
    if (existente) return existente;
    const resultado = await this.diagnostico.resultadoDe(estudianteId);
    if (resultado.estado === 'PENDIENTE') return null;
    return resultado.estado === 'FINALIZADO'
      ? this.posicionar(estudianteId, mundos, mundoInicial(resultado.maestrias), 'DIAGNOSTICO')
      : this.posicionar(estudianteId, mundos, 1, 'SIN_DIAGNOSTICO');
  }

  async posicionar(estudianteId: string, mundos: MundoRef[], inicial: number, origen: 'DIAGNOSTICO' | 'SIN_DIAGNOSTICO'): Promise<ProgresoAventura> {
    const ahora = this.ahora();
    const progreso = ProgresoAventura.posicionar(estudianteId, mundos, inicial, ahora);
    if (!(await this.repo.crearProgreso(progreso))) {
      // Dos pedidos simultáneos: gana el primero y ambos ven el mismo mapa.
      return (await this.repo.progreso(estudianteId)) as ProgresoAventura;
    }
    await this.bus.publicar([
      crearEvento(EVENTOS_AVENTURA.ESTUDIANTE_POSICIONADO, estudianteId, { estudianteId, mundoInicial: inicial, origen }, ahora),
    ]);
    return progreso;
  }
}
