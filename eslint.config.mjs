import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'fixtures/**',
    ],
  },
  {
    // 규칙 10-stack.md
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // 규칙 20-security.md — 클라이언트 컴포넌트에서 서버 전용 환경변수 금지.
    // NEXT_PUBLIC_ 은 next/typescript 규칙이 아닌 이 규칙에 걸리지 않도록 별도 처리가 필요하므로,
    // 여기서는 process.env 접근 자체를 막고 필요한 값은 서버에서 props 로 내려보낸다.
    files: ['components/**/*.tsx', 'app/**/*.tsx'],
    ignores: ['app/**/layout.tsx', 'app/**/page.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            '클라이언트 컴포넌트에서 환경변수를 읽지 마세요. 서버 컴포넌트나 route handler에서 읽어 props로 내려보냅니다. (규칙 20-security.md)',
        },
      ],
    },
  },
  {
    // DB 접근은 lib/db.ts 를 통해서만
    files: ['app/**/*.ts', 'app/**/*.tsx', 'components/**/*.ts', 'components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pg', message: 'DB 접근은 lib/db.ts 의 query() 를 통해서만 합니다. (규칙 10-stack.md)' },
          ],
        },
      ],
    },
  },
];
