import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_INTERCAMBIOS } from '../../../../src/modules/asistente/domain/entities/conversacion';
import { RESPUESTA_SEGURA } from '../../../../src/modules/asistente/domain/services/filtro-salida';
import { MENSAJE_CIERRE } from '../../../../src/modules/asistente/domain/services/mediacion-socratica';
import { ErrorDeNegocio, NoEncontradoError, ProhibidoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoAsistente, EntornoAsistente, preguntaEnCurso, TEXTO_KILLA } from '../dobles';

/** Nivel 1 — Casos de uso del asistente de lectura con dobles (RF-072 a RF-075, RN-16, RN-17, RNF-011). */
const NINO = 'nino-1';
const SESION = 'sesion-1';

describe('Conversar durante la lectura (RF-072 a RF-074)', () => {
  let e: EntornoAsistente;

  beforeEach(() => {
    e = crearEntornoAsistente();
    e.preguntas.poner(NINO, preguntaEnCurso());
    e.activaciones.filas.set(NINO, { activo: true, cambiadoPor: 'familia', rol: 'FAMILIAR', cambiadoEn: e.reloj.ahora() });
  });

  it('responde con una guía, guarda el intercambio y el motor nunca ve la clave', async () => {
    const r = await e.conversar.conversar(NINO, SESION, { atajo: 'NO_ENTIENDO' });
    expect(r).toEqual({ texto: expect.stringMatching(/^Leamos la pregunta despacio: «¿Por qué Pancho no quiso comer\?»/), restantes: 9, filtrado: false, cerrada: false });
    expect(e.conversaciones.textos(SESION)).toEqual(['No entiendo la pregunta', r.texto]);
    const [entrada] = e.motor.entradas;
    expect(entrada).toMatchObject({ intencion: 'NO_ENTIENDO', mensaje: 'No entiendo la pregunta', moderacion: null, intercambio: 1, historial: [] });
    expect(JSON.stringify(entrada)).not.toMatch(/dolía|espina/);

    await e.conversar.conversar(NINO, SESION, { mensaje: 'dime la respuesta' });
    expect(e.motor.entradas[1]).toMatchObject({ intencion: 'PIDE_RESPUESTA', intercambio: 2, historial: [{ emisor: 'ESTUDIANTE' }, { emisor: 'ASISTENTE' }] });
    expect(await e.conversar.estado(NINO, SESION)).toMatchObject({ disponible: true, intercambios: 2, restantes: 8, turnos: { length: 4 } });
  });

  it('guarda el mensaje sin datos personales y avisa con cariño', async () => {
    const r = await e.conversar.conversar(NINO, SESION, { mensaje: 'Me llamo Ana Quispe y mi celular es 987 654 321' });
    expect(r.texto).toMatch(/^Aquí no compartas datos personales/);
    const [nino] = e.conversaciones.filas.get(SESION)!.turnos;
    expect(nino).toMatchObject({ emisor: 'ESTUDIANTE', texto: 'Me llamo [nombre] y mi celular es [número]', filtrado: true });
    expect(JSON.stringify(e.motor.entradas)).not.toMatch(/Ana|Quispe|987/);
  });

  it('RF-073: si el motor revela la clave, el niño recibe la guía segura y queda marcado', async () => {
    e.motor.respuesta = 'Fácil: le dolía algo.';
    const r = await e.conversar.conversar(NINO, SESION, { mensaje: '¿por qué no comía?' });
    expect(r).toEqual({ texto: RESPUESTA_SEGURA, restantes: 9, filtrado: true, cerrada: false });
    expect(e.conversaciones.filas.get(SESION)!.turnos[1]).toMatchObject({ emisor: 'ASISTENTE', texto: RESPUESTA_SEGURA, filtrado: true });
  });

  it('RNF-011: si el motor falla, responde el mediador sin conexión', async () => {
    e.motor.respuesta = new Error('modelo caído');
    const r = await e.conversar.conversar(NINO, SESION, { atajo: 'DONDE_BUSCO' });
    expect(r.texto).toContain('Vuelve a leer con calma la parte del texto');
    expect(r.filtrado).toBe(false);
  });

  it('RF-074: hasta 10 intercambios; el undécimo recibe un cierre amable que no se guarda', async () => {
    for (let i = 1; i <= MAX_INTERCAMBIOS; i++) {
      const r = await e.conversar.conversar(NINO, SESION, { mensaje: `pregunta ${i}` });
      expect(r).toMatchObject({ restantes: MAX_INTERCAMBIOS - i, cerrada: i === MAX_INTERCAMBIOS });
    }
    expect(await e.conversar.conversar(NINO, SESION, { mensaje: 'otra más' })).toEqual({ texto: MENSAJE_CIERRE, restantes: 0, filtrado: false, cerrada: true });
    expect(e.conversaciones.textos(SESION)).toHaveLength(20);
    expect(e.motor.entradas).toHaveLength(MAX_INTERCAMBIOS);
    expect(e.conversaciones.filas.get(SESION)!.cerradaEn).toEqual(e.reloj.ahora());
  });

  it('dos mensajes a la vez: una sola conversación y ninguno se pierde', async () => {
    const [a, b] = await Promise.all([
      e.conversar.conversar(NINO, SESION, { mensaje: 'hola' }),
      e.conversar.conversar(NINO, SESION, { atajo: 'PALABRA' }),
    ]);
    expect([a.restantes, b.restantes].sort()).toEqual([8, 9]);
    expect(e.conversaciones.filas.size).toBe(1);
    expect(e.conversaciones.filas.get(SESION)!.turnos.map((t) => t.orden)).toEqual([1, 2, 3, 4]);
  });

  it('nunca pasa de 10 aunque lleguen muchos a la vez', async () => {
    for (let i = 0; i < 8; i++) await e.conversar.conversar(NINO, SESION, { mensaje: `p${i}` });
    const r = await Promise.allSettled([1, 2, 3, 4].map((i) => e.conversar.conversar(NINO, SESION, { mensaje: `a la vez ${i}` })));
    const hechas = r.filter((x) => x.status === 'fulfilled').map((x) => (x as PromiseFulfilledResult<{ texto: string }>).value);
    expect(e.conversaciones.filas.get(SESION)!.intercambios).toBe(MAX_INTERCAMBIOS);
    expect(e.conversaciones.textos(SESION)).toHaveLength(20);
    expect(hechas.filter((x) => x.texto === MENSAJE_CIERRE).length + r.filter((x) => x.status === 'rejected').length).toBe(2);
  });

  it('si la base nunca confirma el intercambio, pide intentarlo otra vez (no reintenta sin fin)', async () => {
    e.conversaciones.registrarIntercambio = async () => false;
    const error = await e.conversar.conversar(NINO, SESION, { mensaje: 'hola' }).catch((x: unknown) => x);
    expect(error).toBeInstanceOf(ErrorDeNegocio);
    expect(error).toMatchObject({ tipo: 'CONFLICTO', message: 'El asistente está ocupado. Inténtalo otra vez.' });
    expect(e.motor.entradas).toHaveLength(MAX_INTERCAMBIOS + 1);
  });

  it('sin activar, de otro niño o vacío: no conversa', async () => {
    await expect(e.conversar.conversar(NINO, SESION, { mensaje: '   ' })).rejects.toThrow('Escribe tu pregunta o elige una ayuda');
    await expect(e.conversar.conversar('otro-nino', SESION, { mensaje: 'hola' })).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.conversar.estado('otro-nino', SESION)).rejects.toBeInstanceOf(NoEncontradoError);
    e.activaciones.filas.get(NINO)!.activo = false;
    await expect(e.conversar.conversar(NINO, SESION, { mensaje: 'hola' })).rejects.toBeInstanceOf(ProhibidoError);
    expect(await e.conversar.estado(NINO, SESION)).toEqual({ disponible: false, intercambios: 0, restantes: MAX_INTERCAMBIOS, turnos: [] });
    expect(e.conversaciones.filas.size).toBe(0);
  });

  it('retención: borra las conversaciones de más de 30 días', async () => {
    await e.conversar.conversar(NINO, SESION, { mensaje: 'hola' });
    e.reloj.avanzarMin(29 * 24 * 60);
    expect(await e.conversaciones.borrarVencidas(e.reloj.ahora())).toBe(0);
    e.reloj.avanzarMin(2 * 24 * 60);
    expect(await e.conversaciones.borrarVencidas(e.reloj.ahora())).toBe(1);
    expect(e.conversaciones.filas.size).toBe(0);
  });
});

