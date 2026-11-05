// Suite por TIEMPO: los archivos con algún describe [Slow] del Nivel 1 (criptografía real, PDF y conjuntos grandes).
//   npm run test:slow
// Las pruebas de integración son [Slow] por definición (PostgreSQL real): npm run test:int
import '../unit/asistente/dominio/conjunto-adversarial.spec';
import '../unit/contenido/dominio/dominio-contenido.spec';
import '../unit/escuela/infraestructura/tarjetas-y-auditoria.spec';
import '../unit/iam/infraestructura/exportacion-y-logs.spec';
import '../unit/iam/infraestructura/seguridad.spec';
