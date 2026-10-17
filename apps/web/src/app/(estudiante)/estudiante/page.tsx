'use client';

import { AVATARES, EscenaMundo, Icono, Mascota, Paisaje, TonoMundo } from '@lectoaventura/ui';

import { MisionesDelDocente } from '@/features/escuela/MisionesDelDocente';
import { useSesion } from '@/shared/auth/sesion';

/** Los 5 mundos del mapa de aventuras (SRS §1, RF-030). Se desbloquean con el módulo Aventura. */
const MUNDOS: { nombre: string; tono: TonoMundo }[] = [
  { nombre: 'Explorador', tono: 'bosque' },
  { nombre: 'Detective', tono: 'valle' },
  { nombre: 'Investigador', tono: 'montana' },
  { nombre: 'Crítico', tono: 'desierto' },
  { nombre: 'Maestro de la Lectura', tono: 'cielo' },
];

/**
 * Inicio del estudiante con la identidad aprobada. Solo muestra datos reales: alias y avatar.
 * Las misiones que deja la docente aparecen como "Misión del docente" (RF-018); la racha y las
 * monedas aparecerán cuando existan los módulos que las generan.
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
          ¡Tu aventura ya viene!
        </p>
        <Paisaje className="est-heroe__paisaje" />
      </section>

      <MisionesDelDocente />

      <section className="est-preparando">
        <Mascota tamano={96} flota />
        <div>
          <h2>Tu mapa de aventuras se está preparando</h2>
          <p>Muy pronto podrás elegir tu primera lectura, ganar estrellas y abrir nuevos mundos.</p>
        </div>
      </section>

      <section className="est-mundos" aria-labelledby="mundos-titulo">
        <div className="est-mundos__cabecera">
          <Icono nombre="globo" tamano={40} />
          <h2 id="mundos-titulo">Tus mundos</h2>
        </div>
        <ul className="est-mundos__lista">
          {MUNDOS.map((m, i) => (
            <li key={m.nombre} className="est-mundo">
              <span className="est-mundo__escena">
                <EscenaMundo tono={m.tono} />
                <span className="est-mundo__candado">
                  <Icono nombre="candado" tamano={22} />
                </span>
              </span>
              <span className="est-mundo__texto">
                <span className="est-mundo__numero">Mundo {i + 1}</span>
                <span className="est-mundo__nombre">{m.nombre}</span>
                <span className="est-mundo__estado">Muy pronto</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