describe('Activación por la familia o la docente (RF-072, RN-17)', () => {
  let e: EntornoAsistente;

  beforeEach(() => {
    e = crearEntornoAsistente();
    e.acceso.responsables.add('familia-1:hijo-1');
    e.acceso.aulas.set('aula-1', { docenteId: 'docente-1', estudianteIds: ['est-b', 'est-a'] });
    e.identidad.perfilesPorId.set('est-a', { alias: 'Ana', avatar: 'buho' });
    e.identidad.perfilesPorId.set('est-b', { alias: 'Mateo', avatar: 'leon' });
  });

  it('la familia que creó el perfil lo activa y queda registrado quién lo hizo', async () => {
    expect(await e.activacion.deFamilia('familia-1', 'hijo-1')).toEqual({ estudianteId: 'hijo-1', activo: false });
    expect(await e.activacion.cambiarFamilia('familia-1', 'hijo-1', true)).toEqual({ estudianteId: 'hijo-1', activo: true });
    expect(e.activaciones.filas.get('hijo-1')).toEqual({ activo: true, cambiadoPor: 'familia-1', rol: 'FAMILIAR', cambiadoEn: e.reloj.ahora() });
    expect(await e.activacion.deFamilia('familia-1', 'hijo-1')).toEqual({ estudianteId: 'hijo-1', activo: true });
  });

  it('otra familia (o la que acompaña por invitación) no lo ve ni lo cambia', async () => {
    await expect(e.activacion.deFamilia('familia-2', 'hijo-1')).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.activacion.cambiarFamilia('familia-2', 'hijo-1', true)).rejects.toBeInstanceOf(NoEncontradoError);
    expect(e.activaciones.filas.size).toBe(0);
  });

  it('la docente lo activa para toda su aula o para algunos, ordenados por nombre', async () => {
    expect((await e.activacion.deAula('docente-1', 'aula-1')).estudiantes.map((x) => [x.alias, x.activo])).toEqual([
      ['Ana', false],
      ['Mateo', false],
    ]);
    const todos = await e.activacion.cambiarAula('docente-1', 'aula-1', undefined, true);
    expect(todos).toEqual({
      aulaId: 'aula-1',
      estudiantes: [
        { estudianteId: 'est-a', alias: 'Ana', avatar: 'buho', activo: true },
        { estudianteId: 'est-b', alias: 'Mateo', avatar: 'leon', activo: true },
      ],
    });
    const uno = await e.activacion.cambiarAula('docente-1', 'aula-1', ['est-a'], false);
    expect(uno.estudiantes.map((x) => x.activo)).toEqual([false, true]);
    expect(e.activaciones.filas.get('est-a')).toMatchObject({ cambiadoPor: 'docente-1', rol: 'DOCENTE' });
  });

  it('RN-17: otra docente, otra aula o un estudiante ajeno responden 404', async () => {
    await expect(e.activacion.deAula('docente-2', 'aula-1')).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.activacion.cambiarAula('docente-2', 'aula-1', undefined, true)).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.activacion.cambiarAula('docente-1', 'aula-1', ['est-a', 'hijo-1'], true)).rejects.toThrow('Estudiante no encontrado');
    expect(e.activaciones.filas.size).toBe(0);
  });

  it('un aula sin estudiantes no guarda nada', async () => {
    e.acceso.aulas.set('aula-vacia', { docenteId: 'docente-1', estudianteIds: [] });
    expect(await e.activacion.cambiarAula('docente-1', 'aula-vacia', undefined, true)).toEqual({ aulaId: 'aula-vacia', estudiantes: [] });
    expect(e.activaciones.filas.size).toBe(0);
  });
});

