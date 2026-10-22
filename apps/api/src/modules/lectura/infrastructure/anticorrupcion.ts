import { ContenidoFacade, VersionParaLeer } from '../../contenido/public-api';
import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { Habilidad, RangoEdad } from '../../shared-kernel/public-api';
import { ContenidoLecturas, EscuelaLectura, IdentidadEstudiantes } from '../application/ports/lectura.ports';
import { ContenidoLectura, Modalidad, Momento, NivelPista, TipoActividad } from '../domain/value-objects/contenido-lectura';

function aContenidoLectura(v: VersionParaLeer): ContenidoLectura {
  return {
    lecturaId: v.lecturaId,
    versionId: v.versionId,
    titulo: v.titulo,
    rangoEdad: v.rangoEdad as RangoEdad,
    nivelDificultad: v.nivelDificultad,
    imagen: v.imagen,
    oraciones: v.oraciones,
    actividades: v.actividades.map((a) => ({
      id: a.id,
      momento: a.momento as Momento,
      tipo: a.tipo as TipoActividad,
      orden: a.orden,
      oracionAnclajeId: a.oracionAnclajeId,
      items: a.items.map((i) => {
        const rc = i.respuestaCorrecta;
        return {
          id: i.id,
          orden: i.orden,
          habilidad: i.habilidad as Habilidad,
          nivelDificultad: i.nivelDificultad,
          modalidad: i.modalidad as Modalidad,
          esCerrado: i.esCerrado,
          enunciado: i.enunciado,
          opciones: i.contenido.opciones ?? [],
          indicesCorrectos: rc && 'indice' in rc ? [rc.indice] : rc && 'indices' in rc ? rc.indices : [],
          multiple: i.contenido.multiple === true,
          elementos: i.contenido.elementos ?? [],
          minPalabras: i.contenido.minPalabras ?? null,
          explicacionModelada: i.explicacionModelada,
          pistas: i.pistas.map((p) => ({ nivel: p.nivel as NivelPista, texto: p.texto })),
          clavesEvidencia: i.clavesEvidencia,
        };
      }),
    })),
    nodos: v.nodos,
  };
}

/**
 * Anticorrupción hacia Contenido. Una versión publicada no cambia (RN-14), así que se guarda en
 * memoria: corregir no vuelve a leer la lectura en cada respuesta (RF-040, p95 < 300 ms).
 */
export class ContenidoLecturasContenido implements ContenidoLecturas {
  private readonly cache = new Map<string, ContenidoLectura>();

  constructor(
    private readonly contenido: ContenidoFacade,
    private readonly limite = 200,
  ) {}

  async publicada(lecturaId: string): Promise<ContenidoLectura | null> {
    const versionId = await this.contenido.versionPublicadaId(lecturaId);
    return versionId ? this.version(versionId) : null;
  }

  async version(versionId: string): Promise<ContenidoLectura | null> {
    const guardada = this.cache.get(versionId);
    if (guardada) {
      this.cache.delete(versionId);
      this.cache.set(versionId, guardada);
      return guardada;
    }
    const v = await this.contenido.versionParaLeer(versionId);
    if (!v) return null;
    const c = aContenidoLectura(v);
    this.cache.set(versionId, c);
    if (this.cache.size > this.limite) this.cache.delete(this.cache.keys().next().value as string);
    return c;
  }
}

/** Anticorrupción hacia IAM: alias, avatar y rango de edad del estudiante. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async perfiles(ids: string[]) {
    return (await this.iam.resumenEstudiantes(ids)).map((e) => ({ id: e.id, alias: e.alias, avatar: e.avatar, rangoEdad: e.rangoEdad, activo: e.activo }));
  }
}

/** Anticorrupción hacia Escuela: aulas, asignaciones y acceso del docente (RN-17). */
export class EscuelaLecturaEscuela implements EscuelaLectura {
  constructor(private readonly escuela: EscuelaFacade) {}

  async tieneDocente(estudianteId: string): Promise<boolean> {
    return (await this.escuela.aulasDeEstudiante(estudianteId)).some((a) => a.estado === 'ACTIVA');
  }

  async asignacionDeLectura(estudianteId: string, asignacionId: string, lecturaId: string): Promise<boolean> {
    return (await this.escuela.misionesDelDocente(estudianteId)).some((m) => m.id === asignacionId && m.tipo === 'LECTURA' && m.contenidoId === lecturaId);
  }

  async aulaDelDocente(docenteId: string, aulaId: string) {
    const aula = await this.escuela.aula(aulaId).catch(() => null);
    return aula && aula.docenteId === docenteId ? { id: aula.id, nombre: aula.nombre } : null;
  }

  estudiantes(aulaId: string): Promise<string[]> {
    return this.escuela.estudiantesDeAula(aulaId);
  }

  docenteAccedeAEstudiante(docenteId: string, estudianteId: string): Promise<boolean> {
    return this.escuela.docenteAccedeAEstudiante(docenteId, estudianteId);
  }
}
