import { BusEventos, crearEvento, ProhibidoError } from '../../../shared-kernel/public-api';
import {
  Consentimiento,
  MedioConsentimiento,
  TipoConsentimiento,
  VERSION_POLITICA_VIGENTE,
} from '../../domain/entities/consentimiento';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { ConsentimientoRepository } from '../ports/consentimiento.repository';
import { CuentaRepository } from '../ports/cuenta.repository';

export interface RegistrarConsentimientoInput {
  cuentaResponsableId: string;
  tipo: TipoConsentimiento;
  aulaId?: string;
  otorganteNombre: string;
  medio: MedioConsentimiento;
}

/**
 * Use Case: RegistrarConsentimiento (RF-005, RN-01). Parental para familias (desde el panel familiar)
 * o institucional para un aula (lo registra el docente con la declaración de la IE).
 * Si ya existe uno vigente para el mismo alcance, se devuelve ese.
 */
export class RegistrarConsentimientoUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly consentimientos: ConsentimientoRepository,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: RegistrarConsentimientoInput): Promise<{ id: string; versionPolitica: string; otorgadoEn: string }> {
    const cuenta = await this.cuentas.buscarPorId(entrada.cuentaResponsableId);
    const rolEsperado = entrada.tipo === 'PARENTAL' ? 'FAMILIAR' : 'DOCENTE';
    if (!cuenta || !cuenta.estaActiva() || cuenta.rol.value !== rolEsperado) {
      throw new ProhibidoError('Tu cuenta no puede registrar este tipo de consentimiento');
    }

    const existente =
      entrada.tipo === 'PARENTAL'
        ? await this.consentimientos.buscarParentalVigente(cuenta.id)
        : await this.consentimientos.buscarInstitucionalVigente(cuenta.id, entrada.aulaId ?? '');
    if (existente && existente.versionPolitica === VERSION_POLITICA_VIGENTE) {
      return { id: existente.id, versionPolitica: existente.versionPolitica, otorgadoEn: existente.otorgadoEn.toISOString() };
    }

    const ahora = this.ahora();
    const consentimiento = Consentimiento.otorgar({
      id: this.generarId(),
      cuentaResponsableId: cuenta.id,
      tipo: entrada.tipo,
      aulaId: entrada.aulaId ?? null,
      versionPolitica: VERSION_POLITICA_VIGENTE,
      otorganteNombre: entrada.otorganteNombre,
      medio: entrada.medio,
      ahora,
    });
    if (existente) {
      existente.revocar();
      await this.consentimientos.guardar(existente);
    }
    await this.consentimientos.guardar(consentimiento);

    await this.bus.publicar([
      crearEvento(
        EVENTOS_IAM.CONSENTIMIENTO_OTORGADO,
        consentimiento.id,
        { actorId: cuenta.id, tipo: entrada.tipo, aulaId: entrada.aulaId ?? null, versionPolitica: VERSION_POLITICA_VIGENTE },
        ahora,
      ),
    ]);
    return { id: consentimiento.id, versionPolitica: VERSION_POLITICA_VIGENTE, otorgadoEn: ahora.toISOString() };
  }
}
