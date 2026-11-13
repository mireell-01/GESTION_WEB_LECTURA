import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { EVENTOS_AVENTURA } from '../../aventura/public-api';
import { EVENTOS_CONTENIDO } from '../../contenido/public-api';
import { EVENTOS_ESCUELA } from '../../escuela/public-api';
import { EVENTOS_GAMIFICACION } from '../../gamificacion/public-api';
import { EVENTOS_IAM } from '../../iam/public-api';
import { BUS_EVENTOS, BusEventos, EventoDominio, ipDeLaSolicitud } from '../../shared-kernel/public-api';
import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../application/casos-uso-administracion';
import { AccionAuditada } from '../domain/services/acciones-auditadas';

interface DatosEvento {
  actorId?: string;
  estudianteId?: string;
  aulaId?: string;
  docenteId?: string;
  cantidad?: number;
  ip?: string | null;
  /** Cuando la acción la pueden hacer varios roles, el evento dice cuál fue. */
  rol?: string;
  tipo?: string;
}

type Recurso = (e: EventoDominio<DatosEvento>) => [string, string | null];

/** Cómo se audita cada evento: la acción, el rol de quien la hace (si el evento no lo dice) y el recurso. */
interface Regla {
  accion: AccionAuditada;
  actorRol: string | null;
  recurso: Recurso;
}

const agregado =
  (tipo: string): Recurso =>
  (e) => [tipo, e.agregadoId];
const estudiante: Recurso = (e) => ['perfil_estudiante', e.datos.estudianteId ?? null];

