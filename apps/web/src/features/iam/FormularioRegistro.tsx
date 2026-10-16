'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

import { Alerta, Boton, Campo, Tarjeta } from '@lectoaventura/ui';

import { api, mensajeDeError } from '@/shared/api/client';

import { ReenviarVerificacion } from './ReenviarVerificacion';

type RolAdulto = 'FAMILIAR' | 'DOCENTE';

/** RF-001: registro de cuenta adulta. La cuenta queda pendiente hasta verificar el correo (RF-002). */
export function FormularioRegistro() {
  const [rol, setRol] = useState<RolAdulto>('FAMILIAR');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [registrado, setRegistrado] = useState(false);

  const errorConfirmacion = confirmacion && confirmacion !== contrasena ? 'Las contraseñas no coinciden' : undefined;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (errorConfirmacion) return;
    setError(null);
    setEnviando(true);
    try {
      await api('/auth/registro', { metodo: 'POST', cuerpo: { nombre, email, contrasena, rol } });
      setRegistrado(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  if (registrado) {
    return (
      <Tarjeta titulo="¡Revisa tu correo! 📬" nivel={1}>
        <p>
          Enviamos un enlace a <strong>{email}</strong> para activar tu cuenta. Vence en 24 horas.
        </p>
        <Alerta tipo="aviso">
          ¿Estás probando la plataforma sin servidor de correo? Abre la <Link href="/dev/correos">bandeja de desarrollo</Link>.
        </Alerta>
        <p className="texto-suave" style={{ marginBottom: 'var(--la-espacio-2)' }}>
          ¿No te llegó o se venció? Pide otro enlace (los anteriores dejan de servir).
        </p>
        <ReenviarVerificacion email={email} esperaInicialSeg={60} />
        <Link href="/ingresar">Ir a ingresar</Link>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Crear una cuenta" nivel={1}>
      <form onSubmit={enviar} noValidate>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 var(--la-espacio-3)' }}>
          <legend className="la-campo__etiqueta" style={{ marginBottom: 'var(--la-espacio-2)' }}>
            Soy…
          </legend>
          <div className="fila">
            {(
              [
                ['FAMILIAR', '👨‍👩‍👧 Familiar'],
                ['DOCENTE', '🧑‍🏫 Docente'],
              ] as const
            ).map(([valor, texto]) => (
              <Boton
                key={valor}
                variante={rol === valor ? 'primario' : 'fantasma'}
                aria-pressed={rol === valor}
                onClick={() => setRol(valor)}
              >
                {texto}
              </Boton>
            ))}
          </div>
        </fieldset>
        <Campo etiqueta="Nombre y apellido" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          ayuda="Mínimo 10 caracteres. Evita contraseñas comunes o tu propio nombre."
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
        />
        <Campo
          etiqueta="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          error={errorConfirmacion}
          required
        />
        <Boton type="submit" bloque cargando={enviando}>
          Crear cuenta
        </Boton>
      </form>
      <p className="texto-suave" style={{ marginBottom: 0 }}>
        ¿Ya tienes cuenta? <Link href="/ingresar">Ingresa</Link>
      </p>
    </Tarjeta>
  );
}
