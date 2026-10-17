import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class CuentaNoVerificadaError extends ErrorDeNegocio {
  constructor() {
    super('Tu cuenta aún no está verificada. Revisa tu correo.', 'PROHIBIDO', {
      motivo: 'CUENTA_NO_VERIFICADA',
    });
  }
}

export class CuentaSuspendidaError extends ErrorDeNegocio {
  constructor() {
    super('Tu cuenta está suspendida. Comunícate con la administración.', 'PROHIBIDO', {
      motivo: 'CUENTA_SUSPENDIDA',
    });
  }
}

/** RF-011: la cuenta tiene MFA y falta el código de 6 dígitos. */
export class CodigoMfaRequeridoError extends ErrorDeNegocio {
  constructor() {
    super('Ingresa el código de 6 dígitos de tu app autenticadora', 'NO_AUTENTICADO', {
      requiereCodigoMfa: true,
    });
  }
}

export class CodigoMfaInvalidoError extends ErrorDeNegocio {
  constructor() {
    super('El código de verificación no es correcto', 'NO_AUTENTICADO', { requiereCodigoMfa: true });
  }
}

export class SesionInvalidaError extends ErrorDeNegocio {
  constructor(mensaje = 'Tu sesión terminó. Vuelve a ingresar.') {
    super(mensaje, 'NO_AUTENTICADO');
  }
}

export class EmailYaRegistradoError extends ErrorDeNegocio {
  constructor() {
    super('Ya existe una cuenta con este correo', 'CONFLICTO');
  }
}

export class ContrasenaFiltradaError extends ErrorDeNegocio {
  constructor() {
    super(
      'Esa contraseña aparece en filtraciones conocidas o es muy común. Elige otra.',
      'VALIDACION',
    );
  }
}

/** RF-071: máximo 6 perfiles por cuenta familiar. */
export class LimitePerfilesError extends ErrorDeNegocio {
  constructor(maximo: number) {
    super(`Una cuenta familiar puede tener hasta ${maximo} perfiles de estudiante`, 'CONFLICTO');
  }
}

export class AliasRepetidoError extends ErrorDeNegocio {
  constructor() {
    super('Ya tienes un perfil con ese alias y avatar; elige otro', 'CONFLICTO');
  }
}

/** RF-012: enlace de descarga alterado, de otra exportación o vencido. */
export class EnlaceDescargaInvalidoError extends ErrorDeNegocio {
  constructor(vencido: boolean) {
    super(
      vencido
        ? 'El enlace de descarga venció (dura 72 horas). Solicita una nueva exportación.'
        : 'El enlace de descarga no es válido',
      vencido ? 'NO_ENCONTRADO' : 'PROHIBIDO',
    );
  }
}

export class DatoInvalidoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RF-019: el familiar ya acompaña a ese estudiante (como responsable o vinculado). */
export class YaVinculadoError extends ErrorDeNegocio {
  constructor(alias: string) {
    super(`Ya acompañas a ${alias} desde tu cuenta`, 'CONFLICTO');
  }
}

/** SRS §7: cada estudiante tiene 1 responsable principal y hasta 2 familiares vinculados. */
export class LimiteFamiliaresError extends ErrorDeNegocio {
  constructor(alias: string, maximo: number) {
    super(`${alias} ya tiene ${maximo} familiares vinculados. Si hace falta un cambio, habla con su docente.`, 'CONFLICTO');
  }
}
