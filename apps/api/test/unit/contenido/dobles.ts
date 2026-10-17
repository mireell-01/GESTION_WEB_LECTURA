/**
 * Dobles de prueba de Contenido: repositorio en memoria que se comporta como la base (guarda copias
 * y no reescribe el contenido de una versión que ya salió de borrador), almacén en memoria e IAM
 * simulado. El firmador de subidas es el real (solo usa node:crypto).
 */
import type { RangoEdad, ResolutorNivelLector } from '../../../src/modules/shared-kernel/public-api';
import type { AlmacenArchivos } from '../../../src/modules/contenido/application/ports/almacen';
import type { IdentidadLectores } from '../../../src/modules/contenido/application/ports/identidad-lectores';
import type { FiltroBiblioteca, LecturaRepository, ResumenLectura } from '../../../src/modules/contenido/application/ports/lectura.repository';
import { Lectura } from '../../../src/modules/contenido/domain/entities/lectura';
import { VersionLectura } from '../../../src/modules/contenido/domain/entities/version-lectura';
import { ActividadNueva } from '../../../src/modules/contenido/domain/services/actividades';
import { DatosMetadatos, MetadatosLectura } from '../../../src/modules/contenido/domain/value-objects/metadatos-lectura';
import { FirmadorSubidasHmac } from '../../../src/modules/contenido/infrastructure/almacen/firmador-subidas-hmac';
import { BusEspia, Reloj } from '../iam/dobles';

const copiar = (v: VersionLectura) => {
  const p = v.propsSnapshot;
  return VersionLectura.desdePersistencia({
    ...p,
    oraciones: structuredClone(p.oraciones),
    actividades: structuredClone(p.actividades),
    recursos: structuredClone(p.recursos),
    nodos: structuredClone(p.nodos),
  });
};

export class LecturasEnMemoria implements LecturaRepository {
  readonly lecturas = new Map<string, Lectura>();
  readonly versiones = new Map<string, VersionLectura>();

  async guardarLectura(l: Lectura) { this.lecturas.set(l.id, Lectura.desdePersistencia({ ...l.propsSnapshot })); }
  async buscarLectura(id: string) {
    const l = this.lecturas.get(id);
    return l ? Lectura.desdePersistencia({ ...l.propsSnapshot }) : null;
  }
  async guardarVersion(v: VersionLectura) {
    const guardada = this.versiones.get(v.id);
    if (guardada && guardada.estado !== 'BORRADOR') {
      // Como la base: fuera de borrador solo cambian los campos de estado (RN-14).
      const p = v.propsSnapshot;
      this.versiones.set(v.id, VersionLectura.desdePersistencia({
        ...guardada.propsSnapshot,
        estado: p.estado, revisorId: p.revisorId, comentarioRevision: p.comentarioRevision,
        enviadaRevisionEn: p.enviadaRevisionEn, publicadaEn: p.publicadaEn, archivadaEn: p.archivadaEn,
      }));
      return;
    }
    this.versiones.set(v.id, copiar(v));
  }
  async buscarVersion(id: string) {
    const v = this.versiones.get(id);
    return v ? copiar(v) : null;
  }
  async versionesDe(lecturaId: string) {
    return [...this.versiones.values()].filter((v) => v.lecturaId === lecturaId).map(copiar);
  }
  async listarResumen(): Promise<ResumenLectura[]> {
    return [...this.lecturas.values()].flatMap((l) => {
      const v = [...this.versiones.values()].filter((x) => x.lecturaId === l.id).sort((a, b) => b.propsSnapshot.numero - a.propsSnapshot.numero)[0];
      if (!v) return [];
      const p = v.propsSnapshot;
      return [{
        lecturaId: l.id, versionId: v.id, numero: p.numero, estado: p.estado, titulo: p.metadatos.titulo, rangoEdad: p.metadatos.rangoEdad,
        nivelDificultad: p.metadatos.nivelDificultad, autorId: p.autorId, tienePublicada: !!l.versionPublicadaId, archivada: l.archivada,
        actualizadaEn: p.publicadaEn ?? p.enviadaRevisionEn ?? p.creadaEn,
      }];
    });
  }
  async biblioteca(f: FiltroBiblioteca) {
    const vigentes = new Set([...this.lecturas.values()].filter((l) => !l.archivada).map((l) => l.versionPublicadaId));
    const todas = [...this.versiones.values()]
      .filter((v) => v.estado === 'PUBLICADO' && vigentes.has(v.id))
      .filter((v) => {
        const m = v.propsSnapshot.metadatos;
        return (!f.rangos || f.rangos.includes(m.rangoEdad)) && (!f.niveles || f.niveles.includes(m.nivelDificultad))
          && (!f.tema || m.tematica.toLowerCase().includes(f.tema.toLowerCase())) && (!f.tipo || m.tipoTexto === f.tipo)
          && (!f.habilidad || (m.habilidadesObjetivo as string[]).includes(f.habilidad));
      })
      .sort((a, b) => a.propsSnapshot.metadatos.titulo.localeCompare(b.propsSnapshot.metadatos.titulo) || a.id.localeCompare(b.id));
    const desde = f.cursor ? Number(f.cursor) : 0;
    const pagina = todas.slice(desde, desde + f.limite);
    return { versiones: pagina.map(copiar), siguiente: desde + f.limite < todas.length ? String(desde + f.limite) : null };
  }
  async buscarRecurso(id: string) {
    for (const v of this.versiones.values()) {
      const r = v.propsSnapshot.recursos.find((x) => x.id === id);
      if (r) return { recurso: { ...r }, versionId: v.id, estado: v.estado };
    }
    return null;
  }
}

