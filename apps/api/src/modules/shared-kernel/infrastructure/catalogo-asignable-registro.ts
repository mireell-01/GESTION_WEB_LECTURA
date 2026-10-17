import { Injectable } from '@nestjs/common';

import {
  ContenidoAsignable,
  FuenteAsignable,
  RegistroCatalogoAsignable,
  TipoAsignable,
} from '../application/catalogo-asignable';

/** Registro en memoria de las fuentes del catálogo: sin fuente de un tipo, ese tipo está vacío. */
@Injectable()
export class RegistroCatalogoAsignableMemoria implements RegistroCatalogoAsignable {
  private readonly fuentes = new Map<TipoAsignable, FuenteAsignable>();

  registrar(fuente: FuenteAsignable): void {
    this.fuentes.set(fuente.tipo, fuente);
  }

  async listar(): Promise<ContenidoAsignable[]> {
    const listas = await Promise.all([...this.fuentes.values()].map((f) => f.listar()));
    return listas.flat();
  }

  async buscar(tipo: TipoAsignable, id: string): Promise<ContenidoAsignable | null> {
    return (await this.fuentes.get(tipo)?.buscar(id)) ?? null;
  }
}
