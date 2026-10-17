'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { AreaTexto, Alerta, Boton, Icono, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { FormularioMetadatos, METADATOS_VACIOS } from './FormularioMetadatos';
import { DetalleLectura } from './tipos';

/** RF-021: la editora crea la lectura en borrador; el texto se divide solo en oraciones (RF-022). */
export function NuevaLectura() {
  const router = useRouter();
  const [metadatos, setMetadatos] = useState(METADATOS_VACIOS);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const d = await api<DetalleLectura>('/backoffice/lecturas', {
        metodo: 'POST',
        cuerpo: { metadatos: { ...metadatos, licencia: metadatos.licencia || null }, texto },
      });
      router.push(`/backoffice/lecturas/${d.lecturaId}`);
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  return (
    <div className="pila">
      <Link href="/backoffice/lecturas" className="volver">
        <Icono nombre="flecha" tamano={20} className="volver__icono" />
        Lecturas
      </Link>
      <Tarjeta titulo="Nueva lectura" nivel={1}>
        <form onSubmit={crear} className="pila-sm">
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          <FormularioMetadatos valor={metadatos} onChange={setMetadatos} />
          <AreaTexto
            etiqueta="Texto de la lectura"
            ayuda="Cada línea es un párrafo. Al guardar se divide en oraciones; luego puedes ajustar los cortes."
            value={texto}
            rows={12}
            maxLength={20000}
            required
            onChange={(e) => setTexto(e.target.value)}
          />
          <div>
            <Boton type="submit" cargando={enviando} disabled={metadatos.titulo.trim().length < 3 || !texto.trim()}>
              Crear borrador
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
