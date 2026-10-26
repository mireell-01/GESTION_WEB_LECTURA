import { ETIQUETA_NIVEL, NOMBRE_HABILIDAD, NivelCNEB } from '../../../shared-kernel/public-api';
import { Celda } from './mapa-calor';
import { MotivoRiesgo } from './riesgo';

/** Una fila del reporte de aula (RF-067): un estudiante. */
export interface FilaReporte {
  alias: string;
  celdas: Celda[];
  ultimaActividad: Date | null;
  lecturasSemana: number;
  motivosRiesgo: MotivoRiesgo[];
}

export const TEXTO_MOTIVO: Record<MotivoRiesgo, string> = {
  SIN_ACTIVIDAD: '7 días o más sin actividad',
  HABILIDADES_EN_INICIO: '2 o más habilidades en inicio',
};

export function textoNivel(nivel: NivelCNEB | null): string {
  return nivel ? `${nivel} (${ETIQUETA_NIVEL[nivel]})` : 'Aún descubriendo';
}

/**
 * Celda CSV segura (RFC 4180): entre comillas si lleva separador, comillas o saltos, y con un apóstrofo
 * delante si empieza como una fórmula (=, +, -, @), para que la hoja de cálculo no la ejecute.
 */
export function celdaCsv(valor: string | number | null): string {
  let texto = valor === null ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const fechaLima = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

/** RF-067: el reporte en CSV (UTF-8 con BOM, para que Excel muestre bien las tildes). */
export function reporteCsv(filas: FilaReporte[]): string {
  const habilidades = filas[0]?.celdas.map((c) => c.habilidad) ?? [];
  const cabecera = [
    'Estudiante',
    ...habilidades.flatMap((h) => [`${NOMBRE_HABILIDAD[h]} (maestría)`, `${NOMBRE_HABILIDAD[h]} (nivel)`]),
    'Última actividad',
    'Lecturas esta semana',
    'En riesgo',
  ];
  const lineas = filas.map((f) => [
    f.alias,
    ...f.celdas.flatMap((c) => [c.valor === null ? '' : c.valor, textoNivel(c.nivel)]),
    f.ultimaActividad ? fechaLima(f.ultimaActividad) : 'Sin actividad',
    f.lecturasSemana,
    f.motivosRiesgo.length > 0 ? `Sí: ${f.motivosRiesgo.map((m) => TEXTO_MOTIVO[m]).join('; ')}` : 'No',
  ]);
  return `\uFEFF${[cabecera, ...lineas].map((l) => l.map(celdaCsv).join(',')).join('\r\n')}\r\n`;
}
