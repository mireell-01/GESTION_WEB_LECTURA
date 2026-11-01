import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EVENTOS_GAMIFICACION } from '../../domain/events/eventos-gamificacion';
import { aJsonParametros, LIMITES, ParametrosEditables, validarParametros } from '../../domain/services/parametros-editables';
import { metaDe, tieneUmbral } from '../../domain/services/reglas-insignia';
import { GamificacionRepository } from '../ports/gamificacion.ports';
import { ParametrosRepository } from '../ports/parametros.repository';

/** Una insignia que se gana contando, con el umbral del catálogo y el de la versión vigente. */
export interface UmbralInsignia {
  codigo: string;
  nombre: string;
  tipo: 'LECTURAS' | 'EVIDENCIAS' | 'RACHA';
  umbralCatalogo: number;
  umbral: number;
}

export interface ParametrosVigentesVista {
  version: number;
  vigenteDesde: string | null;
  creadoPor: string | null;
  parametros: ParametrosEditables;
  insignias: UmbralInsignia[];
  limites: typeof LIMITES;
}

export interface VersionParametrosVista {
  version: number;
  vigenteDesde: string;
  creadoPor: string | null;
}

/**
 * RF-078: la administración consulta y publica los parámetros de gamificación (puntos, topes, nivel
 * lector, palabras mínimas y umbrales de insignias). Cada publicación es una versión nueva, vigente
 * desde ese momento: los logros ya otorgados no cambian y lo que ocurre después usa la nueva.
 */
export class ParametrosAdminUseCase {
  constructor(
    private readonly versiones: ParametrosRepository,
    private readonly repo: GamificacionRepository,
    private readonly bus: BusEventos,
    private readonly ahora: () => Date,
  ) {}

  async vigentes(): Promise<ParametrosVigentesVista> {
    const [p, catalogo, versiones] = await Promise.all([this.repo.parametros(), this.repo.insignias(), this.versiones.versiones()]);
    const fila = versiones.find((v) => v.version === p.version);
    const { version, ...parametros } = p;
    return {
      version,
      vigenteDesde: fila?.vigenteDesde.toISOString() ?? null,
      creadoPor: fila?.creadoPor ?? null,
      parametros,
      insignias: catalogo.filter((i) => tieneUmbral(i.regla)).map((i) => {
        const umbralCatalogo = metaDe(i.regla) as number;
        return { codigo: i.codigo, nombre: i.nombre, tipo: i.regla.tipo as UmbralInsignia['tipo'], umbralCatalogo, umbral: p.insignias[i.codigo] ?? umbralCatalogo };
      }),
      limites: LIMITES,
    };
  }

  async historial(): Promise<VersionParametrosVista[]> {
    return (await this.versiones.versiones()).map((v) => ({ version: v.version, vigenteDesde: v.vigenteDesde.toISOString(), creadoPor: v.creadoPor }));
  }

  async publicar(entrada: unknown, adminId: string): Promise<ParametrosVigentesVista> {
    const conUmbral = (await this.repo.insignias()).filter((i) => tieneUmbral(i.regla)).map((i) => i.codigo);
    const parametros = validarParametros(entrada, conUmbral);
    const ahora = this.ahora();
    const version = await this.versiones.publicar({ parametros: aJsonParametros(parametros), creadoPor: adminId, ahora });
    await this.bus.publicar([
      crearEvento(EVENTOS_GAMIFICACION.PARAMETROS_PUBLICADOS, String(version), { actorId: adminId, rol: 'ADMIN_PLATAFORMA', version }, ahora),
    ]);
    return this.vigentes();
  }
}
