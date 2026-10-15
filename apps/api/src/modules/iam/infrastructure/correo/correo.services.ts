import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

import { CorreoService } from '../../application/ports/correo.service';

type Mensaje = Parameters<CorreoService['enviar']>[0];

function textoPlano(m: Mensaje): string {
  return m.enlace ? `${m.texto}\n\n${m.enlace}\n\n— Equipo LectoAventura` : `${m.texto}\n\n— Equipo LectoAventura`;
}

/** Adaptador: SMTP real con nodemailer (se activa con SMTP_HOST). */
export class SmtpCorreoService implements CorreoService {
  private readonly transporte;

  constructor(
    config: { host: string; puerto: number; usuario?: string; contrasena?: string },
    private readonly remitente: string,
  ) {
    this.transporte = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      secure: config.puerto === 465,
      auth: config.usuario ? { user: config.usuario, pass: config.contrasena } : undefined,
    });
  }

  async enviar(mensaje: Mensaje): Promise<void> {
    await this.transporte.sendMail({
      from: this.remitente,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: textoPlano(mensaje),
    });
  }
}

export interface CorreoDesarrollo extends Mensaje {
  enviadoEn: string;
}

/**
 * Adaptador de desarrollo: no envía nada; registra el correo en consola y lo guarda en una
 * bandeja en memoria que la web muestra en /dev/correos. Nunca se usa en producción.
 */
export class ConsolaCorreoService implements CorreoService {
  private readonly logger = new Logger('Correo (desarrollo)');
  private readonly bandeja: CorreoDesarrollo[] = [];

  async enviar(mensaje: Mensaje): Promise<void> {
    this.bandeja.unshift({ ...mensaje, enviadoEn: new Date().toISOString() });
    this.bandeja.splice(50);
    this.logger.log(`→ ${mensaje.para} · ${mensaje.asunto}${mensaje.enlace ? ` · ${mensaje.enlace}` : ''}`);
  }

  correos(): CorreoDesarrollo[] {
    return [...this.bandeja];
  }
}
