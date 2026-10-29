import { FuenteFichasLectura, NoEncontradoError, ResolutorLecturasRealizadas } from '../../../shared-kernel/public-api';
import { CONSEJOS_HABITO, consejosPara, habilidadesAReforzar } from '../../domain/services/acompanamiento-familiar';
import { Celda, celdasDe } from '../../domain/services/mapa-calor';
import { ActividadSemanal, semanasDe } from '../../domain/services/resumen-semanal';
import { Acompanamiento, PanelHijo, SemanaLectura } from '../dto/familia.dto';
import { HijoFamilia, HijosFamilia, ReportesFamiliaRepository } from '../ports/familia.ports';

function restarSemana(lunes: string): string {
  return new Date(Date.parse(`${lunes}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
}

function semanaDe(semana: string, actividad: ActividadSemanal[]): SemanaLectura {
  const fila = actividad.find((a) => a.semana === semana);
  const minutos = fila?.minutos ?? 0;
  const lecturas = fila?.lecturas ?? 0;
  const respuestas = fila?.respuestas ?? 0;
  // Si leyó algo, al menos 1 minuto: "0 min" junto a una lectura terminada o a respuestas confunde.
  const leyo = minutos > 0 || lecturas > 0 || respuestas > 0;
  return { semana, minutos: leyo ? Math.max(1, Math.round(minutos)) : 0, lecturas, respuestas };
}

/**
 * RF-068, RF-069: el panel de un hijo para su familia — avance, tiempo de lectura de la semana, sus
 * habilidades y cómo acompañar en casa las que necesitan refuerzo. Solo de los hijos vinculados a la
 * cuenta (RN-17): cualquier otro responde como si no existiera.
 */
export class PanelHijoUseCase {
  constructor(
    private readonly repo: ReportesFamiliaRepository,
    private readonly hijos: HijosFamilia,
    private readonly fichas: FuenteFichasLectura,
    private readonly realizadas: ResolutorLecturasRealizadas,
    private readonly ahora: () => Date,
  ) {}

  async panel(cuentaId: string, estudianteId: string): Promise<PanelHijo> {
    const hijo = (await this.hijos.hijosDe(cuentaId)).find((h) => h.id === estudianteId);
    if (!hijo) throw new NoEncontradoError('Estudiante');
    return this.armar(hijo, semanasDe(this.ahora()).actual);
  }

  /** El panel con `semana` (su lunes) como semana actual; el resumen del domingo usa la que resume. */
  async armar(hijo: HijoFamilia, semana: string): Promise<PanelHijo> {
    const anterior = restarSemana(semana);
    const [medidas, avance, actividad, ultima, refrescadoEn] = await Promise.all([
      this.repo.maestriasPerfil(hijo.id),
      this.repo.avance(hijo.id),
      this.repo.actividadSemanal([hijo.id], [semana, anterior]),
      this.repo.ultimaActividad([hijo.id]),
      this.repo.refrescadoEn(),
    ]);
    const habilidades = celdasDe(medidas);
    return {
      estudiante: { id: hijo.id, alias: hijo.alias, avatar: hijo.avatar, rangoEdad: hijo.rangoEdad, activo: hijo.activo, relacion: hijo.relacion },
      actualizadoEn: refrescadoEn?.toISOString() ?? null,
      semana: { actual: semanaDe(semana, actividad), anterior: semanaDe(anterior, actividad) },
      avance: {
        lecturasTerminadas: avance?.lecturasTerminadas ?? 0,
        mundosCompletados: avance?.mundosCompletados ?? 0,
        mundoActual: avance?.mundoActual ?? null,
        puntos: avance?.puntos ?? 0,
        insignias: avance?.insignias ?? 0,
        ultimaActividad: ultima.get(hijo.id)?.toISOString() ?? null,
      },
      habilidades,
      aReforzar: await this.acompanamiento(hijo, habilidades),
      habito: CONSEJOS_HABITO,
    };
  }

  /** RF-069: consejos para casa y una lectura de su edad que trabaja la habilidad y aún no terminó. */
  private async acompanamiento(hijo: HijoFamilia, celdas: Celda[]): Promise<Acompanamiento[]> {
    const reforzar = habilidadesAReforzar(celdas);
    if (reforzar.length === 0) return [];
    const [publicadas, hechas] = await Promise.all([this.fichas.publicadas(hijo.rangoEdad), this.realizadas.realizadasDe(hijo.id)]);
    const terminadas = new Set(hechas.map((h) => h.lecturaId));
    return reforzar.map(({ habilidad, valor }) => {
      const ficha = publicadas
        .filter((f) => !terminadas.has(f.id) && f.habilidadesObjetivo?.includes(habilidad))
        .sort((a, b) => a.nivelDificultad - b.nivelDificultad || a.titulo.localeCompare(b.titulo, 'es'))[0];
      return { habilidad, valor, consejos: consejosPara(habilidad, hijo.rangoEdad), lectura: ficha ? { id: ficha.id, titulo: ficha.titulo } : null };
    });
  }
}
