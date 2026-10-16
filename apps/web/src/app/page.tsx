import Link from 'next/link';

import { clasesBoton, Mascota, Paisaje } from '@lectoaventura/ui';

import { ContinuarSesion } from '@/features/iam/ContinuarSesion';
import { RedirigirTabletActivada } from '@/features/iam/RedirigirTabletActivada';

/**
 * Portada abierta, al estilo de las apps de aprendizaje: la propuesta en una frase y dos
 * caminos claros ("Empezar" y "Ya tengo una cuenta"). En una tablet ya activada por la
 * docente o la familia, la app se abre directo en los avatares de los niños (CR-01).
 */
export default function InicioPage() {
  return (
    <div className="portada">
      <RedirigirTabletActivada />
      <header className="portada-cab">
        <Link href="/" className="marca">
          <Mascota tamano={44} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </Link>
        <Link href="/ingresar" className={clasesBoton('fantasma', { tamano: 'pequeno' })}>
          Ingresar
        </Link>
      </header>

      <main className="portada-heroe">
        <div className="portada-heroe__ilustracion">
          <Paisaje className="portada-heroe__paisaje" />
          <Mascota tamano={190} flota className="portada-heroe__mascota" />
        </div>
        <div className="portada-heroe__texto">
          <h1>La aventura de leer, comprender y crecer</h1>
          <p>Lecturas interactivas para niñas y niños de 6 a 12 años: leen, descubren pistas y crecen como lectores.</p>
          <ContinuarSesion />
          <div className="portada-heroe__acciones">
            <Link href="/registro" className={clasesBoton('primario', { tamano: 'grande', bloque: true })}>
              Empezar
            </Link>
            <Link href="/ingresar" className={clasesBoton('fantasma', { tamano: 'grande', bloque: true })}>
              Ya tengo una cuenta
            </Link>
          </div>
        </div>
      </main>

      <section className="portada-ninos" aria-labelledby="portada-ninos">
        <Mascota tamano={72} />
        <div>
          <h2 id="portada-ninos">¿Eres estudiante?</h2>
          <p>Entra desde la tablet de tu aula o de tu casa: toca tu avatar y escribe tu PIN. ¡Sin códigos!</p>
        </div>
        <Link href="/ingresar/estudiante" className={clasesBoton('secundario', { tamano: 'grande' })}>
          ¡A leer!
        </Link>
      </section>
    </div>
  );
}
