// Suite por RIESGO: los archivos con algún describe [Core] (seguridad y privacidad de los niños, calificación y
// contenido que les llega). Se corre con -t para dejar afuera los [Menor] de esos archivos:
//   npm run test:core        (toda la suite Core)
//   npm run test:core:fast   (Core y Fast: la puerta rápida de CI)
// La guardia etiquetas.spec.ts falla si esta lista queda desactualizada o si una regla crítica deja de ser Core.
import '../unit/administracion/administracion.spec';
import '../unit/asistente/aplicacion/asistente-casos-de-uso.spec';
import '../unit/asistente/dominio/conjunto-adversarial.spec';
import '../unit/asistente/dominio/dominio-asistente.spec';
import '../unit/contenido/aplicacion/contenido-casos-de-uso.spec';
import '../unit/contenido/dominio/dominio-contenido.spec';
import '../unit/contenido/infraestructura/almacen-y-firma.spec';
import '../unit/diagnostico/aplicacion/diagnostico-casos-de-uso.spec';
import '../unit/diagnostico/dominio/dominio-diagnostico.spec';
import '../unit/escuela/aplicacion/aulas-y-matriculas.spec';
import '../unit/escuela/aplicacion/instituciones.spec';
import '../unit/escuela/aplicacion/invitaciones.spec';
import '../unit/escuela/dominio/dominio-escuela.spec';
import '../unit/escuela/infraestructura/tarjetas-y-auditoria.spec';
import '../unit/iam/aplicacion/administrar-docentes.spec';
import '../unit/iam/aplicacion/autenticacion.spec';
import '../unit/iam/aplicacion/cuentas-y-perfiles.spec';
import '../unit/iam/aplicacion/vinculos-familiares.spec';
import '../unit/iam/dominio/entidades.spec';
import '../unit/iam/dominio/value-objects.spec';
import '../unit/iam/infraestructura/exportacion-y-logs.spec';
import '../unit/iam/infraestructura/seguridad.spec';
import '../unit/iam/interface/guards.spec';
import '../unit/iam/interface/limite-tasa.spec';
import '../unit/lectura/aplicacion/lectura-casos-de-uso.spec';
import '../unit/lectura/dominio/correccion-caja-blanca.spec';
import '../unit/lectura/dominio/dominio-lectura.spec';
import '../unit/progreso/aplicacion/progreso-casos-de-uso.spec';
import '../unit/progreso/dominio/dominio-progreso.spec';
import '../unit/progreso/dominio/maestria-caja-negra.spec';
import '../unit/reporting/aplicacion/familia-casos-de-uso.spec';
import '../unit/reporting/aplicacion/reporting-casos-de-uso.spec';
import '../unit/reporting/dominio/dominio-familia.spec';
import '../unit/reporting/dominio/dominio-reporting.spec';
import '../unit/suites/etiquetas.spec';
