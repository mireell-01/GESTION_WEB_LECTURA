import { BandejaDesarrollo } from '@/features/iam/BandejaDesarrollo';

export const metadata = { title: 'Correos de desarrollo' };

export default function CorreosDesarrolloPage() {
  return (
    <div className="publico__panel publico__panel--ancho">
      <BandejaDesarrollo />
    </div>
  );
}
