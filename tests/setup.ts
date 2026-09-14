// Vitest 전역 셋업.
// pnpm test 는 API 키 없이 통과해야 한다. 실수로 네트워크를 타는 테스트를 즉시 실패시킨다.
import { beforeAll, afterEach, vi } from 'vitest';

beforeAll(() => {
  globalThis.fetch = ((...args: unknown[]) => {
    throw new Error(
      `테스트에서 실제 네트워크 호출이 발생했습니다: ${String(args[0])}\n` +
        'fixtures/ 의 저장된 응답을 사용하세요. (규칙 30-testing.md)',
    );
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
