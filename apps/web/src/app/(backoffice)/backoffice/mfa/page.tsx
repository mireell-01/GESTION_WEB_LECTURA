'use client';

import { useRouter } from 'next/navigation';

import { Alerta, Tarjeta } from '@lectoaventura/ui';

import { ConfigurarMfa } from '@/features/iam/ConfigurarMfa';

/** RF-011: los roles administrativos deben configurar MFA antes de entrar al backoffice. */
export default function MfaBackofficePage() {
  const router = useRouter();
  return (
    <Tarjeta titulo="🔐 Verificación en dos pasos">
      <Alerta tipo="aviso">
        Por seguridad, las cuentas del backoffice deben usar un código de una app autenticadora además de la contraseña.
      </Alerta>
      <ConfigurarMfa onListo={() => setTimeout(() => router.replace('/backoffice'), 1200)} />
    </Tarjeta>
  );
}
