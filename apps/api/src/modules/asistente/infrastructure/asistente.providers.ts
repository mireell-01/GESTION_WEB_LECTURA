import { Provider } from '@nestjs/common';

import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import {
  PREGUNTA_EN_CURSO,
  PrismaService,
  ResolutorPreguntaEnCurso,
  ResolutorRespuestasAbiertas,
  RESPUESTAS_ABIERTAS,
  uuidV7,
} from '../../shared-kernel/public-api';
import { CASOS_USO_ASISTENTE, CasosUsoAsistente } from '../application/casos-uso-asistente';
import { ActivacionUseCase } from '../application/use-cases/activacion.use-case';
import { BorradorUseCase } from '../application/use-cases/borrador.use-case';
import { ConversarUseCase } from '../application/use-cases/conversar.use-case';
import { AccesoAdultosIamEscuela, IdentidadEstudiantesIam } from './anticorrupcion';
import { MediadorSinConexion } from './motor/mediador-sin-conexion';
import { PrismaActivacionRepository, PrismaConversacionRepository } from './persistence/prisma-asistente-repositories';
import { RetencionAsistente } from './retencion-asistente';

/** Composition root del asistente de lectura (Módulo 11). */
export function crearCasosUsoAsistente(
  prisma: PrismaService,
  iam: IamFacade,
  escuela: EscuelaFacade,
  preguntas: ResolutorPreguntaEnCurso,
  respuestas: ResolutorRespuestasAbiertas,
): CasosUsoAsistente {
  const ahora = () => new Date();
  const conversaciones = new PrismaConversacionRepository(prisma);
  const activaciones = new PrismaActivacionRepository(prisma);
  // Sin IA externa por ahora (decisión del Product Owner): el mediador sin conexión es motor y respaldo.
  const motor = new MediadorSinConexion();
  return {
    conversar: new ConversarUseCase(conversaciones, activaciones, preguntas, motor, motor, () => uuidV7(), ahora),
    activacion: new ActivacionUseCase(activaciones, new AccesoAdultosIamEscuela(iam, escuela), new IdentidadEstudiantesIam(iam), ahora),
    borrador: new BorradorUseCase(respuestas),
    retencion: conversaciones,
  };
}

/** Vinculación puerto → adaptador (Dependency Injection). */
export const asistenteProviders: Provider[] = [
  {
    provide: CASOS_USO_ASISTENTE,
    useFactory: crearCasosUsoAsistente,
    inject: [PrismaService, IamFacade, EscuelaFacade, PREGUNTA_EN_CURSO, RESPUESTAS_ABIERTAS],
  },
  RetencionAsistente,
];
