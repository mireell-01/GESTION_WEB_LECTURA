import { isIP } from 'node:net';

import { Auditoria } from '../../domain/entities/auditoria';
import { RegistrarAuditoriaCommand, RegistrarAuditoriaResult } from '../dto/registrar-auditoria.dto';
import { AuditoriaRepository } from '../ports/auditoria.repository';

/**
 * Use Case: RegistrarAuditoriaUseCase (RF-077) — capa de aplicación (orquesta el dominio).
 * Una IP que no es IPv4/IPv6 válida se guarda como desconocida en lugar de perder el registro.
 */
export class RegistrarAuditoriaUseCase {
  constructor(
    private readonly repositorio: AuditoriaRepository,
    private readonly generarId: () => string,
  ) {}

  async ejecutar(entrada: RegistrarAuditoriaCommand): Promise<RegistrarAuditoriaResult> {
    const registro = Auditoria.registrar({
      ...entrada,
      id: this.generarId(),
      ip: entrada.ip && isIP(entrada.ip) ? entrada.ip : null,
    });
    await this.repositorio.agregar(registro);
    return { id: registro.propsSnapshot.id };
  }
}
