import Link from 'next/link';

import { clasesBoton } from '@lectoaventura/ui';

import { ContinuarSesion } from '@/features/iam/ContinuarSesion';

export default function InicioPage() {
  return (
    <main className="publico">
      <div className="publico__panel publico__panel--ancho pila texto-centro">
        <div>
          <p style={{ fontSize: '4rem', margin: 0 }} aria-hidden="true">
            🚀📚
          </p>
          <h1 style={{ fontSize: '2.5rem' }}>LectoAventura</h1>
          <p className="texto-suave" style={{ fontSize: 'var(--la-texto-lg)', margin: 0 }}>
            No queremos que los niños solo lean historias: queremos que las vivan, las cuestionen y descubran lo que hay
            detrás de ellas.
          </p>
        </div>

        <ContinuarSesion />

        <div className="rejilla" style={{ textAlign: 'left' }}>
          <section className="la-tarjeta pila-sm">
            <h2 style={{ margin: 0 }}>🧒 Soy estudiante</h2>
            <p className="texto-suave" style={{ margin: 0 }}>
              Entra con el código de tu aula o desde la tablet de tu casa, elige tu avatar y escribe tu PIN.
            </p>
            <Link href="/ingresar/estudiante" className={clasesBoton('primario', { tamano: 'grande', bloque: true })}>
              ¡A leer!
            </Link>
          </section>
          <section className="la-tarjeta pila-sm">
            <h2 style={{ margin: 0 }}>🧑‍🏫 Soy docente o familiar</h2>
            <p className="texto-suave" style={{ margin: 0 }}>
              Acompaña el avance lector: aulas, asignaciones y recomendaciones por habilidad.
            </p>
            <Link href="/ingresar" className={clasesBoton('secundario', { tamano: 'grande', bloque: true })}>
              Ingresar
            </Link>
            <Link href="/registro" className={clasesBoton('fantasma', { bloque: true })}>
              Crear una cuenta
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
