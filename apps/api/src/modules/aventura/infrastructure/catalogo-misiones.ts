import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  CATALOGO_ASIGNABLE,
  ContenidoAsignable,
  esUuid,
  PrismaService,
  RegistroCatalogoAsignable,
} from '../../shared-kernel/public-api';

/**
 * Fuente del catálogo asignable (RF-018): misiones de los 5 mundos. Solo lectura; el mapa y el
 * avance llegan con el módulo Aventura (RF-030 a RF-033).
 */
@Injectable()
export class CatalogoMisiones implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOGO_ASIGNABLE) private readonly catalogo: RegistroCatalogoAsignable,
  ) {}

  onModuleInit(): void {
    this.catalogo.registrar({
      tipo: 'MISION',
      listar: async () => {
        const filas = await this.prisma.mision.findMany({
          include: { mundo: true },
          orderBy: [{ mundo: { numero: 'asc' } }, { orden: 'asc' }],
        });
        return filas.map((f) => this.aContenido(f));
      },
      buscar: async (id) => {
        if (!esUuid(id)) return null;
        const f = await this.prisma.mision.findUnique({ where: { id }, include: { mundo: true } });
        return f ? this.aContenido(f) : null;
      },
    });
  }

  private aContenido(f: { id: string; titulo: string; mundo: { numero: number; nombre: string } }): ContenidoAsignable {
    return { id: f.id, tipo: 'MISION', titulo: f.titulo, detalle: `Mundo ${f.mundo.numero} · ${f.mundo.nombre}` };
  }
}
