'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { fechaHora, ParametrosEditables, ParametrosVigentes, Rango, VersionParametros } from './tipos';

/** El formulario guarda texto (se puede borrar un número para escribir otro); al publicar se convierte. */
type Formulario = {
  puntos: Record<Exclude<keyof ParametrosEditables['puntos'], 'racha'>, string>;
  racha: { dias: string; bono: string }[];
  antiFarming: Record<keyof ParametrosEditables['antiFarming'], string>;
  base: string;
  palabras: Record<keyof ParametrosEditables['respuestasAbiertas'], string>;
  insignias: Record<string, string>;
};

const PUNTOS: [keyof Formulario['puntos'], string][] = [
  ['itemCorrecto', 'Respuesta correcta'],
  ['correctoTrasPista', 'Correcta después de una pista'],
  ['lecturaCompletada', 'Lectura terminada'],
  ['retoDelDia', 'Reto del día'],
  ['subidaNivelCneb', 'Subir de nivel en una habilidad'],
];

const UNIDAD = { LECTURAS: 'lecturas', EVIDENCIAS: 'evidencias', RACHA: 'días seguidos' } as const;

function aFormulario(v: ParametrosVigentes): Formulario {
  const p = v.parametros;
  const texto = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, n]) => [k, String(n)])) as Record<keyof T, string>;
  const { racha, ...puntos } = p.puntos;
  return {
    puntos: texto(puntos),
    racha: Object.entries(racha)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dias, bono]) => ({ dias, bono: String(bono) })),
    antiFarming: texto(p.antiFarming),
    base: String(p.nivelLector.base),
    palabras: texto(p.respuestasAbiertas),
    insignias: Object.fromEntries(v.insignias.map((i) => [i.codigo, String(i.umbral)])),
  };
}

function aParametros(f: Formulario): ParametrosEditables {
  const numero = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const numeros = <T extends Record<string, string>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, numero(s)])) as Record<keyof T, number>;
  return {
    puntos: { ...numeros(f.puntos), racha: Object.fromEntries(f.racha.map((r) => [r.dias.trim(), numero(r.bono)])) },
    antiFarming: numeros(f.antiFarming),
    nivelLector: { base: numero(f.base) },
    respuestasAbiertas: numeros(f.palabras),
    insignias: numeros(f.insignias),
  };
}

const ayuda = (r: Rango) => `Entre ${r.min} y ${r.max}`;

/**
 * RF-078: la administración ajusta puntos, topes, nivel lector, palabras mínimas y umbrales de las
 * insignias. Cada publicación es una versión nueva que aplica solo a lo que ocurra desde ese momento.
 */
