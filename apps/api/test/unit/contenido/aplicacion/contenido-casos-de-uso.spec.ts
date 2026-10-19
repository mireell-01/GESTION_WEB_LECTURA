import { beforeEach, describe, expect, it } from 'vitest';

import { AutoriaUseCase } from '../../../../src/modules/contenido/application/use-cases/autoria.use-case';
import { BibliotecaUseCase } from '../../../../src/modules/contenido/application/use-cases/biblioteca.use-case';
import { PublicacionUseCase } from '../../../../src/modules/contenido/application/use-cases/publicacion.use-case';
import { RecursosUseCase, VIGENCIA_SUBIDA_MS } from '../../../../src/modules/contenido/application/use-cases/recursos.use-case';
import {
  AutorNoPuedeAprobarError,
  LecturaIncompletaError,
  NoEsAutorError,
  RecursoInvalidoError,
  TransicionInvalidaError,
  VersionNoEditableError,
} from '../../../../src/modules/contenido/domain/errors/errores-contenido';
import { EVENTOS_CONTENIDO } from '../../../../src/modules/contenido/domain/events/eventos-contenido';
import { NoEncontradoError, ProhibidoError } from '../../../../src/modules/shared-kernel/public-api';
import { actividadesCompletas, crearEntornoContenido, EntornoContenido, metadatos, TEXTO } from '../dobles';

/** Nivel 1 — Casos de uso de Contenido con dobles (RF-021 a RF-028). */
const EDITORA = 'editora';
const REVISOR = 'revisor';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);

