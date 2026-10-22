import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import {
  BUS_EVENTOS,
  BusEventos,
  DatosDiagnosticoFinalizado,
  DatosItemRespondido,
  DatosRespuestaAbiertaValorada,
  EVENTOS_INTEGRACION,
  MAESTRIA_LECTOR,
  NIVEL_LECTOR,
  RegistroMaestria,
  RegistroNivelLector,
} from '../../shared-kernel/public-api';
import { CASOS_USO_PROGRESO, CasosUsoProgreso } from '../application/casos-uso-progreso';

/**
 * Progreso en el resto de la plataforma (SAD §6):
 *  - escucha el reto inicial (inicializa el perfil), cada ítem cerrado de una lectura (RF-053) y cada
 *    respuesta abierta valorada (RN-19);
 *  - registra en el shared-kernel la maestría (Aventura desbloquea mundos, RN-09) y el nivel de
 *    lectura (la biblioteca muestra lo de su nivel ± 1, RF-028).
 * Si un manejador falla, el evento queda pendiente en el outbox para reintentarse (sin contar doble).
 */
@Injectable()
export class IntegracionProgreso implements OnModuleInit {
  constructor(
    @Inject(BUS_EVENTOS) private readonly bus: BusEventos,
    @Inject(CASOS_USO_PROGRESO) private readonly progreso: CasosUsoProgreso,
    @Inject(MAESTRIA_LECTOR) private readonly maestria: RegistroMaestria,
    @Inject(NIVEL_LECTOR) private readonly nivel: RegistroNivelLector,
  ) {}

  onModuleInit(): void {
    this.bus.suscribir<DatosDiagnosticoFinalizado>(
      EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO,
      (e) => this.progreso.perfil.alDiagnostico(e.datos),
    );
    this.bus.suscribir<DatosItemRespondido>(EVENTOS_INTEGRACION.ITEM_RESPONDIDO, (e) =>
      this.progreso.perfil.alItem(e.datos),
    );
    this.bus.suscribir<DatosRespuestaAbiertaValorada>(
      EVENTOS_INTEGRACION.RESPUESTA_ABIERTA_VALORADA,
      (e) => this.progreso.perfil.alValoracion(e.datos),
    );
    this.maestria.registrar({ maestriasDe: (id) => this.progreso.perfil.maestriasDe(id) });
    this.nivel.registrar({ nivelDe: (id) => this.progreso.perfil.nivelDe(id) });
  }
}
