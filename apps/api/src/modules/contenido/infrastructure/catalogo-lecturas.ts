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
 * Fuente del catálogo asignable (RF-018): lecturas con una versión publicada y no archivadas.
 * Solo lectura; la autoría y la publicación llegan con el módulo Biblioteca (RF-021 a RF-029).
 */
@Injectable()
export class CatalogoLecturas implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOGO_ASIGNABLE) private readonly catalogo: RegistroCatalogoAsignable,
  ) {}

  onModuleInit(): void {
    this.catalogo.registrar({
      tipo: 'LECTURA',
      listar: async () => {
        const filas = await this.prisma.lectura.findMany({
          where: { archivadaEn: null, versionPublicadaId: { not: null } },
          include: { versionPublicada: true },
        });
        return filas
          .map((f) => this.aContenido(f.id, f.versionPublicada))
          .filter((c): c is ContenidoAsignable => c !== null)
          .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      },
      buscar: async (id) => {
        if (!esUuid(id)) return null;
        const f = await this.prisma.lectura.findFirst({
          where: { id, archivadaEn: null },
          include: { versionPublicada: true },
        });
        return f ? this.aContenido(f.id, f.versionPublicada) : null;
      },
    });
  }

  private aContenido(
    id: string,
    version: { titulo: string; rangoEdad: string; nivelDificultad: number } | null,
  ): ContenidoAsignable | null {
    if (!version) return null;
    return {
      id,
      tipo: 'LECTURA',
      titulo: version.titulo,
      detalle: `${EDADES[version.rangoEdad] ?? version.rangoEdad} · nivel ${version.nivelDificultad}`,
    };
  }
}
