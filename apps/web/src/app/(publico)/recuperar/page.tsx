import { RecuperarContrasena } from '@/features/iam/RecuperarContrasena';

export const metadata = { title: 'Recuperar contraseña' };

export default function RecuperarPage() {
  return (
    <div className="publico__panel">
      <RecuperarContrasena />
    </div>
  );
}