describe('Borrador de retroalimentación para la docente (RF-075, RN-17)', () => {
  let e: EntornoAsistente;

  beforeEach(() => {
    e = crearEntornoAsistente();
    e.respuestas.filas.set('resp-1', {
      docenteId: 'docente-1',
      respuesta: { respuestaId: 'resp-1', estudianteId: 'est-a', rangoEdad: 'R2', enunciado: '¿Qué harías tú?', habilidad: 'CRI', minPalabras: 3, respuesta: 'Le ayudaría porque Pancho tenía una espina', texto: TEXTO_KILLA },
    });
  });

  it('propone un comentario con sus criterios; no lo guarda', async () => {
    expect(await e.borrador.borrador('docente-1', 'resp-1')).toEqual({
      respuestaId: 'resp-1',
      borrador: 'Me gusta que uses lo que dice el texto. ¡Tu respuesta está muy completa! ¿Qué habrías hecho tú en su lugar?',
      criterios: { palabras: 7, suficiente: true, daRazones: true, usaElTexto: true },
    });
  });

  it('otra docente o una respuesta que no existe: 404', async () => {
    await expect(e.borrador.borrador('docente-2', 'resp-1')).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.borrador.borrador('docente-1', 'no-existe')).rejects.toBeInstanceOf(NoEncontradoError);
  });
});
