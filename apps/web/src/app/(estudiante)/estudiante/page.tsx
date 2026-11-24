'use client';

import { Icono, Paisaje } from '@lectoaventura/ui';

import { MapaMundos } from '@/features/aventura/MapaMundos';
import { TarjetaReto } from '@/features/diagnostico/TarjetaReto';
import { MensajesDeMiProfe } from '@/features/escuela/MensajesDeMiProfe';
import { MisionesDelDocente } from '@/features/escuela/MisionesDelDocente';
import { AvatarLector, useApariencia } from '@/features/gamificacion/AvatarLector';
import { CopaLectora } from '@/features/gamificacion/CopaLectora';
import { MarcadorLector } from '@/features/gamificacion/MarcadorLector';
import { RetoDelDia } from '@/features/gamificacion/RetoDelDia';
import { useSesion } from '@/shared/auth/sesion';

/**
 * Inicio del estudiante con la identidad aprobada. Solo muestra datos reales: alias, avatar, las
 * misiones que deja la docente ("Misión del docente", RF-018), su reto pendiente (RF-034, RF-037), su
 * mapa de aventuras (RF-030) y, desde el Módulo 8, su nivel, racha y monedas con el reto del día (RF-057,
 * RF-060 a RF-062), con el accesorio que lleva puesto, los mensajitos de su docente y la Copa Lectora del aula.
 * El camino de los mundos va arriba, como protagonista, con su avatar sobre el mundo donde está.
 */
export default function EstudianteHomePage() {
  const { usuario } = useSesion();
  const apariencia = useApariencia();

  return (
    <div className="est-inicio">
      <section className="est-heroe" aria-labelledby="saludo">
        <AvatarLector
          avatar={apariencia?.avatar ?? usuario?.avatar ?? ''}
          accesorio={apariencia?.accesorio}
          personaje={apariencia?.personaje}
          className="est-heroe__avatar"
        />
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

      <MensajesDeMiProfe />

      <TarjetaReto />

      <MapaMundos
        lector={{
          avatar: apariencia?.avatar ?? usuario?.avatar ?? '',
          accesorio: apariencia?.accesorio,
          personaje: apariencia?.personaje,
        }}
      />

      <RetoDelDia />

      <CopaLectora />

      <MisionesDelDocente />
    </div>
  );
}
