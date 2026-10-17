import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable, OnModuleInit, Provider } from '@nestjs/common';

import { EVENTOS_IAM, IamFacade } from '../../iam/public-api';
import {
  BUS_EVENTOS,
  BusEventos,
  CATALOGO_ASIGNABLE,
  CatalogoAsignable,
  CONTEXTO_AULA,
  PrismaService,
  RECOLECTOR_DATOS,
  RecolectorDatosEstudiante,
  RegistroContextoAula,
  uuidV7,
} from '../../shared-kernel/public-api';
import { CASOS_USO_ESCUELA, CasosUsoEscuela } from '../application/casos-uso-escuela';
import { EscuelaFacade } from '../application/escuela.facade';
import {
  CatalogoDelAulaUseCase,
  ListarAsignacionesUseCase,
  MisionesDelDocenteUseCase,
} from '../application/use-cases/consultar-asignaciones.use-case';
import { DetalleAulaUseCase, ListarAulasUseCase } from '../application/use-cases/consultar-aulas.use-case';
import { CrearAulaUseCase } from '../application/use-cases/crear-aula.use-case';
import { GenerarTarjetasUseCase } from '../application/use-cases/generar-tarjetas.use-case';
import { ArchivarAulaUseCase, RetirarEstudianteUseCase } from '../application/use-cases/gestionar-aula.use-case';
import { CerrarAsignacionUseCase, CrearAsignacionUseCase } from '../application/use-cases/gestionar-asignaciones.use-case';
import {
  CanjearInvitacionFamiliarUseCase,
  GenerarInvitacionFamiliarUseCase,
} from '../application/use-cases/invitaciones-familiar.use-case';
import { MatricularEstudiantesUseCase } from '../application/use-cases/matricular-estudiantes.use-case';
import { ServicioIdentidadIam } from './identidad/servicio-identidad-iam';
import { PdfLibTarjetas } from './pdf/pdf-lib-tarjetas';
import { PrismaAsignacionRepository } from './persistence/prisma-asignacion-repository';
import { PrismaAulaRepository } from './persistence/prisma-aula-repository';
import { PrismaInvitacionRepository } from './persistence/prisma-invitacion-repository';
import { PrismaMatriculaRepository } from './persistence/prisma-matricula-repository';

/** Composition root de Escuela. */
export function crearCasosUsoEscuela(
  prisma: PrismaService,
  bus: BusEventos,
  iam: IamFacade,
  catalogo: CatalogoAsignable,
): CasosUsoEscuela {
  const ahora = () => new Date();
  const generarId = () => uuidV7();
  const aleatorio = (n: number) => randomInt(n);
  const huella = (texto: string) => createHash('sha256').update(texto).digest('base64url');

  const aulas = new PrismaAulaRepository(prisma);
  const matriculas = new PrismaMatriculaRepository(prisma);
  const asignaciones = new PrismaAsignacionRepository(prisma);
  const invitaciones = new PrismaInvitacionRepository(prisma);
  const identidad = new ServicioIdentidadIam(iam);
  const misionesDelDocente = new MisionesDelDocenteUseCase(aulas, matriculas, asignaciones, ahora);

  return {
    crearAula: new CrearAulaUseCase(aulas, identidad, bus, aleatorio, generarId, ahora),
    listarAulas: new ListarAulasUseCase(aulas, matriculas),
    detalleAula: new DetalleAulaUseCase(aulas, matriculas, identidad),
    matricular: new MatricularEstudiantesUseCase(aulas, matriculas, identidad, bus, aleatorio, generarId, ahora),
    generarTarjetas: new GenerarTarjetasUseCase(aulas, matriculas, identidad, new PdfLibTarjetas(), bus, aleatorio, ahora),
    archivarAula: new ArchivarAulaUseCase(aulas, matriculas, asignaciones, bus, ahora),
    retirarEstudiante: new RetirarEstudianteUseCase(aulas, matriculas, bus, ahora),
    crearAsignacion: new CrearAsignacionUseCase(aulas, matriculas, asignaciones, catalogo, identidad, bus, generarId, ahora),
    listarAsignaciones: new ListarAsignacionesUseCase(aulas, asignaciones, identidad, ahora),
    cerrarAsignacion: new CerrarAsignacionUseCase(aulas, asignaciones, bus, ahora),
    catalogoDelAula: new CatalogoDelAulaUseCase(aulas, catalogo),
    misionesDelDocente,
    generarInvitacion: new GenerarInvitacionFamiliarUseCase(
      aulas, matriculas, invitaciones, identidad, bus, huella, aleatorio, generarId, ahora,
    ),
    canjearInvitacion: new CanjearInvitacionFamiliarUseCase(aulas, matriculas, invitaciones, identidad, bus, huella, ahora),
    aulas,
    matriculas,
    asignaciones,
    facade: new EscuelaFacade(aulas, matriculas, misionesDelDocente),
  };
}

/**
 * Integración de Escuela con el resto: contexto de aula para el ingreso de estudiantes (RF-007),
 * reacción a la eliminación de perfiles (RF-013) y aporte a la exportación de datos (RF-012).
 */
@Injectable()
export class EscuelaSuscripciones implements OnModuleInit {
  constructor(
    @Inject(CASOS_USO_ESCUELA) private readonly casos: CasosUsoEscuela,
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
    @Inject(RECOLECTOR_DATOS) private readonly recolector: RecolectorDatosEstudiante,
    @Inject(CONTEXTO_AULA) private readonly contextoAula: RegistroContextoAula,
  ) {}

  onModuleInit(): void {
    const { aulas, matriculas } = this.casos;

    // RF-007 / RN-04 / CR-01: IAM valida la tablet del aula (aula activa, su docente y matrículas).
    this.contextoAula.registrar({
      aulaActiva: async (aulaId) => {
        const aula = await aulas.buscarPorId(aulaId);
        return aula && aula.estaActiva ? { aulaId: aula.id, nombre: aula.nombre, docenteId: aula.docenteId } : null;
      },
      estudiantesActivos: async (aulaId) => (await matriculas.listarActivasPorAula(aulaId)).map((m) => m.estudianteId),
      estaMatriculado: async (aulaId, estudianteId) => !!(await matriculas.buscar(aulaId, estudianteId))?.activa,
    });

    // RF-013: al eliminar un perfil, deja de figurar en las aulas.
    this.bus.suscribir(EVENTOS_IAM.PERFIL_ELIMINADO, async (evento) => {
      for (const m of await matriculas.listarPorEstudiante(evento.agregadoId)) {
        m.retirar(evento.ocurreEn);
        await matriculas.guardar(m);
      }
    });

    this.recolector.registrar('aulas', async (estudianteId) =>
      (await this.casos.facade.aulasDeEstudiante(estudianteId)).map((a) => ({
        aula: a.nombre,
        grado: a.grado,
        anioLectivo: a.anioLectivo,
      })),
    );
  }
}

export const escuelaProviders: Provider[] = [
  {
    provide: CASOS_USO_ESCUELA,
    useFactory: crearCasosUsoEscuela,
    inject: [PrismaService, BUS_EVENTOS, IamFacade, CATALOGO_ASIGNABLE],
  },
  {
    provide: EscuelaFacade,
    useFactory: (casos: CasosUsoEscuela) => casos.facade,
    inject: [CASOS_USO_ESCUELA],
  },
  EscuelaSuscripciones,
];
