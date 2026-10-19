'use client';

import { useEffect, useState } from 'react';

import { apiArchivo } from '@/shared/api/client';

/**
 * Imagen o audio que exige sesión: el token vive solo en memoria (no en cookies), así que el
 * archivo se pide con el cliente de la API y se muestra desde una URL local del navegador.
 */
export function ArchivoProtegido({ url, tipo, alt = '', className }: { url: string; tipo: 'IMAGEN' | 'AUDIO'; alt?: string; className?: string }) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    let creada: string | null = null;
    apiArchivo(url.replace(/^\/api\/v1/, ''))
      .then(({ archivo }) => {
        if (!vigente) return;
        creada = URL.createObjectURL(archivo);
        setLocal(creada);
      })
      .catch(() => setLocal(null));
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [url]);

  if (!local) return <span className={`archivo-cargando ${className ?? ''}`} aria-hidden="true" />;
  return tipo === 'IMAGEN' ? <img src={local} alt={alt} className={className} /> : <audio controls src={local} className={className} />;
}
