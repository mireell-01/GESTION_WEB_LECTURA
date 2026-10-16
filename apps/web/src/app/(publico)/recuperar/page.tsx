import { RecuperarContrasena } from '@/features/iam/RecuperarContrasena';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Recuperar contraseña' };

export default function RecuperarPage() {
  return (
    <MarcoPublico>
      <RecuperarContrasena />
    </MarcoPublico>
  );
}
