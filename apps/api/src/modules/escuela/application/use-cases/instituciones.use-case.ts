import { BusEventos, crearEvento, ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { InstitucionRepetidaError, InstitucionSuspendidaError } from '../../domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { datosInstitucion, EstadoInstitucion, Institucion, normalizarNombreInstitucion } from '../../domain/services/institucion';
import { GeneradorId, Reloj } from '../dto/escuela.dto';
import { ConteoInstitucion, InstitucionRepository } from '../ports/institucion.repository';

/** Una institución con lo que tiene, como la ve la administración. */
export interface InstitucionVista extends ConteoInstitucion {
  id: string;
  nombre: string;
  codigoModular: string | null;
  region: string | null;
  estado: EstadoInstitucion;
  creadaEn: string;
}

const vista = (i: Institucion & ConteoInstitucion): InstitucionVista => ({
  id: i.id,
  nombre: i.nombre,
  codigoModular: i.codigoModular,
  region: i.region,
  estado: i.estado,
  creadaEn: i.creadaEn.toISOString(),
  aulas: i.aulas,
  docentes: i.docentes,
  estudiantes: i.estudiantes,
});

/**
 * RF-076: la administración registra las instituciones educativas y puede suspenderlas.
 * Suspender una institución (decisión del Product Owner, 30/10/2026) solo la marca: ya no se elige
 * para aulas nuevas; sus docentes, aulas y estudiantes siguen igual.
 * Las aulas guardan el nombre que escribió la docente: al registrar una institución se vinculan las
 * que ya la nombraban igual, y desde entonces cada aula nueva con ese nombre queda vinculada.
 */
export class InstitucionesUseCase {
  constructor(
    private readonly repo: InstitucionRepository,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async listar(): Promise<InstitucionVista[]> {
    return (await this.repo.listar()).map(vista);
  }

  /** Las que puede elegir una docente al crear su aula (RF-014). */
  async activas(): Promise<{ id: string; nombre: string }[]> {
    return (await this.repo.todas())
      .filter((i) => i.estado === 'ACTIVA')
      .map((i) => ({ id: i.id, nombre: i.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async crear(entrada: { nombre: string; codigoModular?: string | null; region?: string | null; adminId: string }): Promise<InstitucionVista> {
    const datos = datosInstitucion(entrada);
    const clave = normalizarNombreInstitucion(datos.nombre);
    const todas = await this.repo.todas();
    if (todas.some((i) => normalizarNombreInstitucion(i.nombre) === clave)) throw new InstitucionRepetidaError('nombre');
    if (datos.codigoModular && todas.some((i) => i.codigoModular === datos.codigoModular)) throw new InstitucionRepetidaError('código modular');

    const ahora = this.ahora();
    const institucion: Institucion = { id: this.generarId(), ...datos, estado: 'ACTIVA', creadaEn: ahora };
    await this.repo.crear(institucion);
    const aulasVinculadas = await this.repo.vincularAulasPorNombre(institucion.id, clave);
    await this.bus.publicar([
      crearEvento(EVENTOS_ESCUELA.INSTITUCION_CREADA, institucion.id, { actorId: entrada.adminId, rol: 'ADMIN_PLATAFORMA', aulasVinculadas }, ahora),
    ]);
    return this.una(institucion.id);
  }

  async cambiarEstado(id: string, estado: EstadoInstitucion, adminId: string): Promise<InstitucionVista> {
    const institucion = await this.repo.buscarPorId(id);
    if (!institucion) throw new ErrorDeNegocio('Institución no encontrada', 'NO_ENCONTRADO');
    if (institucion.estado !== estado) {
      await this.repo.cambiarEstado(id, estado);
      const evento = estado === 'SUSPENDIDA' ? EVENTOS_ESCUELA.INSTITUCION_SUSPENDIDA : EVENTOS_ESCUELA.INSTITUCION_REACTIVADA;
      await this.bus.publicar([crearEvento(evento, id, { actorId: adminId, rol: 'ADMIN_PLATAFORMA' }, this.ahora())]);
    }
    return this.una(id);
  }

  /** Al crear un aula: la institución registrada con ese nombre (si la hay); una suspendida no se elige. */
  async paraAulaNueva(nombre: string): Promise<Institucion | null> {
    const clave = normalizarNombreInstitucion(nombre);
    const institucion = (await this.repo.todas()).find((i) => normalizarNombreInstitucion(i.nombre) === clave) ?? null;
    if (institucion?.estado === 'SUSPENDIDA') throw new InstitucionSuspendidaError(institucion.nombre);
    return institucion;
  }

  vincularAula(aulaId: string, institucionId: string): Promise<void> {
    return this.repo.vincularAula(aulaId, institucionId);
  }

  private async una(id: string): Promise<InstitucionVista> {
    const fila = (await this.repo.listar()).find((i) => i.id === id);
    if (!fila) throw new ErrorDeNegocio('Institución no encontrada', 'NO_ENCONTRADO');
    return vista(fila);
  }
}
