import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { MISION_EN_CURSO, RegistroMisionEnCurso } from '../../shared-kernel/public-api';
import { CASOS_USO_AVENTURA, CasosUsoAventura } from '../application/casos-uso-aventura';

/**
 * Aventura registra en el shared-kernel cuál es la lectura que sigue en la misión en curso del
 * niño (la primera misión sin completar de su mundo actual), para que Progreso la recomiende (RN-20).
 */
@Injectable()
export class MisionEnCursoRegistro implements OnModuleInit {
  constructor(
    @Inject(CASOS_USO_AVENTURA) private readonly aventura: CasosUsoAventura,
    @Inject(MISION_EN_CURSO) private readonly registro: RegistroMisionEnCurso,
  ) {}

  onModuleInit(): void {
    this.registro.registrar({
      lecturaSiguiente: async (estudianteId) => {
        // Sin perfil o sin mapa todavía (RN-05), no hay misión en curso.
        const mapa = await this.aventura.mapa.mapa(estudianteId).catch(() => null);
        const actual = mapa?.mundos.find((m) => m.numero === mapa.mundoActual);
        if (!actual) return null;
        const { misiones } = await this.aventura.mapa.misiones(estudianteId, actual.id);
        for (const m of [...misiones].sort((a, b) => a.orden - b.orden)) {
          if (m.estado === 'COMPLETADA') continue;
          const lectura = m.lecturas.find((l) => l.avance === 'EN_CURSO') ?? m.lecturas.find((l) => l.avance === 'PENDIENTE');
          if (lectura) return { misionId: m.id, mision: m.titulo, lecturaId: lectura.id, enCurso: lectura.avance === 'EN_CURSO' };
        }
        return null;
      },
    });
  }
}
