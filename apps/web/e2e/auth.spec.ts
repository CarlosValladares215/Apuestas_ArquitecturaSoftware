import { expect, test } from '@playwright/test';

const AUTH_ROUTES = ['/registro', '/login', '/verificar-correo', '/seguridad', '/admin/usuarios'];

for (const route of AUTH_ROUTES) {
  test(`${route} renders semantic heading without horizontal overflow at 360px`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });
}
