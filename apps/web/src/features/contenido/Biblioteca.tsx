'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Chip, clasesBoton, Icono, Selector } from '@lectoaventura/ui';

import { EscenaAnimada, IlustracionParrafo, repartoDe } from '@/features/lectura/IlustracionLectura';
import { esMensaje, RecuadroMensaje } from '@/features/lectura/MensajeCuento';
import { api, mensajeDeError } from '@/shared/api/client';

import { ArchivoProtegido } from './ArchivoProtegido';
import { DibujoTema, temaDe, TemasBiblioteca } from './TemasBiblioteca';
import { DetalleBiblioteca, EDADES, FichaLectura, HABILIDADES, MOMENTOS, Momento, TIPOS_TEXTO } from './tipos';

interface Pagina {
  lecturas: FichaLectura[];
  siguiente: string | null;
  alcance: { rangoEdad: string; niveles: number[] } | null;
  /** Los tipos de texto que tienen lecturas en su alcance: el filtro solo ofrece esos. */
  tipos?: string[];
}

/**
 * Biblioteca (RF-028) para niños y adultos. El niño ve solo lo de su edad y nivel (lo decide la
 * API) y elige el tema tocando su dibujo; los adultos filtran por edad, nivel, temática, tipo de texto
 * y habilidad.
 */
