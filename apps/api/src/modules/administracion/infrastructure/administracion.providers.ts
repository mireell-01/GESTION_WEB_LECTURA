import { Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { EscuelaFacade } from '../../escuela/public-api';
import { GamificacionFacade } from '../../gamificacion/public-api';
import { IamFacade } from '../../iam/public-api';
import { PrismaService, uuidV7 } from '../../shared-kernel/public-api';
import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../application/casos-uso-administracion';
import { AuditoriaUseCase, DocentesAdminUseCase, InstitucionesAdminUseCase, ParametrosGamificacionUseCase } from '../application/use-cases/plataforma.use-cases';
import { RegistrarAuditoriaUseCase } from '../application/use-cases/registrar-auditoria.use-case';
import { GestionCuentasIam, GestionEscuelaFacade, GestionGamificacionFacade } from './anticorrupcion';
import { AuditoriaAccesosInterceptor } from './auditoria-accesos.interceptor';
import { AuditoriaSuscripciones } from './auditoria-suscripciones';
import { PrismaAuditoriaRepository } from './persistence/prisma-auditoria-repository';
import { RetencionAuditoria } from './retencion-auditoria';

/** Composition root de Administración (RF-076 a RF-078). */
export function crearCasosUsoAdministracion(
  prisma: PrismaService,
  iam: IamFacade,
  escuela: EscuelaFacade,
  gamificacion: GamificacionFacade,
): CasosUsoAdministracion {
  const auditoria = new PrismaAuditoriaRepository(prisma);
  const cuentas = new GestionCuentasIam(iam);
  const gestionEscuela = new GestionEscuelaFacade(escuela);
  return {
    docentes: new DocentesAdminUseCase(cuentas, gestionEscuela),
    instituciones: new InstitucionesAdminUseCase(gestionEscuela),
    parametros: new ParametrosGamificacionUseCase(new GestionGamificacionFacade(gamificacion)),
    auditoria: new AuditoriaUseCase(auditoria, cuentas),
    registrarAuditoria: new RegistrarAuditoriaUseCase(auditoria, () => uuidV7()),
  };
}

export const administracionProviders: Provider[] = [
  {
    provide: CASOS_USO_ADMINISTRACION,
    useFactory: crearCasosUsoAdministracion,
    inject: [PrismaService, IamFacade, EscuelaFacade, GamificacionFacade],
  },
  // RF-077: acciones sensibles anunciadas por los demás módulos y accesos a datos de estudiantes.
  AuditoriaSuscripciones,
  { provide: APP_INTERCEPTOR, useClass: AuditoriaAccesosInterceptor },
  RetencionAuditoria,
];
