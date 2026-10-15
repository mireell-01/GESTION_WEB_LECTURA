/** ÚNICO punto de entrada del módulo IAM desde otros módulos. */
export * from './iam.module';
export { IamFacade } from './application/iam.facade';
export type { ResumenEstudiante, ResumenCuenta } from './application/iam.facade';
export type { SesionEmitida, PerfilEstudianteVista } from './application/dto/iam.dto';
export { EVENTOS_IAM } from './domain/events/eventos-iam';
export { AVATARES } from './domain/entities/perfil-estudiante';
