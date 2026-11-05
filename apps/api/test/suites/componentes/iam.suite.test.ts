// Suite por COMPONENTE: todo el Nivel 1 de IAM, aislado del resto.
//   npm run test:suite -- componentes/iam
import '../../unit/iam/aplicacion/administrar-docentes.spec';
import '../../unit/iam/aplicacion/autenticacion.spec';
import '../../unit/iam/aplicacion/cuentas-y-perfiles.spec';
import '../../unit/iam/aplicacion/vinculos-familiares.spec';
import '../../unit/iam/dominio/entidades.spec';
import '../../unit/iam/dominio/value-objects.spec';
import '../../unit/iam/infraestructura/exportacion-y-logs.spec';
import '../../unit/iam/infraestructura/seguridad.spec';
import '../../unit/iam/interface/guards.spec';
import '../../unit/iam/interface/limite-tasa.spec';
