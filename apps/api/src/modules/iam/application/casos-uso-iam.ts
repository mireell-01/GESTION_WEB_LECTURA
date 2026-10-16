import { IamFacade } from './iam.facade';
import { ConsentimientoRepository } from './ports/consentimiento.repository';
import { ActualizarPerfilUseCase } from './use-cases/actualizar-perfil.use-case';
import { AutenticarAdultoUseCase } from './use-cases/autenticar-adulto.use-case';
import { AutenticarEstudianteUseCase } from './use-cases/autenticar-estudiante.use-case';
import { CerrarSesionUseCase } from './use-cases/cerrar-sesion.use-case';
import { ConfigurarMfaUseCase } from './use-cases/configurar-mfa.use-case';
import { ContextoIngresoUseCase } from './use-cases/contexto-ingreso.use-case';
import { CrearPerfilEstudianteUseCase } from './use-cases/crear-perfil-estudiante.use-case';
import { DescargarExportacionUseCase } from './use-cases/descargar-exportacion.use-case';
import { IniciarMfaUseCase } from './use-cases/iniciar-mfa.use-case';
import { ListarPerfilesUseCase } from './use-cases/listar-perfiles.use-case';
import { ObtenerUsuarioActualUseCase } from './use-cases/obtener-usuario-actual.use-case';
import { RecuperarContrasenaUseCase } from './use-cases/recuperar-contrasena.use-case';
import { ReenviarVerificacionUseCase } from './use-cases/reenviar-verificacion.use-case';
import { RegistrarConsentimientoUseCase } from './use-cases/registrar-consentimiento.use-case';
import { RegistrarCuentaUseCase } from './use-cases/registrar-cuenta.use-case';
import { RenovarSesionUseCase } from './use-cases/renovar-sesion.use-case';
import { RestablecerContrasenaUseCase } from './use-cases/restablecer-contrasena.use-case';
import { RestablecerPinUseCase } from './use-cases/restablecer-pin.use-case';
import { SolicitarEliminacionUseCase } from './use-cases/solicitar-eliminacion.use-case';
import { SolicitarExportacionUseCase } from './use-cases/solicitar-exportacion.use-case';
import { ValidarAccesoUseCase } from './use-cases/validar-acceso.use-case';
import { VerificarCorreoUseCase } from './use-cases/verificar-correo.use-case';
import { VincularDispositivoUseCase } from './use-cases/vincular-dispositivo.use-case';

/** Correos retenidos en desarrollo cuando no hay SMTP configurado. */
export interface BandejaDesarrollo {
  correos(): { para: string; asunto: string; texto: string; enlace?: string; enviadoEn: string }[];
}

/** Casos de uso de IAM ya ensamblados (composition root en infrastructure/iam.providers.ts). */
export interface CasosUsoIam {
  registrarCuenta: RegistrarCuentaUseCase;
  verificarCorreo: VerificarCorreoUseCase;
  reenviarVerificacion: ReenviarVerificacionUseCase;
  autenticarAdulto: AutenticarAdultoUseCase;
  recuperarContrasena: RecuperarContrasenaUseCase;
  restablecerContrasena: RestablecerContrasenaUseCase;
  renovarSesion: RenovarSesionUseCase;
  cerrarSesion: CerrarSesionUseCase;
  validarAcceso: ValidarAccesoUseCase;
  iniciarMfa: IniciarMfaUseCase;
  configurarMfa: ConfigurarMfaUseCase;
  obtenerUsuarioActual: ObtenerUsuarioActualUseCase;
  registrarConsentimiento: RegistrarConsentimientoUseCase;
  consentimientos: ConsentimientoRepository;
  crearPerfil: CrearPerfilEstudianteUseCase;
  listarPerfiles: ListarPerfilesUseCase;
  actualizarPerfil: ActualizarPerfilUseCase;
  restablecerPin: RestablecerPinUseCase;
  solicitarExportacion: SolicitarExportacionUseCase;
  descargarExportacion: DescargarExportacionUseCase;
  solicitarEliminacion: SolicitarEliminacionUseCase;
  vincularDispositivo: VincularDispositivoUseCase;
  contextoIngreso: ContextoIngresoUseCase;
  autenticarEstudiante: AutenticarEstudianteUseCase;
  facade: IamFacade;
  bandejaDesarrollo: BandejaDesarrollo | null;
}

export const CASOS_USO_IAM = Symbol('CASOS_USO_IAM');
