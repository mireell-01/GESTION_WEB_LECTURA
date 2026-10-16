'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

import { Alerta, Avatar, Boton, BotonAvatar, Campo, Cargando, TecladoPin, Tarjeta } from '@lectoaventura/ui';

import { api, ErrorApi, mensajeDeError, RespuestaSesion } from '@/shared/api/client';
import { leerTokenDispositivo, olvidarDispositivo } from '@/shared/auth/dispositivo';
import { useSesion } from '@/shared/auth/sesion';

interface PerfilIngreso {
  id: string;
  alias: string;
  avatar: string;
}

type Contexto = { tipo: 'DISPOSITIVO'; token: string } | { tipo: 'AULA'; codigo: string; nombreAula: string };

/**
 * RF-007 / RN-04: el estudiante entra con un contexto (dispositivo familiar o código de aula),
 * elige su avatar y escribe su PIN. Sin contexto válido no se muestran avatares.
 */
export function IngresoEstudiante() {
  const router = useRouter();
  const porInactividad = useSearchParams().get('motivo') === 'inactividad';
  const { iniciar } = useSesion();
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [perfiles, setPerfiles] = useState<PerfilIngreso[] | null>(null);
  const [elegido, setElegido] = useState<PerfilIngreso | null>(null);
  const [codigoAula, setCodigoAula] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // Si la tablet de casa está vinculada, muestra directamente los avatares de la familia.
  useEffect(() => {
    const token = leerTokenDispositivo();
    if (!token) {
      setCargando(false);
      return;
    }
    api<PerfilIngreso[]>('/acceso-estudiante/contexto-dispositivo', { cabeceras: { 'x-dispositivo': token } })
      .then((lista) => {
        setContexto({ tipo: 'DISPOSITIVO', token });
        setPerfiles(lista);
      })
      .catch(() => olvidarDispositivo())
      .finally(() => setCargando(false));
  }, []);

  const buscarAula = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const codigo = codigoAula.trim().toUpperCase();
    try {
      const datos = await api<{ aula: { nombre: string }; estudiantes: PerfilIngreso[] }>(`/acceso-estudiante/contexto/${codigo}`);
      setContexto({ tipo: 'AULA', codigo, nombreAula: datos.aula.nombre });
      setPerfiles(datos.estudiantes);
    } catch (err) {
      setError(err instanceof ErrorApi && err.estado === 404 ? 'No encontramos un aula con ese código. Revisa tu tarjeta.' : mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const ingresar = useCallback(
    async (pin: string) => {
      if (!contexto || !elegido) return;
      setError(null);
      setEnviando(true);
      try {
        const sesion = await api<RespuestaSesion>('/acceso-estudiante/login', {
          metodo: 'POST',
          cuerpo: {
            perfilId: elegido.id,
            pin,
            ...(contexto.tipo === 'DISPOSITIVO' ? { tokenDispositivo: contexto.token } : { codigoAula: contexto.codigo }),
          },
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
    [contexto, elegido, iniciar, router],
  );

  const reiniciar = () => {
    setContexto(null);
    setPerfiles(null);
    setElegido(null);
    setError(null);
  };

  if (cargando) return <Cargando />;

  // RF-010: avisa por qué volvió a la pantalla de ingreso.
  const avisoInactividad = porInactividad ? (
    <Alerta tipo="info">Cerramos tu sesión porque no hubo actividad por un rato. ¡Vuelve a entrar!</Alerta>
  ) : null;

  // Paso 3: PIN
  if (elegido) {
    return (
      <Tarjeta className="texto-centro">
        <div className="pila">
          <div>
            <Avatar clave={elegido.avatar} tamano={96} />
            <h1 style={{ marginTop: 'var(--la-espacio-2)' }}>¡Hola, {elegido.alias}!</h1>
            <p className="texto-suave" style={{ margin: 0 }}>
              Escribe tu PIN secreto de 4 números
            </p>
          </div>
          {error ? <Alerta tipo="error">{error}</Alerta> : null}
          <TecladoPin onCompletar={ingresar} deshabilitado={enviando} />
          <Boton variante="fantasma" onClick={() => setElegido(null)}>
            ← No soy yo
          </Boton>
        </div>
      </Tarjeta>
    );
  }

  // Paso 2: elegir avatar
  if (contexto && perfiles) {
    return (
      <Tarjeta
        titulo={contexto.tipo === 'AULA' ? `Aula: ${contexto.nombreAula}` : '¿Quién va a leer hoy?'}
        acciones={
          contexto.tipo === 'AULA' ? (
            <Boton variante="fantasma" tamano="pequeno" onClick={reiniciar}>
              Cambiar código
            </Boton>
          ) : null
        }
      >
        {avisoInactividad}
        {perfiles.length === 0 ? (
          <Alerta tipo="aviso">Todavía no hay perfiles aquí. Pide a un adulto que cree el tuyo.</Alerta>
        ) : (
          <div className="fila" style={{ justifyContent: 'center' }}>
            {perfiles.map((p) => (
              <BotonAvatar key={p.id} clave={p.avatar} texto={p.alias} onClick={() => setElegido(p)} />
            ))}
          </div>
        )}
        {contexto.tipo === 'DISPOSITIVO' ? (
          <p className="texto-centro" style={{ marginBottom: 0 }}>
            <Boton variante="fantasma" tamano="pequeno" onClick={reiniciar}>
              Entrar con código de aula
            </Boton>
          </p>
        ) : null}
      </Tarjeta>
    );
  }

  // Paso 1: contexto
  return (
    <Tarjeta titulo="🏫 Entra a tu aula">
      <form onSubmit={buscarAula} className="pila-sm">
        {avisoInactividad}
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <Campo
          etiqueta="Código de tu aula"
          ayuda="Está en tu tarjeta de acceso: 6 letras y números."
          value={codigoAula}
          onChange={(e) => setCodigoAula(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          maxLength={6}
          autoComplete="off"
          style={{ fontSize: '1.5rem', letterSpacing: '0.3em', textAlign: 'center' }}
        />
        <Boton type="submit" tamano="grande" bloque cargando={enviando} disabled={codigoAula.length !== 6}>
          Siguiente
        </Boton>
      </form>
      <Alerta tipo="info">
        ¿Lees en casa? Un adulto debe entrar a su cuenta familiar y tocar <strong>“Vincular este dispositivo”</strong>.
      </Alerta>
    </Tarjeta>
  );
}
