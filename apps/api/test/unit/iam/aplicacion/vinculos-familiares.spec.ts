import { beforeEach, describe, expect, it } from 'vitest';

import { AutenticarEstudianteUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-estudiante.use-case';
import { ContextoIngresoUseCase } from '../../../../src/modules/iam/application/use-cases/contexto-ingreso.use-case';
import { ListarPerfilesUseCase } from '../../../../src/modules/iam/application/use-cases/listar-perfiles.use-case';
import { MAX_FAMILIARES_VINCULADOS, VincularFamiliarUseCase } from '../../../../src/modules/iam/application/use-cases/vincular-familiar.use-case';
import { VincularDispositivoUseCase } from '../../../../src/modules/iam/application/use-cases/vincular-dispositivo.use-case';
import { LimiteFamiliaresError, LimitePerfilesError, YaVinculadoError } from '../../../../src/modules/iam/domain/errors/errores-iam';
import { NoEncontradoError, ProhibidoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntorno, cuentaActiva, Entorno, perfilEstudiante } from '../dobles';

/**
 * Nivel 1 — Vínculos de familiares adicionales (RF-019, RN-17, SRS §7: 1 responsable + hasta 2
 * vinculados). IAM los crea cuando Escuela canjea la invitación de la docente.
 */
describe('Vincular un familiar con un estudiante (RF-019)', () => {
  let e: Entorno;
  let vincular: VincularFamiliarUseCase;
  beforeEach(() => {
    e = crearEntorno();
    vincular = new VincularFamiliarUseCase(e.cuentas, e.perfiles, e.vinculos, e.generarId, e.reloj.ahora);
  });

  const escenario = async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    const familiar = await cuentaActiva(e, { rol: 'FAMILIAR' });
    const mateo = await perfilEstudiante(e, docente.id, { alias: 'Mateo', avatar: 'leon', pin: '4826' });
    return { docente, familiar, mateo };
  };

  it('el familiar pasa a acompañar al estudiante y lo ve en su panel como vinculado', async () => {
    const { familiar, mateo } = await escenario();
    const propio = await perfilEstudiante(e, familiar.id, { alias: 'Lucía', avatar: 'zorro' });

    const vista = await vincular.ejecutar({ perfilId: mateo.id, cuentaId: familiar.id, origen: 'INVITACION_DOCENTE' });
    expect(vista).toMatchObject({ id: mateo.id, alias: 'Mateo' });
    expect(e.vinculos.filas).toEqual([{ perfilId: mateo.id, cuentaId: familiar.id, origen: 'INVITACION_DOCENTE', vinculadoEn: e.reloj.ahora() }]);

    const panel = await new ListarPerfilesUseCase(e.perfiles, e.vinculos, e.reloj.ahora).ejecutar(familiar.id);
    expect(panel.map((p) => [p.id, p.relacion])).toEqual([
      [propio.id, 'RESPONSABLE'],
      [mateo.id, 'VINCULADO'],
    ]);
  });

  it('solo cuentas familiares activas; el estudiante debe existir', async () => {
    const { docente, mateo } = await escenario();
    const pendiente = await cuentaActiva(e, { rol: 'FAMILIAR', verificada: false });
    await expect(vincular.validar({ perfilId: mateo.id, cuentaId: docente.id })).rejects.toThrow(ProhibidoError);
    await expect(vincular.validar({ perfilId: mateo.id, cuentaId: pendiente.id })).rejects.toThrow(ProhibidoError);
    const { familiar } = await escenario();
    await expect(vincular.validar({ perfilId: 'no-existe', cuentaId: familiar.id })).rejects.toThrow(NoEncontradoError);
  });

  it('no duplica: ya responsable o ya vinculado', async () => {
    const { familiar, mateo } = await escenario();
    const propio = await perfilEstudiante(e, familiar.id, { alias: 'Lucía' });
    await expect(vincular.validar({ perfilId: propio.id, cuentaId: familiar.id })).rejects.toThrow(YaVinculadoError);
    await vincular.ejecutar({ perfilId: mateo.id, cuentaId: familiar.id, origen: 'INVITACION_DOCENTE' });
    await expect(vincular.validar({ perfilId: mateo.id, cuentaId: familiar.id })).rejects.toThrow(/Ya acompañas a Mateo/);
  });

  it(`máximo ${MAX_FAMILIARES_VINCULADOS} familiares vinculados por estudiante y 6 estudiantes por familia`, async () => {
    const { mateo } = await escenario();
    for (let i = 0; i < MAX_FAMILIARES_VINCULADOS; i++) {
      const f = await cuentaActiva(e, { rol: 'FAMILIAR' });
      await vincular.ejecutar({ perfilId: mateo.id, cuentaId: f.id, origen: 'INVITACION_DOCENTE' });
    }
    const tercero = await cuentaActiva(e, { rol: 'FAMILIAR' });
    await expect(vincular.validar({ perfilId: mateo.id, cuentaId: tercero.id })).rejects.toThrow(LimiteFamiliaresError);

    const llena = await cuentaActiva(e, { rol: 'FAMILIAR' });
    for (let i = 0; i < 6; i++) await perfilEstudiante(e, llena.id, { alias: `Hijo ${i}` });
    const { mateo: otro } = await escenario();
    await expect(vincular.validar({ perfilId: otro.id, cuentaId: llena.id })).rejects.toThrow(LimitePerfilesError);
  });
});

describe('Tablet de casa con estudiantes vinculados (RF-007, RN-04, RF-019)', () => {
  it('la familia ve y hace entrar con su PIN al niño vinculado; otra familia no', async () => {
    const e = crearEntorno();
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    const familiar = await cuentaActiva(e, { rol: 'FAMILIAR' });
    const otraFamilia = await cuentaActiva(e, { rol: 'FAMILIAR' });
    const mateo = await perfilEstudiante(e, docente.id, { alias: 'Mateo', avatar: 'leon', pin: '4826' });
    await new VincularFamiliarUseCase(e.cuentas, e.perfiles, e.vinculos, e.generarId, e.reloj.ahora).ejecutar({
      perfilId: mateo.id, cuentaId: familiar.id, origen: 'INVITACION_DOCENTE',
    });

    const activar = new VincularDispositivoUseCase(e.cuentas, e.dispositivos, e.contextoAula, e.tokens, e.bus, e.generarId, e.reloj.ahora);
    const { tokenDispositivo } = await activar.ejecutar({ cuentaId: familiar.id, nombre: 'Tablet de casa' });
    const { tokenDispositivo: ajeno } = await activar.ejecutar({ cuentaId: otraFamilia.id, nombre: 'Otra casa' });

    const contexto = new ContextoIngresoUseCase(e.perfiles, e.vinculos, e.dispositivos, e.contextoAula, e.tokens, e.reloj.ahora);
    expect((await contexto.deDispositivo(tokenDispositivo)).estudiantes).toEqual([{ id: mateo.id, alias: 'Mateo', avatar: 'leon' }]);
    expect((await contexto.deDispositivo(ajeno)).estudiantes).toEqual([]);

    const ingreso = new AutenticarEstudianteUseCase(e.perfiles, e.vinculos, e.dispositivos, e.contextoAula, e.hash, e.tokens, e.emisor, e.bus, e.reloj.ahora);
    await expect(ingreso.ejecutar({ perfilId: mateo.id, pin: '4826', tokenDispositivo })).resolves.toMatchObject({ rol: 'ESTUDIANTE' });
    await expect(ingreso.ejecutar({ perfilId: mateo.id, pin: '4826', tokenDispositivo: ajeno })).rejects.toThrow(/tu familia/);
  });
});
