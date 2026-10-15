import { randomInt, randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleInit, Provider } from '@nestjs/common';

import { EVENTOS_IAM, IamFacade } from '../../iam/public-api';
import {
  BUS_EVENTOS,
  BusEventos,
  PrismaService,
  RECOLECTOR_DATOS,
  RecolectorDatosEstudiante,
} from '../../shared-kernel/public-api';
import { CASOS_USO_ESCUELA, CasosUsoEscuela } from '../application/casos-uso-escuela';
import { EscuelaFacade } from '../application/escuela.facade';
import { DetalleAulaUseCase, ListarAulasUseCase } from '../application/use-cases/consultar-aulas.use-case';
import { CrearAulaUseCase } from '../application/use-cases/crear-aula.use-case';
import { GenerarTarjetasUseCase } from '../application/use-cases/generar-tarjetas.use-case';
import { ArchivarAulaUseCase, RetirarEstudianteUseCase } from '../application/use-cases/gestionar-aula.use-case';
import { ContextoIngresoAulaUseCase, IngresarEnAulaUseCase } from '../application/use-cases/ingreso-aula.use-case';
import { MatricularEstudiantesUseCase } from '../application/use-cases/matricular-estudiantes.use-case';
import { ServicioIdentidadIam } from './identidad/servicio-identidad-iam';
import { PrismaAulaRepository } from './persistence/prisma-aula-repository';
import { PrismaMatriculaRepository } from './persistence/prisma-matricula-repository';

/** Composition root de Escuela. */
export function crearCasosUsoEscuela(prisma: PrismaService, bus: BusEventos, iam: IamFacade): CasosUsoEscuela {
  const ahora = () => new Date();
  const generarId = () => randomUUID();
  const aleatorio = (n: number) => randomInt(n);

  const aulas = new PrismaAulaRepository(prisma);
  const matriculas = new PrismaMatriculaRepository(prisma);
  const identidad = new ServicioIdentidadIam(iam);

  return {
    crearAula: new CrearAulaUseCase(aulas, identidad, bus, aleatorio, generarId, ahora),
    listarAulas: new ListarAulasUseCase(aulas, matriculas),
    detalleAula: new DetalleAulaUseCase(aulas, matriculas, identidad),
    matricular: new MatricularEstudiantesUseCase(aulas, matriculas, identidad, bus, aleatorio, generarId, ahora),
    generarTarjetas: new GenerarTarjetasUseCase(aulas, matriculas, identidad, bus, aleatorio, ahora),
    archivarAula: new ArchivarAulaUseCase(aulas, matriculas, bus, ahora),
    retirarEstudiante: new RetirarEstudianteUseCase(aulas, matriculas, bus, ahora),
    contextoIngreso: new ContextoIngresoAulaUseCase(aulas, matriculas, identidad),
    ingresarEnAula: new IngresarEnAulaUseCase(aulas, matriculas, identidad),
    matriculas,
    facade: new EscuelaFacade(aulas, matriculas),
  };
}

/**
 * Reacciones de Escuela a eventos de otros módulos y aporte a la exportación de datos (RF-012).
 */
@Injectable()
export class EscuelaSuscripciones implements OnModuleInit {
  constructor(
    @Inject(CASOS_USO_ESCUELA) private readonly casos: CasosUsoEscuela,
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
    @Inject(RECOLECTOR_DATOS) private readonly recolector: RecolectorDatosEstudiante,
  ) {}

  onModuleInit(): void {
    // RF-013: al eliminar un perfil, deja de figurar en las aulas.
    this.bus.suscribir(EVENTOS_IAM.PERFIL_ELIMINADO, async (evento) => {
      for (const m of await this.casos.matriculas.listarPorEstudiante(evento.agregadoId)) {
        m.retirar(evento.ocurreEn);
        await this.casos.matriculas.guardar(m);
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
    inject: [PrismaService, BUS_EVENTOS, IamFacade],
  },
  {
    provide: EscuelaFacade,
    useFactory: (casos: CasosUsoEscuela) => casos.facade,
    inject: [CASOS_USO_ESCUELA],
  },
  EscuelaSuscripciones,
];
