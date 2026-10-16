# CR-01 — Ingreso del estudiante sin código de aula ("tablet recordada")

| Campo | Valor |
| :--- | :--- |
| Estado | **Aprobado** por la Product Owner (16/10/2026) |
| Solicitado por | Product Owner, al revisar el diseño visual aprobado |
| Módulo | 1 · Identidad, Consentimiento y Acceso (IAM) — con apoyo de Escuela |
| Rama | `diseno-responsivo` |

## 1. Pedido

> "Quita el código de aula y que se vea abierto, como la app de Duolingo: no quiero que pida código de aula."

La aplicación debe abrirse directamente en una experiencia amigable, sin que el niño escriba un código.

## 2. Decisión

Se compararon dos alternativas con la Product Owner:

| Opción | Cómo entra el niño | Resultado |
| :--- | :--- | :--- |
| **Tablet recordada** | La docente (o la familia) activa la tablet **una vez**; desde entonces el niño abre la app, ve los avatares de su aula o familia, toca el suyo y escribe su PIN. | ✅ **Elegida** |
| Usuario + PIN | Cada niño escribe un nombre de usuario y su PIN en cualquier dispositivo. | Descartada: difícil para niños de 6–7 años (RNF-024) y menos segura con un PIN de 4 números y usuarios visibles. |

## 3. Qué cambia respecto al SRS

| Elemento del SRS | Antes | Ahora |
| :--- | :--- | :--- |
| ADR-004 / RF-007 | Contexto = código de aula **o** dispositivo familiar | Contexto = **dispositivo activado** por la familia **o por la docente para su aula** |
| RN-04 | Código de aula vigente o token de dispositivo familiar (30 días) | Token de dispositivo de la familia **o del aula** (30 días); sin código de aula |
| SRS §7 (API) | `GET /acceso-estudiante/contexto/{codigoAula}` | **Eliminado.** Nuevo `POST /aulas/{id}/dispositivos` (docente) |
| `POST /acceso-estudiante/login` | `codigoAula` **o** `tokenDispositivo` | Solo `tokenDispositivo` |
| `GET /acceso-estudiante/contexto-dispositivo` | Lista de avatares | `{ contexto: { tipo, nombre }, estudiantes }` |
| RNF-019 | 30 intentos/min por código de aula | 30 intentos/min **por tablet** (y por IP) |
| RF-017 (tarjetas, Módulo 2) | Código de aula + avatar + PIN | Avatar + alias + PIN (se ajusta en el Módulo 2) |

**Lo que no cambia** (y protege a los niños):

- Sin un contexto válido **no se muestran avatares** (criterio de aceptación de RF-007).
- El PIN sigue siendo obligatorio y se bloquea a los 5 intentos (RF-008, RN-03).
- El dispositivo se guarda solo como huella SHA-256 en la base; el token vive en la tablet (RNF-031).
- Al archivar el aula (RF-020), su tablet deja de mostrar avatares y de permitir el ingreso.

## 4. Diseño técnico

- **Dominio (IAM):** `DispositivoFamiliar` pasa a `DispositivoIngreso` con `contexto: FAMILIA | AULA(aulaId)`.
- **Base de datos:** migración `20261017000000_dispositivo_ingreso`. Renombra la tabla y sus restricciones y agrega `aulaId` con su índice. No se pierden datos: los dispositivos familiares existentes siguen funcionando.
- **Puerto `ResolutorContextoAula`:** pasa de `aulaActivaPorCodigo(codigo)` a `aulaActiva(aulaId)`, que también devuelve `docenteId`. Escuela sigue registrando la implementación, así que IAM sigue sin depender de Escuela.
- **Activación por la docente:** solo la docente dueña del aula, y solo si el aula está activa. Si el aula es ajena o no existe, responde 404 para no revelar aulas de otras docentes.
- **Límite de tasa:** cuenta por tablet. Al ser el token un secreto, en memoria se guarda solo su huella.
- **Web:**
  - Portada abierta, con "Empezar" y "Ya tengo una cuenta".
  - Una tablet activada abre directo en "¿Quién va a leer hoy?".
  - Una tablet sin activar explica a los adultos cómo activarla, sin pedir códigos.
  - La docente ve "Mis aulas → Activar esta tablet" y luego "Dejar la tablet lista para los niños".

## 5. Verificación

| Nivel | Pruebas nuevas o actualizadas |
| :--- | :--- |
| Unitarias | Activación por la docente (aula propia, ajena, archivada, inexistente); familia sin aula; tablet del aula con matrícula; aula archivada; tablet vencida a los 30 días; límite por tablet sin guardar el token en claro |
| Integración | Recorrido HTTP + PostgreSQL con Escuela: activar → avatares del aula → ingreso → ajeno 403 → familia 403 → otra docente 404 → archivar → 403; `codigoAula` rechazado (400) y ruta antigua inexistente (404) |
| Sistema (E2E) | La docente activa la tablet desde la interfaz y la niña entra sin códigos; la tablet vuelve sola a los avatares; diseño responsivo en computadora, tablet y celular |
| Aceptación (UAT) | Característica nueva "Tablet del aula sin códigos" (2 escenarios) |
