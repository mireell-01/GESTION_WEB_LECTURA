'use client';

import { FormEvent, useState } from 'react';

import { Alerta, AVATARES, Boton, BotonAvatar, Campo, Selector } from '@lectoaventura/ui';

import { mensajeDeError } from '@/shared/api/client';

import { MESES } from './tipos';

export interface DatosPerfilNuevo {
  alias: string;
  anioNacimiento: number;
  mesNacimiento: number;
  avatar: string;
  pin: string;
}

/**
 * Formulario de perfil de estudiante (RF-006): solo alias, año-mes de nacimiento, avatar y PIN.
 * Nunca pide apellidos, documento, foto ni correo del menor (RN-02).
 */
export function FormularioPerfil({
  onGuardar,
  onCancelar,
  textoBoton = 'Crear perfil',
}: {
  onGuardar: (datos: DatosPerfilNuevo) => Promise<void>;
  onCancelar?: () => void;
  textoBoton?: string;
}) {
  const anioActual = new Date().getFullYear();
  const [alias, setAlias] = useState('');
  const [anio, setAnio] = useState(String(anioActual - 8));
  const [mes, setMes] = useState('1');
  const [avatar, setAvatar] = useState('zorro');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const errorPin = pin2 && pin2 !== pin ? 'Los PIN no coinciden' : undefined;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (errorPin) return;
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({ alias, anioNacimiento: Number(anio), mesNacimiento: Number(mes), avatar, pin });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const anios = Array.from({ length: 9 }, (_, i) => String(anioActual - 5 - i));

  return (
    <form onSubmit={enviar} noValidate>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <Campo
        etiqueta="Alias o apodo"
        ayuda="Solo el nombre o apodo con el que se reconoce. Sin apellidos."
        value={alias}
        maxLength={20}
        onChange={(e) => setAlias(e.target.value)}
      />
      <div className="fila" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Selector
            etiqueta="Mes de nacimiento"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            opciones={MESES.map((m, i) => ({ valor: String(i + 1), texto: m }))}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Selector
            etiqueta="Año de nacimiento"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            opciones={anios.map((a) => ({ valor: a, texto: a }))}
          />
        </div>
      </div>
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 var(--la-espacio-3)' }}>
        <legend className="la-campo__etiqueta" style={{ marginBottom: 'var(--la-espacio-2)' }}>
          Avatar
        </legend>
        <div className="fila">
          {Object.entries(AVATARES).map(([clave, a]) => (
            <BotonAvatar key={clave} clave={clave} texto={a.nombre} seleccionado={avatar === clave} onClick={() => setAvatar(clave)} />
          ))}
        </div>
      </fieldset>
      <div className="fila" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Campo
            etiqueta="PIN de 4 números"
            ayuda="No uses 1234, números repetidos ni el año de nacimiento."
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Campo
            etiqueta="Repite el PIN"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            error={errorPin}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <div className="fila">
        <Boton type="submit" cargando={enviando} disabled={!alias.trim() || pin.length !== 4}>
          {textoBoton}
        </Boton>
        {onCancelar ? (
          <Boton variante="fantasma" onClick={onCancelar}>
            Cancelar
          </Boton>
        ) : null}
      </div>
    </form>
  );
}
