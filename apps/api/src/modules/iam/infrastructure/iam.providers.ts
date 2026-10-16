import { randomUUID } from 'node:crypto';
import { Provider } from '@nestjs/common';

import {
  BUS_EVENTOS,
  BusEventos,
  CONTEXTO_AULA,
  PrismaService,
  RECOLECTOR_DATOS,
  RecolectorDatosEstudiante,
  ResolutorContextoAula,
} from '../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../application/casos-uso-iam';
import { IamFacade } from '../application/iam.facade';
import { EmisorSesiones } from '../application/services/emisor-sesiones';
import { ActualizarPerfilUseCase } from '../application/use-cases/actualizar-perfil.use-case';
import { AutenticarAdultoUseCase } from '../application/use-cases/autenticar-adulto.use-case';
import { AutenticarEstudianteUseCase } from '../application/use-cases/autenticar-estudiante.use-case';
import { CerrarSesionUseCase } from '../application/use-cases/cerrar-sesion.use-case';
import { ConfigurarMfaUseCase } from '../application/use-cases/configurar-mfa.use-case';
import { CrearPerfilEstudianteUseCase } from '../application/use-cases/crear-perfil-estudiante.use-case';
import { ContextoIngresoUseCase } from '../application/use-cases/contexto-ingreso.use-case';
import { DescargarExportacionUseCase } from '../application/use-cases/descargar-exportacion.use-case';
import { SolicitarExportacionUseCase } from '../application/use-cases/solicitar-exportacion.use-case';
import { IniciarMfaUseCase } from '../application/use-cases/iniciar-mfa.use-case';
import { ListarPerfilesUseCase } from '../application/use-cases/listar-perfiles.use-case';
import { ObtenerUsuarioActualUseCase } from '../application/use-cases/obtener-usuario-actual.use-case';
import { RecuperarContrasenaUseCase } from '../application/use-cases/recuperar-contrasena.use-case';
import { RegistrarConsentimientoUseCase } from '../application/use-cases/registrar-consentimiento.use-case';
import { RegistrarCuentaUseCase } from '../application/use-cases/registrar-cuenta.use-case';
import { RenovarSesionUseCase } from '../application/use-cases/renovar-sesion.use-case';
import { RestablecerContrasenaUseCase } from '../application/use-cases/restablecer-contrasena.use-case';
import { RestablecerPinUseCase } from '../application/use-cases/restablecer-pin.use-case';
import { SolicitarEliminacionUseCase } from '../application/use-cases/solicitar-eliminacion.use-case';
import { ValidarAccesoUseCase } from '../application/use-cases/validar-acceso.use-case';
import { VerificarCorreoUseCase } from '../application/use-cases/verificar-correo.use-case';
import { VincularDispositivoUseCase } from '../application/use-cases/vincular-dispositivo.use-case';
import { ConsolaCorreoService, SmtpCorreoService } from './correo/correo.services';
import { Argon2HashService } from './crypto/argon2-hash.service';
import { HmacFirmador } from './crypto/hmac-firmador';
import { JwtTokenService } from './crypto/jwt-token.service';
import { OtplibTotpService } from './crypto/otplib-totp.service';
import { PdfLibGenerador } from './export/pdf-lib-generador';
import { ListaContrasenasFiltradas } from './passwords/lista-contrasenas-filtradas';
import { PrismaAlmacenExportaciones } from './persistence/prisma-almacen-exportaciones';
import { PrismaConsentimientoRepository } from './persistence/prisma-consentimiento-repository';
import { PrismaCuentaRepository } from './persistence/prisma-cuenta-repository';
import { PrismaDispositivoRepository } from './persistence/prisma-dispositivo-repository';
import { PrismaPerfilEstudianteRepository } from './persistence/prisma-perfil-estudiante-repository';
import { PrismaSesionRepository } from './persistence/prisma-sesion-repository';
import { PrismaVerificacionRepository } from './persistence/prisma-verificacion-repository';

/** Lee la configuración de IAM del entorno (apps/api/.env). */
function configuracion() {
  const jwtSecret = process.env['JWT_SECRET'] ?? '';
  return {
    jwtSecret,
    urlWeb: process.env['WEB_ORIGIN'] ?? 'http://localhost:3002',
    smtpHost: process.env['SMTP_HOST'],
    smtpPuerto: Number(process.env['SMTP_PORT'] ?? 587),
    smtpUsuario: process.env['SMTP_USER'],
    smtpContrasena: process.env['SMTP_PASS'],
    remitente: process.env['CORREO_REMITENTE'] ?? 'LectoAventura <no-responder@lectoaventura.pe>',
  };
}

/**
 * Composition root de IAM: vincula cada puerto con su adaptador y ensambla los casos de uso.
 */
