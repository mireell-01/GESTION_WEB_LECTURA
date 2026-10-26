import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { EVENTOS_AVENTURA } from '../../aventura/public-api';
import {
  BUS_EVENTOS,
  BusEventos,
  DatosItemRespondido,
  DatosMaestriaActualizada,
  DatosMaestriaNivelSubido,
  DatosSesionLectura,
  EVENTOS_INTEGRACION,
} from '../../shared-kernel/public-api';
import { CASOS_USO_GAMIFICACION, CasosUsoGamificacion } from '../application/casos-uso-gamificacion';

/** Lo que publica Aventura al completar un mundo (eventos-aventura.ts). */
interface DatosMundoDesbloqueado {
  estudianteId: string;
  mundoCompletado: number;
}

/**
 * Gamificación en el resto de la plataforma (SAD §6):
 *  - ItemRespondido → puntos por acertar, corregir tras pista o esforzarse en una abierta (RN-11, RN-19);
 *  - SesionLecturaFinalizada → +20, racha e insignias de lecturas;
 *  - MaestriaNivelSubido → +50; MaestriaActualizada → insignias por nivel de habilidad;
 *  - MundoDesbloqueado → insignia de rango.
 * Si un manejador falla, el evento queda pendiente en el outbox; al reintentarse no se cuenta dos veces.
 */
@Injectable()
export class IntegracionGamificacion implements OnModuleInit {
  constructor(
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
    @Inject(CASOS_USO_GAMIFICACION) private readonly casos: CasosUsoGamificacion,
  ) {}

  onModuleInit(): void {
    const logros = this.casos.logros;
    this.bus.suscribir<DatosItemRespondido>(EVENTOS_INTEGRACION.ITEM_RESPONDIDO, (e) => logros.alItem(e.datos));
    this.bus.suscribir<DatosSesionLectura>(EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA, (e) => logros.alLecturaFinalizada(e.datos));
    this.bus.suscribir<DatosMaestriaNivelSubido>(EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO, (e) => logros.alNivelSubido(e.datos));
    this.bus.suscribir<DatosMaestriaActualizada>(EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, (e) => logros.alMaestria(e.datos));
    this.bus.suscribir<DatosMundoDesbloqueado>(EVENTOS_AVENTURA.MUNDO_DESBLOQUEADO, (e) => logros.alMundo(e.datos));
  }
}
