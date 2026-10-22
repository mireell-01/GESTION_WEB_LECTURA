'use client';

import { AVATARES, Icono, Paisaje } from '@lectoaventura/ui';

import { MapaMundos } from '@/features/aventura/MapaMundos';
import { TarjetaReto } from '@/features/diagnostico/TarjetaReto';
import { MisionesDelDocente } from '@/features/escuela/MisionesDelDocente';
import { useSesion } from '@/shared/auth/sesion';

/**
 * Inicio del estudiante con la identidad aprobada. Solo muestra datos reales: alias, avatar, las
 * misiones que deja la docente ("Misión del docente", RF-018), su reto pendiente (RF-034, RF-037) y su
 * mapa de aventuras (RF-030). La
 * racha y las monedas aparecerán cuando existan los módulos que las generan.
 */
export default function EstudianteHomePage() {
  const { usuario } = useSesion();
  const avatar = AVATARES[usuario?.avatar ?? ''] ?? { emoji: '🙂', nombre: 'Avatar', fondo: '#ede8ff' };

  return (
    <div className="est-inicio">
      <section className="est-heroe" aria-labelledby="saludo">
        <span className="est-heroe__avatar" role="img" aria-label={`Tu avatar: ${avatar.nombre}`} style={{ background: avatar.fondo }}>
          {avatar.emoji}
        </span>
        <h1 id="saludo">
          Hola, <span className="est-heroe__nombre">{usuario?.alias}</span>
        </h1>
        <p className="est-heroe__pildora">
          <Icono nombre="brujula" tamano={30} />
          ¡Tu aventura te espera!
        </p>
        <Paisaje className="est-heroe__paisaje" />
      </section>

      <TarjetaReto />

      <MisionesDelDocente />

      <MapaMundos />
    </div>
  );
}
