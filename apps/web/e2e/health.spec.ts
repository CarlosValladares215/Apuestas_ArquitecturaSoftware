import { expect, test } from '@playwright/test';

test('home page renders without horizontal overflow at 360px', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflow).toBe(false);
});

test('sticky topbar and desktop sidebar stay pinned on scroll without overlapping content', async ({
  page,
}) => {
  await page.goto('/');

  const banner = page.getByRole('banner');
  const main = page.getByRole('main');
  const heading = page.getByRole('heading', { level: 1 });
  const nav = page.getByRole('navigation', { name: /navegación por rol/i });
  const sidebar = page.locator('#app-sidebar');

  await expect(banner).toBeVisible();
  await expect(heading).toBeVisible();

  const bannerAtTop = await banner.boundingBox();
  const headingAtTop = await heading.boundingBox();
  const mainAtTop = await main.boundingBox();
  expect(bannerAtTop).not.toBeNull();
  expect(headingAtTop).not.toBeNull();
  expect(mainAtTop).not.toBeNull();

  if (bannerAtTop && headingAtTop) {
    expect(bannerAtTop.y + bannerAtTop.height).toBeLessThanOrEqual(headingAtTop.y + 1);
  }

  const viewport = page.viewportSize();
  const isDesktop = Boolean(viewport && viewport.width >= 960);

  if (isDesktop && mainAtTop && bannerAtTop) {
    await expect(nav).toBeVisible();
    await expect(sidebar).toBeVisible();
    const sidebarAtTop = await sidebar.boundingBox();
    expect(sidebarAtTop).not.toBeNull();
    if (sidebarAtTop) {
      expect(sidebarAtTop.x + sidebarAtTop.width).toBeLessThanOrEqual(mainAtTop.x + 1);
      expect(bannerAtTop.x).toBeGreaterThanOrEqual(sidebarAtTop.x + sidebarAtTop.width - 1);
    }
  }

  const maxScroll = await page.evaluate(() => {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  });

  if (maxScroll > 120) {
    const scrollTarget = Math.min(480, maxScroll);
    await page.evaluate((target) => window.scrollTo(0, target), scrollTarget);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(80);

    const bannerAfterScroll = await banner.boundingBox();
    expect(bannerAfterScroll).not.toBeNull();
    if (bannerAfterScroll) {
      expect(bannerAfterScroll.y).toBeGreaterThanOrEqual(-1);
      expect(bannerAfterScroll.y).toBeLessThanOrEqual(1);
    }

    if (isDesktop && viewport) {
      const sidebarAfterScroll = await sidebar.boundingBox();
      const mainAfterScroll = await main.boundingBox();
      expect(sidebarAfterScroll).not.toBeNull();
      expect(mainAfterScroll).not.toBeNull();
      if (sidebarAfterScroll && mainAfterScroll && bannerAfterScroll) {
        expect(sidebarAfterScroll.y).toBeGreaterThanOrEqual(-1);
        expect(sidebarAfterScroll.y).toBeLessThanOrEqual(1);
        expect(sidebarAfterScroll.height).toBeGreaterThanOrEqual(viewport.height - 2);
        expect(sidebarAfterScroll.x + sidebarAfterScroll.width).toBeLessThanOrEqual(
          mainAfterScroll.x + 1,
        );
        expect(bannerAfterScroll.x).toBeGreaterThanOrEqual(
          sidebarAfterScroll.x + sidebarAfterScroll.width - 1,
        );
      }
    }
  }
});