export function Biblioteca({ base, infantil = false }: { base: string; infantil?: boolean }) {
  const [filtros, setFiltros] = useState({ edad: '', nivel: '', tema: '', tipo: '', habilidad: '' });
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consultar = useCallback(async (f: typeof filtros, cursor?: string) => {
    const q = new URLSearchParams(Object.entries({ ...f, ...(cursor ? { cursor } : {}) }).filter(([, v]) => v) as [string, string][]);
    return api<Pagina>(`/biblioteca${q.size ? `?${q}` : ''}`);
  }, []);

  // Solo vale la última búsqueda: si la carga inicial (o una búsqueda anterior) responde después de que el
  // niño eligió un tema, no debe pisar lo que pidió.
  const ultima = useRef(0);
  const cargar = useCallback(
    async (f: typeof filtros) => {
      const numero = ++ultima.current;
      setError(null);
      try {
        const resultado = await consultar(f);
        if (numero === ultima.current) setPagina(resultado);
      } catch (err) {
        if (numero === ultima.current) setError(mensajeDeError(err));
      }
    },
    [consultar],
  );

  useEffect(() => {
    void cargar({ edad: '', nivel: '', tema: '', tipo: '', habilidad: '' });
  }, [cargar]);

  const buscar = async (e?: FormEvent) => {
    e?.preventDefault();
    await cargar(filtros);
  };

  const mas = async () => {
    if (!pagina?.siguiente) return;
    setCargandoMas(true);
    const numero = ultima.current;
    try {
      const siguiente = await consultar(filtros, pagina.siguiente);
      // Si mientras tanto pidió otra búsqueda, esta página ya no corresponde.
      if (numero === ultima.current) setPagina({ ...siguiente, lecturas: [...pagina.lecturas, ...siguiente.lecturas] });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargandoMas(false);
    }
  };

  const cambiar = (campo: keyof typeof filtros) => (e: { target: { value: string } }) => setFiltros({ ...filtros, [campo]: e.target.value });

  const elegirTema = async (tema: string) => {
    const f = { ...filtros, tema };
    setFiltros(f);
    await cargar(f);
  };

  return (
    <div className={infantil ? 'pila biblioteca biblioteca--infantil' : 'pila biblioteca'}>
      <header className={infantil ? 'est-mundos__cabecera' : 'saludo-adulto'}>
        {infantil ? <Icono nombre="libro" tamano={40} /> : null}
        <h1>{infantil ? 'Tu biblioteca' : 'Biblioteca'}</h1>
        {!infantil ? <p className="texto-suave">Lecturas publicadas, con sus actividades listas para leer y asignar.</p> : null}
      </header>

      {infantil ? <TemasBiblioteca elegido={filtros.tema.trim().toLocaleLowerCase('es')} alElegir={elegirTema} /> : null}

      <form onSubmit={buscar} className={infantil ? 'filtros filtros--infantil' : 'la-tarjeta filtros'} aria-label="Filtrar lecturas">
        <div className="form-columnas">
          <Campo etiqueta="Temática" value={filtros.tema} maxLength={60} onChange={cambiar('tema')} />
          {!infantil ? (
            <>
              <Selector etiqueta="Edad" value={filtros.edad} onChange={cambiar('edad')} opciones={[{ valor: '', texto: 'Todas' }, ...Object.entries(EDADES).map(([v, t]) => ({ valor: v, texto: t }))]} />
              <Selector etiqueta="Nivel" value={filtros.nivel} onChange={cambiar('nivel')} opciones={[{ valor: '', texto: 'Todos' }, ...[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: `Nivel ${n}` }))]} />
            </>
          ) : null}
          <Selector
            etiqueta="Tipo de texto"
            value={filtros.tipo}
            onChange={cambiar('tipo')}
            opciones={[
              { valor: '', texto: 'Todos' },
              ...Object.entries(TIPOS_TEXTO)
                .filter(([v]) => !pagina?.tipos || pagina.tipos.includes(v) || v === filtros.tipo)
                .map(([v, t]) => ({ valor: v, texto: t })),
            ]}
          />
          {!infantil ? (
            <Selector
              etiqueta="Habilidad"
              value={filtros.habilidad}
              onChange={cambiar('habilidad')}
              opciones={[{ valor: '', texto: 'Todas' }, ...Object.entries(HABILIDADES).map(([v, t]) => ({ valor: v, texto: t }))]}
            />
          ) : null}
        </div>
        <div>
          <Boton type="submit" tamano="pequeno">
            Buscar
          </Boton>
        </div>
      </form>

      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {!pagina ? (
        error ? null : <Cargando />
      ) : pagina.lecturas.length === 0 ? (
        <Alerta tipo="info">
          {!infantil ? 'No hay lecturas publicadas con esos filtros.' : filtros.tema ? 'Aún no hay cuentos de ese tema para ti. ¡Prueba con otro!' : 'Pronto habrá lecturas para ti aquí.'}
        </Alerta>
      ) : (
        <ul className="fichas" aria-label="Lecturas">
          {pagina.lecturas.map((l) => (
            <li key={l.lecturaId}>
              <Link href={`${base}/${l.lecturaId}`} className="ficha" aria-label={`Abrir ${l.titulo}`}>
                {/* La escena del cuento, la misma que verá al leerlo (decorativa: el título ya dice de qué trata). */}
                <span className="ficha__escena" aria-hidden="true">
                  <EscenaAnimada texto={`${l.titulo}. ${l.resumen}`} reparto={repartoDe(l.titulo, l.resumen)} />
                </span>
                {infantil && temaDe(l.tematica) ? (
                  <span className="ficha__tema">
                    <DibujoTema tema={temaDe(l.tematica)!} />
                    {temaDe(l.tematica)!.nombre}
                  </span>
                ) : null}
                <span className="ficha__titulo">{l.titulo}</span>
                <span className="ficha__resumen">{l.resumen}</span>
                <span className="fila fila--compacta">
                  <Chip tipo="info">{EDADES[l.rangoEdad]}</Chip>
                  <Chip>Nivel {l.nivelDificultad}</Chip>
                  <Chip>{TIPOS_TEXTO[l.tipoTexto]}</Chip>
                  {l.esRamificada ? <Chip tipo="aviso">Tú decides</Chip> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pagina?.siguiente ? (
        <div>
          <Boton variante="fantasma" cargando={cargandoMas} onClick={mas}>
            Ver más lecturas
          </Boton>
        </div>
      ) : null}
    </div>
  );
}

/** Detalle de una lectura publicada (sin respuestas). El estudiante la lee con sus actividades en /estudiante/lecturas (Módulo 6). */
const primerParrafo = (l: DetalleBiblioteca) => l.parrafos[0]?.oraciones.map((o) => o.texto).join(' ') ?? '';

export function DetalleLecturaBiblioteca({ lecturaId, base, infantil = false }: { lecturaId: string; base: string; infantil?: boolean }) {
  const [lectura, setLectura] = useState<DetalleBiblioteca | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DetalleBiblioteca>(`/biblioteca/${lecturaId}`)
      .then(setLectura)
      .catch((err) => setError(mensajeDeError(err)));
  }, [lecturaId]);

  const volver = (
    <Link href={base} className="volver">
      <Icono nombre="flecha" tamano={20} className="volver__icono" />
      {infantil ? 'Tu biblioteca' : 'Biblioteca'}
    </Link>
  );
  if (error) return <div className="pila">{volver}<Alerta tipo="error">{error}</Alerta></div>;
  if (!lectura) return <Cargando />;

  return (
    <div className="pila">
      {volver}
      <article className={infantil ? 'lectura lectura--infantil' : 'la-tarjeta lectura'}>
        <h1>{lectura.titulo}</h1>
        <span className="fila fila--compacta">
          <Chip tipo="info">{EDADES[lectura.rangoEdad]}</Chip>
          <Chip>Nivel {lectura.nivelDificultad}</Chip>
          <Chip>{TIPOS_TEXTO[lectura.tipoTexto]}</Chip>
          <Chip>{lectura.tematica}</Chip>
        </span>
        {lectura.imagenes[0] ? (
          <ArchivoProtegido url={lectura.imagenes[0].url} tipo="IMAGEN" alt={lectura.imagenes[0].textoAlternativo} className="lectura__imagen" />
        ) : (
          <IlustracionParrafo imagen={null} texto={lectura.titulo} reparto={repartoDe(lectura.titulo, primerParrafo(lectura))} />
        )}
        <div className="lectura__texto">
          {lectura.parrafos.map((p) => {
            const texto = p.oraciones.map((o) => o.texto).join(' ');
            return p.oraciones.length === 1 && esMensaje(texto) ? (
              <RecuadroMensaje key={p.numero}>
                <p>{texto}</p>
              </RecuadroMensaje>
            ) : (
              <p key={p.numero}>{texto}</p>
            );
          })}
        </div>
        {!infantil ? (
          <div className="pila-sm">
            <p className="texto-suave">
              Habilidades: {lectura.habilidades.map((h) => HABILIDADES[h]).join(', ')} · Licencia: {lectura.licencia}
            </p>
            <p className="texto-suave">
              Actividades:{' '}
              {(Object.entries(lectura.actividadesPorMomento) as [Momento, number][])
                .filter(([, n]) => n > 0)
                .map(([m, n]) => `${n} ${MOMENTOS[m].toLowerCase()}`)
                .join(' · ')}
            </p>
          </div>
        ) : (
          <div>
            <Link href={`/estudiante/lecturas/${lecturaId}`} className={clasesBoton('primario', { tamano: 'grande' })}>
              <Icono nombre="libro" tamano={24} />
              ¡Leer ahora!
            </Link>
          </div>
        )}
      </article>
    </div>
  );
}
