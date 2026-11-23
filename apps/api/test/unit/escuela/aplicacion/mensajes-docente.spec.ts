import { beforeEach, describe, expect, it } from 'vitest';

import { EnvioResumen, MensajeRepository } from '../../../../src/modules/escuela/application/ports/mensaje.repository';
import { MAX_ENVIOS_POR_DIA, MensajesDocenteUseCase } from '../../../../src/modules/escuela/application/use-cases/mensajes-docente.use-case';
import { MensajeDocente, textoDeMensaje } from '../../../../src/modules/escuela/domain/entities/mensaje-docente';
import { AulaArchivadaError, DatoMensajeInvalidoError, DemasiadosMensajesError } from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn } from '../dobles';

/** Los mensajitos en memoria, con la misma agrupación por envío que la base. */
class MensajesEnMemoria implements MensajeRepository {
  readonly filas: MensajeDocente[] = [];
  async guardar(mensajes: MensajeDocente[]) {
    this.filas.push(...mensajes);
  }
  async contarEnvios(aulaId: string, desde: Date, hasta: Date) {
    return new Set(this.filas.filter((m) => m.datos.aulaId === aulaId && m.datos.creadoEn >= desde && m.datos.creadoEn < hasta).map((m) => m.datos.envioId)).size;
  }
  async envios(aulaId: string, limite: number) {
    const porEnvio = new Map<string, EnvioResumen>();
    for (const m of [...this.filas].reverse().filter((f) => f.datos.aulaId === aulaId)) {
      const d = m.datos;
      const envio = porEnvio.get(d.envioId);
      if (envio) {
        envio.estudianteIds.push(d.estudianteId);
        if (d.leidoEn) envio.leidos += 1;
      } else if (porEnvio.size < limite) {
        porEnvio.set(d.envioId, { envioId: d.envioId, sticker: d.sticker, texto: d.texto, creadoEn: d.creadoEn, paraTodaElAula: d.paraTodaElAula, estudianteIds: [d.estudianteId], leidos: d.leidoEn ? 1 : 0 });
      }
    }
    return [...porEnvio.values()];
  }
  async noLeidos(estudianteId: string, aulaIds: string[], limite: number) {
    return [...this.filas].reverse().filter((m) => m.datos.estudianteId === estudianteId && aulaIds.includes(m.datos.aulaId) && !m.datos.leidoEn).slice(0, limite);
  }
  async marcarLeido(id: string, estudianteId: string, ahora: Date) {
    const i = this.filas.findIndex((m) => m.id === id && m.datos.estudianteId === estudianteId);
    const m = this.filas[i];
    if (!m) return false;
    if (!m.datos.leidoEn) this.filas[i] = MensajeDocente.desdePersistencia({ ...m.datos, leidoEn: ahora });
    return true;
  }
  async deEstudiante(estudianteId: string) {
    return this.filas.filter((m) => m.datos.estudianteId === estudianteId);
  }
  async eliminarDeEstudiante(estudianteId: string) {
    for (let i = this.filas.length - 1; i >= 0; i--) if (this.filas[i]?.datos.estudianteId === estudianteId) this.filas.splice(i, 1);
  }
}

/** Nivel 1 — Mensajitos de ánimo de la docente para sus estudiantes. */
const DOCENTE = 'doc-1';

