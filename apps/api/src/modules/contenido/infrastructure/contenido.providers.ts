import { join } from 'node:path';

import { Provider } from '@nestjs/common';

import { IamFacade } from '../../iam/public-api';
import { BUS_EVENTOS, BusEventos, NIVEL_LECTOR, PrismaService, ResolutorNivelLector, uuidV7 } from '../../shared-kernel/public-api';
import { CASOS_USO_CONTENIDO, CasosUsoContenido } from '../application/casos-uso-contenido';
import { AutoriaUseCase } from '../application/use-cases/autoria.use-case';
import { BibliotecaUseCase } from '../application/use-cases/biblioteca.use-case';
import { PublicacionUseCase } from '../application/use-cases/publicacion.use-case';
import { RecursosUseCase } from '../application/use-cases/recursos.use-case';
import { AlmacenDiscoLocal } from './almacen/almacen-disco-local';
import { FirmadorSubidasHmac } from './almacen/firmador-subidas-hmac';
import { CatalogoLecturas } from './catalogo-lecturas';
import { IdentidadLectoresIam } from './identidad/identidad-lectores-iam';
import { PrismaLecturaRepository } from './persistence/prisma-lectura-repository';

/** Composition root de Contenido. ALMACEN_DIR: carpeta de archivos en desarrollo (en la nube, S3). */
export function crearCasosUsoContenido(
  prisma: PrismaService,
  bus: BusEventos,
  iam: IamFacade,
  nivelLector: ResolutorNivelLector,
): CasosUsoContenido {
  const ahora = () => new Date();
  const generarId = () => uuidV7();
  const repo = new PrismaLecturaRepository(prisma);
  const almacen = new AlmacenDiscoLocal(process.env['ALMACEN_DIR'] ?? join(process.cwd(), 'almacen'));
  const firmador = new FirmadorSubidasHmac(process.env['JWT_SECRET'] ?? '');
  return {
    autoria: new AutoriaUseCase(repo, bus, generarId, ahora),
    publicacion: new PublicacionUseCase(repo, bus, ahora),
    recursos: new RecursosUseCase(repo, almacen, firmador, bus, generarId, ahora),
    biblioteca: new BibliotecaUseCase(repo, new IdentidadLectoresIam(iam), nivelLector),
  };
}

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const contenidoProviders: Provider[] = [
  {
    provide: CASOS_USO_CONTENIDO,
    useFactory: crearCasosUsoContenido,
    inject: [PrismaService, BUS_EVENTOS, IamFacade, NIVEL_LECTOR],
  },
  // RF-018: lecturas publicadas que el docente puede asignar.
  CatalogoLecturas,
];
