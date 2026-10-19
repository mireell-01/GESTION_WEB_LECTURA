import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { AlmacenArchivos } from '../../application/ports/almacen';

/**
 * Adaptador: almacén en disco para desarrollo y pruebas (en la nube será S3, ADR-008). Las claves
 * las genera el sistema; aun así se impide salir de la carpeta base.
 */
export class AlmacenDiscoLocal implements AlmacenArchivos {
  private readonly base: string;

  constructor(carpeta: string) {
    this.base = resolve(carpeta);
  }

  async guardar(clave: string, datos: Uint8Array): Promise<void> {
    const ruta = this.ruta(clave);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, datos);
  }

  async leer(clave: string): Promise<Buffer | null> {
    try {
      return await readFile(this.ruta(clave));
    } catch {
      return null;
    }
  }

  private ruta(clave: string): string {
    const ruta = resolve(join(this.base, clave));
    if (!ruta.startsWith(this.base + sep)) throw new Error('Clave de almacén inválida');
    return ruta;
  }
}
