import { FormularioRegistro } from '@/features/iam/FormularioRegistro';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Crear cuenta' };

export default function RegistroPage() {
  return (
    <MarcoPublico>
      <FormularioRegistro />
    </MarcoPublico>
  );
}
