import { expect, test } from '@playwright/test';

const AUTH_ROUTES = [
  '/registro',
  '/login',
  '/verificar-correo',
  '/seguridad',
  '/admin/usuarios',
  '/wallet',
  '/operador',
];

for (const route of AUTH_ROUTES) {
  test(`${route} renders semantic landmarks, footer, and navigation without horizontal overflow`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width < 960) {
      const menuButton = page.getByRole('button', { name: /abrir menú de navegación/i });
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      await expect(page.getByRole('navigation', { name: /navegación por rol/i })).toBeVisible();
      await page.getByRole('button', { name: /cerrar menú lateral/i }).click();
    } else {
      await expect(page.getByRole('navigation', { name: /navegación por rol/i })).toBeVisible();
    }

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });
}
