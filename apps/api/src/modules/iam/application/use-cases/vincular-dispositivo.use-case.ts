import { BusEventos, crearEvento, ErrorDeNegocio, ProhibidoError, ResolutorContextoAula } from '../../../shared-kernel/public-api';
import { ContextoDispositivo, DispositivoIngreso } from '../../domain/entities/dispositivo-ingreso';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { TokenService } from '../ports/token.service';

/**
 * Use Case: VincularDispositivo (RF-007, RN-04, CR-01). Un adulto activa la tablet una vez por
 * 30 días: el familiar para sus hijos y la docente para una de sus aulas activas. El token se
 * guarda en el dispositivo y aquí solo su huella. Así ningún niño escribe un código de aula.
 */
export class VincularDispositivoUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly dispositivos: DispositivoRepository,
    private readonly contextoAula: ResolutorContextoAula,
    private readonly tokens: TokenService,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: {
    cuentaId: string;
    nombre: string;
    aulaId?: string;
  }): Promise<{ tokenDispositivo: string; expiraEn: string; contexto: { tipo: 'FAMILIA' | 'AULA'; nombre: string } }> {
    const cuenta = await this.cuentas.buscarPorId(entrada.cuentaId);
    if (!cuenta || !cuenta.estaActiva()) {
      throw new ProhibidoError('Tu cuenta no puede activar dispositivos');
    }

    let contexto: ContextoDispositivo;
    let nombreContexto: string;
    if (entrada.aulaId) {
      // Solo la docente del aula, y solo mientras el aula esté activa (no revela aulas ajenas).
      const aula = cuenta.rol.value === 'DOCENTE' ? await this.contextoAula.aulaActiva(entrada.aulaId) : null;
      if (!aula || aula.docenteId !== cuenta.id) {
        throw new ErrorDeNegocio('No encontramos esa aula entre tus aulas activas', 'NO_ENCONTRADO');
      }
      contexto = { tipo: 'AULA', aulaId: aula.aulaId };
      nombreContexto = aula.nombre;
    } else {
      if (cuenta.rol.value !== 'FAMILIAR') {
        throw new ProhibidoError('Elige el aula para la que quieres activar esta tablet');
      }
      contexto = { tipo: 'FAMILIA' };
      nombreContexto = 'Tu familia';
    }

    const ahora = this.ahora();
    const token = this.tokens.generarTokenOpaco();
    const dispositivo = DispositivoIngreso.activar({
      id: this.generarId(),
      cuentaId: cuenta.id,
      contexto,
      nombre: entrada.nombre,
      hashToken: this.tokens.huella(token),
      ahora,
    });
    await this.dispositivos.guardar(dispositivo);

    await this.bus.publicar([
      crearEvento(
        EVENTOS_IAM.DISPOSITIVO_VINCULADO,
        dispositivo.id,
        { actorId: cuenta.id, tipo: contexto.tipo, ...(contexto.tipo === 'AULA' ? { aulaId: contexto.aulaId } : {}) },
        ahora,
      ),
    ]);
    return {
      tokenDispositivo: token,
      expiraEn: dispositivo.propsSnapshot.expiraEn.toISOString(),
      contexto: { tipo: contexto.tipo, nombre: nombreContexto },
    };
  }
}
