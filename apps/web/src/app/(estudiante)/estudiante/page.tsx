'use client';

import { AVATARES, Icono, Paisaje } from '@lectoaventura/ui';

import { MapaMundos } from '@/features/aventura/MapaMundos';
import { TarjetaReto } from '@/features/diagnostico/TarjetaReto';
import { MisionesDelDocente } from '@/features/escuela/MisionesDelDocente';
import { MarcadorLector } from '@/features/gamificacion/MarcadorLector';
import { RetoDelDia } from '@/features/gamificacion/RetoDelDia';
import { useSesion } from '@/shared/auth/sesion';

/**
 * Inicio del estudiante con la identidad aprobada. Solo muestra datos reales: alias, avatar, las
 * misiones que deja la docente ("Misión del docente", RF-018), su reto pendiente (RF-034, RF-037), su
 * mapa de aventuras (RF-030) y, desde el Módulo 8, su nivel, racha y monedas con el reto del día (RF-057,
 * RF-060 a RF-062).
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
        <MarcadorLector />
        <Paisaje className="est-heroe__paisaje" />
      </section>

      <TarjetaReto />

      <RetoDelDia />

      <MisionesDelDocente />

      <MapaMundos />
    </div>
  );
}
