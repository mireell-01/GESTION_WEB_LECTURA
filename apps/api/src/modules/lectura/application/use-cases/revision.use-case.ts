import { BusEventos, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { EstadoRespuesta } from '../../domain/entities/sesion-lectura';
import { EVENTOS_LECTURA } from '../../domain/events/eventos-lectura';
import { Guion } from '../../domain/services/guion';
import { RespuestaAbiertaVista, vistaRespuestaAbierta } from '../dto/lectura.dto';
import { ContenidoLecturas, EscuelaLectura, IdentidadEstudiantes, SesionRepository } from '../ports/lectura.ports';

/**
 * RF-051: la docente revisa las respuestas abiertas de su aula con una rúbrica de 3 niveles. Solo ve
 * a los estudiantes de sus aulas (RN-17); la valoración la publica para que Progreso actualice la
 * maestría de ARG/CRI (RN-19).
 */
export class RevisionUseCase {
  constructor(
    private readonly repo: SesionRepository,
    private readonly contenidos: ContenidoLecturas,
    private readonly identidad: IdentidadEstudiantes,
    private readonly escuela: EscuelaLectura,
    private readonly bus: BusEventos,
    private readonly ahora: () => Date,
  ) {}

  async respuestas(docenteId: string, aulaId: string, estado: EstadoRespuesta = 'PENDIENTE_REVISION'): Promise<RespuestaAbiertaVista[]> {
    if (!(await this.escuela.aulaDelDocente(docenteId, aulaId))) throw new NoEncontradoError('Aula');
    const ids = await this.escuela.estudiantes(aulaId);
    if (ids.length === 0) return [];
    const [sesiones, perfiles] = await Promise.all([this.repo.conRespuestasAbiertas(ids, estado), this.identidad.perfiles(ids)]);
    const porId = new Map(perfiles.map((p) => [p.id, p]));
    const guiones = new Map<string, Guion>();
    const vistas: RespuestaAbiertaVista[] = [];
    for (const s of sesiones) {
      let g = guiones.get(s.versionLecturaId);
      if (!g) {
        const contenido = await this.contenidos.version(s.versionLecturaId);
        if (!contenido) continue;
        g = new Guion(contenido);
        guiones.set(s.versionLecturaId, g);
      }
      const perfil = porId.get(s.estudianteId);
      for (const r of s.respuestas) {
        const item = g.paso(r.itemId)?.item;
        if (r.estado !== estado || !item || item.esCerrado) continue;
        vistas.push(vistaRespuestaAbierta(s, g, r, { id: s.estudianteId, alias: perfil?.alias ?? 'Estudiante', avatar: perfil?.avatar ?? '' }));
      }
    }
    return vistas.sort((a, b) => a.respondidaEn.localeCompare(b.respondidaEn));
  }

  async valorar(docenteId: string, respuestaId: string, entrada: { nivel: number; comentario?: string | null }): Promise<RespuestaAbiertaVista> {
    const s = await this.repo.buscarPorRespuesta(respuestaId);
    // RN-17: la respuesta de un niño que no es de sus aulas responde como si no existiera.
    if (!s || !(await this.escuela.docenteAccedeAEstudiante(docenteId, s.estudianteId))) throw new NoEncontradoError('Respuesta');
    const contenido = await this.contenidos.version(s.versionLecturaId);
    if (!contenido) throw new NoEncontradoError('Respuesta');
    const g = new Guion(contenido);
    const r = s.valorar({ respuestaId, docenteId, nivel: entrada.nivel, comentario: entrada.comentario, ahora: this.ahora() });
    await this.repo.guardar(s);
    const item = g.paso(r.itemId)?.item;
    await this.bus.publicar([
      crearEvento(
        EVENTOS_LECTURA.RESPUESTA_VALORADA,
        r.id,
        {
          estudianteId: s.estudianteId,
          respuestaId: r.id,
          itemId: r.itemId,
          habilidad: r.habilidad,
          nivelDificultad: item?.nivelDificultad ?? 1,
          nivel: entrada.nivel,
          puntajeItem: r.puntajeItem,
          docenteId,
        },
        this.ahora(),
      ),
    ]);
    const [perfil] = await this.identidad.perfiles([s.estudianteId]);
    return vistaRespuestaAbierta(s, g, r, { id: s.estudianteId, alias: perfil?.alias ?? 'Estudiante', avatar: perfil?.avatar ?? '' });
  }
}
