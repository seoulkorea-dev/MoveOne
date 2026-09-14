import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // lib/ 의 순수 로직이 대상이므로 node 환경이면 충분하다.
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 숫자를 목표로 삼지 않는다. 아래가 실제로 커버되는지만 본다.
      include: ['lib/odsay/**', 'lib/routes.ts', 'lib/region.ts', 'lib/cache.ts', 'lib/routing/**'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