export function ParametrosGamificacion() {
  const [vigentes, setVigentes] = useState<ParametrosVigentes | null>(null);
  const [historial, setHistorial] = useState<VersionParametros[]>([]);
  const [f, setF] = useState<Formulario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const cargar = async () => {
    const [v, h] = await Promise.all([api<ParametrosVigentes>('/admin/parametros-gamificacion'), api<VersionParametros[]>('/admin/parametros-gamificacion/historial')]);
    setVigentes(v);
    setHistorial(h);
    setF(aFormulario(v));
  };

  useEffect(() => {
    cargar().catch((err) => setError(mensajeDeError(err)));
  }, []);

  const pedirConfirmacion = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setConfirmando(true);
  };

  const publicar = async () => {
    if (!f) return;
    setPublicando(true);
    setError(null);
    try {
      const v = await api<ParametrosVigentes>('/admin/parametros-gamificacion', { metodo: 'PUT', cuerpo: aParametros(f) });
      await cargar();
      setAviso(`Publicada la versión ${v.version}: se aplica desde ahora. Los logros ya otorgados no cambian.`);
      setConfirmando(false);
    } catch (err) {
      setError(mensajeDeError(err));
      setConfirmando(false);
    } finally {
      setPublicando(false);
    }
  };

  if (!vigentes || !f) {
    return <Tarjeta titulo="Gamificación">{error ? <Alerta tipo="error">{error}</Alerta> : <Cargando />}</Tarjeta>;
  }
  const l = vigentes.limites;
  const numero = (valor: string, cambiar: (v: string) => void, etiqueta: string, rango: Rango) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda(rango)} type="number" inputMode="numeric" min={rango.min} max={rango.max} step={1} required value={valor} onChange={(e) => cambiar(e.target.value)} />
  );

  return (
    <div className="pila">
      <Tarjeta
        nivel={1}
        titulo={
          <span className="titulo-con-icono">
            <Icono nombre="estrella" tamano={30} />
            Gamificación
          </span>
        }
      >
        <p className="texto-suave" style={{ margin: 0 }}>
          Versión vigente: <b>{vigentes.version}</b>
          {vigentes.vigenteDesde ? ` (desde el ${fechaHora(vigentes.vigenteDesde)})` : ''}. Al publicar se crea una versión nueva que se
          aplica solo a lo que ocurra desde ese momento: los puntos e insignias ya ganados no cambian.
        </p>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {aviso ? <Alerta tipo="exito">{aviso}</Alerta> : null}

        <form className="pila" onSubmit={pedirConfirmacion} aria-label="Parámetros de gamificación">
          <fieldset className="admin-grupo">
            <legend>Puntos</legend>
            <div className="admin-campos">
              {PUNTOS.map(([clave, etiqueta]) => (
                <div key={clave}>{numero(f.puntos[clave], (v) => setF({ ...f, puntos: { ...f.puntos, [clave]: v } }), etiqueta, l.puntos)}</div>
              ))}
            </div>
          </fieldset>

          <fieldset className="admin-grupo">
            <legend>Bonos de racha</legend>
            <ul className="admin-racha" aria-label="Bonos de racha">
              {f.racha.map((r, i) => (
                <li key={i} className="admin-racha__fila">
                  {numero(r.dias, (v) => setF({ ...f, racha: f.racha.map((x, j) => (j === i ? { ...x, dias: v } : x)) }), 'Días seguidos', l.rachaDias)}
                  {numero(r.bono, (v) => setF({ ...f, racha: f.racha.map((x, j) => (j === i ? { ...x, bono: v } : x)) }), 'Puntos de bono', l.rachaBono)}
                  <Boton type="button" variante="fantasma" tamano="pequeno" disabled={f.racha.length <= 1} onClick={() => setF({ ...f, racha: f.racha.filter((_, j) => j !== i) })}>
                    Quitar
                  </Boton>
                </li>
              ))}
            </ul>
            <div>
              <Boton type="button" variante="fantasma" tamano="pequeno" disabled={f.racha.length >= 6} onClick={() => setF({ ...f, racha: [...f.racha, { dias: '', bono: '' }] })}>
                + Agregar un bono
              </Boton>
            </div>
          </fieldset>

          <fieldset className="admin-grupo">
            <legend>Topes y nivel lector</legend>
            <div className="admin-campos">
              {numero(f.antiFarming.topeDiario, (v) => setF({ ...f, antiFarming: { ...f.antiFarming, topeDiario: v } }), 'Tope de puntos por día', l.topeDiario)}
              {numero(f.antiFarming.porcentajeRepeticion, (v) => setF({ ...f, antiFarming: { ...f.antiFarming, porcentajeRepeticion: v } }), 'Porcentaje al repetir una lectura', l.porcentajeRepeticion)}
              {numero(f.base, (v) => setF({ ...f, base: v }), 'Puntos para el nivel 1 (base)', l.baseNivel)}
            </div>
          </fieldset>

          <fieldset className="admin-grupo">
            <legend>Palabras mínimas en las respuestas abiertas</legend>
            <div className="admin-campos">
              {numero(f.palabras.palabrasMinimasR2, (v) => setF({ ...f, palabras: { ...f.palabras, palabrasMinimasR2: v } }), 'De 6 a 9 años', l.palabras)}
              {numero(f.palabras.palabrasMinimasR3, (v) => setF({ ...f, palabras: { ...f.palabras, palabrasMinimasR3: v } }), 'De 10 a 12 años', l.palabras)}
            </div>
          </fieldset>

          <fieldset className="admin-grupo">
            <legend>Umbrales de las insignias</legend>
            <div className="admin-campos">
              {vigentes.insignias.map((i) => (
                <div key={i.codigo}>
                  {numero(
                    f.insignias[i.codigo] ?? '',
                    (v) => setF({ ...f, insignias: { ...f.insignias, [i.codigo]: v } }),
                    `${i.nombre} (${UNIDAD[i.tipo]})`,
                    l.umbralInsignia,
                  )}
                  <span className="texto-suave admin-catalogo">En el catálogo: {i.umbralCatalogo}</span>
                </div>
              ))}
            </div>
          </fieldset>

          {confirmando ? (
            <div className="admin-confirmar" role="group" aria-label="Confirmar la publicación">
              <p style={{ margin: 0 }}>
                Se publicará la versión <b>{vigentes.version + 1}</b> y se aplicará desde ahora. ¿Continuar?
              </p>
              <div className="fila">
                <Boton type="button" cargando={publicando} onClick={() => void publicar()}>
                  Sí, publicar la versión {vigentes.version + 1}
                </Boton>
                <Boton type="button" variante="fantasma" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Boton>
              </div>
            </div>
          ) : (
            <div className="fila">
              <Boton type="submit">Publicar versión nueva</Boton>
              <Boton type="button" variante="fantasma" onClick={() => setF(aFormulario(vigentes))}>
                Deshacer cambios
              </Boton>
            </div>
          )}
        </form>
      </Tarjeta>

      <Tarjeta titulo="Versiones publicadas">
        <ul className="admin-versiones" aria-label="Versiones publicadas">
          {historial.map((h) => (
            <li key={h.version}>
              <b>Versión {h.version}</b> · {fechaHora(h.vigenteDesde)}
              {h.creadoPor ? '' : ' · la inicial (valores del SRS)'}
              {h.version === vigentes.version ? ' · vigente' : ''}
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}
