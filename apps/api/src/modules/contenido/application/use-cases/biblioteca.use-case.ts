import { NoEncontradoError, ResolutorNivelLector, RolUsuario } from '../../../shared-kernel/public-api';
import { VersionLectura } from '../../domain/entities/version-lectura';
import { DetalleBiblioteca, FichaBiblioteca, fichaDe, URL_RECURSO_BIBLIOTECA } from '../dto/contenido.dto';
import { IdentidadLectores } from '../ports/identidad-lectores';
import { LecturaRepository } from '../ports/lectura.repository';

export const POR_PAGINA = 12;
/** Mientras Progreso no informe su nivel (diagnóstico, RF-034), se parte del nivel típico de su edad. */
export const NIVEL_INICIAL: Record<'R1' | 'R2' | 'R3', number> = { R1: 1, R2: 2, R3: 3 };

export interface FiltrosBiblioteca {
  edad?: string;
  nivel?: number;
  tema?: string;
  tipo?: string;
  habilidad?: string;
  cursor?: string;
}

/**
 * Biblioteca (RF-028): estudiantes y adultos exploran lo publicado con filtros. El estudiante solo
 * ve lecturas de su rango de edad y de su nivel ± 1.
 */
export class BibliotecaUseCase {
  constructor(
    private readonly repo: LecturaRepository,
    private readonly identidad: IdentidadLectores,
    private readonly nivelLector: ResolutorNivelLector,
  ) {}

  async explorar(usuario: { sub: string; rol: RolUsuario }, f: FiltrosBiblioteca): Promise<{ lecturas: FichaBiblioteca[]; siguiente: string | null; alcance: { rangoEdad: string; niveles: number[] } | null }> {
    let rangos = f.edad ? [f.edad] : undefined;
    let niveles = f.nivel ? [f.nivel] : undefined;
    let alcance: { rangoEdad: string; niveles: number[] } | null = null;
    if (usuario.rol === 'ESTUDIANTE') {
      const permitido = await this.alcanceDelEstudiante(usuario.sub);
      if (!permitido) return { lecturas: [], siguiente: null, alcance: null };
      alcance = permitido;
      rangos = f.edad && f.edad !== permitido.rangoEdad ? [] : [permitido.rangoEdad];
      niveles = f.nivel ? permitido.niveles.filter((n) => n === f.nivel) : permitido.niveles;
      if (rangos.length === 0 || niveles.length === 0) return { lecturas: [], siguiente: null, alcance };
    }
    const { versiones, siguiente } = await this.repo.biblioteca({
      rangos,
      niveles,
      tema: f.tema?.trim() || undefined,
      tipo: f.tipo,
      habilidad: f.habilidad,
      cursor: f.cursor ?? null,
      limite: POR_PAGINA,
    });
    return { lecturas: versiones.map(fichaDe), siguiente, alcance };
  }

  async detalle(usuario: { sub: string; rol: RolUsuario }, lecturaId: string): Promise<DetalleBiblioteca> {
    const lectura = await this.repo.buscarLectura(lecturaId);
    const version = lectura?.versionPublicadaId && !lectura.archivada ? await this.repo.buscarVersion(lectura.versionPublicadaId) : null;
    if (!version || version.estado !== 'PUBLICADO') throw new NoEncontradoError('Lectura');
    if (usuario.rol === 'ESTUDIANTE') {
      const permitido = await this.alcanceDelEstudiante(usuario.sub);
      const m = version.propsSnapshot.metadatos;
      if (!permitido || m.rangoEdad !== permitido.rangoEdad || !permitido.niveles.includes(m.nivelDificultad)) throw new NoEncontradoError('Lectura');
    }
    return this.vistaDetalle(version);
  }

  private async alcanceDelEstudiante(estudianteId: string): Promise<{ rangoEdad: string; niveles: number[] } | null> {
    const rango = await this.identidad.rangoEdad(estudianteId);
    if (!rango) return null;
    const referencia = (await this.nivelLector.nivelDe(estudianteId)) ?? NIVEL_INICIAL[rango];
    const niveles = [referencia - 1, referencia, referencia + 1].filter((n) => n >= 1 && n <= 5);
    return { rangoEdad: rango, niveles };
  }

  private vistaDetalle(version: VersionLectura): DetalleBiblioteca {
    const p = version.propsSnapshot;
    const parrafos = new Map<number, { id: string; texto: string }[]>();
    for (const o of [...p.oraciones].sort((a, b) => a.orden - b.orden)) {
      parrafos.set(o.parrafo, [...(parrafos.get(o.parrafo) ?? []), { id: o.id, texto: o.texto }]);
    }
    const contar = (m: string) => p.actividades.filter((a) => a.momento === m).length;
    return {
      ...fichaDe(version),
      licencia: p.metadatos.licencia,
      parrafos: [...parrafos.entries()].map(([numero, oraciones]) => ({ numero, oraciones })),
      imagenes: p.recursos
        .filter((r) => r.tipo === 'IMAGEN')
        .map((r) => ({ id: r.id, url: URL_RECURSO_BIBLIOTECA(r.id), textoAlternativo: r.textoAlternativo ?? '' })),
      actividadesPorMomento: { ANTES: contar('ANTES'), DURANTE: contar('DURANTE'), DESPUES: contar('DESPUES') },
    };
  }
}
