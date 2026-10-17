import { BusEventos, crearEvento, ErrorDeNegocio, NoEncontradoError } from '../../../shared-kernel/public-api';
import { InvitacionFamiliar, MAX_INVITACIONES_PENDIENTES } from '../../domain/entities/invitacion-familiar';
import {
  AulaArchivadaError,
  DemasiadasInvitacionesError,
  FamiliaCompletaError,
  InvitacionInvalidaError,
} from '../../domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { CodigoInvitacion } from '../../domain/value-objects/codigo-invitacion';
import { Aleatorio, EstudianteResumido, GeneradorId, Huella, InvitacionVista, Reloj } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { InvitacionRepository } from '../ports/invitacion.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';

/** SRS §7: hasta 2 familiares vinculados por estudiante. */
export const MAX_FAMILIARES_VINCULADOS = 2;

/**
 * Use Case: GenerarInvitacionFamiliar (RF-019, RN-17). La docente obtiene un código de un solo uso,
 * válido 7 días, para que un familiar acompañe desde casa a un estudiante de su aula activa.
 * El código se muestra una sola vez; en la base solo queda su huella.
 */
export class GenerarInvitacionFamiliarUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly invitaciones: InvitacionRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly huella: Huella,
    private readonly aleatorio: Aleatorio,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; estudianteId: string; ip?: string }): Promise<InvitacionVista> {
    const ahora = this.ahora();
    // RN-17: solo estudiantes con matrícula activa en un aula de esta docente (404 si no, sin revelar más).
    const activas = (await this.matriculas.listarPorEstudiante(entrada.estudianteId)).filter((m) => m.activa);
    const aulasPropias = (await this.aulas.buscarPorIds(activas.map((m) => m.aulaId))).filter((a) => a.perteneceA(entrada.docenteId));
    if (aulasPropias.length === 0) throw new NoEncontradoError('Estudiante');
    const aula = aulasPropias.find((a) => a.estaActiva);
    if (!aula) throw new AulaArchivadaError();

    const [estudiante] = await this.identidad.estudiantes([entrada.estudianteId]);
    if (!estudiante) throw new NoEncontradoError('Estudiante');
    if ((estudiante.familiaresVinculados ?? 0) >= MAX_FAMILIARES_VINCULADOS) {
      throw new FamiliaCompletaError(estudiante.alias, MAX_FAMILIARES_VINCULADOS);
    }
    if ((await this.invitaciones.contarVigentesDeEstudiante(estudiante.id, ahora)) >= MAX_INVITACIONES_PENDIENTES) {
      throw new DemasiadasInvitacionesError(MAX_INVITACIONES_PENDIENTES);
    }

    let codigo = CodigoInvitacion.generar(this.aleatorio);
    while (await this.invitaciones.existeHash(this.huella(codigo.value))) {
      codigo = CodigoInvitacion.generar(this.aleatorio);
    }
    const invitacion = InvitacionFamiliar.emitir({
      id: this.generarId(),
      aulaId: aula.id,
      estudianteId: estudiante.id,
      docenteId: entrada.docenteId,
      hashCodigo: this.huella(codigo.value),
      ahora,
    });
    await this.invitaciones.guardar(invitacion);
    await this.bus.publicar([
      crearEvento(
        EVENTOS_ESCUELA.INVITACION_FAMILIAR_GENERADA,
        invitacion.id,
        { actorId: entrada.docenteId, estudianteId: estudiante.id, aulaId: aula.id, ip: entrada.ip ?? null },
        ahora,
      ),
    ]);

    return {
      codigo: codigo.legible,
      expiraEn: invitacion.expiraEn.toISOString(),
      estudiante: { id: estudiante.id, alias: estudiante.alias, avatar: estudiante.avatar },
      aula: { id: aula.id, nombre: aula.nombre },
    };
  }
}

/**
 * Use Case: CanjearInvitacionFamiliar (RF-019). El familiar escribe el código y queda vinculado
 * con el estudiante. Código inexistente, vencido o usado responden igual (no se revela cuál es).
 * Aun con dos intentos simultáneos, el código se usa una sola vez. El vínculo queda auditado.
 */
export class CanjearInvitacionFamiliarUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly invitaciones: InvitacionRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly huella: Huella,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaFamiliarId: string; codigo: string; ip?: string }): Promise<{ estudiante: EstudianteResumido; aula: string }> {
    const ahora = this.ahora();
    const codigo = CodigoInvitacion.intentar(entrada.codigo);
    const invitacion = codigo ? await this.invitaciones.buscarPorHash(this.huella(codigo.value)) : null;
    if (!invitacion || !invitacion.estaVigente(ahora)) throw new InvitacionInvalidaError();

    // El estudiante debe seguir en un aula activa de esa docente.
    const aula = await this.aulas.buscarPorId(invitacion.aulaId);
    const matricula = await this.matriculas.buscar(invitacion.aulaId, invitacion.estudianteId);
    if (!aula || !aula.estaActiva || !matricula?.activa) throw new InvitacionInvalidaError();

    const vinculo = { perfilId: invitacion.estudianteId, cuentaFamiliarId: entrada.cuentaFamiliarId };
    await this.identidad.validarVinculoFamiliar(vinculo);

    invitacion.canjear(entrada.cuentaFamiliarId, ahora);
    if (!(await this.invitaciones.reclamar(invitacion))) throw new InvitacionInvalidaError();
    try {
      await this.identidad.vincularFamiliar(vinculo);
    } catch (error) {
      // Si el vínculo no se completa (p. ej. una carrera con otro código), el código no se pierde.
      if (error instanceof ErrorDeNegocio) await this.invitaciones.liberar(invitacion);
      throw error;
    }

    await this.bus.publicar([
      crearEvento(
        EVENTOS_ESCUELA.FAMILIAR_VINCULADO,
        invitacion.id,
        {
          actorId: entrada.cuentaFamiliarId,
          estudianteId: invitacion.estudianteId,
          aulaId: aula.id,
          docenteId: invitacion.docenteId,
          ip: entrada.ip ?? null,
        },
        ahora,
      ),
    ]);

    const [estudiante] = await this.identidad.estudiantes([invitacion.estudianteId]);
    return {
      estudiante: { id: invitacion.estudianteId, alias: estudiante?.alias ?? '', avatar: estudiante?.avatar ?? '' },
      aula: aula.nombre,
    };
  }
}
