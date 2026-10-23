'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alerta, AVATARES, BarraProgreso, Boton, Cargando, clasesBoton, Icono } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { RetoDelDia } from './RetoDelDia';
import { EMOJI_INSIGNIA, EMOJI_RECOMPENSA, motivoInfantil, Pasaporte as DatosPasaporte, Recompensa } from './tipos';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });

/** RF-062: la tienda de personajes y accesorios; se paga con monedas, nunca con puntos de nivel. */
function Tienda({ p, alCanjear }: { p: DatosPasaporte; alCanjear: (r: Recompensa) => Promise<void> }) {
  const [canjeando, setCanjeando] = useState<string | null>(null);
  return (
    <section className="pila-sm" aria-labelledby="tienda-titulo">
      <h2 id="tienda-titulo">Tienda de recompensas</h2>
      <p className="texto-suave">Ganas 1 moneda por cada 10 puntos. Canjear no te quita puntos ni nivel.</p>
      <ul className="tienda" aria-label="Recompensas">
        {p.recompensas.map((r) => {
          const faltan = r.costo - p.monedas;
          return (
            <li key={r.id} className={`tienda__item${r.tuya ? ' tienda__item--tuya' : ''}`}>
              <span className="tienda__emoji" aria-hidden="true">
                {EMOJI_RECOMPENSA[r.codigo] ?? '🎁'}
              </span>
              <span className="tienda__nombre">{r.nombre}</span>
              <span className="tienda__tipo">{r.tipo === 'PERSONAJE' ? 'Personaje' : 'Accesorio'}</span>
              {r.tuya ? (
                <span className="tienda__tuya">¡Es tuya!</span>
              ) : (
                <Boton
                  tamano="pequeno"
                  variante={faltan > 0 ? 'secundario' : 'primario'}
                  disabled={faltan > 0 || canjeando !== null}
                  aria-label={`Canjear ${r.nombre} por ${r.costo} monedas`}
                  onClick={async () => {
                    setCanjeando(r.id);
                    await alCanjear(r);
                    setCanjeando(null);
                  }}
                >
                  🪙 {r.costo}
                </Boton>
              )}
              {!r.tuya && faltan > 0 ? <span className="tienda__faltan">Te faltan {faltan}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * RF-059: el Pasaporte del Lector — su nivel con los puntos que faltan para el siguiente (RF-057), su
 * racha (RF-061), sus monedas, el reto del día (RF-060), las insignias ganadas y por ganar (RF-058), los
 * mundos completados, las lecturas que terminó y la tienda de recompensas (RF-062).
 */
export function Pasaporte() {
  const [p, setP] = useState<DatosPasaporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(
    () =>
      api<DatosPasaporte>('/yo/pasaporte')
        .then(setP)
        .catch((err) => setError(mensajeDeError(err))),
    [],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const canjear = async (r: Recompensa) => {
    setAviso(null);
    try {
      await api(`/yo/recompensas/${r.id}/canje`, { metodo: 'POST' });
      setAviso({ tipo: 'exito', texto: `¡${r.nombre}: ya es tuya!` });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  };

  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!p) return <Cargando texto="Abriendo tu pasaporte…" />;

  const avatar = AVATARES[p.avatar] ?? { emoji: '🙂', nombre: 'Avatar', fondo: '#ede8ff' };
  const ganadas = p.insignias.filter((i) => i.ganada).length;
  const tramo = Math.max(1, p.nivel.hasta - p.nivel.desde);
  return (
    <div className="pila pasaporte">
      <section className="pasaporte__portada" aria-labelledby="pasaporte-titulo">
        <span className="pasaporte__avatar" role="img" aria-label={`Tu avatar: ${avatar.nombre}`} style={{ background: avatar.fondo }}>
          {avatar.emoji}
        </span>
        <div className="pila-sm pasaporte__portada-texto">
          <h1 id="pasaporte-titulo">Pasaporte del Lector</h1>
          <p className="pasaporte__alias">{p.alias}</p>
          <p className="pasaporte__nivel">
            <span aria-hidden="true">⭐</span> Nivel {p.nivel.actual} de lector
          </p>
          <BarraProgreso valor={((p.puntos.total - p.nivel.desde) / tramo) * 100} etiqueta={`Camino al nivel ${p.nivel.actual + 1}`} color="var(--la-color-secundario)" />
          <p>
            Te faltan {p.nivel.faltan} puntos para el nivel {p.nivel.actual + 1}.
          </p>
        </div>
      </section>

      <ul className="pasaporte__cifras" aria-label="Tus números">
        <li>
          <span className="pasaporte__cifra">{p.puntos.total}</span> puntos
          <small>
            Hoy {p.puntos.hoy} de {p.puntos.topeDiario}
          </small>
        </li>
        <li>
          <span className="pasaporte__cifra">🔥 {p.racha.dias}</span> {p.racha.dias === 1 ? 'día seguido' : 'días seguidos'}
          <small>{p.racha.comodinDisponible ? 'Tienes 1 comodín esta semana' : 'Ya usaste el comodín de esta semana'}</small>
        </li>
        <li>
          <span className="pasaporte__cifra">🪙 {p.monedas}</span> {p.monedas === 1 ? 'moneda' : 'monedas'}
        </li>
        <li>
          <span className="pasaporte__cifra">📚 {p.lecturas.total}</span> {p.lecturas.total === 1 ? 'lectura' : 'lecturas'}
        </li>
      </ul>
      {!p.racha.leyoHoy ? <p className="texto-suave">Termina una lectura o tu reto del día para sumar un día más a tu racha.</p> : null}

      <RetoDelDia />

      <section className="pila-sm" aria-labelledby="insignias-titulo">
        <h2 id="insignias-titulo">
          Tus insignias <span className="texto-suave">({ganadas} de {p.insignias.length})</span>
        </h2>
        <ul className="insignias" aria-label="Insignias">
          {p.insignias.map((i) => (
            <li key={i.codigo} className={`insignia${i.ganada ? ' insignia--ganada' : ''}`}>
              <span className="insignia__sello" aria-hidden="true">
                {EMOJI_INSIGNIA[i.codigo] ?? '🏅'}
                {!i.ganada ? (
                  <span className="insignia__candado">
                    <Icono nombre="candado" tamano={14} />
                  </span>
                ) : null}
              </span>
              <span className="insignia__nombre">{i.nombre}</span>
              <span className="insignia__descripcion">{i.descripcion}</span>
              {i.ganada && i.otorgadaEn ? (
                <span className="insignia__estado">Ganada el {fecha(i.otorgadaEn)}</span>
              ) : i.meta !== null && i.avance !== null ? (
                <span className="insignia__estado">
                  {i.avance} de {i.meta}
                </span>
              ) : (
                <span className="insignia__estado">Por ganar</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="pasaporte__columnas">
        <section className="pila-sm" aria-labelledby="mundos-titulo">
          <h2 id="mundos-titulo">Mundos completados</h2>
          {p.mundos.length === 0 ? (
            <p className="texto-suave">Aún no completas un mundo. ¡Sigue tus misiones!</p>
          ) : (
            <ul className="pasaporte__lista" aria-label="Mundos completados">
              {p.mundos.map((m) => (
                <li key={m.numero}>
                  <Icono nombre="globo" tamano={22} /> {m.nombre}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="pila-sm" aria-labelledby="lecturas-titulo">
          <h2 id="lecturas-titulo">Lecturas que terminaste</h2>
          {p.lecturas.recientes.length === 0 ? (
            <p className="texto-suave">Cuando termines una lectura, aparecerá aquí.</p>
          ) : (
            <ul className="pasaporte__lista" aria-label="Lecturas terminadas">
              {p.lecturas.recientes.map((l) => (
                <li key={l.id}>
                  <Icono nombre="libro" tamano={22} /> {l.titulo} <span className="texto-suave">· {fecha(l.finalizadaEn)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {p.ultimosPuntos.length > 0 ? (
        <section className="pila-sm" aria-labelledby="puntos-titulo">
          <h2 id="puntos-titulo">Tus últimos puntos</h2>
          <ul className="pasaporte__lista" aria-label="Últimos puntos">
            {p.ultimosPuntos.map((u, n) => (
              <li key={`${u.creadoEn}-${n}`}>
                <span className="pasaporte__mas">+{u.puntos}</span> {motivoInfantil(u.motivo)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {aviso ? <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta> : null}
      <Tienda p={p} alCanjear={canjear} />

      <div>
        <Link href="/estudiante/biblioteca" className={clasesBoton('secundario')}>
          <Icono nombre="libro" tamano={22} />
          Ir a mi biblioteca
        </Link>
      </div>
    </div>
  );
}
