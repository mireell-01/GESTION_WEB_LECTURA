'use client';

import { Alerta, Tarjeta } from '@lectoaventura/ui';

import { ConfigurarMfa } from '@/features/iam/ConfigurarMfa';
import { useSesion } from '@/shared/auth/sesion';

export default function DocenteHomePage() {
  const { usuario } = useSesion();
  return (
    <div className="pila">
      <Tarjeta titulo={`Hola, ${usuario?.nombre?.split(' ')[0] ?? ''} 👋`}>
        <p className="texto-suave" style={{ margin: 0 }}>
          Aquí administrarás tus aulas, estudiantes y asignaciones.
        </p>
      </Tarjeta>

      {/* RF-011: verificación en dos pasos opcional para docentes. */}
      <Tarjeta titulo="🔐 Seguridad de tu cuenta">
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
