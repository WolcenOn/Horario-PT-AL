import { test, expect } from '@playwright/test';

test('la navegación y el resumen presentan el producto como planificador del centro', async ({ page }) => {
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

  const accountSection = page.locator('.nav-section[aria-label="Cuenta y datos"]');
  await expect(accountSection.getByText('Cuenta y sincronización')).toBeVisible();

  await expect(page.locator('#summaryStrip .metric span')).toHaveText([
    'Clases con horario',
    'Profesorado activo',
    'Conflictos / avisos',
    'Apoyos pendientes'
  ]);
  await expect(page.locator('#summaryStrip')).toContainText('Necesidades PT/AL pendientes por alumno');
});

test('las vistas independientes comparten el mismo estado de cabecera y lo restauran al volver al horario', async ({ page }) => {
  await page.goto('/');

  for (const [view, title] of [
    ['setupWizard', 'Asistente de configuración'],
    ['combinedCalendar', 'Horario combinado'],
    ['classRosters', 'Clases y alumnado'],
    ['centerActivities', 'Actividades del centro'],
    ['temporalPatterns', 'Patrones temporales'],
    ['capacityStudy', 'Estudio de plantilla'],
    ['operations', 'Operativa diaria'],
    ['integration', 'Cuenta y sincronización']
  ]) {
    const nav = page.locator(`.nav-item[data-view="${view}"]`);
    await nav.scrollIntoViewIfNeeded();
    await nav.click();
    await expect(page.locator('#pageTitle')).toHaveText(title);
    await expect(nav).toHaveClass(/is-active/);
    await expect(page.locator('#summaryStrip')).toHaveClass(/hidden/);
    await expect(page.locator('.service-filter')).toHaveClass(/hidden/);
    await expect(page.locator('#primaryActionBtn')).toHaveClass(/hidden/);
    await expect(page.locator('#calendarPrintActions')).toHaveClass(/hidden/);
  }

  const calendar = page.locator('.nav-item[data-view="calendar"]');
  await calendar.scrollIntoViewIfNeeded();
  await calendar.click();
  await expect(page.locator('#pageTitle')).toHaveText('Horario semanal');
  await expect(calendar).toHaveClass(/is-active/);
  await expect(page.locator('#summaryStrip')).not.toHaveClass(/hidden/);
  await expect(page.locator('.service-filter')).not.toHaveClass(/hidden/);
  await expect(page.locator('#primaryActionBtn')).not.toHaveClass(/hidden/);
  await expect(page.locator('#calendarPrintActions')).not.toHaveClass(/hidden/);
});
