import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

/**
 * ESLint flat config raíz.
 * eslint-plugin-boundaries hace cumplir la arquitectura del SRS (§5, "Regla de Dependencias"):
 *   domain          → solo su propio dominio y el shared-kernel
 *   application     → dominio y aplicación de su módulo; otros módulos solo por su public-api
 *   infrastructure  → implementa los puertos de application; otros módulos solo por su public-api
 *   interface       → casos de uso de su módulo; otros módulos solo por su public-api
 * Un módulo nunca importa capas internas de otro módulo.
 */
const MISMO = { modulo: '{{ from.captured.modulo }}' };

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/reports/**',
      '**/reportes/**',
      '**/test-results/**',
      '**/.features-gen/**',
      '**/prisma/migrations/**',
      '**/next-env.d.ts',
      // Plantillas de módulos aún no implementados: se quitan de aquí al construir cada módulo.
      'apps/api/src/modules/{diagnostico,lectura,progreso,gamificacion,asistente,administracion}/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.js'] } },
      'boundaries/include': ['apps/api/src/**/*'],
      'boundaries/elements': [
        { type: 'shared-kernel', pattern: 'apps/api/src/modules/shared-kernel/**', mode: 'full' },
        { type: 'public-api', pattern: 'apps/api/src/modules/*/public-api.ts', mode: 'full', capture: ['modulo'] },
        { type: 'module-root', pattern: 'apps/api/src/modules/*/*.module.ts', mode: 'full', capture: ['modulo'] },
        { type: 'domain', pattern: 'apps/api/src/modules/*/domain/**', mode: 'full', capture: ['modulo'] },
        { type: 'application', pattern: 'apps/api/src/modules/*/application/**', mode: 'full', capture: ['modulo'] },
        { type: 'infrastructure', pattern: 'apps/api/src/modules/*/infrastructure/**', mode: 'full', capture: ['modulo'] },
        { type: 'interface', pattern: 'apps/api/src/modules/*/interface/**', mode: 'full', capture: ['modulo'] },
        { type: 'app', pattern: 'apps/api/src/*.ts', mode: 'full' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: '{{file.type}} de "{{file.captured.modulo}}" no puede importar {{dependency.type}} de "{{dependency.captured.modulo}}"',
          rules: [
            { from: 'shared-kernel', allow: ['shared-kernel'] },
            { from: 'domain', allow: [['domain', MISMO], 'shared-kernel'] },
            { from: 'application', allow: [['domain', MISMO], ['application', MISMO], 'shared-kernel', 'public-api'] },
            {
              from: 'infrastructure',
              allow: [['domain', MISMO], ['application', MISMO], ['infrastructure', MISMO], 'shared-kernel', 'public-api'],
            },
            { from: 'interface', allow: [['application', MISMO], ['interface', MISMO], 'shared-kernel', 'public-api'] },
            {
              from: 'public-api',
              allow: [
                ['module-root', MISMO], ['domain', MISMO], ['application', MISMO],
                ['infrastructure', MISMO], ['interface', MISMO], 'shared-kernel',
              ],
            },
            {
              from: 'module-root',
              allow: [['application', MISMO], ['infrastructure', MISMO], ['interface', MISMO], 'shared-kernel', 'public-api'],
            },
            { from: 'app', allow: ['app', 'public-api', 'shared-kernel'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.int-spec.ts', '**/test/**/*.ts', 'tests/**/*.ts', 'tests/**/*.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty-pattern': 'off',
    },
  },
  {
    // Variables globales de k6 (__ENV, __VU) en los scripts de carga.
    files: ['tests/load/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly', __VU: 'readonly' } },
  },
);
