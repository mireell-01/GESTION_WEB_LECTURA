'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alerta, AVATARES, Boton, Cargando, Chip, clasesBoton, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { HABILIDAD_CORTA, Habilidad } from '@/features/diagnostico/tipos';
import { diaEnPalabras, guardarArchivo, hoyEnLima } from '@/features/escuela/tipos';
import { api, apiArchivo, mensajeDeError } from '@/shared/api/client';

import { EstudiantePanel, fechaCorta, HABILIDADES, horaLima, mensajeDeSeguimiento, motivosRiesgo, NivelCNEB, NOMBRE_HABILIDAD, NOMBRE_NIVEL, PanelAula as Panel, Refuerzo, textoCelda } from './tipos';

type FiltroNivel = '' | NivelCNEB | 'NADA';

const NIVELES: NivelCNEB[] = ['C', 'B', 'A', 'AD'];

function Avatar({ avatar }: { avatar: string }) {
  const a = AVATARES[avatar] ?? { emoji: '🙂', nombre: 'Avatar', fondo: '#ede8ff' };
  return (
    <span className="seg-avatar" style={{ background: a.fondo }} aria-hidden="true">
      {a.emoji}
    </span>
  );
}

/** Fecha límite por defecto de un refuerzo: en una semana (día de Lima). */
function enUnaSemana(): string {
  return new Date(Date.parse(`${hoyEnLima()}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
}

/** RF-066: un refuerzo grupal que se asigna con un clic a quienes comparten la dificultad. */
function RefuerzoGrupal({ aulaId, refuerzo, editable }: { aulaId: string; refuerzo: Refuerzo; editable: boolean }) {
  const [estado, setEstado] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nombre = NOMBRE_HABILIDAD[refuerzo.habilidad];
  const asignar = async () => {
    if (!refuerzo.lectura) return;
    setEnviando(true);
    setEstado(null);
    const fechaLimite = enUnaSemana();
    try {
      await api(`/aulas/${aulaId}/asignaciones`, {
        metodo: 'POST',
        cuerpo: { tipo: 'LECTURA', contenidoId: refuerzo.lectura.id, fechaLimite, estudianteIds: refuerzo.estudianteIds },
      });
      setEstado({ tipo: 'exito', texto: `Listo: «${refuerzo.lectura.titulo}» quedó asignada a ${refuerzo.estudianteIds.length} estudiantes hasta el ${diaEnPalabras(fechaLimite)}.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <li className="seg-refuerzo">
      <div className="pila-sm">
        <strong>
          {nombre}: {refuerzo.porcentaje} % del aula en inicio
        </strong>
        <span className="texto-suave">{refuerzo.alias.join(', ')}</span>
        {refuerzo.lectura ? (
          <span>
            Lectura sugerida: <b>«{refuerzo.lectura.titulo}»</b> (nivel {refuerzo.lectura.nivelDificultad})
          </span>
        ) : (
          <span className="texto-suave">Aún no hay una lectura publicada que trabaje esta habilidad para su edad.</span>
        )}
      </div>
      {refuerzo.lectura && editable && estado?.tipo !== 'exito' ? (
        <Boton onClick={asignar} cargando={enviando} aria-label={`Asignar «${refuerzo.lectura.titulo}» a ${refuerzo.estudianteIds.length} estudiantes para reforzar ${nombre.toLowerCase()}`}>
          <Icono nombre="libro" tamano={20} />
          Asignar a {refuerzo.estudianteIds.length} estudiantes
        </Boton>
      ) : null}
      {estado ? <Alerta tipo={estado.tipo}>{estado.texto}</Alerta> : null}
    </li>
  );
}

/** Una celda del mapa de calor: el nivel CNEB con su color y la maestría (RF-063). */
function CeldaNivel({ celda }: { celda: EstudiantePanel['celdas'][number] }) {
  const clase = celda.valor === null ? 'seg-celda--nada' : celda.nivel ? `seg-celda--${celda.nivel.toLowerCase()}` : 'seg-celda--descubriendo';
  return (
    <td className={`seg-celda ${clase}`} aria-label={`${NOMBRE_HABILIDAD[celda.habilidad]}: ${textoCelda(celda)}`}>
      {celda.valor === null ? '—' : (
        <>
          <b>{celda.nivel ?? '…'}</b>
          <span>{Math.round(celda.valor)}</span>
        </>
      )}
    </td>
  );
}

/**
 * RF-063, RF-065, RF-066, RF-067: el seguimiento del aula. Resumen de la semana, estudiantes que
 * necesitan acompañamiento, refuerzos grupales asignables con un clic, el aula por habilidad y el mapa
 * de calor estudiantes × habilidades con filtros por habilidad y nivel CNEB. Se descarga en PDF o CSV.
 */
export function PanelAula({ aulaId }: { aulaId: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [habilidad, setHabilidad] = useState<'' | Habilidad>('');
  const [nivel, setNivel] = useState<FiltroNivel>('');
  const [descarga, setDescarga] = useState<{ formato: 'pdf' | 'csv' | null; error: string | null }>({ formato: null, error: null });

  const cargar = useCallback(() => {
    api<Panel>(`/aulas/${aulaId}/panel`)
      .then(setPanel)
      .catch((err) => setError(mensajeDeSeguimiento(err, 'No encontramos esta aula entre las tuyas.')));
  }, [aulaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (!panel) return [];
    const nivelDe = (e: EstudiantePanel, h: Habilidad) => {
      const c = e.celdas.find((x) => x.habilidad === h);
      return !c || c.valor === null ? 'SIN' : (c.nivel ?? 'NADA');
    };
    let lista = panel.estudiantes;
    if (nivel) lista = lista.filter((e) => (habilidad ? [habilidad] : HABILIDADES).some((h) => nivelDe(e, h) === nivel));
    if (habilidad) {
      const valor = (e: EstudiantePanel) => e.celdas.find((c) => c.habilidad === habilidad)?.valor ?? 101;
      lista = [...lista].sort((a, b) => valor(a) - valor(b));
    }
    return lista;
  }, [panel, habilidad, nivel]);

  const descargar = async (formato: 'pdf' | 'csv') => {
    setDescarga({ formato, error: null });
    try {
      const { archivo, nombre } = await apiArchivo(`/aulas/${aulaId}/reporte?formato=${formato}`);
      guardarArchivo(archivo, nombre);
      setDescarga({ formato: null, error: null });
    } catch (err) {
      setDescarga({ formato: null, error: mensajeDeError(err) });
    }
  };

  if (error) {
    return (
      <div className="pila">
        <Link href={`/docente/aulas/${aulaId}`} className="volver">
          <Icono nombre="flecha" tamano={20} className="volver__icono" />
          Volver al aula
        </Link>
        <Alerta tipo="error">{error}</Alerta>
      </div>
    );
  }
  if (!panel) return <Cargando texto="Preparando el seguimiento del aula…" />;

  const { actual, anterior, enRiesgo } = panel.resumenSemanal;
  const editable = panel.aula.estado === 'ACTIVA';
  const filtroActivo = Boolean(habilidad || nivel);

  return (
    <div className="pila seguimiento">
      <Link href={`/docente/aulas/${aulaId}`} className="volver">
        <Icono nombre="flecha" tamano={20} className="volver__icono" />
        {panel.aula.nombre}
      </Link>

      <header className="seg-cabecera">
        <div className="pila-sm">
          <h1>Seguimiento del aula</h1>
          <p className="texto-suave">
            {panel.aula.nombre} · {panel.totalEstudiantes} estudiantes
            {panel.actualizadoEn ? ` · Datos de las ${horaLima(panel.actualizadoEn)} (se actualizan cada 5 minutos)` : ''}
          </p>
        </div>
        <div className="fila fila--compacta">
          <Boton variante="secundario" onClick={() => descargar('pdf')} cargando={descarga.formato === 'pdf'} disabled={descarga.formato !== null}>
            Descargar PDF
          </Boton>
          <Boton variante="secundario" onClick={() => descargar('csv')} cargando={descarga.formato === 'csv'} disabled={descarga.formato !== null}>
            Descargar CSV
          </Boton>
        </div>
      </header>
      {descarga.error ? <Alerta tipo="error">{descarga.error}</Alerta> : null}

      <ul className="seg-cifras" aria-label="Resumen de la semana">
        <li>
          <span className="seg-cifra">
            {actual.estudiantesActivos} de {actual.totalEstudiantes}
          </span>
          leyeron esta semana
          <small>La semana pasada: {anterior.estudiantesActivos}</small>
        </li>
        <li>
          <span className="seg-cifra">{actual.lecturasFinalizadas}</span>
          lecturas terminadas
          <small>La semana pasada: {anterior.lecturasFinalizadas}</small>
        </li>
        <li>
          <span className="seg-cifra">{actual.minutosLectura}</span>
          minutos de lectura
          <small>La semana pasada: {anterior.minutosLectura}</small>
        </li>
        <li className={enRiesgo > 0 ? 'seg-cifras__alerta' : undefined}>
          <span className="seg-cifra">{enRiesgo}</span>
          {enRiesgo === 1 ? 'estudiante para acompañar' : 'estudiantes para acompañar'}
        </li>
      </ul>

      <Tarjeta titulo="Estudiantes para acompañar" aria-label="Estudiantes para acompañar">
        {panel.alertas.length === 0 ? (
          <p className="texto-suave">Nadie con 7 días sin actividad ni con 2 habilidades en inicio. ¡Buen trabajo!</p>
        ) : (
          <ul className="seg-alertas" aria-label="Alertas">
            {panel.alertas.map((a) => (
              <li key={a.estudianteId} className="seg-alerta">
                <Avatar avatar={a.avatar} />
                <span className="pila-sm">
                  <strong>{a.alias}</strong>
                  <span className="fila fila--compacta">
                    {motivosRiesgo(a.riesgo).map((m) => (
                      <Chip key={m} tipo="aviso">
                        {m}
                      </Chip>
                    ))}
                  </span>
                </span>
                <Link href={`/docente/aulas/${aulaId}/estudiantes/${a.estudianteId}`} className={clasesBoton('fantasma', { tamano: 'pequeno' })} aria-label={`Ver el detalle de ${a.alias}`}>
                  Ver detalle
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Refuerzos para el grupo" aria-label="Refuerzos para el grupo">
        {panel.refuerzos.length === 0 ? (
          <p className="texto-suave">Ninguna habilidad está en inicio para el 30 % del aula o más.</p>
        ) : (
          <ul className="seg-refuerzos" aria-label="Refuerzos sugeridos">
            {panel.refuerzos.map((r) => (
              <RefuerzoGrupal key={r.habilidad} aulaId={aulaId} refuerzo={r} editable={editable} />
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="El aula por habilidad" aria-label="El aula por habilidad">
        <div className="tabla-desplazable">
          <table className="tabla seg-grupo">
            <thead>
              <tr>
                <th scope="col">Habilidad</th>
                <th scope="col">Promedio</th>
                {NIVELES.map((n) => (
                  <th key={n} scope="col">
                    {n}
                  </th>
                ))}
                <th scope="col">Aún descubriendo</th>
                <th scope="col">Sin datos</th>
              </tr>
            </thead>
            <tbody>
              {panel.grupo.map((g) => (
                <tr key={g.habilidad}>
                  <th scope="row">{NOMBRE_HABILIDAD[g.habilidad]}</th>
                  <td>{g.promedio ?? '—'}</td>
                  {NIVELES.map((n) => (
                    <td key={n}>{g.distribucion[n]}</td>
                  ))}
                  <td>{g.distribucion.descubriendo}</td>
                  <td>{g.sinDatos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Mapa de calor por habilidad" aria-label="Mapa de calor por habilidad">
        <div className="form-columnas">
          <Selector
            etiqueta="Habilidad"
            value={habilidad}
            onChange={(e) => setHabilidad(e.target.value as '' | Habilidad)}
            opciones={[{ valor: '', texto: 'Todas' }, ...HABILIDADES.map((h) => ({ valor: h, texto: NOMBRE_HABILIDAD[h] }))]}
          />
          <Selector
            etiqueta="Nivel"
            value={nivel}
            onChange={(e) => setNivel(e.target.value as FiltroNivel)}
            opciones={[{ valor: '', texto: 'Todos' }, ...NIVELES.map((n) => ({ valor: n, texto: `${n} · ${NOMBRE_NIVEL[n]}` })), { valor: 'NADA', texto: 'Aún descubriendo' }]}
          />
        </div>
        <p className="texto-suave" role="status">
          {filtroActivo ? `${visibles.length} de ${panel.totalEstudiantes} estudiantes` : `${panel.totalEstudiantes} estudiantes`}
          {habilidad ? `, de menor a mayor en ${NOMBRE_HABILIDAD[habilidad].toLowerCase()}` : ''}
        </p>
        <div className="tabla-desplazable">
          <table className="tabla seg-mapa">
            <caption className="sr-only">Nivel CNEB de cada estudiante en cada habilidad</caption>
            <thead>
              <tr>
                <th scope="col">Estudiante</th>
                {HABILIDADES.map((h) => (
                  <th key={h} scope="col" title={NOMBRE_HABILIDAD[h]}>
                    {HABILIDAD_CORTA[h]}
                  </th>
                ))}
                <th scope="col">Última actividad</th>
                <th scope="col">Lecturas (semana)</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id} className={e.riesgo.enRiesgo ? 'seg-mapa__riesgo' : undefined}>
                  <th scope="row">
                    <Link href={`/docente/aulas/${aulaId}/estudiantes/${e.id}`} className="seg-estudiante">
                      <Avatar avatar={e.avatar} />
                      {e.alias}
                    </Link>
                  </th>
                  {HABILIDADES.map((h) => (
                    <CeldaNivel key={h} celda={e.celdas.find((c) => c.habilidad === h) ?? { habilidad: h, valor: null, items: 0, nivel: null }} />
                  ))}
                  <td>{e.ultimaActividad ? fechaCorta(e.ultimaActividad) : 'Sin actividad'}</td>
                  <td>{e.lecturasSemana}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="seg-leyenda texto-suave">
          <span className="seg-celda--c">C</span> En inicio · <span className="seg-celda--b">B</span> En proceso · <span className="seg-celda--a">A</span> Logrado ·{' '}
          <span className="seg-celda--ad">AD</span> Destacado · <span className="seg-celda--descubriendo">…</span> Aún descubriendo (menos de 5 preguntas) · — sin datos
        </p>
      </Tarjeta>
    </div>
  );
}
