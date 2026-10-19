import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  BUS_EVENTOS,
  BusEventos,
  DatosDiagnosticoFinalizado,
  DatosMaestriaActualizada,
  DatosSesionLectura,
  EVENTOS_INTEGRACION,
} from '../../shared-kernel/public-api';
import { CASOS_USO_AVENTURA, CasosUsoAventura } from '../application/casos-uso-aventura';

/**
 * Aventura escucha a Diagnóstico, Lectura y Progreso (SAD §6). Hoy esos módulos aún no publican;
 * cuando lleguen, el mapa avanzará solo. Si un manejador falla, el evento queda pendiente en el outbox.
 */
@Injectable()
export class SuscripcionesAventura implements OnModuleInit {
  constructor(
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
    @Inject(CASOS_USO_AVENTURA) private readonly aventura: CasosUsoAventura,
  ) {}

  onModuleInit(): void {
    this.bus.suscribir<DatosDiagnosticoFinalizado>(EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO, (e) =>
      this.aventura.progreso.posicionarTrasDiagnostico(e.datos.estudianteId, e.datos.maestrias),
    );
    for (const evento of [EVENTOS_INTEGRACION.SESION_LECTURA_INICIADA, EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA]) {
      this.bus.suscribir<DatosSesionLectura>(evento, (e) => this.aventura.progreso.registrarAvance(e.datos.estudianteId, e.datos.lecturaId));
    }
    this.bus.suscribir<DatosMaestriaActualizada>(EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, (e) =>
      this.aventura.progreso.evaluarDesbloqueo(e.datos.estudianteId),
    );
  }
}
