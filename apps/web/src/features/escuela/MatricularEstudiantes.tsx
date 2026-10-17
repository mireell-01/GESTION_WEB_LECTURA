'use client';

import { ChangeEvent, FormEvent, useState } from 'react';

import { AreaTexto, Alerta, AVATARES, Boton, BotonAvatar, Campo, Icono, Selector, Tarjeta } from '@lectoaventura/ui';

import { MESES } from '@/features/iam/tipos';
import { api, mensajeDeError } from '@/shared/api/client';

import { EstudianteMatriculado, FilaRechazada } from './tipos';

type Modo = 'uno' | 'csv';

const EJEMPLO_CSV = 'alias,año,mes,avatar\nLucía,2017,5,zorro\nMateo,2016,11,leon';

/**
 * Matrícula (RF-015, RF-016): uno por uno o varios con un CSV de hasta 60 filas. No se muestra
 * ningún PIN: cada niño lo recibe en su tarjeta impresa (RF-017).
 */
export function MatricularEstudiantes({ aulaId, onMatriculados }: { aulaId: string; onMatriculados: (ids: string[]) => void }) {
  const anio = new Date().getFullYear();
  const [modo, setModo] = useState<Modo>('uno');
  const [alias, setAlias] = useState('');
  const [anioNacimiento, setAnioNacimiento] = useState(String(anio - 8));
  const [mesNacimiento, setMesNacimiento] = useState('1');
  const [avatar, setAvatar] = useState('');
  const [csv, setCsv] = useState('');
  const [rechazadas, setRechazadas] = useState<FilaRechazada[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const terminar = (matriculados: EstudianteMatriculado[]) => {
    if (matriculados.length > 0) {
      const nombres = matriculados.map((m) => m.alias).join(', ');
      setMensaje({
        tipo: 'exito',
        texto: `Matriculados: ${nombres}. Ya están elegidos en la lista: descarga sus tarjetas para entregarles su PIN.`,
      });
      onMatriculados(matriculados.map((m) => m.estudianteId));
    }
  };

  const enviarUno = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    try {
      const m = await api<EstudianteMatriculado>(`/aulas/${aulaId}/matriculas`, {
        metodo: 'POST',
        cuerpo: { alias, anioNacimiento: Number(anioNacimiento), mesNacimiento: Number(mesNacimiento), avatar },
      });
      setAlias('');
      setAvatar('');
      terminar([m]);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  };

  const enviarCsv = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    setRechazadas([]);
    try {
      const r = await api<{ matriculados: EstudianteMatriculado[]; rechazadas: FilaRechazada[] }>(`/aulas/${aulaId}/matriculas/importacion`, {
        metodo: 'POST',
        cuerpo: { csv },
      });
      setRechazadas(r.rechazadas);
      if (r.matriculados.length === 0) {
        setMensaje({ tipo: 'error', texto: 'No se matriculó a nadie. Revisa las filas rechazadas.' });
      } else {
        setCsv('');
        terminar(r.matriculados);
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  };

  const leerArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (archivo) setCsv(await archivo.text());
  };

  return (
    <Tarjeta
      titulo={
        <span className="titulo-con-icono">
          <Icono nombre="estrella" tamano={28} />
          Matricular estudiantes
        </span>
      }
    >
      <div className="selector-modo" role="group" aria-label="Forma de matricular">
        <Boton tamano="pequeno" variante={modo === 'uno' ? 'primario' : 'fantasma'} aria-pressed={modo === 'uno'} onClick={() => setModo('uno')}>
          Uno por uno
        </Boton>
        <Boton tamano="pequeno" variante={modo === 'csv' ? 'primario' : 'fantasma'} aria-pressed={modo === 'csv'} onClick={() => setModo('csv')}>
          Varios con CSV
        </Boton>
      </div>
      {mensaje ? <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta> : null}

      {modo === 'uno' ? (
        <form onSubmit={enviarUno} className="pila-sm" aria-label="Matricular un estudiante">
          <p className="texto-suave">Solo alias, mes y año de nacimiento y avatar: nunca apellidos, documento ni foto.</p>
          <div className="form-columnas">
            <Campo etiqueta="Alias del estudiante" value={alias} maxLength={20} required onChange={(e) => setAlias(e.target.value)} />
            <Selector
              etiqueta="Año de nacimiento"
              value={anioNacimiento}
              onChange={(e) => setAnioNacimiento(e.target.value)}
              opciones={Array.from({ length: 8 }, (_, i) => String(anio - 5 - i)).map((a) => ({ valor: a, texto: a }))}
            />
            <Selector
              etiqueta="Mes de nacimiento"
              value={mesNacimiento}
              onChange={(e) => setMesNacimiento(e.target.value)}
              opciones={MESES.map((m, i) => ({ valor: String(i + 1), texto: m.charAt(0).toUpperCase() + m.slice(1) }))}
            />
          </div>
          <fieldset className="grupo-avatares">
            <legend className="la-campo__etiqueta">Avatar</legend>
            <div className="fila">
              {Object.entries(AVATARES).map(([clave, a]) => (
                <BotonAvatar key={clave} clave={clave} texto={a.nombre} seleccionado={avatar === clave} onClick={() => setAvatar(clave)} />
              ))}
            </div>
          </fieldset>
          <div>
            <Boton type="submit" cargando={enviando} disabled={alias.trim().length < 2 || !avatar}>
              Matricular
            </Boton>
          </div>
        </form>
      ) : (
        <form onSubmit={enviarCsv} className="pila-sm" aria-label="Matricular con un archivo CSV">
          <p className="texto-suave">
            Hasta 60 filas con <strong>alias, año, mes, avatar</strong> (el avatar es opcional). La primera fila puede ser el encabezado.
          </p>
          <label className="la-boton la-boton--fantasma la-boton--pequeno subir-archivo">
            Elegir archivo .csv
            <input type="file" accept=".csv,text/csv,text/plain" onChange={leerArchivo} className="sr-only" />
          </label>
          <AreaTexto etiqueta="Contenido del CSV" value={csv} placeholder={EJEMPLO_CSV} rows={6} onChange={(e) => setCsv(e.target.value)} />
          <div>
            <Boton type="submit" cargando={enviando} disabled={csv.trim().length === 0}>
              Matricular desde el CSV
            </Boton>
          </div>
          {rechazadas.length > 0 ? (
            <div className="tabla-desplazable">
              <table className="tabla">
                <caption className="texto-suave">Filas que no se matricularon</caption>
                <thead>
                  <tr>
                    <th scope="col">Fila</th>
                    <th scope="col">Contenido</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rechazadas.map((f) => (
                    <tr key={f.fila}>
                      <td>{f.fila}</td>
                      <td>{f.contenido}</td>
                      <td>{f.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </form>
      )}
    </Tarjeta>
  );
}