export class AlmacenEnMemoria implements AlmacenArchivos {
  readonly archivos = new Map<string, { datos: Buffer; tipoMime: string }>();
  async guardar(clave: string, datos: Uint8Array, tipoMime: string) { this.archivos.set(clave, { datos: Buffer.from(datos), tipoMime }); }
  async leer(clave: string) { return this.archivos.get(clave)?.datos ?? null; }
}

export class LectoresFalsos implements IdentidadLectores {
  readonly rangos = new Map<string, RangoEdad>();
  async rangoEdad(id: string) { return this.rangos.get(id) ?? null; }
}

export class NivelLectorFalso implements ResolutorNivelLector {
  readonly niveles = new Map<string, number>();
  async nivelDe(id: string) { return this.niveles.get(id) ?? null; }
}

export function crearEntornoContenido() {
  let secuencia = 0;
  const reloj = new Reloj(new Date('2026-10-20T15:00:00Z'));
  return {
    reloj,
    generarId: () => `id-${String(++secuencia).padStart(4, '0')}`,
    repo: new LecturasEnMemoria(),
    almacen: new AlmacenEnMemoria(),
    firmador: new FirmadorSubidasHmac('secreto-de-pruebas-de-contenido-con-mas-de-32-caracteres'),
    lectores: new LectoresFalsos(),
    nivelLector: new NivelLectorFalso(),
    bus: new BusEspia(),
  };
}

export type EntornoContenido = ReturnType<typeof crearEntornoContenido>;

export const TEXTO = [
  'Había una vez un zorro que miraba la luna cada noche. Quería tocarla con su nariz.',
  'Una tarde subió al cerro más alto. ¡Qué cerca parecía! Pero la luna seguía lejos.',
  'Entonces entendió algo importante: hay cosas que se admiran desde donde uno está.',
].join('\n');

export const metadatos = (cambios: Partial<DatosMetadatos> = {}): DatosMetadatos => ({
  titulo: 'El zorro y la luna',
  rangoEdad: 'R2',
  nivelDificultad: 2,
  tematica: 'Animales',
  tipoTexto: 'CUENTO',
  habilidadesObjetivo: ['LIT', 'INF'],
  licencia: 'CC BY 4.0',
  ...cambios,
});

export const meta = (cambios: Partial<DatosMetadatos> = {}) => MetadatosLectura.de(metadatos(cambios));

/** Actividades completas (pasan la revisión) ancladas a las oraciones de la versión. */
export function actividadesCompletas(oracionIds: string[]): ActividadNueva[] {
  return [
    {
      momento: 'ANTES', tipo: 'PREDICCION',
      items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿De qué crees que trata?', explicacionModelada: 'El título habla de un zorro y la luna.' }],
    },
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: oracionIds[1],
      items: [{
        habilidad: 'LIT', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué quería el zorro?',
        opciones: ['Tocar la luna', 'Dormir', 'Comer'], indiceCorrecto: 0,
        explicacionModelada: 'El texto dice que quería tocarla con su nariz.',
        pistas: [{ nivel: 'P1', texto: 'Relee la segunda oración.' }, { nivel: 'P2', texto: 'Fíjate en lo que quería hacer con su nariz.' }],
      }],
    },
    {
      momento: 'DESPUES', tipo: 'EVIDENCIA',
      items: [{
        habilidad: 'INF', nivelDificultad: 3, modalidad: 'EVIDENCIA', enunciado: 'Marca dónde se ve que la luna estaba lejos',
        clavesEvidencia: [oracionIds[4] as string], explicacionModelada: 'Dice que la luna seguía lejos.',
        pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }],
      }],
    },
  ];
}
