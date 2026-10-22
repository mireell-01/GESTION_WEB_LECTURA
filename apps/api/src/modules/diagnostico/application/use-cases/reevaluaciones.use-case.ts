import { BusEventos, crearEvento, ErrorDeNegocio, Habilidad, HABILIDADES, NoEncontradoError } from '../../../shared-kernel/public-api';
import { Diagnostico } from '../../domain/entities/diagnostico';
import { EVENTOS_DIAGNOSTICO } from '../../domain/events/eventos-diagnostico';
import { maestriasDe } from '../../domain/services/calculo-nivel';
import { AsignacionReevaluacionVista, ReevaluacionEstudianteVista } from '../dto/diagnostico.dto';
import { AulasDocente, DiagnosticoRepository, IdentidadEstudiantes } from '../ports/diagnostico.ports';

/**
 * RF-037: el docente asigna una reevaluación periódica a su aula. Usa ítems equivalentes (la otra
 * forma del banco), así que el resultado se compara con el diagnóstico inicial habilidad por habilidad.
 */
export class ReevaluacionesUseCase {
  constructor(
    private readonly repo: DiagnosticoRepository,
    private readonly aulas: AulasDocente,
    private readonly identidad: IdentidadEstudiantes,
    private readonly bus: BusEventos,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  async asignar(e: { docenteId: string; aulaId: string; estudianteIds?: string[] }): Promise<AsignacionReevaluacionVista> {
    const aula = await this.aulaDe(e.docenteId, e.aulaId);
    if (!aula.activa) throw new ErrorDeNegocio('El aula está archivada: ya no se pueden asignar reevaluaciones', 'CONFLICTO');
    const delAula = await this.aulas.estudiantes(aula.id);
    const elegidos = e.estudianteIds ?? delAula;
    if (elegidos.length === 0 || !elegidos.every((id) => delAula.includes(id))) {
      throw new ErrorDeNegocio('Elige estudiantes matriculados en esta aula', 'VALIDACION');
    }
    const perfiles = new Map((await this.identidad.perfiles(elegidos)).map((p) => [p.id, p]));
    const resultado: AsignacionReevaluacionVista = { asignados: 0, omitidos: [] };
    for (const id of new Set(elegidos)) {
      const perfil = perfiles.get(id);
      const omitir = (motivo: string) => resultado.omitidos.push({ estudianteId: id, alias: perfil?.alias ?? '—', motivo });
      if (!perfil?.activo) { omitir('Su perfil está desactivado'); continue; }
      if ((await this.repo.inicialDe(id))?.estado !== 'FINALIZADO') { omitir('Aún no termina su reto inicial'); continue; }
      if (await this.repo.pendienteDe(id)) { omitir('Ya tiene un reto pendiente'); continue; }
      const reevaluacion = Diagnostico.crearReevaluacion({
        id: this.generarId(),
        estudianteId: id,
        rangoEdad: perfil.rangoEdad,
        secuencia: (await this.repo.ultimaSecuencia(id, 'REEVALUACION')) + 1,
        asignadoPor: e.docenteId,
      });
      if (await this.repo.crear(reevaluacion)) resultado.asignados += 1;
      else omitir('Ya tiene un reto pendiente');
    }
    if (resultado.asignados > 0) {
      await this.bus.publicar([
        crearEvento(EVENTOS_DIAGNOSTICO.REEVALUACION_ASIGNADA, aula.id, { actorId: e.docenteId, aulaId: aula.id, cantidad: resultado.asignados }, this.ahora()),
      ]);
    }
    return resultado;
  }

  /** Por estudiante: su inicial, su última reevaluación y cuánto cambió en cada habilidad. */
  async resumen(docenteId: string, aulaId: string): Promise<ReevaluacionEstudianteVista[]> {
    const aula = await this.aulaDe(docenteId, aulaId);
    const ids = await this.aulas.estudiantes(aula.id);
    const [perfiles, diagnosticos] = await Promise.all([this.identidad.perfiles(ids), this.repo.deEstudiantes(ids)]);
    return perfiles
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'))
      .map((p) => {
        const suyos = diagnosticos.filter((d) => d.estudianteId === p.id);
        const inicial = suyos.find((d) => d.tipo === 'INICIAL') ?? null;
        const ultima = suyos.filter((d) => d.tipo === 'REEVALUACION').sort((a, b) => b.secuencia - a.secuencia)[0] ?? null;
        const valoresInicial = valores(inicial);
        const valoresUltima = valores(ultima);
        return {
          estudianteId: p.id,
          alias: p.alias,
          avatar: p.avatar,
          inicial: { estado: inicial?.estado ?? 'SIN_EMPEZAR', valores: valoresInicial },
          reevaluacion: ultima
            ? { secuencia: ultima.secuencia, estado: ultima.estado, respondidos: ultima.respondidos, total: ultima.totalItems, valores: valoresUltima }
            : null,
          cambios:
            valoresInicial && valoresUltima
              ? (Object.fromEntries(HABILIDADES.map((h) => [h, Math.round((valoresUltima[h] - valoresInicial[h]) * 10) / 10])) as Record<Habilidad, number>)
              : null,
        };
      });
  }

  private async aulaDe(docenteId: string, aulaId: string) {
    const aula = await this.aulas.aulaDelDocente(docenteId, aulaId);
    if (!aula) throw new NoEncontradoError('Aula');
    return aula;
  }
}

function valores(d: Diagnostico | null): Record<Habilidad, number> | null {
  return d?.estado === 'FINALIZADO' && d.resultado ? maestriasDe(d.resultado.habilidades) : null;
}
