import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { DIAGNOSTICO_INICIAL, PrismaService, RegistroDiagnosticoInicial } from '../../shared-kernel/public-api';
import { itemsDe, maestriasDe } from '../domain/services/calculo-nivel';
import { PrismaDiagnosticoRepository } from './persistence/prisma-diagnostico-repository';

/**
 * Diagnóstico registra en el shared-kernel el resultado del reto inicial. Desde este momento rige
 * RN-05 en Aventura: sin el reto inicial terminado, el mapa no se habilita; terminado, el niño
 * empieza en el mundo que le corresponde (RF-033).
 */
@Injectable()
export class DiagnosticoInicialRegistro implements OnModuleInit {
  private readonly repo: PrismaDiagnosticoRepository;

  constructor(
    prisma: PrismaService,
    @Inject(DIAGNOSTICO_INICIAL) private readonly registro: RegistroDiagnosticoInicial,
  ) {
    this.repo = new PrismaDiagnosticoRepository(prisma);
  }

  onModuleInit(): void {
    this.registro.registrar({
      resultadoDe: async (estudianteId) => {
        const inicial = await this.repo.inicialDe(estudianteId);
        return inicial?.estado === 'FINALIZADO' && inicial.resultado
          ? { estado: 'FINALIZADO', maestrias: maestriasDe(inicial.resultado.habilidades), items: itemsDe(inicial.resultado.habilidades), diagnosticoId: inicial.id }
          : { estado: 'PENDIENTE' };
      },
    });
  }
}
