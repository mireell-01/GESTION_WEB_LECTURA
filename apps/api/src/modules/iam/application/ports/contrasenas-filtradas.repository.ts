/** Puerto de salida: verificación de contraseñas comprometidas o muy comunes (RF-001). */
export interface ContrasenasFiltradasRepository {
  estaFiltrada(contrasena: string, contexto?: { email?: string; nombre?: string }): Promise<boolean>;
}
