import {
  FuenteFichasLectura,
  NoEncontradoError,
  ResolutorAvanceLecturas,
  ResolutorMisionEnCurso,
} from '../../../shared-kernel/public-api';
import { NIVEL_BASE, nivelLectura } from '../../domain/services/maestria';
import { Recomendacion, recomendar } from '../../domain/services/recomendador';
import { RecomendacionVista } from '../dto/progreso.dto';
import {
  AsignacionesEstudiante,
  IdentidadEstudiantes,
  RecomendacionRepository,
} from '../ports/progreso.ports';
import { PerfilLectorUseCase } from './perfil-lector.use-case';

const clave = (r: Pick<Recomendacion, 'tipo' | 'lecturaId' | 'asignacionId' | 'habilidad'>) =>
  `${r.tipo}|${r.lecturaId ?? ''}|${r.asignacionId ?? ''}|${r.habilidad ?? ''}`;

/**
 * RF-055, RN-20: las próximas lecturas del niño, entre 1 y 3: lo que le asignó su docente (primero),
 * la lectura que sigue en su misión del mapa y una para su habilidad más débil, a su nivel. Se calcula
 * al pedirla con lo que el niño tiene hoy y queda guardada como la vigente.
 */
export class RecomendacionesUseCase {
  constructor(
    private readonly repo: RecomendacionRepository,
    private readonly perfiles: PerfilLectorUseCase,
    private readonly identidad: IdentidadEstudiantes,
    private readonly asignaciones: AsignacionesEstudiante,
    private readonly fichas: FuenteFichasLectura,
    private readonly avance: ResolutorAvanceLecturas,
    private readonly mision: ResolutorMisionEnCurso,
    private readonly ahora: () => Date,
  ) {}

  async recomendaciones(estudianteId: string): Promise<RecomendacionVista[]> {
    const rango = await this.identidad.rangoDe(estudianteId);
    if (!rango) throw new NoEncontradoError('Estudiante');
    const [perfil, asignaciones, mision, publicadas] = await Promise.all([
      this.perfiles.perfilDe(estudianteId),
      this.asignaciones.vigentes(estudianteId),
      this.mision.lecturaSiguiente(estudianteId),
      this.fichas.publicadas(rango),
    ]);
    // Las lecturas asignadas o de la misión pueden ser de otra edad: se buscan aparte; las archivadas no se recomiendan.
    const conocidas = new Map(publicadas.map((f) => [f.id, f]));
    const otras = [
      ...asignaciones.filter((a) => a.tipo === 'LECTURA').map((a) => a.contenidoId),
      ...(mision ? [mision.lecturaId] : []),
    ].filter((id) => !conocidas.has(id));
    for (const f of otras.length ? await this.fichas.fichas([...new Set(otras)]) : [])
      conocidas.set(f.id, f);
    const asignadas = asignaciones.filter(
      (a) => a.tipo === 'MISION' || conocidas.has(a.contenidoId),
    );
    const deMision = mision && conocidas.has(mision.lecturaId) ? mision : null;

    const ids = [...conocidas.keys()];
    const avance = await this.avance.avanceDe(estudianteId, ids);
    const terminadas = new Set(ids.filter((id) => avance.get(id) === 'FINALIZADA'));

    const recomendadas = recomendar({
      asignaciones: asignadas,
      mision: deMision,
      fichas: publicadas.map((f) => ({
        id: f.id,
        nivelDificultad: f.nivelDificultad,
        habilidades: f.habilidadesObjetivo ?? [],
      })),
      terminadas,
      habilidadDebil: perfil.habilidadMasDebil(),
      nivel: perfil.tieneHistoria ? nivelLectura(rango, perfil.promedio()) : NIVEL_BASE[rango],
    });

    // Solo se guardan cuando cambian (RF-055: las vigentes).
    const vigentes = await this.repo.vigentes(estudianteId);
    if (vigentes.map(clave).join() !== recomendadas.map(clave).join())
      await this.repo.reemplazar(estudianteId, recomendadas, this.ahora());

    return recomendadas.map((r, i) => {
      const ficha = r.lecturaId ? conocidas.get(r.lecturaId) : undefined;
      return {
        tipo: r.tipo,
        prioridad: i + 1,
        lectura: ficha
          ? { id: ficha.id, titulo: ficha.titulo, nivelDificultad: ficha.nivelDificultad }
          : null,
        habilidad: r.habilidad,
        mision: r.mision,
        asignacionId: r.asignacionId,
        enCurso: !!r.lecturaId && avance.get(r.lecturaId) === 'EN_CURSO',
      };
    });
  }
}
