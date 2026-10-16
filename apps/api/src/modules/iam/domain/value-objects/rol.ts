/**
 * Value Object: Rol — catálogo cerrado de roles del sistema.
 * ESTUDIANTE es el único rol menor; el resto son adultos.
 */
export type RolValor =
  | 'ESTUDIANTE'
  | 'DOCENTE'
  | 'FAMILIAR'
  | 'EDITOR'
  | 'REVISOR'
  | 'ADMIN_PLATAFORMA';

const ROLES_ADULTOS: ReadonlySet<RolValor> = new Set<RolValor>([
  'DOCENTE',
  'FAMILIAR',
  'EDITOR',
  'REVISOR',
  'ADMIN_PLATAFORMA',
]);

/** Roles que exigen MFA obligatorio (RF-011). */
const ROLES_CON_MFA_OBLIGATORIO: ReadonlySet<RolValor> = new Set<RolValor>([
  'EDITOR',
  'REVISOR',
  'ADMIN_PLATAFORMA',
]);

export class Rol {
  private constructor(private readonly valor: RolValor) {}

  static de(valor: RolValor): Rol {
    return new Rol(valor);
  }

  get value(): RolValor {
    return this.valor;
  }

  esAdulto(): boolean {
    return ROLES_ADULTOS.has(this.valor);
  }

  requiereMfaObligatorio(): boolean {
    return ROLES_CON_MFA_OBLIGATORIO.has(this.valor);
  }
}
