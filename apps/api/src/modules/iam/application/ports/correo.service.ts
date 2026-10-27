/** Puerto de salida: correos transaccionales (RF-002, RF-004). */
export interface CorreoService {
  /** `bajaUrl` (RF-070): baja con un clic desde el programa de correo (RFC 8058). */
  enviar(params: { para: string; asunto: string; texto: string; enlace?: string; bajaUrl?: string }): Promise<void>;
}
