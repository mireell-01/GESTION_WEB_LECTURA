'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alerta, BarraProgreso, Boton, Cargando, clasesBoton, Icono } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { ArteRecompensa, AvatarLector } from './AvatarLector';
import { EstanteLecturas, PuntosDeHoy, RutaDeMundos } from './RecuerdosPasaporte';
import { RetoDelDia } from './RetoDelDia';
import { EMOJI_INSIGNIA, Insignia, Pasaporte as DatosPasaporte, PISTA_INSIGNIA, Recompensa } from './tipos';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });

type Filtro = 'TODO' | 'ACCESORIO' | 'PERSONAJE';
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'TODO', texto: 'Todo' },
  { valor: 'ACCESORIO', texto: 'Accesorios' },
  { valor: 'PERSONAJE', texto: 'Personajes' },
];

/**
 * RF-062: la tienda de personajes y accesorios; se paga con monedas, nunca con puntos de nivel. Lo que
 * canjea se usa: el accesorio lo luce su avatar y el personaje lo acompaña al leer.
 */
function Tienda({
  p,
  alCanjear,
  alUsar,
}: {
  p: DatosPasaporte;
  alCanjear: (r: Recompensa) => Promise<void>;
  alUsar: (r: Recompensa, usar: boolean) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('TODO');
  const visibles = p.recompensas.filter((r) => filtro === 'TODO' || r.tipo === filtro);
  const accion = async (r: Recompensa, hacer: () => Promise<void>) => {
    setOcupado(r.id);
    await hacer();
    setOcupado(null);
  };

  return (
    <section className="tienda-recompensas" aria-labelledby="tienda-titulo">
      <header className="tienda-recompensas__cabecera">
        <span className="tienda-recompensas__trofeo" aria-hidden="true">
          🏆
        </span>
        <div className="pila-sm">
          <h2 id="tienda-titulo">Tienda de recompensas</h2>
          <p className="texto-suave">Ganas 1 moneda por cada 10 puntos. ¡Canjear no te quita puntos ni nivel!</p>
        </div>
        <p className="tienda-recompensas__monedas">
          <span aria-hidden="true">🪙</span> Tus monedas: <b>{p.monedas}</b>
        </p>
      </header>

      <div className="tienda-recompensas__filtros" role="group" aria-label="Qué quieres ver">
        {FILTROS.map((f) => (
          <button key={f.valor} type="button" className="filtro-chip" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
            {f.texto}
          </button>
        ))}
      </div>

      <ul className="tienda" aria-label="Recompensas">
        {visibles.map((r) => {
          const faltan = r.costo - p.monedas;
          const personaje = r.tipo === 'PERSONAJE';
          const clases = ['tienda__item', r.tuya ? 'tienda__item--tuya' : '', r.puesta ? 'tienda__item--puesta' : '', !r.tuya && faltan <= 0 ? 'tienda__item--alcanza' : ''];
          return (
            <li key={r.id} className={clases.filter(Boolean).join(' ')}>
              <span className="tienda__vitrina" aria-hidden="true">
                <ArteRecompensa codigo={r.codigo} />
              </span>
              <span className="tienda__nombre">{r.nombre}</span>
              <span className={`tienda__tipo tienda__tipo--${personaje ? 'personaje' : 'accesorio'}`}>{personaje ? 'Personaje' : 'Accesorio'}</span>
              {r.tuya ? (
                <>
                  <span className="tienda__tuya">
                    <span aria-hidden="true">✓</span> ¡Es tuya!
                  </span>
                  {r.puesta ? (
                    <span className="tienda__uso">
                      <span className="tienda__en-uso">{personaje ? '✨ Te acompaña' : '✨ Lo llevas puesto'}</span>
                      <Boton
                        tamano="pequeno"
                        variante="fantasma"
                        disabled={ocupado !== null}
                        aria-label={`Quitar ${r.nombre}`}
                        onClick={() => accion(r, () => alUsar(r, false))}
                      >
                        Quitar
                      </Boton>
                    </span>
                  ) : (
                    <Boton tamano="pequeno" disabled={ocupado !== null} aria-label={`Usar ${r.nombre}`} onClick={() => accion(r, () => alUsar(r, true))}>
                      {personaje ? '¡Que me acompañe!' : '¡Ponérmelo!'}
                    </Boton>
                  )}
                </>
              ) : (
                <>
                  <Boton
                    tamano="pequeno"
                    variante={faltan > 0 ? 'secundario' : 'primario'}
                    className="tienda__precio"
                    disabled={faltan > 0 || ocupado !== null}
                    aria-label={`Canjear ${r.nombre} por ${r.costo} monedas`}
                    onClick={() => accion(r, () => alCanjear(r))}
                  >
                    🪙 {r.costo}
                  </Boton>
                  {faltan > 0 ? (
                    <span className="tienda__faltan">
                      <span className="tienda__mini-barra" aria-hidden="true">
                        <span style={{ width: `${Math.round((Math.max(0, p.monedas) / r.costo) * 100)}%` }} />
                      </span>
                      Te faltan {faltan}
                    </span>
                  ) : (
                    <span className="tienda__alcanza">¡Te alcanza!</span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** RF-058: cada insignia; al tocarla dice cómo se gana. Las de conteo muestran su avance. */
function TarjetaInsignia({ i }: { i: Insignia }) {
  const [abierta, setAbierta] = useState(false);
  const idPista = `pista-${i.codigo}`;
  const pista = PISTA_INSIGNIA[i.codigo] ?? i.descripcion;
  return (
    <li className={`insignia${i.ganada ? ' insignia--ganada' : ''}${abierta ? ' insignia--abierta' : ''}`}>
      <button type="button" className="insignia__boton" aria-expanded={abierta} aria-controls={idPista} onClick={() => setAbierta((a) => !a)}>
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
          <span className="insignia__estado insignia__estado--avance">
            <span className="insignia__barra" aria-hidden="true">
              <span style={{ width: `${Math.round((i.avance / Math.max(1, i.meta)) * 100)}%` }} />
            </span>
            {i.avance} de {i.meta}
          </span>
        ) : (
          <span className="insignia__estado">Por ganar</span>
        )}
        <span className="insignia__como">{abierta ? 'Cerrar' : i.ganada ? '¿Cómo la gané?' : '¿Cómo se gana?'}</span>
      </button>
      <p id={idPista} className="insignia__pista" hidden={!abierta}>
        <span aria-hidden="true">💡</span> {pista}
      </p>
    </li>
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
      setAviso({ tipo: 'exito', texto: `¡${r.nombre}: ya es tuya! Ahora puedes usarla.` });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  };

  const usar = async (r: Recompensa, poner: boolean) => {
    setAviso(null);
    try {
      await api(`/yo/recompensas/${r.id}/uso`, { metodo: poner ? 'PUT' : 'DELETE' });
      if (poner) setAviso({ tipo: 'exito', texto: r.tipo === 'PERSONAJE' ? `¡${r.nombre} te acompañará cuando leas!` : `¡Te pusiste ${r.nombre}!` });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  };

  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!p) return <Cargando texto="Abriendo tu pasaporte…" />;

  const ganadas = p.insignias.filter((i) => i.ganada).length;
  const tramo = Math.max(1, p.nivel.hasta - p.nivel.desde);
  return (
    <div className="pila pasaporte">
      <section className="pasaporte__portada" aria-labelledby="pasaporte-titulo">
        <AvatarLector avatar={p.avatar} accesorio={p.puestas?.accesorio} personaje={p.puestas?.personaje} className="pasaporte__avatar" />
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
        <p className="texto-suave">Toca una insignia para saber cómo se gana.</p>
        <ul className="insignias" aria-label="Insignias">
          {p.insignias.map((i) => (
            <TarjetaInsignia key={i.codigo} i={i} />
          ))}
        </ul>
      </section>

      {/* Sus recuerdos de lector: la ruta de mundos sellada, su estante de libros y sus puntos de hoy. */}
      <RutaDeMundos completados={p.mundos} />
      <div className="pasaporte__recuerdos">
        <EstanteLecturas lecturas={p.lecturas} />
        <PuntosDeHoy p={p} />
      </div>

      {aviso ? <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta> : null}
      <Tienda p={p} alCanjear={canjear} alUsar={usar} />

      <div>
        <Link href="/estudiante/biblioteca" className={clasesBoton('secundario')}>
          <Icono nombre="libro" tamano={22} />
          Ir a mi biblioteca
        </Link>
      </div>
    </div>
  );
}
