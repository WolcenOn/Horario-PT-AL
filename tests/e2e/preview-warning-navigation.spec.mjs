import { test, expect } from '@playwright/test';

async function makeLocalPlanningMode(page,mode) {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async selectedMode=>{
    const repository=await import('/js/repository.js');
    const data=await repository.loadState();
    await repository.saveCenterPlanningSettings({
      ...data.centerPlanningSettings,mode:selectedMode
    });
  },mode);
  await page.reload();
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
}

test('cada aviso accionable lleva a la opción de configuración que falta',async({page})=>{
  await makeLocalPlanningMode(page,'ptal');
  await page.locator('.nav-item[data-view="integration"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Cuenta y sincronización');
  const row=page.locator('.integration-issue-row').filter({
    hasText:'Activa «Centro completo»'
  });
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:/Activar centro completo/}).click();
  await expect(page.locator('#pageTitle')).toHaveText('Planificación académica');
  await expect(page.locator('input[name="mode"][value="global"]')).toBeVisible();
  await expect(page.locator('input[name="mode"]').first()).toBeFocused();
});

test('los indicadores de preparación enlazan con el lugar correcto',async({page})=>{
  await makeLocalPlanningMode(page,'global');
  await page.evaluate(async()=>{
    const repository=await import('/js/repository.js');
    const data=await repository.loadState();
    await repository.saveCenterPlanningSettings({
      ...data.centerPlanningSettings,mode:'global',curriculum:{}
    });
  });
  await page.reload();
  await page.locator('.nav-item[data-view="centerPlanning"]').click();
  const row=page.locator('.global-readiness-item').filter({
    hasText:'Currículo objetivo'
  });
  await expect(row).toHaveClass(/is-pending/);
  await row.getByRole('button',{name:/Revisar currículo/}).click();
  await expect(page.locator('#pageTitle')).toHaveText('Planificación académica');
  await expect(page.locator('.curriculum-course-list')).toBeVisible();
});

test('las advertencias generales no contienen enlaces externos improvisados',async({page})=>{
  await makeLocalPlanningMode(page,'ptal');
  await page.locator('.nav-item[data-view="integration"]').click();
  await expect(page.locator('.integration-issues.is-error').first()).toBeVisible();
  const links=await page.locator('[data-fix-view]').evaluateAll(nodes=>
    nodes.map(node=>({view:node.dataset.fixView,href:node.getAttribute('href')}))
  );
  const allowed=new Set([
    'centerPlanning','professionals','classSchedules','groups',
    'sessions','temporalPatterns','centerActivities','automation'
  ]);
  expect(links.length).toBeGreaterThan(0);
  expect(links.every(link=>allowed.has(link.view)&&link.href===null)).toBe(true);
});
