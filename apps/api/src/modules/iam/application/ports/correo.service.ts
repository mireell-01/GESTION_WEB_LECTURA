/** Puerto de salida: correos transaccionales (RF-002, RF-004). */
export interface CorreoService {
  enviar(params: { para: string; asunto: string; texto: string; enlace?: string }): Promise<void>;
}