describe('[Escuela][Menor][Fast] Mensajitos de la docente', () => {
  let e: EntornoEscuela;
  let mensajes: MensajesEnMemoria;
  let uc: MensajesDocenteUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela(); // jueves 15/10/2026, 10:00 en Lima
    mensajes = new MensajesEnMemoria();
    uc = new MensajesDocenteUseCase(e.aulas, e.matriculas, mensajes, e.identidad, e.bus, e.generarId, e.reloj.ahora);
  });

  it('envía a toda el aula: un mensaje por niño, queda auditado sin el texto y cada niño lo ve', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');

    const envio = await uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'ESTRELLA', texto: '  ¡Qué bien   leyeron hoy!  ' });
    expect(envio).toMatchObject({ sticker: 'ESTRELLA', texto: '¡Qué bien leyeron hoy!', paraTodaElAula: true, para: 'Toda el aula', total: 2, leidos: 0 });
    expect(mensajes.filas).toHaveLength(2);
    const evento = e.bus.publicados.at(-1);
    expect(evento).toMatchObject({ nombreEvento: EVENTOS_ESCUELA.MENSAJE_DOCENTE_ENVIADO, agregadoId: aula.id, datos: { actorId: DOCENTE, aulaId: aula.id, cantidad: 2 } });
    expect(JSON.stringify(evento)).not.toContain('leyeron');

    const deMateo = await uc.paraEstudiante(mateo);
    expect(deMateo).toEqual([{ id: expect.any(String), sticker: 'ESTRELLA', texto: '¡Qué bien leyeron hoy!', creadoEn: '2026-10-15T15:00:00.000Z', aula: '3.° B' }]);
    expect(await uc.paraEstudiante(ana)).toHaveLength(1);

    // Mateo lo cierra con «Gracias»: desaparece de su inicio y la docente ve 1 de 2 leídos.
    expect(await uc.marcarLeido(mateo, deMateo[0]?.id as string)).toEqual({ leido: true });
    expect(await uc.marcarLeido(mateo, deMateo[0]?.id as string)).toEqual({ leido: true }); // repetirlo no cambia nada
    expect(await uc.paraEstudiante(mateo)).toEqual([]);
    expect(await uc.enviados({ docenteId: DOCENTE, aulaId: aula.id })).toMatchObject([{ para: 'Toda el aula', total: 2, leidos: 1 }]);
  });

  it('envía a un solo niño matriculado; nadie más lo ve ni lo puede marcar', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');

    const envio = await uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, estudianteId: ana, sticker: 'FUERZA', texto: 'Te extrañamos, ¡vuelve a leer!' });
    expect(envio).toMatchObject({ paraTodaElAula: false, para: 'Ana', total: 1 });
    expect(e.bus.publicados.at(-1)?.datos).toMatchObject({ estudianteId: ana, cantidad: 1 });
    expect(await uc.paraEstudiante(mateo)).toEqual([]);
    const [mensaje] = await uc.paraEstudiante(ana);
    await expect(uc.marcarLeido(mateo, mensaje?.id as string)).rejects.toThrow(NoEncontradoError);
    await expect(uc.marcarLeido(ana, 'no-existe')).rejects.toThrow(NoEncontradoError);
  });

  it('RN-17: solo su docente, a estudiantes de esa aula, y con el aula activa', async () => {
    const aula = await aulaDe(e, DOCENTE);
    await estudianteEn(e, aula, 'Mateo');
    const otraAula = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    const deOtra = await estudianteEn(e, otraAula, 'Lía', 'rana');

    await expect(uc.enviar({ docenteId: 'doc-2', aulaId: aula.id, sticker: 'SOL', texto: 'Hola' })).rejects.toThrow(NoEncontradoError);
    await expect(uc.enviados({ docenteId: 'doc-2', aulaId: aula.id })).rejects.toThrow(NoEncontradoError);
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, estudianteId: deOtra, sticker: 'SOL', texto: 'Hola' })).rejects.toThrow(DatoMensajeInvalidoError);

    aula.archivar(e.reloj.ahora());
    await e.aulas.guardar(aula);
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'SOL', texto: 'Hola' })).rejects.toThrow(AulaArchivadaError);
  });

  it('el niño retirado del aula ya no ve los mensajitos de esa aula', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    await uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'LIBRO', texto: '¡A leer!' });
    const matricula = await e.matriculas.buscar(aula.id, mateo);
    matricula?.retirar(e.reloj.ahora());
    expect(await uc.paraEstudiante(mateo)).toEqual([]);
  });

  it('valida el sticker, el texto y el aula con estudiantes; tope de envíos por día', async () => {
    const vacia = await aulaDe(e, DOCENTE);
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: vacia.id, sticker: 'SOL', texto: 'Hola' })).rejects.toThrow('Aún no hay estudiantes');

    const aula = await aulaDe(e, DOCENTE, { nombre: '5.° A' });
    await estudianteEn(e, aula, 'Mateo');
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'CALAVERA', texto: 'Hola' })).rejects.toThrow(DatoMensajeInvalidoError);
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'SOL', texto: '   ' })).rejects.toThrow(DatoMensajeInvalidoError);
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'SOL', texto: 'a'.repeat(141) })).rejects.toThrow('hasta 140');

    for (let i = 0; i < MAX_ENVIOS_POR_DIA; i++) await uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'SOL', texto: `Mensaje ${i}` });
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'SOL', texto: 'Uno más' })).rejects.toThrow(DemasiadosMensajesError);
    // Al día siguiente (Lima) se puede volver a escribir; la docente ve los 20 más recientes.
    e.reloj.avanzarMin(24 * 60);
    await expect(uc.enviar({ docenteId: DOCENTE, aulaId: aula.id, sticker: 'SOL', texto: 'Buenos días' })).resolves.toMatchObject({ total: 1 });
    expect(await uc.enviados({ docenteId: DOCENTE, aulaId: aula.id })).toHaveLength(20);
  });

  it('el texto: 140 caracteres como máximo (los emojis cuentan como uno) y sin caracteres ocultos', () => {
    expect(textoDeMensaje('¡Muy bien!\n\nSigue así 🌟')).toBe('¡Muy bien! Sigue así 🌟');
    expect(textoDeMensaje('🌟'.repeat(140))).toHaveLength(280);
    expect(() => textoDeMensaje('🌟'.repeat(141))).toThrow(DatoMensajeInvalidoError);
    expect(() => textoDeMensaje('Hola‮texto oculto')).toThrow(DatoMensajeInvalidoError);
  });
});
