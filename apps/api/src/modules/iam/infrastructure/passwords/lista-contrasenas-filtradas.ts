import { ContrasenasFiltradasRepository } from '../../application/ports/contrasenas-filtradas.repository';

/**
 * Contraseñas de 10+ caracteres que más aparecen en filtraciones públicas (incluidas variantes
 * en español). Se complementa con reglas para patrones triviales.
 */
const FILTRADAS = new Set([
  '1234567890', '0123456789', '12345678910', '123456789a', 'qwertyuiop', 'asdfghjkl1',
  '1q2w3e4r5t', '1qaz2wsx3edc', 'password12', 'password123', 'password1234', 'contrasena',
  'contrasena1', 'contrasena123', 'contraseña', 'contraseña1', 'contraseña123', 'iloveyou12',
  'teamo12345', 'teamo123456', 'princesa123', 'superman123', 'qwerty1234', 'qwerty12345',
  'abc1234567', 'abcdefghij', 'peru123456', 'perú123456', 'lima123456', 'futbol1234',
  'america123', 'alianza123', 'universitario', 'cristal123', 'mariposa12', 'estrella12',
  'corazon123', 'chocolate1', 'administrador', 'admin12345', 'welcome123', 'bienvenido',
  'bienvenido1', 'football12', 'baseball12', 'sunshine12', 'starwars12', 'dragon1234',
  'monkey1234', 'letmein123', 'trustno1234', 'passw0rd12', 'p@ssw0rd12', 'computadora',
  'lectoaventura', 'lectoaventura1', 'lectoaventura123', 'docente123', 'profesor123',
]);

export class ListaContrasenasFiltradas implements ContrasenasFiltradasRepository {
  async estaFiltrada(contrasena: string, contexto?: { email?: string; nombre?: string }): Promise<boolean> {
    const normal = contrasena.trim().toLowerCase();
    if (FILTRADAS.has(normal)) return true;
    // Un solo carácter repetido o solo dígitos consecutivos.
    if (/^(.)\1+$/.test(normal)) return true;
    if ('01234567890123456789'.includes(normal) || '98765432109876543210'.includes(normal)) return true;
    // Contiene la parte local del correo o el nombre de la persona.
    const local = contexto?.email?.split('@')[0]?.toLowerCase();
    if (local && local.length >= 4 && normal.includes(local)) return true;
    // El nombre de la persona más solo números o símbolos (p. ej. "Rosa123456").
    const nombre = contexto?.nombre?.trim().toLowerCase().split(/\s+/)[0];
    if (nombre && nombre.length >= 3 && normal.includes(nombre)) {
      const resto = normal.replace(nombre, '');
      if (!/[a-zñáéíóúü]/.test(resto)) return true;
    }
    return false;
  }
}
