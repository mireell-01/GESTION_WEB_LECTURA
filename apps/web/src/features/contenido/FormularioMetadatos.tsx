'use client';

import { Campo, Selector } from '@lectoaventura/ui';

import { EDADES, HABILIDADES, Metadatos, TIPOS_TEXTO } from './tipos';

export const METADATOS_VACIOS: Metadatos = {
  titulo: '',
  rangoEdad: 'R2',
  nivelDificultad: 2,
  tematica: '',
  tipoTexto: 'CUENTO',
  habilidadesObjetivo: [],
  licencia: '',
};

/** Temáticas sugeridas (la editora puede escribir otra). */
const TEMATICAS = ['Animales', 'Naturaleza', 'Amistad', 'Familia', 'Ciencia', 'Historia del Perú', 'Leyendas andinas', 'Medio ambiente', 'Deportes', 'Humor', 'Valores', 'Tecnología'];

/** RF-021: título, edad, dificultad, temática, tipo de texto, habilidades objetivo y licencia. */
export function FormularioMetadatos({ valor, onChange, soloLectura = false }: { valor: Metadatos; onChange: (m: Metadatos) => void; soloLectura?: boolean }) {
  const cambiar = <K extends keyof Metadatos>(campo: K, v: Metadatos[K]) => onChange({ ...valor, [campo]: v });
  const alternarHabilidad = (h: string) =>
    cambiar('habilidadesObjetivo', valor.habilidadesObjetivo.includes(h) ? valor.habilidadesObjetivo.filter((x) => x !== h) : [...valor.habilidadesObjetivo, h]);

  return (
    <fieldset className="grupo-opciones" disabled={soloLectura}>
      <legend className="sr-only">Datos de la lectura</legend>
      <Campo etiqueta="Título" value={valor.titulo} maxLength={120} required onChange={(e) => cambiar('titulo', e.target.value)} />
      <div className="form-columnas">
        <Selector
          etiqueta="Edad"
          value={valor.rangoEdad}
          onChange={(e) => cambiar('rangoEdad', e.target.value)}
          opciones={Object.entries(EDADES).map(([v, texto]) => ({ valor: v, texto }))}
        />
        <Selector
          etiqueta="Nivel de dificultad"
          value={String(valor.nivelDificultad)}
          onChange={(e) => cambiar('nivelDificultad', Number(e.target.value))}
          opciones={[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: `Nivel ${n}` }))}
        />
        <Selector
          etiqueta="Tipo de texto"
          value={valor.tipoTexto}
          onChange={(e) => cambiar('tipoTexto', e.target.value)}
          opciones={Object.entries(TIPOS_TEXTO).map(([v, texto]) => ({ valor: v, texto }))}
        />
        <div>
          <Campo
            etiqueta="Temática"
            value={valor.tematica}
            maxLength={60}
            list="tematicas-sugeridas"
            required
            onChange={(e) => cambiar('tematica', e.target.value)}
          />
          <datalist id="tematicas-sugeridas">
            {TEMATICAS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <fieldset className="grupo-opciones">
        <legend className="la-campo__etiqueta">Habilidades objetivo</legend>
        <div className="casillas-en-fila">
          {Object.entries(HABILIDADES).map(([clave, nombre]) => (
            <label key={clave} className="casilla">
              <input type="checkbox" checked={valor.habilidadesObjetivo.includes(clave)} onChange={() => alternarHabilidad(clave)} />
              <span>{nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Campo
        etiqueta="Licencia"
        ayuda="Por ejemplo: CC BY 4.0, dominio público o texto propio del equipo."
        value={valor.licencia ?? ''}
        maxLength={120}
        onChange={(e) => cambiar('licencia', e.target.value)}
      />
    </fieldset>
  );
}