export function crearCasosUsoIam(
  prisma: PrismaService,
  bus: BusEventos,
  recolector: RecolectorDatosEstudiante,
  contextoAula: ResolutorContextoAula,
): CasosUsoIam {
  const config = configuracion();
  const ahora = () => new Date();
  const generarId = () => randomUUID();

  const cuentas = new PrismaCuentaRepository(prisma);
  const perfiles = new PrismaPerfilEstudianteRepository(prisma);
  const consentimientos = new PrismaConsentimientoRepository(prisma);
  const verificaciones = new PrismaVerificacionRepository(prisma);
  const sesiones = new PrismaSesionRepository(prisma);
  const dispositivos = new PrismaDispositivoRepository(prisma);

  const hash = new Argon2HashService();
  const tokens = new JwtTokenService(config.jwtSecret);
  const totp = new OtplibTotpService();
  const filtradas = new ListaContrasenasFiltradas();
  const exportaciones = new PrismaAlmacenExportaciones(prisma);
  const firmador = new HmacFirmador(config.jwtSecret, 'exportaciones');

  const bandejaDesarrollo = config.smtpHost ? null : new ConsolaCorreoService();
  const correo = config.smtpHost
    ? new SmtpCorreoService(
        { host: config.smtpHost, puerto: config.smtpPuerto, usuario: config.smtpUsuario, contrasena: config.smtpContrasena },
        config.remitente,
      )
    : (bandejaDesarrollo as ConsolaCorreoService);

  const emisor = new EmisorSesiones(sesiones, tokens, generarId, ahora);

  const registrarConsentimiento = new RegistrarConsentimientoUseCase(cuentas, consentimientos, bus, generarId, ahora);
  const crearPerfil = new CrearPerfilEstudianteUseCase(cuentas, perfiles, consentimientos, hash, bus, generarId, ahora);
  const autenticarEstudiante = new AutenticarEstudianteUseCase(perfiles, dispositivos, contextoAula, hash, tokens, emisor, bus, ahora);
  const restablecerPin = new RestablecerPinUseCase(perfiles, sesiones, hash, bus, ahora);

  return {
    registrarCuenta: new RegistrarCuentaUseCase(
      cuentas, verificaciones, hash, filtradas, tokens, correo, bus, config.urlWeb, generarId, ahora,
    ),
    verificarCorreo: new VerificarCorreoUseCase(cuentas, verificaciones, tokens, bus, ahora),
    autenticarAdulto: new AutenticarAdultoUseCase(cuentas, hash, totp, emisor),
    recuperarContrasena: new RecuperarContrasenaUseCase(cuentas, verificaciones, tokens, correo, config.urlWeb, generarId, ahora),
    restablecerContrasena: new RestablecerContrasenaUseCase(
      cuentas, verificaciones, hash, filtradas, tokens, sesiones, bus, ahora,
    ),
    renovarSesion: new RenovarSesionUseCase(sesiones, tokens, emisor, bus, ahora),
    cerrarSesion: new CerrarSesionUseCase(sesiones, ahora),
    validarAcceso: new ValidarAccesoUseCase(sesiones, tokens, ahora),
    iniciarMfa: new IniciarMfaUseCase(cuentas, totp),
    configurarMfa: new ConfigurarMfaUseCase(cuentas, sesiones, totp, tokens, emisor, bus, ahora),
    obtenerUsuarioActual: new ObtenerUsuarioActualUseCase(cuentas, perfiles, ahora),
    registrarConsentimiento,
    consentimientos,
    crearPerfil,
    listarPerfiles: new ListarPerfilesUseCase(perfiles, ahora),
    actualizarPerfil: new ActualizarPerfilUseCase(perfiles, sesiones, bus, ahora),
    restablecerPin,
    solicitarExportacion: new SolicitarExportacionUseCase(
      perfiles, consentimientos, recolector, exportaciones, new PdfLibGenerador(), firmador, bus, generarId, ahora,
    ),
    descargarExportacion: new DescargarExportacionUseCase(exportaciones, firmador, ahora),
    solicitarEliminacion: new SolicitarEliminacionUseCase(perfiles, sesiones, bus, ahora),
    vincularDispositivo: new VincularDispositivoUseCase(cuentas, dispositivos, contextoAula, tokens, bus, generarId, ahora),
    contextoIngreso: new ContextoIngresoUseCase(perfiles, dispositivos, contextoAula, tokens, ahora),
    autenticarEstudiante,
    facade: new IamFacade(cuentas, perfiles, registrarConsentimiento, crearPerfil, restablecerPin, ahora),
    bandejaDesarrollo,
  };
}

export const iamProviders: Provider[] = [
  {
    provide: CASOS_USO_IAM,
    useFactory: crearCasosUsoIam,
    inject: [PrismaService, BUS_EVENTOS, RECOLECTOR_DATOS, CONTEXTO_AULA],
  },
  {
    provide: IamFacade,
    useFactory: (casos: CasosUsoIam) => casos.facade,
    inject: [CASOS_USO_IAM],
  },
];
