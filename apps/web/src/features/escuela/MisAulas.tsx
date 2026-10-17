'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { Alerta, Boton, Campo, Cargando, Chip, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { Aula, NOMBRE_GRADO } from './tipos';

/** RF-014: crear un aula con el consentimiento institucional (RN-01). */
function FormularioAula({ onCancelar }: { onCancelar: () => void }) {
  const router = useRouter();
  const anio = new Date().getFullYear();
  const [datos, setDatos] = useState({ nombre: '', grado: '3', anioLectivo: String(anio), institucion: '', autoridad: '' });
  const [declara, setDeclara] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof datos) => (e: { target: { value: string } }) => setDatos({ ...datos, [campo]: e.target.value });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const aula = await api<Aula>('/aulas', {
        metodo: 'POST',
        cuerpo: {
          nombre: datos.nombre,
          grado: datos.grado,
          anioLectivo: Number(datos.anioLectivo),
          institucion: datos.institucion,
          autoridadConsentimiento: datos.autoridad,
          declaraConsentimiento: declara,
        },
      });
      router.push(`/docente/aulas/${aula.id}`);
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="pila-sm" aria-label="Nueva aula">
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <div className="form-columnas">
        <Campo etiqueta="Nombre del aula" ayuda="Por ejemplo: 3.° B" value={datos.nombre} maxLength={60} required onChange={cambiar('nombre')} />
        <Selector
          etiqueta="Grado"
          value={datos.grado}
          onChange={cambiar('grado')}
          opciones={Object.entries(NOMBRE_GRADO).map(([valor, texto]) => ({ valor, texto }))}
        />
        <Selector
          etiqueta="Año lectivo"
          value={datos.anioLectivo}
          onChange={cambiar('anioLectivo')}
          opciones={[anio - 1, anio, anio + 1].map((a) => ({ valor: String(a), texto: String(a) }))}
        />
        <Campo etiqueta="Institución educativa" value={datos.institucion} maxLength={120} required onChange={cambiar('institucion')} />
      </div>
      <Campo
        etiqueta="Autoridad que firmó el consentimiento"
        ayuda="Directora, director o quien autorizó el uso de LectoAventura con las familias."
        value={datos.autoridad}
        maxLength={120}
        required
        onChange={cambiar('autoridad')}
      />
      <label className="casilla">
        <input type="checkbox" checked={declara} onChange={(e) => setDeclara(e.target.checked)} />
        <span>Declaro que la institución cuenta con el consentimiento de las familias para crear los perfiles de sus hijos.</span>
      </label>
      <div className="fila">
        <Boton type="submit" cargando={enviando} disabled={!declara}>
          Crear aula
        </Boton>
        <Boton variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** RF-014 / RF-020: las aulas de la docente (activas primero) y el acceso a cada una. */
export function MisAulas() {
  const [aulas, setAulas] = useState<Aula[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Aula[]>('/aulas')
      .then(setAulas)
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="aula" tamano={28} />
          Mis aulas
        </span>
      }
      acciones={
        !creando ? (
          <Boton tamano="pequeno" onClick={() => setCreando(true)}>
            + Nueva aula
          </Boton>
        ) : null
      }
    >
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      {creando ? <FormularioAula onCancelar={() => setCreando(false)} /> : null}
      {!aulas ? (
        error ? null : <Cargando />
      ) : aulas.length === 0 ? (
        creando ? null : <Alerta tipo="info">Crea tu primera aula para matricular a tus estudiantes e imprimir sus tarjetas.</Alerta>
      ) : (
        <ul className="aulas">
          {aulas.map((a) => (
            <li key={a.id}>
              <Link href={`/docente/aulas/${a.id}`} className="aula-enlace" aria-label={`Abrir ${a.nombre}`}>
                <span className="lista-aulas__icono">
                  <Icono nombre="aula" tamano={28} />
                </span>
                <span className="aula-enlace__datos">
                  <strong>{a.nombre}</strong>
                  <span className="texto-suave">
                    {NOMBRE_GRADO[a.grado]} · {a.anioLectivo} · {a.institucion}
                  </span>
                  <span className="fila fila--compacta">
                    <Chip tipo="info">
                      {a.totalEstudiantes} {a.totalEstudiantes === 1 ? 'estudiante' : 'estudiantes'}
                    </Chip>
                    {a.estado === 'ARCHIVADA' ? <Chip>Archivada</Chip> : null}
                  </span>
                </span>
                <Icono nombre="chevron" tamano={22} className="aula-enlace__flecha" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
