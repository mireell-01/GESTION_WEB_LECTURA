import { BusEventos, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { AulaVista, Reloj, vistaAula } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { cargarAulaPropia } from '../services/aulas';

/** Use Case: ArchivarAula (RF-020) — solo lectura; los estudiantes conservan su perfil lector. */
export class ArchivarAulaUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string }): Promise<AulaVista> {
    const ahora = this.ahora();
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.archivar(ahora);
    await this.aulas.guardar(aula);
    await this.bus.publicar([crearEvento(EVENTOS_ESCUELA.AULA_ARCHIVADA, aula.id, { actorId: entrada.docenteId }, ahora)]);
    const total = (await this.matriculas.contarActivasPorAulas([aula.id]))[aula.id] ?? 0;
    return vistaAula(aula, total);
  }
}

/** Use Case: RetirarEstudiante — el estudiante deja el aula; su perfil lector se conserva. */
export class RetirarEstudianteUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { docenteId: string; aulaId: string; estudianteId: string }): Promise<{ ok: true }> {
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.asegurarEditable();
    const matricula = await this.matriculas.buscar(aula.id, entrada.estudianteId);
    if (!matricula || !matricula.activa) {
      throw new NoEncontradoError('Estudiante en el aula');
    }
    const ahora = this.ahora();
    matricula.retirar(ahora);
    await this.matriculas.guardar(matricula);
    await this.bus.publicar([
      crearEvento(EVENTOS_ESCUELA.ESTUDIANTE_RETIRADO, aula.id, { actorId: entrada.docenteId, estudianteId: entrada.estudianteId }, ahora),
    ]);
    return { ok: true };
  }
}
