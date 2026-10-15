import type { SesionEmitida } from '../../../iam/public-api';
import { ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { Aula } from '../../domain/entities/aula';
import { CodigoAulaInvalidoError } from '../../domain/errors/errores-escuela';
import { CodigoAula } from '../../domain/value-objects/codigo-aula';
import { AulaRepository } from '../ports/aula.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';

async function aulaActivaPorCodigo(aulas: AulaRepository, texto: string): Promise<Aula> {
  const codigo = CodigoAula.intentar(texto);
  const aula = codigo ? await aulas.buscarPorCodigo(codigo.value) : null;
  if (!aula || !aula.estaActiva) {
    throw new CodigoAulaInvalidoError();
  }
  return aula;
}

/**
 * Use Case: ContextoIngresoAula (RF-007, RN-04). Con un código de aula vigente se muestran
 * solo alias y avatar de los estudiantes matriculados y activos.
 */
export class ContextoIngresoAulaUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly identidad: ServicioIdentidad,
  ) {}

  async ejecutar(codigo: string): Promise<{ aula: { nombre: string }; estudiantes: { id: string; alias: string; avatar: string }[] }> {
    const aula = await aulaActivaPorCodigo(this.aulas, codigo);
    const matriculas = await this.matriculas.listarActivasPorAula(aula.id);
    const estudiantes = (await this.identidad.estudiantes(matriculas.map((m) => m.estudianteId)))
      .filter((e) => e.activo)
      .map((e) => ({ id: e.id, alias: e.alias, avatar: e.avatar }))
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
    return { aula: { nombre: aula.nombre }, estudiantes };
  }
}

/** Use Case: IngresarEnAula (RF-007) — valida código y matrícula, y delega el PIN a IAM. */
export class IngresarEnAulaUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly identidad: ServicioIdentidad,
  ) {}

  async ejecutar(entrada: { codigoAula: string; perfilId: string; pin: string }): Promise<SesionEmitida> {
    const aula = await aulaActivaPorCodigo(this.aulas, entrada.codigoAula);
    const matricula = await this.matriculas.buscar(aula.id, entrada.perfilId);
    if (!matricula || !matricula.activa) {
      throw new ErrorDeNegocio('No perteneces a esta aula', 'PROHIBIDO');
    }
    return this.identidad.autenticarEnAula({ perfilId: entrada.perfilId, pin: entrada.pin, aulaId: aula.id });
  }
}
