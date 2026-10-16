import { BandejaDesarrollo } from '@/features/iam/BandejaDesarrollo';
import { MarcoPublico } from '@/shared/ui';

export const metadata = { title: 'Correos de desarrollo' };

export default function CorreosDesarrolloPage() {
  return (
    <MarcoPublico ancho>
      <BandejaDesarrollo />
    </MarcoPublico>
  );
}
