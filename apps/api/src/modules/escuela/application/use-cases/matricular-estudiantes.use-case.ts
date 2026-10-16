import { BusEventos, crearEvento, ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { Matricula } from '../../domain/entities/matricula';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { generarPinTarjeta, PoliticaMatricula } from '../../domain/services/politica-matricula';
import { Aleatorio, GeneradorId, Reloj, TarjetaAcceso } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

export interface DatosEstudianteNuevo {
  alias: string;
  anioNacimiento: number;
  mesNacimiento: number;
  avatar: string;
}

export interface FilaRechazada {
  fila: number;
  contenido: string;
  motivo: string;
}

export const MAX_FILAS_CSV = 60;

/**
 * Use Case: MatricularEstudiantes (RF-015, RF-016).
 * Crea cada perfil bajo el consentimiento institucional del aula, con un PIN aleatorio que solo
 * se devuelve aquí para imprimir la tarjeta de acceso (RF-017).
 */
export class MatricularEstudiantesUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly aleatorio: Aleatorio,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  /** RF-015: registro individual. */
  async uno(entrada: { docenteId: string; aulaId: string } & DatosEstudianteNuevo): Promise<TarjetaAcceso> {
    const { tarjetas, rechazadas } = await this.varios(entrada.docenteId, entrada.aulaId, [entrada]);
    const tarjeta = tarjetas[0];
    if (!tarjeta) {
      throw new ErrorDeNegocio(rechazadas[0]?.motivo ?? 'No se pudo registrar al estudiante', 'VALIDACION');
    }
    return tarjeta;
  }

  /** RF-016: registro masivo desde CSV (alias, año, mes, avatar opcional), hasta 60 filas. */
  async desdeCsv(entrada: { docenteId: string; aulaId: string; csv: string }): Promise<{ tarjetas: TarjetaAcceso[]; rechazadas: FilaRechazada[] }> {
    const lineas = entrada.csv
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l, i) => ({ texto: l.trim(), fila: i + 1 }))
      .filter((l) => l.texto.length > 0);
    if (lineas.length > 0 && /alias/i.test(lineas[0]?.texto ?? '')) {
      lineas.shift(); // encabezado
    }
    if (lineas.length === 0) {
      throw new ErrorDeNegocio('El archivo no tiene filas de estudiantes', 'VALIDACION');
    }
    if (lineas.length > MAX_FILAS_CSV) {
      throw new ErrorDeNegocio(`El archivo puede tener hasta ${MAX_FILAS_CSV} estudiantes`, 'VALIDACION');
    }

    const avatares = this.identidad.avatares();
    const datos: (DatosEstudianteNuevo & { fila: number; contenido: string })[] = [];
    const rechazadas: FilaRechazada[] = [];
    for (const { texto, fila } of lineas) {
      const [alias = '', anio = '', mes = '', avatar = ''] = texto.split(/[;,]/).map((c) => c.trim());
      const anioNum = Number(anio);
      const mesNum = Number(mes);
      if (!alias || !Number.isInteger(anioNum) || !Number.isInteger(mesNum)) {
        rechazadas.push({ fila, contenido: texto, motivo: 'Formato esperado: alias, año, mes, avatar (opcional)' });
        continue;
      }
      const avatarElegido = avatar ? avatar.toLowerCase() : (avatares[(datos.length) % avatares.length] as string);
      if (!avatares.includes(avatarElegido)) {
        rechazadas.push({ fila, contenido: texto, motivo: `Avatar desconocido: ${avatar}` });
        continue;
      }
      datos.push({ alias, anioNacimiento: anioNum, mesNacimiento: mesNum, avatar: avatarElegido, fila, contenido: texto });
    }

    const resultado = await this.varios(entrada.docenteId, entrada.aulaId, datos);
    return { tarjetas: resultado.tarjetas, rechazadas: [...rechazadas, ...resultado.rechazadas].sort((a, b) => a.fila - b.fila) };
  }

  private async varios(
    docenteId: string,
    aulaId: string,
    lista: (DatosEstudianteNuevo & { fila?: number; contenido?: string })[],
  ): Promise<{ tarjetas: TarjetaAcceso[]; rechazadas: FilaRechazada[] }> {
    const aula = await cargarAulaPropia(this.aulas, aulaId, docenteId);
    aula.asegurarEditable();

    const activas = await this.matriculas.listarActivasPorAula(aula.id);
    PoliticaMatricula.validarCapacidad(activas.length, lista.length);
    const existentes = (await this.identidad.estudiantes(activas.map((m) => m.estudianteId))).map((e) => ({
      alias: e.alias,
      avatar: e.avatar,
    }));

    const ahora = this.ahora();
    const tarjetas: TarjetaAcceso[] = [];
    const rechazadas: FilaRechazada[] = [];
    for (const [i, d] of lista.entries()) {
      try {
        PoliticaMatricula.validarDistinguible(existentes, d);
        const pin = generarPinTarjeta(this.aleatorio, d.anioNacimiento);
        const estudiante = await this.identidad.crearPerfilEnAula({ docenteId, aulaId: aula.id, ...d, pin });
        await this.matriculas.guardar(
          Matricula.crear({ id: this.generarId(), aulaId: aula.id, estudianteId: estudiante.id, ahora }),
        );
        existentes.push({ alias: estudiante.alias, avatar: estudiante.avatar });
        tarjetas.push({
          estudianteId: estudiante.id,
          alias: estudiante.alias,
          avatar: estudiante.avatar,
          codigoAula: aula.codigo.value,
          nombreAula: aula.nombre,
          pin,
        });
        await this.bus.publicar([
          crearEvento(EVENTOS_ESCUELA.ESTUDIANTE_MATRICULADO, aula.id, { actorId: docenteId, estudianteId: estudiante.id }, ahora),
        ]);
      } catch (error) {
        if (!(error instanceof ErrorDeNegocio)) throw error;
        rechazadas.push({ fila: d.fila ?? i + 1, contenido: d.contenido ?? d.alias, motivo: error.message });
      }
    }
    return { tarjetas, rechazadas };
  }
}
