import { test, expect } from '@playwright/test';

test('첫 화면이 뜨고 가로 스크롤이 없어야 한다', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/MoveOne/i);

  // 규칙 60-mobile-ui.md: 320px 에서도 가로 스크롤이 없어야 한다
  await page.setViewportSize({ width: 320, height: 720 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow, '가로 스크롤이 발생했습니다').toBe(false);
});
