import { crearEvento, EventoDominio, Habilidad, NivelCNEB } from '../../../shared-kernel/public-api';
import { EVENTOS_GAMIFICACION } from '../events/eventos-gamificacion';
import { idDeterminista } from '../services/id-origen';
import { nivelLector } from '../services/nivel-lector';
import { ParametrosGamificacion } from '../services/parametros';
import { bonoRacha, conRepeticion, dentroDelTope, MotivoPuntos } from '../services/politica-puntos';
import { EstadoRacha, registrarDia } from '../services/racha';
import { alcanzaNivel, Contador, InsigniaCatalogo } from '../services/reglas-insignia';
import { RetoDiario } from './reto-diario';

/** Lo que la cuenta necesita saber del estudiante para aplicar un logro (se carga bajo candado). */
export interface EstadoCuenta {
  estudianteId: string;
  /** Fecha de Lima del logro ("AAAA-MM-DD"). */
  hoy: string;
  puntosTotales: number;
  puntosHoy: number;
  /** Ids de las insignias ya otorgadas. */
  ganadas: Set<string>;
  /** Avance de las insignias de conteo, por id. */
  avances: Map<string, number>;
  racha: EstadoRacha;
  /** El reto del día de `hoy`, si ya existe. */
  reto: RetoDiario | null;
}

export interface AsientoNuevo {
  motivo: MotivoPuntos;
  puntos: number;
  origenId: string;
  fechaLima: string;
}

export interface InsigniaNueva {
  insignia: InsigniaCatalogo;
  origenId: string;
  otorgadaEn: Date;
}

export interface CambiosCuenta {
  asientos: AsientoNuevo[];
  insignias: InsigniaNueva[];
  avances: { insigniaId: string; avance: number }[];
  racha: EstadoRacha | null;
  reto: RetoDiario | null;
}

/**
 * Agregado: CuentaGamificacion (SRS §6). El saldo de puntos es la suma del libro (append-only); cada
 * logro agrega asientos con su motivo (RF-056), nunca negativos (RN-10), con el descuento por repetir y
 * el tope diario (RN-12). Las insignias se otorgan una sola vez (RF-058, RN-13); la racha cuenta los días
 * con lectura terminada o reto completado (RF-061) y el reto del día suma +15 al completarse (RF-060).
 */
export class CuentaGamificacion {
  private readonly asientos: AsientoNuevo[] = [];
  private readonly insignias: InsigniaNueva[] = [];
  private readonly avancesCambiados = new Set<string>();
  private rachaCambiada = false;
  private retoCambiado = false;
  private readonly eventos: EventoDominio<object>[] = [];

  constructor(
    private readonly e: EstadoCuenta,
    private readonly catalogo: InsigniaCatalogo[],
    private readonly p: ParametrosGamificacion,
    private readonly ahora: Date,
  ) {}

  get puntosTotales(): number {
    return this.e.puntosTotales;
  }

  /** RF-056: un asiento con su motivo. Devuelve los puntos que se otorgaron de verdad (0 si se llegó al tope). */
  otorgarPuntos(motivo: MotivoPuntos, base: number, origenId: string, esRepeticion = false): number {
    const puntos = dentroDelTope(conRepeticion(base, esRepeticion, this.p), this.e.puntosHoy, this.p);
    if (puntos <= 0) return 0;
    const nivelAntes = nivelLector(this.e.puntosTotales, this.p.nivelLector.base);
    this.e.puntosTotales += puntos;
    this.e.puntosHoy += puntos;
    this.asientos.push({ motivo, puntos, origenId, fechaLima: this.e.hoy });
    const nivelNuevo = nivelLector(this.e.puntosTotales, this.p.nivelLector.base);
    if (nivelNuevo > nivelAntes) {
      // RF-057: el nivel lector sube con los puntos acumulados.
      this.publicar(EVENTOS_GAMIFICACION.NIVEL_LECTOR_SUBIDO, { nivelAnterior: nivelAntes, nivelNuevo, puntos: this.e.puntosTotales });
    }
    return puntos;
  }

