import { beforeEach, describe, expect, it } from 'vitest';

import {
  CanjearInvitacionFamiliarUseCase,
  GenerarInvitacionFamiliarUseCase,
} from '../../../../src/modules/escuela/application/use-cases/invitaciones-familiar.use-case';
import { MAX_INVITACIONES_PENDIENTES } from '../../../../src/modules/escuela/domain/entities/invitacion-familiar';
import {
  AulaArchivadaError,
  DemasiadasInvitacionesError,
  FamiliaCompletaError,
  InvitacionInvalidaError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { ErrorDeNegocio, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn } from '../dobles';

/** Nivel 1 — Invitación familiar (RF-019, RN-17): código de un solo uso, 7 días, auditado. */
const DOCENTE = 'doc-1';
const FAMILIAR = 'fam-1';

describe('Invitación familiar (RF-019)', () => {
  let e: EntornoEscuela;
  let generar: GenerarInvitacionFamiliarUseCase;
  let canjear: CanjearInvitacionFamiliarUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela();
    generar = new GenerarInvitacionFamiliarUseCase(
      e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.aleatorio, e.generarId, e.reloj.ahora,
    );
    canjear = new CanjearInvitacionFamiliarUseCase(e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.reloj.ahora);
  });

  const preparar = async () => {
    const aula = await aulaDe(e, DOCENTE, { nombre: '3.° B' });
    const mateo = await estudianteEn(e, aula, 'Mateo');
    return { aula, mateo };
  };

  it('la docente obtiene un código legible de 7 días; en la base solo queda su huella', async () => {
    const { aula, mateo } = await preparar();
    e.encolarAleatorios([0, 1, 2, 3, 4, 5, 6, 7]);
    const inv = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo, ip: '203.0.113.7' });

    expect(inv).toEqual({
      codigo: 'ABCD-EFGH',
      expiraEn: '2026-10-22T15:00:00.000Z',
      estudiante: { id: mateo, alias: 'Mateo', avatar: 'leon' },
      aula: { id: aula.id, nombre: '3.° B' },
    });
    const [guardada] = [...e.invitaciones.filas.values()];
    expect(guardada?.hashCodigo).toBe('huella(ABCDEFGH)');
    expect(JSON.stringify(guardada)).not.toContain('ABCD-EFGH');
    expect(e.bus.publicados.at(-1)).toMatchObject({
      nombreEvento: EVENTOS_ESCUELA.INVITACION_FAMILIAR_GENERADA,
      datos: { actorId: DOCENTE, estudianteId: mateo, aulaId: aula.id, ip: '203.0.113.7' },
    });
  });

  it('RN-17: solo para estudiantes de sus aulas activas', async () => {
    const { aula, mateo } = await preparar();
    await expect(generar.ejecutar({ docenteId: 'otra-docente', estudianteId: mateo })).rejects.toThrow(NoEncontradoError);
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: 'no-existe' })).rejects.toThrow(NoEncontradoError);
    aula.archivar(e.reloj.ahora());
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).rejects.toThrow(AulaArchivadaError);
  });

  it(`limita los códigos pendientes (${MAX_INVITACIONES_PENDIENTES}) y no invita si ya hay 2 familiares`, async () => {
    const { mateo } = await preparar();
    for (let i = 0; i < MAX_INVITACIONES_PENDIENTES; i++) await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).rejects.toThrow(DemasiadasInvitacionesError);

    // Al vencer, dejan de contar.
    e.reloj.avanzarMin(7 * 24 * 60);
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).resolves.toBeTruthy();

    e.identidad.vinculos.push({ perfilId: mateo, cuentaFamiliarId: 'f1' }, { perfilId: mateo, cuentaFamiliarId: 'f2' });
    await expect(generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo })).rejects.toThrow(FamiliaCompletaError);
  });

  it('el familiar canjea el código (escrito como sea) y queda vinculado y auditado', async () => {
    const { aula, mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });

    const r = await canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo: ` ${codigo.toLowerCase().replace('-', ' ')} `, ip: '198.51.100.4' });
    expect(r).toEqual({ estudiante: { id: mateo, alias: 'Mateo', avatar: 'leon' }, aula: '3.° B' });
    expect(e.identidad.vinculos).toEqual([{ perfilId: mateo, cuentaFamiliarId: FAMILIAR }]);
    expect([...e.invitaciones.filas.values()][0]).toMatchObject({ usadaEn: e.reloj.ahora(), cuentaFamiliarId: FAMILIAR });
    expect(e.bus.publicados.at(-1)).toMatchObject({
      nombreEvento: EVENTOS_ESCUELA.FAMILIAR_VINCULADO,
      datos: { actorId: FAMILIAR, estudianteId: mateo, aulaId: aula.id, docenteId: DOCENTE, ip: '198.51.100.4' },
    });
  });

  it('un código usado, vencido, inventado o mal escrito responde siempre lo mismo', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    const { codigo: vencido } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    await canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo });

    const intentos = [codigo, 'ZZZZ-ZZZZ', 'hola', ''];
    for (const c of intentos) {
      await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-2', codigo: c })).rejects.toThrow(InvitacionInvalidaError);
    }
    e.reloj.avanzarMin(7 * 24 * 60);
    await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-2', codigo: vencido })).rejects.toThrow(InvitacionInvalidaError);
  });

  it('no sirve si el estudiante dejó el aula o el aula se archivó', async () => {
    const { aula, mateo } = await preparar();
    const { codigo: c1 } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    (await e.matriculas.buscar(aula.id, mateo))?.retirar(e.reloj.ahora());
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo: c1 })).rejects.toThrow(InvitacionInvalidaError);

    const otra = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    const ana = await estudianteEn(e, otra, 'Ana', 'zorro');
    const { codigo: c2 } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: ana });
    otra.archivar(e.reloj.ahora());
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo: c2 })).rejects.toThrow(InvitacionInvalidaError);
  });

  it('si IAM no permite el vínculo (p. ej. ya lo acompaña), el código no se gasta', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    e.identidad.errorAlVincular = new ErrorDeNegocio('Ya acompañas a Mateo desde tu cuenta', 'CONFLICTO');

    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo })).rejects.toThrow(/Ya acompañas/);
    expect([...e.invitaciones.filas.values()][0]?.usadaEn).toBeNull();

    e.identidad.errorAlVincular = null;
    await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-2', codigo })).resolves.toBeTruthy();
  });

  it('con dos canjes simultáneos del mismo código, solo uno vincula', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });

    const resultados = await Promise.allSettled([
      canjear.ejecutar({ cuentaFamiliarId: 'fam-a', codigo }),
      canjear.ejecutar({ cuentaFamiliarId: 'fam-b', codigo }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(InvitacionInvalidaError) });
    expect(e.identidad.vinculos).toHaveLength(1);
  });

  it('si el vínculo falla después de reclamar el código, lo libera', async () => {
    const { mateo } = await preparar();
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });
    const original = e.identidad.vincularFamiliar.bind(e.identidad);
    e.identidad.vincularFamiliar = async () => {
      throw new ErrorDeNegocio('Mateo ya tiene 2 familiares vinculados', 'CONFLICTO');
    };
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo })).rejects.toThrow(/2 familiares/);
    expect([...e.invitaciones.filas.values()][0]).toMatchObject({ usadaEn: null, cuentaFamiliarId: null });

    e.identidad.vincularFamiliar = original;
    await expect(canjear.ejecutar({ cuentaFamiliarId: FAMILIAR, codigo })).resolves.toBeTruthy();
  });
});
