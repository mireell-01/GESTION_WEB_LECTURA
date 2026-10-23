import {
  BusEventos,
  crearEvento,
  fechaLocalLima,
  FuenteFichasLectura,
  NoEncontradoError,
  ResolutorLecturasRealizadas,
  ResolutorMundosCompletados,
} from '../../../shared-kernel/public-api';
import { EVENTOS_GAMIFICACION } from '../../domain/events/eventos-gamificacion';
import { monedasDisponibles, validarCanje } from '../../domain/services/monedas';
import { avanceNivel } from '../../domain/services/nivel-lector';
import { comodinDeEstaSemana, rachaVigente } from '../../domain/services/racha';
import { metaDe } from '../../domain/services/reglas-insignia';
import { CanjeVista, PasaporteVista, RetoVista, vistaReto } from '../dto/gamificacion.dto';
import { GamificacionRepository, IdentidadEstudiantes } from '../ports/gamificacion.ports';
import { LogrosUseCase } from './logros.use-case';

/** Lecturas recientes que muestra el pasaporte (el total las cuenta todas). */
const LECTURAS_RECIENTES = 6;

/**
 * Casos de uso del estudiante: su Pasaporte del Lector (RF-059), su reto del día (RF-060) y el canje
 * de recompensas con monedas (RF-062). Todo se lee directo de la base: refleja cada logro al instante.
 */
export class PasaporteUseCase {
  constructor(
    private readonly repo: GamificacionRepository,
    private readonly identidad: IdentidadEstudiantes,
    private readonly realizadas: ResolutorLecturasRealizadas,
    private readonly mundos: ResolutorMundosCompletados,
    private readonly fichas: FuenteFichasLectura,
    private readonly logros: LogrosUseCase,
    private readonly bus: BusEventos,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  /** RF-059: insignias, mundos completados y lecturas realizadas, con sus puntos, nivel, racha y monedas. */
  async pasaporte(estudianteId: string): Promise<PasaporteVista> {
    const perfil = await this.identidad.perfil(estudianteId);
    if (!perfil) throw new NoEncontradoError('Estudiante');
    const hoy = fechaLocalLima(this.ahora());
    const [p, catalogo, cuenta, recompensas, lecturas, mundos] = await Promise.all([
      this.repo.parametros(),
      this.repo.insignias(),
      this.repo.resumen(estudianteId, hoy),
      this.repo.recompensas(),
      this.realizadas.realizadasDe(estudianteId),
      this.mundos.completadosDe(estudianteId),
    ]);
    const recientes = lecturas.slice(0, LECTURAS_RECIENTES);
    const titulos = new Map((await this.fichas.fichas(recientes.map((l) => l.lecturaId))).map((f) => [f.id, f.titulo]));
    const racha = rachaVigente(cuenta.racha, hoy);

    return {
      alias: perfil.alias,
      avatar: perfil.avatar,
      puntos: { total: cuenta.puntosTotales, hoy: cuenta.puntosHoy, topeDiario: p.antiFarming.topeDiario },
      nivel: avanceNivel(cuenta.puntosTotales, p.nivelLector.base),
      monedas: monedasDisponibles({ puntosTotales: cuenta.puntosTotales, gastadas: cuenta.monedasGastadas }),
      racha: {
        dias: racha,
        mejor: cuenta.racha.mejor,
        leyoHoy: cuenta.racha.ultimaFecha === hoy,
        comodinDisponible: comodinDeEstaSemana(cuenta.racha, hoy),
      },
      insignias: catalogo.map((i) => {
        const otorgadaEn = cuenta.ganadas.get(i.id) ?? null;
        const meta = metaDe(i.regla);
        const avance = meta === null ? null : otorgadaEn ? meta : i.regla.tipo === 'RACHA' ? Math.min(racha, meta) : Math.min(cuenta.avances.get(i.id) ?? 0, meta);
        return {
          codigo: i.codigo,
          nombre: i.nombre,
          descripcion: i.descripcion,
          ganada: otorgadaEn !== null,
          otorgadaEn: otorgadaEn?.toISOString() ?? null,
          avance,
          meta,
        };
      }),
      mundos: mundos.map((m) => ({ numero: m.numero, nombre: m.nombre, completadoEn: m.completadoEn?.toISOString() ?? null })),
      lecturas: {
        total: lecturas.length,
        // Una lectura archivada ya no tiene ficha: cuenta en el total, pero no se lista.
        recientes: recientes.flatMap((l) => {
          const titulo = titulos.get(l.lecturaId);
          return titulo ? [{ id: l.lecturaId, titulo, finalizadaEn: l.finalizadaEn.toISOString() }] : [];
        }),
      },
      ultimosPuntos: cuenta.ultimos.map((a) => ({ motivo: a.motivo, puntos: a.puntos, creadoEn: a.creadoEn.toISOString() })),
      recompensas: recompensas.map((r) => ({ ...r, tuya: cuenta.canjeadas.has(r.id) })),
    };
  }

  /** RF-060, RN-18: un reto por día (00:00 de Lima), orientado a su habilidad más débil. */
  async retoDelDia(estudianteId: string): Promise<RetoVista> {
    if (!(await this.identidad.perfil(estudianteId))) throw new NoEncontradoError('Estudiante');
    const [reto, p] = await Promise.all([this.logros.retoDeHoy(estudianteId, fechaLocalLima(this.ahora())), this.repo.parametros()]);
    return vistaReto(reto, p.puntos.retoDelDia);
  }

  /** RF-062: canjea un personaje o accesorio con monedas; los puntos y el nivel no cambian. */
  async canjear(estudianteId: string, recompensaId: string): Promise<CanjeVista> {
    const recompensa = (await this.repo.recompensas()).find((r) => r.id === recompensaId);
    if (!recompensa) throw new NoEncontradoError('Recompensa');
    const ahora = this.ahora();
    const monedas = await this.repo.canjear(estudianteId, recompensa, { id: this.generarId(), ahora }, (saldo) => validarCanje(saldo, recompensa.costo));
    await this.bus.publicar([
      crearEvento(EVENTOS_GAMIFICACION.RECOMPENSA_CANJEADA, estudianteId, { estudianteId, recompensa: recompensa.codigo, monedas: recompensa.costo }, ahora),
    ]);
    return { recompensa: recompensa.codigo, monedas };
  }
}
