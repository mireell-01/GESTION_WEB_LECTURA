---
name: pruebas-modulo
description: Genera, ejecuta y repara la suite de pruebas de 4 niveles (Modelo V) de un módulo de LectoAventura — unitarias (Vitest), integración (Supertest + PostgreSQL efímero/Testcontainers), sistema (Playwright + k6) y aceptación (Gherkin en español con playwright-bdd). Úsala al terminar o modificar un módulo de apps/api/src/modules, o cuando una prueba falle tras un cambio de negocio.
---

# Pruebas de 4 niveles por módulo (LectoAventura)

Sigue el plan de referencia `docs/pruebas/01-iam-plan-de-pruebas.md`. Para un módulo `<modulo>`:

## 1. Antes de escribir pruebas
- Lee los RF/RN del módulo en el SRS y su código en `apps/api/src/modules/<modulo>` (domain → application → infrastructure → interface).
- Anota casos borde por cada RF/RN (límites numéricos, estados, permisos RN-17, datos del menor RN-02).

## 2. Dónde va cada prueba
| Nivel | Carpeta | Comando |
|---|---|---|
| 1 Unitarias | `apps/api/test/unit/<modulo>/{dominio,aplicacion,infraestructura,interface}/*.spec.ts` | `npm run test:unit` |
| 2 Integración | `apps/api/test/integration/<modulo>/*.int-spec.ts` | `npm run test:int` |
| 3 Sistema E2E | `tests/e2e/specs/<modulo>/*.spec.ts` · carga: `tests/load/scenarios/<modulo>-*.js` | `npm run test:e2e` · `npm run test:load` |
| 4 Aceptación | `tests/e2e/features/<modulo>/*.feature` + `tests/e2e/steps/<modulo>.steps.ts` | `npm run test:uat` |

## 3. Reglas
- Usa las entidades, casos de uso, endpoints y mensajes reales; nunca ejemplos genéricos.
- Nivel 1: casos de uso con dobles en memoria de los puertos (ver `apps/api/test/unit/iam/dobles.ts`); reloj controlado para vencimientos; nada de red ni base de datos. Cobertura ≥ 80 % líneas del módulo (añade la carpeta del módulo a `coverage.include` en `apps/api/vitest.config.ts`).
- Nivel 2: arranca la app con `crearApp()` de `test/integration/setup/app.ts`; verifica también lo guardado en PostgreSQL (hashes, outbox, estados). Nunca uses la base de desarrollo: el setup exige un nombre terminado en `_test`.
- Nivel 3: selectores accesibles (`getByRole`, `getByLabel`); filtra `getByRole('alert')` por texto (Next.js añade su propio `role="alert"`); correos con `correoUnico()` del dominio `e2e.lectoaventura.test` (la limpieza global los borra); `X-Forwarded-For` simulado por prueba por el límite de tasa (RNF-019).
- Nivel 4: Gherkin en español (`# language: es`), lenguaje de negocio, etiquetas `@RF-xxx`/`@RN-xx`, al menos un escenario feliz, uno negativo y uno de borde.
- Si una prueba encuentra un defecto real, corrige el código (no la prueba) y regístralo en el informe.
- Al eliminar la plantilla de un módulo pendiente, quítalo de la lista de `ignores` de `eslint.config.mjs`.

## 4. Al terminar
1. Ejecuta, en este orden: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e`, `npm run test:uat` (y `npm run test:load` si k6 está instalado).
2. Actualiza `docs/pruebas/<nn>-<modulo>-plan-de-pruebas.md` con resultados reales (número de pruebas, cobertura, defectos encontrados) y la matriz de trazabilidad.

## 5. Auto-reparación de pruebas rotas
Ante un fallo: lee `error-context.md` en `tests/e2e/test-results/` o la traza (`npx playwright show-trace`), decide si cambió el negocio (actualiza la prueba y el escenario Gherkin) o si es un defecto (corrige el código), y vuelve a ejecutar solo el nivel afectado antes de la suite completa.
