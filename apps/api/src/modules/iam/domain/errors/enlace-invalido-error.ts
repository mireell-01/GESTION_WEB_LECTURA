import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** Por qué no sirve un enlace, para que la pantalla explique qué hacer (RF-002, RF-004). */
export type MotivoEnlaceInvalido = 'VENCIDO' | 'REEMPLAZADO' | 'INVALIDO';

const MENSAJES: Record<MotivoEnlaceInvalido, string> = {
  VENCIDO: 'Este enlace venció. Pide uno nuevo.',
  REEMPLAZADO: 'Este enlace fue reemplazado por uno más nuevo. Usa el último correo que te enviamos.',
  INVALIDO: 'El enlace no es válido, ya fue usado o venció',
};

export class EnlaceInvalidoError extends ErrorDeNegocio {
  constructor(motivo: MotivoEnlaceInvalido = 'INVALIDO') {
    super(MENSAJES[motivo], 'VALIDACION', { motivo });
  }
}
