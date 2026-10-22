'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { clasesBoton, Icono } from '@lectoaventura/ui';

import { api } from '@/shared/api/client';

import { diaEnPalabras, MisionDelDocente } from './tipos';

/**
 * RF-018: lo que la docente le dejó al niño, con el indicador "Misión del docente".
 * Si no hay nada en curso (o falla la consulta), no ocupa lugar en su inicio.
 */
export function MisionesDelDocente() {
  const [misiones, setMisiones] = useState<MisionDelDocente[]>([]);

  useEffect(() => {
    api<MisionDelDocente[]>('/yo/asignaciones')
      .then(setMisiones)
      .catch(() => setMisiones([]));
  }, []);

  if (misiones.length === 0) return null;

  return (
    <section className="est-misiones" aria-labelledby="misiones-titulo">
      <div className="est-mundos__cabecera">
        <Icono nombre="estrella" tamano={40} />
        <h2 id="misiones-titulo">Misiones de tu profe</h2>
      </div>
      <ul className="est-misiones__lista">
        {misiones.map((m) => (
          <li key={m.id} className="est-mision">
            <span className={`est-mision__icono est-mision__icono--${m.tipo.toLowerCase()}`}>
              <Icono nombre={m.tipo === 'LECTURA' ? 'libro' : 'brujula'} tamano={34} />
            </span>
            <span className="est-mision__texto">
              <span className="est-mision__sello">Misión del docente</span>
              <span className="est-mision__titulo">{m.titulo}</span>
              <span className="est-mision__fecha">
                <Icono nombre="reloj" tamano={20} />
                Hasta el {diaEnPalabras(m.fechaLimite)}
              </span>
            </span>
            {m.tipo === 'LECTURA' ? (
              <Link href={`/estudiante/lecturas/${m.contenidoId}?asignacion=${m.id}`} className={clasesBoton('primario', { tamano: 'pequeno' })} aria-label={`Leer ${m.titulo}`}>
                Leer
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
