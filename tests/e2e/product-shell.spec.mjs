import { test, expect } from '@playwright/test';

test('la navegación presenta el producto como planificador del centro', async ({ page }) => {
  await page.setViewportSize({ width:1024, height:768 });
  await page.goto('/');

  await expect(page.locator('.brand-copy strong')).toHaveText('Planificador del centro');
  await expect(page.locator('.brand-copy small')).toHaveText('Horario, apoyos y operativa');
  await expect(page.locator('.nav-section')).toHaveCount(6);
  await expect(page.locator('.nav-section-label')).toHaveText([
    'Inicio',
    'Horario',
    'Centro',
    'Apoyos PT/AL',
    'Operativa',
    'Cuenta y datos'
  ]);

  const supportSection = page.locator('.nav-section[aria-label="Apoyos PT y AL"]');
  await expect(supportSection.getByText('Necesidades de apoyo')).toBeVisible();
  await expect(supportSection.getByText('Optimización PT/AL')).toBeVisible();

  const centerSection = page.locator('.nav-section[aria-label="Centro"]');
  await expect(centerSection.getByText('Planificación académica')).toBeVisible();
  await expect(centerSection.getByText('Plantilla y reparto')).toBeVisible();
});
