import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Next.js 16 방식의 flat config 입니다.
 *
 * FlatCompat 은 쓰지 않습니다. Next 15 까지는
 *   compat.extends('next/core-web-vitals', 'next/typescript')
 * 가 정석이었지만, Next 16 의 eslint-config-next 는 flat config 를 직접
 * 내보냅니다. 그것을 eslintrc 호환 계층에 밀어 넣으면 스키마 검증에 실패하고,
 * ESLint 가 그 오류를 출력하려다 순환 참조를 만나 아래처럼 죽습니다.
 *
 *   TypeError: Converting circular structure to JSON
 *
 * 진짜 오류가 이 TypeError 에 가려지기 때문에 원인을 찾기 어렵습니다.
 * (vercel/next.js#85244, eslint/eslint#20237)
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // globalIgnores 는 eslint-config-next 의 기본 무시 목록을 덮어씁니다.
  // 그래서 기본값(.next, out, build, next-env.d.ts)을 여기에 다시 적습니다.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'fixtures/**',
  ]),

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
    // 필요한 값은 서버 컴포넌트에서 읽어 props 로 내려보냅니다.
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
    // 로거는 console 이 본업입니다. 다른 곳에서는 log.debug/info/error 를 쓰세요.
    //
    // mailer 는 예외가 하나 더 있습니다. 개발 모드에서 메일을 보내지 않고
    // 터미널에 그대로 찍는데, 비밀번호 재설정 링크를 눈으로 찾아 눌러야 하므로
    // 여러 줄 상자 모양이 그대로 보여야 합니다. log.info 로 바꾸면 한 줄로
    // 뭉개져 링크를 찾기 어렵습니다.
    files: ['lib/logger.ts', 'lib/mailer.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // no-page-custom-font 는 Pages Router 기준 규칙입니다. pages/_document.js
    // 밖에서 폰트를 불러오면 그 페이지에서만 적용된다는 경고인데, App Router 의
    // 루트 layout.tsx 는 정의상 모든 화면에 적용됩니다. 여기서는 오탐입니다.
    files: ['app/**/layout.tsx'],
    rules: { '@next/next/no-page-custom-font': 'off' },
  },

  {
    // DB 접근은 lib/db.ts 를 통해서만
    files: ['app/**/*.ts', 'app/**/*.tsx', 'components/**/*.ts', 'components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pg',
              message: 'DB 접근은 lib/db.ts 의 query() 를 통해서만 합니다. (규칙 10-stack.md)',
            },
          ],
        },
      ],
    },
  },
]);