  /** RF-058, UAT-03: suma 1 al avance de las insignias que cuentan ese logro; al llegar a la meta, se otorga. */
  contar(contador: Contador, origenId: string): void {
    for (const i of this.catalogo) {
      if (i.regla.tipo !== contador || this.e.ganadas.has(i.id)) continue;
      const avance = Math.min((this.e.avances.get(i.id) ?? 0) + 1, i.regla.meta);
      this.e.avances.set(i.id, avance);
      this.avancesCambiados.add(i.id);
      if (avance >= i.regla.meta) this.otorgarInsignia(i, origenId);
    }
  }

  /** RF-061: un día con actividad lectora. Al llegar a 3, 7 o 30 días suma el bono (RN-11). */
  registrarDiaLector(origenId: string): void {
    const { racha, cambio } = registrarDia(this.e.racha, this.e.hoy);
    if (cambio === 'IGUAL') return;
    this.e.racha = racha;
    this.rachaCambiada = true;
    const bono = bonoRacha(racha.dias, this.p);
    if (bono !== null) this.otorgarPuntos(`RACHA_${racha.dias}`, bono, idDeterminista('racha', this.e.estudianteId, this.e.hoy));
    for (const i of this.catalogo) {
      if (i.regla.tipo === 'RACHA' && racha.dias >= i.regla.dias) this.otorgarInsignia(i, origenId);
    }
  }

  /** RF-060: una respuesta bien hecha avanza el reto del día; completarlo da +15 y cuenta para la racha. */
  avanzarReto(habilidad: string): void {
    const reto = this.e.reto;
    if (!reto || reto.datos.fecha !== this.e.hoy) return;
    const resultado = reto.registrarAcierto(habilidad, this.ahora);
    if (resultado === 'NADA') return;
    this.retoCambiado = true;
    if (resultado === 'COMPLETADO') {
      this.otorgarPuntos('RETO_DEL_DIA', this.p.puntos.retoDelDia, reto.id);
      this.publicar(EVENTOS_GAMIFICACION.RETO_COMPLETADO, { retoId: reto.id, habilidad: reto.datos.habilidad, fecha: reto.datos.fecha });
      this.registrarDiaLector(reto.id);
    }
  }

  /** RF-058: "Maestro de las Inferencias" y similares, al declararse el nivel CNEB pedido (RN-08). */
  alcanzarNivelHabilidad(habilidad: Habilidad, nivel: NivelCNEB, origenId: string): void {
    for (const i of this.catalogo) {
      if (i.regla.tipo === 'NIVEL_HABILIDAD' && i.regla.habilidad === habilidad && alcanzaNivel(nivel, i.regla.nivel)) this.otorgarInsignia(i, origenId);
    }
  }

  /** SAD §6: completar un mundo del mapa otorga su insignia de rango. */
  completarMundo(numero: number, origenId: string): void {
    for (const i of this.catalogo) {
      if (i.regla.tipo === 'MUNDO' && i.regla.numero === numero) this.otorgarInsignia(i, origenId);
    }
  }

  cambios(): CambiosCuenta {
    return {
      asientos: [...this.asientos],
      insignias: [...this.insignias],
      avances: [...this.avancesCambiados].map((insigniaId) => ({ insigniaId, avance: this.e.avances.get(insigniaId) ?? 0 })),
      racha: this.rachaCambiada ? { ...this.e.racha } : null,
      reto: this.retoCambiado ? this.e.reto : null,
    };
  }

  /** Eventos para publicar después de guardar. */
  eventosPendientes(): EventoDominio<object>[] {
    return [...this.eventos];
  }

  /** RN-13: una insignia se otorga una sola vez y es irrevocable. */
  private otorgarInsignia(i: InsigniaCatalogo, origenId: string): void {
    if (this.e.ganadas.has(i.id)) return;
    this.e.ganadas.add(i.id);
    this.insignias.push({ insignia: i, origenId, otorgadaEn: this.ahora });
    this.publicar(EVENTOS_GAMIFICACION.INSIGNIA_OTORGADA, { insignia: i.codigo });
  }

  private publicar(nombre: string, datos: Record<string, unknown>): void {
    this.eventos.push(crearEvento(nombre, this.e.estudianteId, { estudianteId: this.e.estudianteId, ...datos }, this.ahora));
  }
}
