import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import prettier from 'eslint-config-prettier';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['dist/**', 'dist-electron/**', 'dist-preload/**', 'node_modules/**'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.renderer.json', './tsconfig.electron.json', './tsconfig.preload.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react: reactPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  prettier,
);
