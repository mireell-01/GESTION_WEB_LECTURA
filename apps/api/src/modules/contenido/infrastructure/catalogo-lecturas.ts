import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  CATALOGO_ASIGNABLE,
  ContenidoAsignable,
  esUuid,
  FICHAS_LECTURA,
  FichaLecturaPublicada,
  PrismaService,
  RangoEdad,
  RegistroCatalogoAsignable,
  RegistroFichasLectura,
} from '../../shared-kernel/public-api';

const EDADES: Record<string, string> = { R1: '6–7 años', R2: '8–9 años', R3: '10–12 años' };

type VersionPublica = { titulo: string; rangoEdad: string; nivelDificultad: number; tematica: string };

/**
 * Fuentes que Contenido registra en el shared-kernel, solo con lecturas publicadas y no archivadas:
 *  - catálogo asignable (RF-018): lo que el docente puede asignar a su aula;
 *  - fichas de lectura (Módulo 4): lo que Aventura usa para armar misiones (RF-032).
 */
@Injectable()
export class CatalogoLecturas implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CATALOGO_ASIGNABLE) private readonly catalogo: RegistroCatalogoAsignable,
    @Inject(FICHAS_LECTURA) private readonly fichas: RegistroFichasLectura,
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

    this.fichas.registrar({
      fichas: async (ids) => {
        const validos = ids.filter(esUuid);
        if (validos.length === 0) return [];
        const filas = await this.prisma.lectura.findMany({
          where: { id: { in: validos }, archivadaEn: null, versionPublicadaId: { not: null } },
          include: { versionPublicada: true },
        });
        return filas.map((f) => this.aFicha(f.id, f.versionPublicada)).filter((x): x is FichaLecturaPublicada => x !== null);
      },
      publicadas: async (rangoEdad) => {
        const filas = await this.prisma.lectura.findMany({
          where: { archivadaEn: null, versionPublicada: { is: { rangoEdad } } },
          include: { versionPublicada: true },
        });
        return filas
          .map((f) => this.aFicha(f.id, f.versionPublicada))
          .filter((x): x is FichaLecturaPublicada => x !== null)
          .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      },
    });
  }

  private aContenido(id: string, version: VersionPublica | null): ContenidoAsignable | null {
    if (!version) return null;
    return {
      id,
      tipo: 'LECTURA',
      titulo: version.titulo,
      detalle: `${EDADES[version.rangoEdad] ?? version.rangoEdad} · nivel ${version.nivelDificultad}`,
    };
  }

  private aFicha(id: string, version: VersionPublica | null): FichaLecturaPublicada | null {
    if (!version) return null;
    return {
      id,
      titulo: version.titulo,
      rangoEdad: version.rangoEdad as RangoEdad,
      nivelDificultad: version.nivelDificultad,
      tematica: version.tematica,
    };
  }
}
