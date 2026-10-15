import { FormularioRegistro } from '@/features/iam/FormularioRegistro';

export const metadata = { title: 'Crear cuenta' };

export default function RegistroPage() {
  return (
    <div className="publico__panel">
      <FormularioRegistro />
    </div>
  );
}