describe('Contenido: autoría, publicación, recursos y biblioteca', () => {
  let e: EntornoContenido;
  let autoria: AutoriaUseCase;
  let publicacion: PublicacionUseCase;
  let recursos: RecursosUseCase;
  let biblioteca: BibliotecaUseCase;

  beforeEach(() => {
    e = crearEntornoContenido();
    autoria = new AutoriaUseCase(e.repo, e.bus, e.generarId, e.reloj.ahora);
    publicacion = new PublicacionUseCase(e.repo, e.bus, e.reloj.ahora);
    recursos = new RecursosUseCase(e.repo, e.almacen, e.firmador, e.bus, e.generarId, e.reloj.ahora);
    biblioteca = new BibliotecaUseCase(e.repo, e.lectores, e.nivelLector);
  });

  /** Lectura lista para revisión (metadatos, texto y actividades completas). */
  const lecturaCompleta = async (cambios = {}) => {
    const creada = await autoria.crear({ editorId: EDITORA, metadatos: metadatos(cambios), texto: TEXTO });
    await autoria.reemplazarActividades({ editorId: EDITORA, lecturaId: creada.lecturaId, actividades: actividadesCompletas(creada.oraciones.map((o) => o.id)) });
    return creada.lecturaId;
  };
  const publicada = async (cambios = {}) => {
    const id = await lecturaCompleta(cambios);
    await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
    await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
    return id;
  };

  describe('Autoría (RF-021, RF-022, RF-024, RF-027, RF-029)', () => {
    it('crear deja la versión 1 en borrador, segmentada, con lo que falta para revisión', async () => {
      const d = await autoria.crear({ editorId: EDITORA, metadatos: metadatos({ licencia: null }), texto: TEXTO });
      expect(d).toMatchObject({ numero: 1, estado: 'BORRADOR', esAutor: true, permisos: { editar: true, enviar: false, revisar: false } });
      expect(d.oraciones).toHaveLength(6);
      expect(d.problemas).toEqual(['Declara la licencia del texto', 'Agrega al menos una actividad para después de leer']);
      expect(e.bus.nombres()).toEqual([EVENTOS_CONTENIDO.LECTURA_CREADA]);
    });

    it('solo la autora edita su borrador; en revisión nadie lo edita', async () => {
      const id = await lecturaCompleta();
      await expect(autoria.actualizarBorrador({ editorId: 'otro-editor', lecturaId: id, texto: 'Hola.' })).rejects.toThrow(NoEsAutorError);
      const { detalle, ajustes } = await autoria.actualizarBorrador({ editorId: EDITORA, lecturaId: id, metadatos: metadatos({ titulo: 'El zorro curioso' }) });
      expect([detalle.metadatos.titulo, ajustes]).toEqual(['El zorro curioso', []]);
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await expect(autoria.unirOraciones({ editorId: EDITORA, lecturaId: id, oracionId: detalle.oraciones[0]!.id })).rejects.toThrow(VersionNoEditableError);
    });

    it('unir, dividir y la historia ramificada se guardan en el borrador', async () => {
      const d = await autoria.crear({ editorId: EDITORA, metadatos: metadatos(), texto: 'Era un día gris y frío. Llovía.' });
      const unida = await autoria.unirOraciones({ editorId: EDITORA, lecturaId: d.lecturaId, oracionId: d.oraciones[0]!.id });
      expect(unida.oraciones.map((o) => o.texto)).toEqual(['Era un día gris y frío. Llovía.']);
      const cortada = await autoria.dividirOracion({ editorId: EDITORA, lecturaId: d.lecturaId, oracionId: unida.oraciones[0]!.id, posicion: 'Era un día gris'.length });
      expect(cortada.oraciones.map((o) => o.texto)).toEqual(['Era un día gris', 'y frío. Llovía.']);
      const grafo = await autoria.reemplazarGrafo({
        editorId: EDITORA, lecturaId: d.lecturaId,
        nodos: [{ clave: 'inicio', contenido: 'Llueve. ¿Sales?', esInicio: true, opciones: [{ texto: 'Salgo', destino: 'fin' }] }, { clave: 'fin', contenido: 'Te mojaste.', esFinal: true }],
      });
      expect([grafo.esRamificada, grafo.nodos.length]).toEqual([true, 2]);
    });

    it('RF-027: la versión nueva sale de la publicada y no la reemplaza hasta aprobarse', async () => {
      const id = await publicada();
      await expect(autoria.nuevaVersion({ editorId: EDITORA, lecturaId: 'no-existe' })).rejects.toThrow(NoEncontradoError);
      const v2 = await autoria.nuevaVersion({ editorId: 'otra-editora', lecturaId: id });
      expect(v2).toMatchObject({ numero: 2, estado: 'BORRADOR', autorId: 'otra-editora', publicada: { numero: 1 } });
      await expect(autoria.nuevaVersion({ editorId: EDITORA, lecturaId: id })).rejects.toThrow(TransicionInvalidaError);

      // Mientras tanto la biblioteca sigue mostrando la versión 1.
      const antes = await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, {});
      expect(antes.lecturas.map((f) => f.versionId)).toEqual([v2.publicada!.versionId]);

      await autoria.actualizarBorrador({ editorId: 'otra-editora', lecturaId: id, metadatos: metadatos({ titulo: 'El zorro y la luna (2.ª edición)' }) });
      await publicacion.enviarARevision({ editorId: 'otra-editora', lecturaId: id });
      await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
      const v1 = await e.repo.buscarVersion(v2.publicada!.versionId);
      expect(v1?.estado).toBe('ARCHIVADO'); // queda para las sesiones ya hechas
      expect((await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, {})).lecturas.map((f) => f.titulo)).toEqual(['El zorro y la luna (2.ª edición)']);
    });
  });

  describe('Flujo de publicación (RF-026)', () => {
    it('incompleta no se envía; completa pasa a revisión y el revisor la publica', async () => {
      const d = await autoria.crear({ editorId: EDITORA, metadatos: metadatos(), texto: TEXTO });
      await expect(publicacion.enviarARevision({ editorId: EDITORA, lecturaId: d.lecturaId })).rejects.toThrow(LecturaIncompletaError);

      const id = await lecturaCompleta();
      const enviada = await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      expect(enviada.estado).toBe('EN_REVISION');
      const vistaRevisor = await publicacion.detalle({ id: REVISOR, rol: 'REVISOR' }, id);
      expect(vistaRevisor.permisos).toMatchObject({ revisar: true, editar: false });

      const aprobada = await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
      expect(aprobada).toMatchObject({ estado: 'PUBLICADO', permisos: { archivar: true } });
      expect((await e.repo.buscarLectura(id))?.versionPublicadaId).toBe(aprobada.versionId);
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_CONTENIDO.VERSION_PUBLICADA, agregadoId: id, datos: { actorId: REVISOR, numero: 1 } });
    });

    it('si la autora tuviera también el rol de revisora, no podría aprobar lo suyo', async () => {
      const id = await lecturaCompleta();
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await expect(publicacion.aprobar({ revisorId: EDITORA, lecturaId: id })).rejects.toThrow(AutorNoPuedeAprobarError);
      expect((await publicacion.detalle({ id: EDITORA, rol: 'REVISOR' }, id)).permisos.revisar).toBe(false);
    });

    it('rechazar devuelve a borrador con el motivo, que ve la autora', async () => {
      const id = await lecturaCompleta();
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await publicacion.rechazar({ revisorId: REVISOR, lecturaId: id, comentario: 'La pista P2 es demasiado directa.' });
      const vista = await publicacion.detalle({ id: EDITORA, rol: 'EDITOR' }, id);
      expect(vista).toMatchObject({ estado: 'BORRADOR', comentarioRevision: 'La pista P2 es demasiado directa.', permisos: { editar: true } });
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_CONTENIDO.VERSION_RECHAZADA, datos: { motivo: 'La pista P2 es demasiado directa.' } });
    });

    it('archivar: la autora o un revisor; sale de la biblioteca', async () => {
      const id = await publicada();
      await expect(publicacion.archivar({ actor: { id: 'otro-editor', rol: 'EDITOR' }, lecturaId: id })).rejects.toThrow(ProhibidoError);
      await publicacion.archivar({ actor: { id: REVISOR, rol: 'REVISOR' }, lecturaId: id });
      expect((await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, {})).lecturas).toEqual([]);
      await expect(publicacion.archivar({ actor: { id: REVISOR, rol: 'REVISOR' }, lecturaId: id })).rejects.toThrow(TransicionInvalidaError);
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_CONTENIDO.LECTURA_ARCHIVADA, datos: { rol: 'REVISOR' } });
    });

    it('el listado pone primero lo que espera a cada uno', async () => {
      const enRevision = await lecturaCompleta({ titulo: 'Para revisar' });
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: enRevision });
      await autoria.crear({ editorId: EDITORA, metadatos: metadatos({ titulo: 'Mi borrador' }), texto: 'Hola.' });
      e.reloj.avanzarMin(5);
      await autoria.crear({ editorId: 'otro-editor', metadatos: metadatos({ titulo: 'Borrador ajeno' }), texto: 'Hola.' });

      expect((await publicacion.listar({ id: REVISOR, rol: 'REVISOR' }))[0]?.titulo).toBe('Para revisar');
      expect((await publicacion.listar({ id: EDITORA, rol: 'EDITOR' }))[0]?.titulo).toBe('Mi borrador');
    });
  });

  describe('Recursos con subida firmada (RF-023)', () => {
    const declarar = (lecturaId: string, cambios = {}) =>
      recursos.solicitarSubida({ editorId: EDITORA, lecturaId, tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: WEBP.length, textoAlternativo: 'Un zorro mira la luna', ...cambios });
    const token = (url: string) => decodeURIComponent(new URL(url, 'http://x').searchParams.get('token') as string);

    it('declarar, subir el archivo exacto y verlo en el borrador', async () => {
      const id = await lecturaCompleta();
      const subida = await declarar(id);
      expect(subida.url).toMatch(/^\/api\/v1\/backoffice\/recursos\/id-\d+\/archivo\?token=/);
      const r = await recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: token(subida.url), archivo: WEBP });
      expect(r).toMatchObject({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: WEBP.length, textoAlternativo: 'Un zorro mira la luna' });
      expect([...e.almacen.archivos.keys()]).toEqual([`lecturas/${id}/${subida.recursoId}.webp`]);
      expect((await publicacion.detalle({ id: EDITORA, rol: 'EDITOR' }, id)).recursos).toHaveLength(1);
      await expect(recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: token(subida.url), archivo: WEBP })).rejects.toThrow(/ya se subió/);
    });

    it('rechaza firma alterada, vencida, de otra persona o archivos que no son lo declarado', async () => {
      const id = await lecturaCompleta();
      const subida = await declarar(id);
      const t = token(subida.url);
      const subir = (cambios: Partial<{ editorId: string; recursoId: string; token: string; archivo: Buffer }>) =>
        recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: t, archivo: WEBP, ...cambios });

      await expect(subir({ token: `${t}x` })).rejects.toThrow(RecursoInvalidoError);
      await expect(subir({ editorId: 'otro-editor' })).rejects.toThrow(/no es válido o ya venció/);
      await expect(subir({ recursoId: 'otro-recurso' })).rejects.toThrow(/no es válido/);
      await expect(subir({ archivo: Buffer.concat([WEBP, Buffer.alloc(1)]) })).rejects.toThrow(/tamaño/);
      await expect(subir({ archivo: Buffer.concat([Buffer.from('<svg'), Buffer.alloc(WEBP.length - 4)]) })).rejects.toThrow(/formato/);
      e.reloj.avanzarMin(VIGENCIA_SUBIDA_MS / 60_000 + 1);
      await expect(subir({})).rejects.toThrow(/venció/);
      await expect(declarar(id, { textoAlternativo: '' })).rejects.toThrow(/texto alternativo/);
    });

    it('la biblioteca solo entrega archivos de versiones publicadas', async () => {
      const id = await lecturaCompleta();
      const subida = await declarar(id);
      await recursos.recibirArchivo({ editorId: EDITORA, recursoId: subida.recursoId, token: token(subida.url), archivo: WEBP });
      expect((await recursos.archivo(subida.recursoId, false)).tipoMime).toBe('image/webp');
      await expect(recursos.archivo(subida.recursoId, true)).rejects.toThrow(NoEncontradoError);
      await publicacion.enviarARevision({ editorId: EDITORA, lecturaId: id });
      await publicacion.aprobar({ revisorId: REVISOR, lecturaId: id });
      expect((await recursos.archivo(subida.recursoId, true)).datos.equals(WEBP)).toBe(true);
      // Publicada, ya no se le quitan archivos (RN-14).
      await expect(recursos.quitar({ editorId: EDITORA, lecturaId: id, recursoId: subida.recursoId })).rejects.toThrow(VersionNoEditableError);
    });
  });

  describe('Biblioteca (RF-028)', () => {
    beforeEach(async () => {
      await publicada({ titulo: 'Rimas del río', rangoEdad: 'R1', nivelDificultad: 1, tematica: 'Naturaleza', tipoTexto: 'POEMA' });
      await publicada({ titulo: 'El zorro y la luna', rangoEdad: 'R2', nivelDificultad: 2 });
      await publicada({ titulo: 'Detectives del museo', rangoEdad: 'R2', nivelDificultad: 4, tematica: 'Misterio', habilidadesObjetivo: ['CRI'] });
      await publicada({ titulo: 'Volcanes del Perú', rangoEdad: 'R3', nivelDificultad: 3, tematica: 'Ciencia', tipoTexto: 'CIENTIFICO' });
      await lecturaCompleta({ titulo: 'Borrador secreto' });
    });

    it('un adulto ve todo lo publicado (nunca borradores) y filtra', async () => {
      const adulto = { sub: 'familia', rol: 'FAMILIAR' as const };
      expect((await biblioteca.explorar(adulto, {})).lecturas.map((f) => f.titulo)).toEqual(['Detectives del museo', 'El zorro y la luna', 'Rimas del río', 'Volcanes del Perú']);
      expect((await biblioteca.explorar(adulto, { tema: 'cien' })).lecturas.map((f) => f.titulo)).toEqual(['Volcanes del Perú']);
      expect((await biblioteca.explorar(adulto, { habilidad: 'CRI' })).lecturas.map((f) => f.titulo)).toEqual(['Detectives del museo']);
      expect((await biblioteca.explorar(adulto, { edad: 'R1', tipo: 'POEMA' })).lecturas.map((f) => f.titulo)).toEqual(['Rimas del río']);
      const ficha = (await biblioteca.explorar(adulto, { nivel: 2 })).lecturas[0];
      expect(ficha).toMatchObject({ titulo: 'El zorro y la luna', totalActividades: 3, resumen: expect.stringMatching(/^Había una vez/) });
      expect(JSON.stringify(ficha)).not.toMatch(/respuesta|pista|explicacion/i);
    });

    it('el estudiante solo ve su rango de edad y su nivel ± 1 (por defecto, el de su edad)', async () => {
      e.lectores.rangos.set('nino-r2', 'R2');
      const nino = { sub: 'nino-r2', rol: 'ESTUDIANTE' as const };
      const r = await biblioteca.explorar(nino, {});
      expect([r.lecturas.map((f) => f.titulo), r.alcance]).toEqual([['El zorro y la luna'], { rangoEdad: 'R2', niveles: [1, 2, 3] }]);
      expect((await biblioteca.explorar(nino, { edad: 'R3' })).lecturas).toEqual([]);
      expect((await biblioteca.explorar(nino, { nivel: 4 })).lecturas).toEqual([]);

      // Cuando Progreso informe su nivel (4), ve de 3 a 5.
      e.nivelLector.niveles.set('nino-r2', 4);
      expect((await biblioteca.explorar(nino, {})).lecturas.map((f) => f.titulo)).toEqual(['Detectives del museo']);
      expect((await biblioteca.explorar({ sub: 'desconocido', rol: 'ESTUDIANTE' }, {})).lecturas).toEqual([]);
    });

    it('detalle sin respuestas; el estudiante no abre lo que está fuera de su alcance', async () => {
      const [zorro, volcanes] = (await biblioteca.explorar({ sub: 'docente', rol: 'DOCENTE' }, { tema: '' })).lecturas.filter((f) => ['El zorro y la luna', 'Volcanes del Perú'].includes(f.titulo));
      const d = await biblioteca.detalle({ sub: 'docente', rol: 'DOCENTE' }, zorro!.lecturaId);
      expect(d.parrafos.map((p) => p.oraciones.length)).toEqual([2, 3, 1]);
      expect(d.actividadesPorMomento).toEqual({ ANTES: 1, DURANTE: 1, DESPUES: 1 });
      expect(JSON.stringify(d)).not.toMatch(/indice|clavesEvidencia|explicacion|pistas/i);

      e.lectores.rangos.set('nino-r2', 'R2');
      await expect(biblioteca.detalle({ sub: 'nino-r2', rol: 'ESTUDIANTE' }, zorro!.lecturaId)).resolves.toBeTruthy();
      await expect(biblioteca.detalle({ sub: 'nino-r2', rol: 'ESTUDIANTE' }, volcanes!.lecturaId)).rejects.toThrow(NoEncontradoError);
      await expect(biblioteca.detalle({ sub: 'docente', rol: 'DOCENTE' }, 'no-existe')).rejects.toThrow(NoEncontradoError);
    });

    it('pagina con cursor', async () => {
      for (let i = 0; i < 12; i++) await publicada({ titulo: `Cuento ${String(i).padStart(2, '0')}` });
      const adulto = { sub: 'docente', rol: 'DOCENTE' as const };
      const p1 = await biblioteca.explorar(adulto, {});
      const p2 = await biblioteca.explorar(adulto, { cursor: p1.siguiente as string });
      expect([p1.lecturas.length, p2.lecturas.length, p2.siguiente]).toEqual([12, 4, null]);
      expect(new Set([...p1.lecturas, ...p2.lecturas].map((f) => f.lecturaId)).size).toBe(16);
    });
  });
});
