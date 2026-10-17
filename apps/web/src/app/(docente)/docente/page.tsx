'use client';

import { Alerta, Icono, Tarjeta } from '@lectoaventura/ui';

import { MisAulas } from '@/features/escuela/MisAulas';
import { ActivarTabletAula } from '@/features/iam/ActivarTabletAula';
import { ConfigurarMfa } from '@/features/iam/ConfigurarMfa';
import { useSesion } from '@/shared/auth/sesion';

export default function DocenteHomePage() {
  const { usuario } = useSesion();
  return (
    <div className="pila">
      <header className="saludo-adulto">
        <h1>Hola, {usuario?.nombre?.split(' ')[0] ?? ''} 👋</h1>
        <p className="texto-suave">Administra tus aulas, estudiantes y asignaciones.</p>
      </header>

      <MisAulas />

      <ActivarTabletAula />

      {/* RF-011: verificación en dos pasos opcional para docentes. */}
      <Tarjeta
        titulo={
          <span className="titulo-con-icono">
            <Icono nombre="escudo" tamano={28} />
            Seguridad de tu cuenta
          </span>
        }
      >
        {usuario?.mfaHabilitado ? (
          <Alerta tipo="exito">La verificación en dos pasos está activa.</Alerta>
        ) : (
          <>
            <p className="texto-suave">Opcional: pide un código de tu celular además de la contraseña.</p>
            <ConfigurarMfa />
          </>
        )}
      </Tarjeta>
    </div>
  );
}
