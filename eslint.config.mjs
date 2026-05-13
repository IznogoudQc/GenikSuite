import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  // Fichiers/dossiers jamais lintés
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'db/migrations/**']
  },

  // Règles de base : JS recommandé + TypeScript recommandé (sans type-checking).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Réglages communs à tout le TS/TSX du projet.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  // Renderer React (sandbox type navigateur).
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // JSX transform automatique → pas besoin d'importer React
      'react/prop-types': 'off', // on a TypeScript pour ça
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // Process main Electron, accès DB et scripts : environnement Node.
  {
    files: ['electron/**/*.ts', 'db/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node }
  },

  // Fichiers de config à la racine : environnement Node également.
  {
    files: ['*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: globals.node }
  }
)
