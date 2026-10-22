import { BusEventos, crearEvento, NoEncontradoError, RangoEdad } from '../../../shared-kernel/public-api';
import { Diagnostico } from '../../domain/entities/diagnostico';
import { ItemDiagnostico } from '../../domain/entities/item-diagnostico';
import { SinRetoPendienteError, TransicionDiagnosticoError } from '../../domain/errors/errores-diagnostico';
import { EVENTOS_DIAGNOSTICO } from '../../domain/events/eventos-diagnostico';
import { maestriasDe } from '../../domain/services/calculo-nivel';
import { ITEMS_POR_RANGO } from '../../domain/value-objects/plan-diagnostico';
import {
  ItemVista,
  RespuestaVista,
  ResultadoVista,
  RetoActualVista,
  RetoVista,
  vistaItem,
  vistaResultado,
  vistaReto,
} from '../dto/diagnostico.dto';
import { BancoItems, DiagnosticoRepository, IdentidadEstudiantes } from '../ports/diagnostico.ports';

/**
 * Casos de uso del estudiante (RF-034 a RF-036): el reto inicial y las reevaluaciones que le asigna
 * su docente. RN-05: el inicial es obligatorio antes del mapa; puede pausarse, no omitirse.
 */
export class RetoUseCase {
  constructor(
    private readonly repo: DiagnosticoRepository,
    private readonly banco: BancoItems,
    private readonly identidad: IdentidadEstudiantes,
    private readonly bus: BusEventos,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  /** Qué reto tiene el niño por delante (sin crear nada). */
  async actual(estudianteId: string): Promise<RetoActualVista> {
    const [pendiente, inicial] = await Promise.all([this.repo.pendienteDe(estudianteId), this.repo.inicialDe(estudianteId)]);
    const inicialFinalizado = inicial?.estado === 'FINALIZADO';
    if (pendiente) return { inicialFinalizado, pendiente: vistaReto(pendiente) };
    if (inicial) return { inicialFinalizado, pendiente: null };
    const rango = await this.rangoDe(estudianteId);
    const porEmpezar: RetoVista = { id: null, tipo: 'INICIAL', estado: 'NO_INICIADO', respondidos: 0, total: ITEMS_POR_RANGO[rango] };
    return { inicialFinalizado: false, pendiente: porEmpezar };
  }

  /** RF-034, RF-036: empieza el reto inicial la primera vez, o reanuda el que esté pendiente. */
  async comenzar(estudianteId: string): Promise<RetoVista> {
    let d = await this.repo.pendienteDe(estudianteId);
    if (!d) {
      if (await this.repo.inicialDe(estudianteId)) throw new SinRetoPendienteError();
      const nuevo = Diagnostico.crearInicial({ id: this.generarId(), estudianteId, rangoEdad: await this.rangoDe(estudianteId) });
      // Dos pedidos a la vez: gana el primero y ambos siguen con el mismo reto.
      d = (await this.repo.crear(nuevo)) ? nuevo : ((await this.repo.pendienteDe(estudianteId)) as Diagnostico);
    }
    const primeraVez = d.estado === 'NO_INICIADO';
    d.comenzar(this.ahora());
    await this.repo.guardar(d);
    if (primeraVez) await this.publicar(EVENTOS_DIAGNOSTICO.INICIADO, d, {});
    return vistaReto(d);
  }

  /** RF-036: la pregunta que sigue a la última respondida (null si ya respondió todas). */
  async siguiente(estudianteId: string, diagnosticoId: string): Promise<ItemVista | null> {
    const d = await this.suyo(estudianteId, diagnosticoId);
    if (d.estado === 'FINALIZADO') throw new TransicionDiagnosticoError('Este reto ya terminó');
    const item = d.siguiente(await this.items(d));
    return item ? vistaItem(item, d) : null;
  }

  async responder(estudianteId: string, diagnosticoId: string, itemId: string, indice: number): Promise<RespuestaVista> {
    const d = await this.suyo(estudianteId, diagnosticoId);
    d.responder(await this.items(d), itemId, indice, this.ahora());
    await this.repo.guardar(d);
    return { respondidos: d.respondidos, total: d.totalItems, terminado: d.respondidos === d.totalItems };
  }

  async pausar(estudianteId: string, diagnosticoId: string): Promise<RetoVista> {
    const d = await this.suyo(estudianteId, diagnosticoId);
    d.pausar(this.ahora());
    await this.repo.guardar(d);
    await this.publicar(EVENTOS_DIAGNOSTICO.PAUSADO, d, { respondidos: d.respondidos });
    return vistaReto(d);
  }

  /**
   * RF-035: calcula el nivel inicial por habilidad y lo publica. Aventura ubica al niño en su mundo
   * (RF-033) en el mismo momento, así que al volver al mapa ya está posicionado.
   */
  async finalizar(estudianteId: string, diagnosticoId: string): Promise<ResultadoVista> {
    const d = await this.suyo(estudianteId, diagnosticoId);
    const resultado = d.finalizar(await this.items(d), this.ahora());
    await this.repo.guardar(d);
    await this.publicar(EVENTOS_DIAGNOSTICO.FINALIZADO, d, { maestrias: maestriasDe(resultado.habilidades), aciertos: resultado.aciertos, total: resultado.total });
    return vistaResultado(d, resultado);
  }

  async resultado(estudianteId: string, diagnosticoId: string): Promise<ResultadoVista> {
    const d = await this.suyo(estudianteId, diagnosticoId);
    if (d.estado !== 'FINALIZADO' || !d.resultado) throw new TransicionDiagnosticoError('Este reto aún no termina');
    return vistaResultado(d, d.resultado);
  }

  /** Un diagnóstico solo lo ve su estudiante: el de otro niño responde como si no existiera. */
  private async suyo(estudianteId: string, diagnosticoId: string): Promise<Diagnostico> {
    const d = await this.repo.buscar(diagnosticoId);
    if (!d || d.estudianteId !== estudianteId) throw new NoEncontradoError('Reto');
    return d;
  }

  private items(d: Diagnostico): Promise<ItemDiagnostico[]> {
    return this.banco.items(d.rangoEdad, d.forma);
  }

  private async rangoDe(estudianteId: string): Promise<RangoEdad> {
    const [perfil] = await this.identidad.perfiles([estudianteId]);
    if (!perfil?.activo) throw new NoEncontradoError('Estudiante');
    return perfil.rangoEdad;
  }

  private publicar(nombre: string, d: Diagnostico, extra: Record<string, unknown>): Promise<void> {
    return this.bus.publicar([
      crearEvento(nombre, d.id, { estudianteId: d.estudianteId, diagnosticoId: d.id, tipo: d.tipo, secuencia: d.secuencia, ...extra }, this.ahora()),
    ]);
  }
}
