# UAT — Escenarios firmados

Escenarios de aceptación en Gherkin, alineados con los ADR y con el System Testing (sección 14).
Cada archivo corresponde a un módulo de negocio. Los escenarios firmados se marcan con la
cabecera `Responsable` y la fecha de aprobación.

## Convenciones

- Un archivo `.feature` por flujo principal.
- Etiquetas: `@estudiante`, `@docente`, `@familia`, `@backoffice`, `@smoke`.
- Cada escenario debe ser automatizable vía Playwright (`tests/e2e`).
