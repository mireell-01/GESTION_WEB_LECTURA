import { esHabilidad, FuenteFichasLectura, HABILIDADES, NoEncontradoError, RangoEdad } from '../../../shared-kernel/public-api';
import { celdasDe } from '../../domain/services/mapa-calor';
import { dificultadesCompartidas } from '../../domain/services/refuerzo-grupal';
import { resumirSemana, semanasDe } from '../../domain/services/resumen-semanal';
import { evaluarRiesgo } from '../../domain/services/riesgo';
import { AulaVista, EstudiantePanel, GrupoHabilidad, PanelAula, Refuerzo } from '../dto/reporting.dto';
import { AulasDocente, IdentidadEstudiantes, ReportesRepository } from '../ports/reporting.ports';

const ORDEN_RIESGO = (e: EstudiantePanel) => e.riesgo.motivos.length * 1000 + (e.riesgo.diasSinActividad ?? 999);

/**
 * RF-063, RF-065, RF-066: el panel del aula para su docente. Todo sale de las vistas de reportes (SAD
 * §5), que se refrescan cada 5 minutos (SRS §7: el panel se cachea 5 min, alineado a ese refresco):
 * mapa de calor estudiantes × habilidades con su nivel CNEB, el promedio y la distribución del grupo,
 * los estudiantes en riesgo, el resumen de la semana y los refuerzos para dificultades compartidas.
 */
export class PanelAulaUseCase {
  constructor(
    private readonly repo: ReportesRepository,
    private readonly aulas: AulasDocente,
    private readonly identidad: IdentidadEstudiantes,
    private readonly fichas: FuenteFichasLectura,
    private readonly ahora: () => Date,
  ) {}

  async panel(docenteId: string, aulaId: string): Promise<PanelAula> {
    // RN-17: el aula de otra docente responde como si no existiera.
    const aula = await this.aulas.aulaDe(docenteId, aulaId);
    if (!aula) throw new NoEncontradoError('Aula');
    return this.analizar(aula);
  }

  /** El panel de un aula ya verificada (también lo usan el reporte y el resumen semanal). */
  async analizar(aula: AulaVista): Promise<PanelAula> {
    const ahora = this.ahora();
    const semanas = semanasDe(ahora);
    const [matriculados, maestrias, desempeno, refrescadoEn] = await Promise.all([
      this.repo.estudiantesDeAula(aula.id),
      this.repo.maestrias(aula.id),
      this.repo.desempeno(aula.id),
      this.repo.refrescadoEn(),
    ]);
    const ids = matriculados.map((m) => m.estudianteId);
    const [perfiles, ultima, semanal] = await Promise.all([
      this.identidad.perfiles(ids),
      this.repo.ultimaActividad(ids),
      this.repo.actividadSemanal(ids, [semanas.actual, semanas.anterior]),
    ]);
    const perfil = new Map(perfiles.map((p) => [p.id, p]));

    const estudiantes: EstudiantePanel[] = matriculados
      .map((m) => {
        const celdas = celdasDe(maestrias.filter((x) => x.estudianteId === m.estudianteId));
        const ultimaActividad = ultima.get(m.estudianteId) ?? null;
        return {
          id: m.estudianteId,
          alias: perfil.get(m.estudianteId)?.alias ?? 'Estudiante',
          avatar: perfil.get(m.estudianteId)?.avatar ?? '',
          celdas,
          ultimaActividad: ultimaActividad?.toISOString() ?? null,
          lecturasSemana: semanal.filter((a) => a.estudianteId === m.estudianteId && a.semana === semanas.actual).reduce((s, a) => s + a.lecturas, 0),
          riesgo: evaluarRiesgo({ ultimaActividad, matriculadoEn: m.matriculadoEn, celdas, ahora }),
        };
      })
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));

    const enRiesgo = estudiantes.filter((e) => e.riesgo.enRiesgo).sort((a, b) => ORDEN_RIESGO(b) - ORDEN_RIESGO(a));
    return {
      aula,
      actualizadoEn: refrescadoEn?.toISOString() ?? null,
      totalEstudiantes: estudiantes.length,
      grupo: this.grupo(desempeno, estudiantes.length),
      estudiantes,
      alertas: enRiesgo.map((e) => ({ estudianteId: e.id, alias: e.alias, avatar: e.avatar, riesgo: e.riesgo })),
      resumenSemanal: {
        actual: resumirSemana(semanas.actual, semanal, estudiantes.length),
        anterior: resumirSemana(semanas.anterior, semanal, estudiantes.length),
        enRiesgo: enRiesgo.length,
      },
      refuerzos: await this.refuerzos(estudiantes, perfiles),
    };
  }

  /** Promedio y distribución por nivel CNEB del grupo (vista `mv_desempeno_aula`). */
  private grupo(desempeno: Awaited<ReturnType<ReportesRepository['desempeno']>>, total: number): GrupoHabilidad[] {
    return HABILIDADES.map((habilidad) => {
      const d = desempeno.find((x) => x.habilidad === habilidad);
      return {
        habilidad,
        promedio: d ? Math.round(d.promedio * 10) / 10 : null,
        distribucion: { C: d?.C ?? 0, B: d?.B ?? 0, A: d?.A ?? 0, AD: d?.AD ?? 0, descubriendo: d?.descubriendo ?? 0 },
        sinDatos: Math.max(0, total - (d?.estudiantes ?? 0)),
      };
    });
  }

  /** RF-066: para cada dificultad compartida, la lectura más sencilla de su edad que la trabaja. */
  private async refuerzos(estudiantes: EstudiantePanel[], perfiles: { id: string; rangoEdad: RangoEdad }[]): Promise<Refuerzo[]> {
    const dificultades = dificultadesCompartidas(estudiantes);
    if (dificultades.length === 0) return [];
    const rangoDe = new Map(perfiles.map((p) => [p.id, p.rangoEdad]));
    const catalogo = new Map<RangoEdad, Awaited<ReturnType<FuenteFichasLectura['publicadas']>>>();
    const alias = new Map(estudiantes.map((e) => [e.id, e.alias]));
    const refuerzos: Refuerzo[] = [];
    for (const d of dificultades) {
      // La edad más frecuente entre quienes la comparten.
      const conteo = new Map<RangoEdad, number>();
      for (const id of d.estudianteIds) {
        const r = rangoDe.get(id);
        if (r) conteo.set(r, (conteo.get(r) ?? 0) + 1);
      }
      const rango = [...conteo].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      let lectura: Refuerzo['lectura'] = null;
      if (rango) {
        if (!catalogo.has(rango)) catalogo.set(rango, await this.fichas.publicadas(rango));
        const f = (catalogo.get(rango) ?? [])
          .filter((x) => x.habilidadesObjetivo?.some((h) => esHabilidad(h) && h === d.habilidad))
          .sort((a, b) => a.nivelDificultad - b.nivelDificultad || a.titulo.localeCompare(b.titulo, 'es'))[0];
        lectura = f ? { id: f.id, titulo: f.titulo, nivelDificultad: f.nivelDificultad } : null;
      }
      refuerzos.push({ habilidad: d.habilidad, estudianteIds: d.estudianteIds, alias: d.estudianteIds.map((id) => alias.get(id) ?? 'Estudiante'), porcentaje: d.porcentaje, lectura });
    }
    return refuerzos;
  }
}
