import { NOMBRE_HABILIDAD } from '../../../shared-kernel/public-api';
import { semanaFamiliarPorResumir } from '../../domain/services/acompanamiento-familiar';
import { PanelHijo } from '../dto/familia.dto';
import { FirmaBaja, HijosFamilia, NotificadorFamilia, ReportesFamiliaRepository } from '../ports/familia.ports';
import { PanelHijoUseCase } from './panel-hijo.use-case';

const fechaLarga = (semana: string) =>
  new Date(`${semana}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'UTC' });

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const juntar = (nombres: string[]) => (nombres.length < 2 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`);

/** El párrafo de un hijo en el correo: su semana, su avance y cómo acompañarle (sin más datos que su alias). */
export function parrafoHijo(p: PanelHijo): string {
  const { actual, anterior } = p.semana;
  const lineas = [p.estudiante.alias];
  lineas.push(
    actual.minutos > 0 || actual.lecturas > 0
      ? `• Esta semana: ${actual.minutos} min de lectura y ${plural(actual.lecturas, 'lectura terminada', 'lecturas terminadas')} (la semana anterior: ${anterior.minutos} min).`
      : `• Esta semana no leyó en LectoAventura. Una idea para la próxima: ${p.habito[0]}`,
  );
  const { mundoActual, lecturasTerminadas, puntos } = p.avance;
  const lleva = `${plural(lecturasTerminadas, 'lectura terminada', 'lecturas terminadas')} y ${plural(puntos, 'punto', 'puntos')}`;
  if (mundoActual) lineas.push(`• Va en el mundo ${mundoActual.numero} · ${mundoActual.nombre}; lleva ${lleva}.`);
  else if (lecturasTerminadas > 0 || puntos > 0) lineas.push(`• Lleva ${lleva}.`);
  else lineas.push('• Aún no empieza su aventura: cuando haga su reto inicial verás aquí su avance.');
  for (const a of p.aReforzar) {
    lineas.push(`• Para acompañar en casa ${NOMBRE_HABILIDAD[a.habilidad].toLowerCase()}: ${a.consejos[0]}`);
  }
  return lineas.join('\n');
}

/**
 * RF-070: el resumen semanal de cada familia, los domingos desde las 18:00 de Lima: la semana y el
 * avance de cada hijo activo con un consejo por habilidad a reforzar. Una vez por familia y semana,
 * salvo que se haya dado de baja; cada correo lleva su enlace de baja con un clic. Lo invoca el worker.
 */
export class ResumenFamiliarUseCase {
  constructor(
    private readonly repo: ReportesFamiliaRepository,
    private readonly hijos: HijosFamilia,
    private readonly panel: PanelHijoUseCase,
    private readonly notificador: NotificadorFamilia,
    private readonly firma: FirmaBaja,
    private readonly urlWeb: string,
    private readonly ahora: () => Date,
  ) {}

  /**
   * Devuelve a cuántas familias se les envió. Si el correo de una falla, se libera su registro (se
   * reintenta en el próximo ciclo), se sigue con las demás y al final se informa el error.
   */
  async enviarPendientes(ahora = this.ahora()): Promise<number> {
    const semana = semanaFamiliarPorResumir(ahora);
    const familias = await this.repo.hijosPorFamilia();
    if (familias.size === 0) return 0;
    const preferencias = await this.repo.preferencias([...familias.keys()]);

    let enviados = 0;
    const fallas: unknown[] = [];
    for (const [cuentaId, hijoIds] of familias) {
      if (preferencias.get(cuentaId) === false) continue;
      // Se registra antes de enviar: si dos procesos coinciden, solo uno lo envía.
      if (!(await this.repo.registrarResumenFamiliar(cuentaId, semana, hijoIds.length))) continue;
      try {
        if (await this.enviar(cuentaId, hijoIds, semana)) enviados += 1;
      } catch (error) {
        await this.repo.liberarResumenFamiliar(cuentaId, semana);
        fallas.push(error);
      }
    }
    if (fallas.length) throw new Error(`No salió el resumen semanal de ${fallas.length} familia(s); se reintentará`, { cause: fallas[0] });
    return enviados;
  }

  private async enviar(cuentaId: string, hijoIds: string[], semana: string): Promise<boolean> {
    const hijos = (await this.hijos.hijosDe(cuentaId)).filter((h) => h.activo && hijoIds.includes(h.id));
    if (hijos.length === 0) return false;
    const paneles: PanelHijo[] = [];
    for (const h of hijos) paneles.push(await this.panel.armar(h, semana));

    const token = encodeURIComponent(this.firma.token(cuentaId));
    const nombres = juntar(hijos.map((h) => h.alias));
    const texto = [
      `Hola. Así ${hijos.length === 1 ? 'leyó' : 'leyeron'} ${nombres} en LectoAventura en la semana del ${fechaLarga(semana)}:`,
      '',
      ...paneles.flatMap((p) => [parrafoHijo(p), '']),
      `Para dejar de recibir este resumen, abre este enlace (un clic): ${this.urlWeb}/resumen-familiar/baja?token=${token}`,
      '',
      'Mira el avance completo y más ideas para acompañar en tu panel de familia:',
    ].join('\n');
    return this.notificador.notificar(cuentaId, {
      asunto: `Resumen semanal: así ${hijos.length === 1 ? 'leyó' : 'leyeron'} ${nombres}`,
      texto,
      enlace: `${this.urlWeb}/familia`,
      // RFC 8058: el botón "Cancelar suscripción" del programa de correo da de baja con un POST.
      bajaUrl: `${this.urlWeb}/api/v1/familia/preferencias-notificacion/baja?token=${token}`,
    });
  }
}