/** Acciones sensibles que se auditan (RF-077) y cómo se leen de su evento de dominio. */
const AUDITADOS: Record<string, Regla> = {
  // RF-019: la vinculación de un familiar queda auditada (y también quién emitió el código).
  [EVENTOS_ESCUELA.INVITACION_FAMILIAR_GENERADA]: { accion: 'INVITACION_FAMILIAR_GENERADA', actorRol: 'DOCENTE', recurso: estudiante },
  [EVENTOS_ESCUELA.FAMILIAR_VINCULADO]: { accion: 'FAMILIAR_VINCULADO', actorRol: 'FAMILIAR', recurso: estudiante },
  // RF-017: imprimir tarjetas cambia el PIN de los estudiantes elegidos.
  [EVENTOS_ESCUELA.TARJETAS_GENERADAS]: { accion: 'TARJETAS_ACCESO_GENERADAS', actorRol: 'DOCENTE', recurso: agregado('aula') },
  [EVENTOS_ESCUELA.ESTUDIANTE_RETIRADO]: { accion: 'ESTUDIANTE_RETIRADO', actorRol: 'DOCENTE', recurso: estudiante },
  [EVENTOS_ESCUELA.AULA_ARCHIVADA]: { accion: 'AULA_ARCHIVADA', actorRol: 'DOCENTE', recurso: agregado('aula') },
  // RF-076: instituciones.
  [EVENTOS_ESCUELA.INSTITUCION_CREADA]: { accion: 'INSTITUCION_CREADA', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('institucion') },
  [EVENTOS_ESCUELA.INSTITUCION_SUSPENDIDA]: { accion: 'INSTITUCION_SUSPENDIDA', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('institucion') },
  [EVENTOS_ESCUELA.INSTITUCION_REACTIVADA]: { accion: 'INSTITUCION_REACTIVADA', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('institucion') },
  // RF-026: cada transición del flujo de publicación queda auditada.
  [EVENTOS_CONTENIDO.ENVIADA_A_REVISION]: { accion: 'LECTURA_ENVIADA_A_REVISION', actorRol: 'EDITOR', recurso: agregado('lectura') },
  [EVENTOS_CONTENIDO.VERSION_PUBLICADA]: { accion: 'LECTURA_PUBLICADA', actorRol: 'REVISOR', recurso: agregado('lectura') },
  [EVENTOS_CONTENIDO.VERSION_RECHAZADA]: { accion: 'LECTURA_RECHAZADA', actorRol: 'REVISOR', recurso: agregado('lectura') },
  [EVENTOS_CONTENIDO.LECTURA_ARCHIVADA]: { accion: 'LECTURA_ARCHIVADA', actorRol: 'REVISOR', recurso: agregado('lectura') },
  [EVENTOS_CONTENIDO.VERSION_CREADA]: { accion: 'LECTURA_NUEVA_VERSION', actorRol: 'EDITOR', recurso: agregado('lectura') },
  // Módulo 4: cambios del recorrido de misiones que verán los niños.
  [EVENTOS_AVENTURA.MISION_CREADA]: { accion: 'MISION_CREADA', actorRol: 'EDITOR', recurso: agregado('mision') },
  [EVENTOS_AVENTURA.MISION_ACTUALIZADA]: { accion: 'MISION_ACTUALIZADA', actorRol: 'EDITOR', recurso: agregado('mision') },
  [EVENTOS_AVENTURA.MISIONES_REORDENADAS]: { accion: 'MISIONES_REORDENADAS', actorRol: 'EDITOR', recurso: agregado('mundo') },
  // Módulo 12 (SRS §8, Audit Logging): consentimientos, PIN, exportaciones, eliminaciones y cuentas.
  [EVENTOS_IAM.CONSENTIMIENTO_OTORGADO]: { accion: 'CONSENTIMIENTO_OTORGADO', actorRol: null, recurso: agregado('consentimiento') },
  [EVENTOS_IAM.PIN_RESTABLECIDO]: { accion: 'PIN_RESTABLECIDO', actorRol: null, recurso: agregado('perfil_estudiante') },
  [EVENTOS_IAM.CONTRASENA_RESTABLECIDA]: { accion: 'CONTRASENA_RESTABLECIDA', actorRol: null, recurso: agregado('cuenta_adulta') },
  [EVENTOS_IAM.MFA_CONFIGURADO]: { accion: 'MFA_CONFIGURADO', actorRol: null, recurso: agregado('cuenta_adulta') },
  [EVENTOS_IAM.REUTILIZACION_REFRESH]: { accion: 'SESION_REVOCADA_POR_REUTILIZACION', actorRol: null, recurso: agregado('sesion') },
  [EVENTOS_IAM.ESTUDIANTE_BLOQUEADO]: { accion: 'ESTUDIANTE_BLOQUEADO', actorRol: 'ESTUDIANTE', recurso: agregado('perfil_estudiante') },
  [EVENTOS_IAM.DISPOSITIVO_VINCULADO]: { accion: 'DISPOSITIVO_VINCULADO', actorRol: null, recurso: agregado('dispositivo') },
  [EVENTOS_IAM.PERFIL_DESACTIVADO]: { accion: 'PERFIL_DESACTIVADO', actorRol: null, recurso: agregado('perfil_estudiante') },
  [EVENTOS_IAM.DATOS_EXPORTADOS]: { accion: 'DATOS_EXPORTADOS', actorRol: null, recurso: agregado('perfil_estudiante') },
  [EVENTOS_IAM.PERFIL_ELIMINADO]: { accion: 'PERFIL_ELIMINADO', actorRol: null, recurso: agregado('perfil_estudiante') },
  [EVENTOS_IAM.DOCENTE_DADO_DE_ALTA]: { accion: 'DOCENTE_DADO_DE_ALTA', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('cuenta_adulta') },
  [EVENTOS_IAM.CUENTA_SUSPENDIDA]: { accion: 'CUENTA_SUSPENDIDA', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('cuenta_adulta') },
  [EVENTOS_IAM.CUENTA_REACTIVADA]: { accion: 'CUENTA_REACTIVADA', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('cuenta_adulta') },
  [EVENTOS_IAM.GOOGLE_VINCULADA]: { accion: 'CUENTA_GOOGLE_VINCULADA', actorRol: null, recurso: agregado('cuenta_adulta') },
  [EVENTOS_IAM.GOOGLE_DESVINCULADA]: { accion: 'CUENTA_GOOGLE_DESVINCULADA', actorRol: null, recurso: agregado('cuenta_adulta') },
  // RF-078
  [EVENTOS_GAMIFICACION.PARAMETROS_PUBLICADOS]: { accion: 'PARAMETROS_GAMIFICACION_PUBLICADOS', actorRol: 'ADMIN_PLATAFORMA', recurso: agregado('parametro_gamificacion') },
};

/** Los roles que pueden aparecer como actor (el `tipo` de un consentimiento no es un rol). */
const ROLES = new Set(['ESTUDIANTE', 'DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA']);

/**
 * Administración escucha los eventos de las acciones sensibles y las registra en `admin.auditoria`
 * (RF-077), con la IP de la solicitud que las originó. Si el registro falla, el evento queda
 * pendiente en el outbox para reintentarse.
 */
@Injectable()
export class AuditoriaSuscripciones implements OnModuleInit {
  constructor(
    @Inject(CASOS_USO_ADMINISTRACION) private readonly casos: CasosUsoAdministracion,
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
  ) {}

  onModuleInit(): void {
    for (const [evento, regla] of Object.entries(AUDITADOS)) {
      this.bus.suscribir<DatosEvento>(evento, async (e) => {
        const { ip, actorId, rol, ...datos } = e.datos;
        const [recursoTipo, recursoId] = regla.recurso(e);
        await this.casos.registrarAuditoria.ejecutar({
          actorId: actorId ?? null,
          actorRol: rol && ROLES.has(rol) ? rol : regla.actorRol,
          accion: regla.accion,
          recursoTipo,
          recursoId,
          ip: ip ?? ipDeLaSolicitud(),
          datos: { ...datos, evento: e.nombreEvento, agregadoId: e.agregadoId },
          ocurridoEn: e.ocurreEn,
        });
      });
    }
  }
}
