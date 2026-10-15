/** Puerto de salida: TOTP para MFA (RF-011). */
export interface TotpService {
  generarSecreto(): string;
  /** URL otpauth:// que se muestra como código QR en la app autenticadora. */
  urlConfiguracion(email: string, secreto: string): string;
  verificar(secreto: string, codigo: string): boolean;
}
