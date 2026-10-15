import { IngresoEstudiante } from '@/features/iam/IngresoEstudiante';

export const metadata = { title: '¡A leer!' };

export default function IngresoEstudiantePage() {
  return (
    <div className="publico__panel publico__panel--ancho">
      <IngresoEstudiante />
    </div>
  );
}
