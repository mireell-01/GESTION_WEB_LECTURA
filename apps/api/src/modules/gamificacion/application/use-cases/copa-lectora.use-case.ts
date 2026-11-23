import { fechaLocalLima, NoEncontradoError } from '../../../shared-kernel/public-api';
import { clasificar, semanaDeCopa } from '../../domain/services/copa-lectora';
import { CopaVista } from '../dto/gamificacion.dto';
import { AulaDelEstudiante, GamificacionRepository, IdentidadEstudiantes } from '../ports/gamificacion.ports';
import { puestasDe } from './apariencia.use-case';

/**
 * La Copa Lectora del aula: los compañeros ordenados por los puntos que ganaron leyendo esta semana.
 * Los puntos ya tienen tope diario y la relectura vale menos (RN-12), así que gana quien lee más.
 * Solo alias y avatar (con su accesorio); sin aula activa, el niño ve cómo unirse.
 */
export class CopaLectoraUseCase {
  constructor(
    private readonly repo: GamificacionRepository,
    private readonly identidad: IdentidadEstudiantes,
    private readonly aulas: AulaDelEstudiante,
    private readonly ahora: () => Date,
  ) {}

  async copa(estudianteId: string): Promise<CopaVista> {
    if (!(await this.identidad.perfil(estudianteId))) throw new NoEncontradoError('Estudiante');
    const semana = semanaDeCopa(fechaLocalLima(this.ahora()));
    const aula = await this.aulas.aulaDe(estudianteId);
    if (!aula) return { enAula: false, aula: null, semana, totalAula: 0, participantes: [] };

    const ids = [...new Set([...aula.estudianteIds, estudianteId])];
    const [perfiles, puntos, apariencias, catalogo] = await Promise.all([
      this.identidad.perfilesDe(ids),
      this.repo.puntosEntre(ids, semana.desde, semana.hasta),
      this.repo.apariencias(ids),
      this.repo.recompensas(),
    ]);
    const competidores = ids.flatMap((id) => {
      const perfil = perfiles.get(id);
      return perfil ? [{ id, alias: perfil.alias, avatar: perfil.avatar, puntos: puntos.get(id) ?? 0 }] : [];
    });
    return {
      enAula: true,
      aula: aula.nombre,
      semana,
      totalAula: competidores.reduce((suma, c) => suma + c.puntos, 0),
      participantes: clasificar(competidores).map((c) => {
        const apariencia = apariencias.get(c.id);
        return {
          posicion: c.posicion,
          alias: c.alias,
          avatar: c.avatar,
          accesorio: apariencia ? puestasDe(apariencia, catalogo).accesorio : null,
          puntos: c.puntos,
          soyYo: c.id === estudianteId,
        };
      }),
    };
  }
}
