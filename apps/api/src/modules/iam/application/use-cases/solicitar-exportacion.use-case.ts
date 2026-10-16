import { BusEventos, crearEvento, RecolectorDatosEstudiante } from '../../../shared-kernel/public-api';
import { Exportacion, FORMATOS_EXPORTACION, FormatoExportacion } from '../../domain/entities/exportacion';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { ConsentimientoRepository } from '../ports/consentimiento.repository';
import { AlmacenExportaciones, DatosExportacion, FirmadorEnlaces, GeneradorPdfExportacion } from '../ports/exportaciones';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { cargarPerfilPropio, vistaPerfil } from '../services/perfiles';

export interface ExportacionSolicitada {
  id: string;
  creadaEn: string;
  expiraEn: string;
  enlaces: Record<FormatoExportacion, string>;
}

/** Texto que se firma para cada enlace: impide cambiar id, formato o vencimiento. */
export function textoFirmado(id: string, formato: FormatoExportacion, expira: number): string {
  return `${id}.${formato}.${expira}`;
}

/**
 * Use Case: SolicitarExportacion (RF-012, derecho de acceso ARCO).
 * Reúne los datos personales (IAM) y los que aporta cada módulo, genera un JSON y un PDF
 * y devuelve enlaces firmados que vencen a las 72 h. Se genera al momento (el SRS admite ≤ 24 h).
 */
export class SolicitarExportacionUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly consentimientos: ConsentimientoRepository,
    private readonly recolector: RecolectorDatosEstudiante,
    private readonly almacen: AlmacenExportaciones,
    private readonly pdf: GeneradorPdfExportacion,
    private readonly firmador: FirmadorEnlaces,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaId: string; perfilId: string }): Promise<ExportacionSolicitada> {
    const ahora = this.ahora();
    const perfil = await cargarPerfilPropio(this.perfiles, entrada.perfilId, entrada.cuentaId);
    const [consentimiento] = await this.consentimientos.listarPorIds([perfil.propsSnapshot.consentimientoId]);
    const { bloqueadoHasta: _omitido, ...datosPerfil } = vistaPerfil(perfil, ahora);

    const datos: DatosExportacion = {
      generadoEn: ahora.toISOString(),
      aviso: 'Datos del estudiante en LectoAventura (Ley N.º 29733 de Protección de Datos Personales).',
      perfil: datosPerfil,
      consentimiento: consentimiento
        ? {
            tipo: consentimiento.tipo,
            versionPolitica: consentimiento.versionPolitica,
            otorgadoEn: consentimiento.otorgadoEn.toISOString(),
            otorgante: consentimiento.otorganteNombre,
            medio: consentimiento.medio,
          }
        : null,
      ...(await this.recolector.recolectar(perfil.id)),
    };

    await this.almacen.eliminarVencidas(ahora);
    const exportacion = Exportacion.solicitar({ id: this.generarId(), perfilId: perfil.id, solicitadaPor: entrada.cuentaId, ahora });
    await this.almacen.guardar(exportacion, {
      json: Buffer.from(JSON.stringify(datos, null, 2), 'utf8'),
      pdf: await this.pdf.generar(datos),
    });

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.DATOS_EXPORTADOS, perfil.id, { actorId: entrada.cuentaId, exportacionId: exportacion.id }, ahora),
    ]);

    const expira = exportacion.expiraEn.getTime();
    const enlaces = Object.fromEntries(
      FORMATOS_EXPORTACION.map((formato) => [
        formato,
        `/api/v1/exportaciones/${exportacion.id}/${formato}?expira=${expira}&firma=${this.firmador.firmar(textoFirmado(exportacion.id, formato, expira))}`,
      ]),
    ) as Record<FormatoExportacion, string>;

    return { id: exportacion.id, creadaEn: ahora.toISOString(), expiraEn: exportacion.expiraEn.toISOString(), enlaces };
  }
}
