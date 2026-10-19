import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  CATALOGO_ASIGNABLE,
  ContenidoAsignable,
  esUuid,
  PrismaService,
  RegistroCatalogoAsignable,
} from '../../shared-kernel/public-api';

const EDADES: Record<string, string> = { R1: '6–7 años', R2: '8–9 años', R3: '10–12 años' };

/**
 * Fuente del catálogo asignable (RF-018): misiones de los 5 mundos, para cada edad. Solo lectura:
 * el equipo de contenidos las arma en el backoffice de misiones.
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
          orderBy: [{ mundo: { numero: 'asc' } }, { rangoEdad: 'asc' }, { orden: 'asc' }],
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

  private aContenido(f: { id: string; titulo: string; rangoEdad: string; mundo: { numero: number; nombre: string } }): ContenidoAsignable {
    const edad = EDADES[f.rangoEdad] ?? f.rangoEdad;
    return { id: f.id, tipo: 'MISION', titulo: f.titulo, detalle: `Mundo ${f.mundo.numero} · ${f.mundo.nombre} · ${edad}` };
  }
}
