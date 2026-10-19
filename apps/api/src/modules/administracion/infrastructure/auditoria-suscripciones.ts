import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { EVENTOS_CONTENIDO } from '../../contenido/public-api';
import { EVENTOS_ESCUELA } from '../../escuela/public-api';
import { BUS_EVENTOS, BusEventos, EventoDominio, PrismaService, uuidV7 } from '../../shared-kernel/public-api';
import { RegistrarAuditoriaUseCase } from '../application/use-cases/registrar-auditoria.use-case';
import { PrismaAuditoriaRepository } from './persistence/prisma-auditoria-repository';

interface DatosEvento {
  actorId?: string;
  estudianteId?: string;
  aulaId?: string;
  docenteId?: string;
  cantidad?: number;
  ip?: string | null;
  /** Cuando la acción la pueden hacer varios roles, el evento dice cuál fue. */
  rol?: string;
}

/** Acciones sensibles que se auditan (RF-077) y cómo se leen de su evento de dominio. */
const AUDITADOS: Record<string, { accion: string; actorRol: string; recurso: (e: EventoDominio<DatosEvento>) => [string, string | null] }> = {
  // RF-019: la vinculación de un familiar queda auditada (y también quién emitió el código).
  [EVENTOS_ESCUELA.INVITACION_FAMILIAR_GENERADA]: {
    accion: 'INVITACION_FAMILIAR_GENERADA',
    actorRol: 'DOCENTE',
    recurso: (e) => ['perfil_estudiante', e.datos.estudianteId ?? null],
  },
  [EVENTOS_ESCUELA.FAMILIAR_VINCULADO]: {
    accion: 'FAMILIAR_VINCULADO',
    actorRol: 'FAMILIAR',
    recurso: (e) => ['perfil_estudiante', e.datos.estudianteId ?? null],
  },
  // RF-017: imprimir tarjetas cambia el PIN de los estudiantes elegidos.
  [EVENTOS_ESCUELA.TARJETAS_GENERADAS]: {
    accion: 'TARJETAS_ACCESO_GENERADAS',
    actorRol: 'DOCENTE',
    recurso: (e) => ['aula', e.agregadoId],
  },
  // RF-026: cada transición del flujo de publicación queda auditada.
  [EVENTOS_CONTENIDO.ENVIADA_A_REVISION]: { accion: 'LECTURA_ENVIADA_A_REVISION', actorRol: 'EDITOR', recurso: (e) => ['lectura', e.agregadoId] },
  [EVENTOS_CONTENIDO.VERSION_PUBLICADA]: { accion: 'LECTURA_PUBLICADA', actorRol: 'REVISOR', recurso: (e) => ['lectura', e.agregadoId] },
  [EVENTOS_CONTENIDO.VERSION_RECHAZADA]: { accion: 'LECTURA_RECHAZADA', actorRol: 'REVISOR', recurso: (e) => ['lectura', e.agregadoId] },
  [EVENTOS_CONTENIDO.LECTURA_ARCHIVADA]: { accion: 'LECTURA_ARCHIVADA', actorRol: 'REVISOR', recurso: (e) => ['lectura', e.agregadoId] },
  [EVENTOS_CONTENIDO.VERSION_CREADA]: { accion: 'LECTURA_NUEVA_VERSION', actorRol: 'EDITOR', recurso: (e) => ['lectura', e.agregadoId] },
};

/**
 * Administración escucha los eventos de las acciones sensibles y las registra en `admin.auditoria`
 * (RF-077). Si el registro falla, el evento queda pendiente en el outbox para reintentarse.
 */
@Injectable()
export class AuditoriaSuscripciones implements OnModuleInit {
  private readonly registrar: RegistrarAuditoriaUseCase;

  constructor(
    prisma: PrismaService,
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
  ) {
    this.registrar = new RegistrarAuditoriaUseCase(new PrismaAuditoriaRepository(prisma), () => uuidV7());
  }

  onModuleInit(): void {
    for (const [evento, regla] of Object.entries(AUDITADOS)) {
      this.bus.suscribir<DatosEvento>(evento, async (e) => {
        const { ip, actorId, ...datos } = e.datos;
        const [recursoTipo, recursoId] = regla.recurso(e);
        await this.registrar.ejecutar({
          actorId: actorId ?? null,
          actorRol: e.datos.rol ?? regla.actorRol,
          accion: regla.accion,
          recursoTipo,
          recursoId,
          ip: ip ?? null,
          datos: { ...datos, evento: e.nombreEvento, agregadoId: e.agregadoId },
          ocurridoEn: e.ocurreEn,
        });
      });
    }
  }
}
