# features/ — lógica de UI por módulo de negocio

Cada subcarpeta corresponde a un módulo de negocio y contiene la lógica de UI de ese módulo
(componentes, hooks, estado, adaptadores del cliente API):

```
features/
├── lectura/
├── aventura/
├── diagnostico/
├── progreso/
├── gamificacion/
├── asistente/
├── escuela/
├── contenido/
└── iam/
```

Reglas:

- `features/` NO importa de otra `features/<otro-módulo>/` directamente; usa `shared/` o los tipos de `@lectoaventura/contracts`.
- El acceso a datos siempre pasa por `shared/api/client.ts` (generado desde `contracts/`).
- Los componentes visuales base provienen de `@lectoaventura/ui` (design system).
