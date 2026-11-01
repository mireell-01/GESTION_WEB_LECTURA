import { PrismaService } from '../../../shared-kernel/public-api';
import { ConteoInstitucion, InstitucionRepository } from '../../application/ports/institucion.repository';
import { EstadoInstitucion, Institucion, normalizarNombreInstitucion } from '../../domain/services/institucion';

type Fila = { id: string; nombre: string; codigoModular: string | null; region: string | null; estado: string; creadaEn: Date };

const aDominio = (f: Fila): Institucion => ({
  id: f.id,
  nombre: f.nombre,
  codigoModular: f.codigoModular,
  region: f.region,
  estado: f.estado as EstadoInstitucion,
  creadaEn: f.creadaEn,
});

/** Adaptador: `escuela.institucion` y el vínculo de cada aula con su institución. */
export class PrismaInstitucionRepository implements InstitucionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<(Institucion & ConteoInstitucion)[]> {
    const filas = await this.prisma.institucion.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        aulas: { where: { estado: 'ACTIVA' }, select: { docenteId: true, matriculas: { where: { estado: 'ACTIVA' }, select: { estudianteId: true } } } },
      },
    });
    return filas.map((f) => ({
      ...aDominio(f),
      aulas: f.aulas.length,
      docentes: new Set(f.aulas.map((a) => a.docenteId)).size,
      estudiantes: new Set(f.aulas.flatMap((a) => a.matriculas.map((m) => m.estudianteId))).size,
    }));
  }

  async todas(): Promise<Institucion[]> {
    return (await this.prisma.institucion.findMany()).map(aDominio);
  }

  async buscarPorId(id: string): Promise<Institucion | null> {
    const fila = await this.prisma.institucion.findUnique({ where: { id } });
    return fila ? aDominio(fila) : null;
  }

  async crear(i: Institucion): Promise<void> {
    await this.prisma.institucion.create({
      data: { id: i.id, nombre: i.nombre, codigoModular: i.codigoModular, region: i.region, estado: i.estado, creadaEn: i.creadaEn },
    });
  }

  async cambiarEstado(id: string, estado: EstadoInstitucion): Promise<void> {
    await this.prisma.institucion.update({ where: { id }, data: { estado } });
  }

  async vincularAulasPorNombre(institucionId: string, nombreNormalizado: string): Promise<number> {
    const sinInstitucion = await this.prisma.aula.findMany({ where: { institucionId: null }, select: { id: true, institucion: true } });
    const ids = sinInstitucion.filter((a) => normalizarNombreInstitucion(a.institucion) === nombreNormalizado).map((a) => a.id);
    if (ids.length === 0) return 0;
    return (await this.prisma.aula.updateMany({ where: { id: { in: ids }, institucionId: null }, data: { institucionId } })).count;
  }

  async vincularAula(aulaId: string, institucionId: string): Promise<void> {
    await this.prisma.aula.update({ where: { id: aulaId }, data: { institucionId } });
  }
}
