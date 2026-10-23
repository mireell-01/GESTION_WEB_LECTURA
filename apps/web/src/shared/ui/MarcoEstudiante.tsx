'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';

import { Icono, Letrero, Mascota, NombreIcono } from '@lectoaventura/ui';

import { useSesion } from '../auth/sesion';

interface Seccion {
  texto: string;
  icono: NombreIcono;
  /** Ruta de la sección; sin ruta, la sección aún no existe y se muestra con candado. */
  href?: string;
}

/** Las secciones futuras se muestran con candado, como los mundos aún no desbloqueados. */
const SECCIONES: Seccion[] = [
  { texto: 'Inicio', icono: 'inicio', href: '/estudiante' },
  { texto: 'Biblioteca', icono: 'libro', href: '/estudiante/biblioteca' },
  { texto: 'Mundos', icono: 'globo', href: '/estudiante/mundos' },
  { texto: 'Progreso', icono: 'progreso', href: '/estudiante/progreso' },
  { texto: 'Pasaporte', icono: 'perfil', href: '/estudiante/pasaporte' },
];

/**
 * Marco de la experiencia del estudiante (tablet-first, RNF-022). Computadora: barra lateral
 * violeta con el letrero. Tablet horizontal: riel de íconos. Tablet vertical y celular: barra
 * superior con "Salir" y barra inferior al alcance del pulgar. Objetivos táctiles ≥ 48 px.
 */
export function MarcoEstudiante({ children }: { children: ReactNode }) {
  const { salir } = useSesion();
  const ruta = usePathname();
  const [aviso, setAviso] = useState('');
  const temporizador = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const cerrar = () => salir('/ingresar/estudiante');
  const proximamente = (seccion: string) => {
    setAviso(`${seccion} llegará muy pronto. ¡Sigue leyendo!`);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(''), 3000);
  };

  return (
    <div className="est">
      <header className="est-top">
        <span className="marca marca--clara marca--compacta">
          <Mascota tamano={38} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </span>
        <button type="button" className="est-top__salir" onClick={cerrar}>
          <Icono nombre="salir" tamano={22} />
          Salir
        </button>
      </header>

      <nav className="est-nav" aria-label="Secciones">
        <span className="marca marca--clara est-nav__marca">
          <Mascota tamano={64} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </span>
        <ul className="est-nav__lista">
          {SECCIONES.map((s) => (
            <li key={s.texto}>
              {s.href ? (
                <Link
                  href={s.href}
                  className="est-nav__item"
                  aria-current={ruta === s.href || (s.href !== '/estudiante' && ruta.startsWith(s.href)) ? 'page' : undefined}
                >
                  <span className="est-nav__icono">
                    <Icono nombre={s.icono} tamano={28} />
                  </span>
                  <span>{s.texto}</span>
                </Link>
              ) : (
                <button type="button" className="est-nav__item" data-bloqueado="" onClick={() => proximamente(s.texto)}>
                  <span className="est-nav__icono">
                    <Icono nombre={s.icono} tamano={28} />
                    <span className="est-nav__candado">
                      <Icono nombre="candado" tamano={14} />
                    </span>
                  </span>
                  <span>{s.texto}</span>
                  <span className="sr-only">, muy pronto</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="est-nav__salir" onClick={cerrar}>
          <Icono nombre="salir" tamano={24} />
          Salir
        </button>
        <Letrero className="est-nav__letrero" />
      </nav>

      <main className="est-main">{children}</main>

      <div className={`est-aviso${aviso ? ' est-aviso--visible' : ''}`} role="status" aria-live="polite">
        {aviso}
      </div>
    </div>
  );
}
