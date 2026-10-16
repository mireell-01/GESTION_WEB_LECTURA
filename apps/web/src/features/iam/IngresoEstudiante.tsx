'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';

import { Alerta, Avatar, Boton, BotonAvatar, Cargando, clasesBoton, Icono, Mascota, TecladoPin } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError, RespuestaSesion } from '@/shared/api/client';
import { leerTokenDispositivo, olvidarDispositivo } from '@/shared/auth/dispositivo';
import { useSesion } from '@/shared/auth/sesion';

interface PerfilIngreso {
  id: string;
  alias: string;
  avatar: string;
}

interface ContextoTablet {
  contexto: { tipo: 'FAMILIA' | 'AULA'; nombre: string };
  estudiantes: PerfilIngreso[];
}

/** Pantalla del niño: panel de bienvenida con la mascota + panel de trabajo (avatares o PIN). */
function PantallaIngreso({ titulo, subtitulo, chip, children }: { titulo: string; subtitulo: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <div className="ing">
      <header className="ing-bienvenida">
        <Link href="/" className="marca marca--clara marca--compacta ing-bienvenida__marca">
          <Mascota tamano={36} />
          <span className="marca__texto">
            Lecto<b>Aventura</b>
          </span>
        </Link>
        <Mascota tamano={150} flota className="ing-bienvenida__mascota" />
        <div className="ing-bienvenida__texto">
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
          {chip}
        </div>
      </header>
      <main className="ing-panel">{children}</main>
    </div>
  );
}

/**
 * RF-007 / RN-04 / CR-01: el niño entra desde una tablet activada por su docente o su familia:
 * ve directo los avatares de su grupo, toca el suyo y escribe su PIN. Nunca escribe un código.
 * Sin tablet activada no se muestran avatares: se explica a los adultos cómo activarla.
 */
export function IngresoEstudiante() {
  const router = useRouter();
  const porInactividad = useSearchParams().get('motivo') === 'inactividad';
  const { iniciar } = useSesion();
  const [token, setToken] = useState<string | null>(null);
  const [datos, setDatos] = useState<ContextoTablet | null>(null);
  const [elegido, setElegido] = useState<PerfilIngreso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const guardado = leerTokenDispositivo();
    if (!guardado) {
      setCargando(false);
      return;
    }
    api<ContextoTablet>('/acceso-estudiante/contexto-dispositivo', { cabeceras: { 'x-dispositivo': guardado } })
      .then((respuesta) => {
        setToken(guardado);
        setDatos(respuesta);
      })
      .catch((err) => {
        // Vencida (30 días), revocada o de un aula archivada: hay que volver a activarla.
        if (err instanceof ErrorApi && err.estado === 403) olvidarDispositivo();
        else setError(mensajeDeError(err));
      })
      .finally(() => setCargando(false));
  }, []);

  const ingresar = useCallback(
    async (pin: string) => {
      if (!token || !elegido) return;
      setError(null);
      setEnviando(true);
      try {
        const sesion = await api<RespuestaSesion>('/acceso-estudiante/login', {
          metodo: 'POST',
          cuerpo: { perfilId: elegido.id, pin, tokenDispositivo: token },
        });
        router.replace(await iniciar(sesion));
      } catch (err) {
        if (err instanceof ErrorApi && err.estado === 423) {
          setError('Escribiste el PIN equivocado muchas veces. Espera 15 minutos o pide ayuda a un adulto. 🙏');
        } else if (err instanceof ErrorApi && typeof err.detalle?.['intentosRestantes'] === 'number') {
          setError(`Ese no es tu PIN. Te quedan ${err.detalle['intentosRestantes']} intentos.`);
        } else {
          setError(mensajeDeError(err));
        }
      } finally {
        setEnviando(false);
      }
    },
    [token, elegido, iniciar, router],
  );

  if (cargando) {
    return (
      <PantallaIngreso titulo="¡Hola!" subtitulo="Preparando tu aventura…">
        <Cargando />
      </PantallaIngreso>
    );
  }

  // RF-010: avisa por qué volvió a la pantalla de ingreso.
  const avisoInactividad = porInactividad ? (
    <Alerta tipo="info">Cerramos tu sesión porque no hubo actividad por un rato. ¡Vuelve a entrar!</Alerta>
  ) : null;

  // Paso 2: PIN
  if (elegido && datos) {
    return (
      <PantallaIngreso titulo={`¡Hola, ${elegido.alias}!`} subtitulo="Escribe tu PIN secreto de 4 números">
        <section className="ing-pin" aria-label="Tu PIN secreto">
          <Avatar clave={elegido.avatar} tamano={96} etiqueta={`Tu avatar, ${elegido.alias}`} />
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          <TecladoPin onCompletar={ingresar} deshabilitado={enviando} />
          <Boton variante="fantasma" onClick={() => setElegido(null)}>
            No soy yo
          </Boton>
        </section>
      </PantallaIngreso>
    );
  }

  // Paso 1: elegir avatar (solo con la tablet activada)
  if (datos) {
    return (
      <PantallaIngreso
        titulo="¿Quién va a leer hoy?"
        subtitulo="Toca tu avatar para entrar"
        chip={
          <span className="ing-contexto">
            <Icono nombre={datos.contexto.tipo === 'AULA' ? 'aula' : 'familia'} tamano={20} />
            {datos.contexto.tipo === 'AULA' ? `Aula ${datos.contexto.nombre}` : datos.contexto.nombre}
          </span>
        }
      >
        {avisoInactividad}
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        {datos.estudiantes.length === 0 ? (
          <Alerta tipo="aviso">Todavía no hay perfiles aquí. Pide a un adulto que cree el tuyo.</Alerta>
        ) : (
          <div className="ing-avatares">
            {datos.estudiantes.map((p) => (
              <BotonAvatar key={p.id} clave={p.avatar} texto={p.alias} onClick={() => setElegido(p)} />
            ))}
          </div>
        )}
        <p className="ing-adulto">
          <Link href="/ingresar">Soy un adulto: ingresar a mi cuenta</Link>
        </p>
      </PantallaIngreso>
    );
  }

  // Sin tablet activada: nunca se piden códigos; se explica a los adultos cómo activarla.
  return (
    <PantallaIngreso titulo="Esta tablet aún no está activada" subtitulo="Pide a tu profe o a tu familia que la active. ¡Solo se hace una vez!">
      {avisoInactividad}
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <section className="la-tarjeta ing-activar" aria-labelledby="ing-activar">
        <h2 id="ing-activar">Para los adultos</h2>
        <ol className="ing-pasos">
          <li>
            <Icono nombre="aula" tamano={28} />
            <span>
              <strong>Docente:</strong> ingresa a tu cuenta, ve a <em>Mis aulas</em> y toca <em>Activar esta tablet</em>.
            </span>
          </li>
          <li>
            <Icono nombre="familia" tamano={28} />
            <span>
              <strong>Familia:</strong> ingresa a tu cuenta y toca <em>Vincular este dispositivo</em>.
            </span>
          </li>
        </ol>
        <p className="texto-suave">Dura 30 días. Después, los niños entran solo con su avatar y su PIN.</p>
        <Link href="/ingresar" className={clasesBoton('primario', { tamano: 'grande', bloque: true })}>
          Soy un adulto: ingresar
        </Link>
      </section>
    </PantallaIngreso>
  );
}
