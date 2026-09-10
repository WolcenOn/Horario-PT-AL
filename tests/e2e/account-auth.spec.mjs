import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
}

test('Cuenta usa una sesión Bearer y no la persiste con la configuración', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify({
      enabled:false,
      baseUrl:'https://gestor.test',
      schoolId:'',
      actorId:'',
      academicYearId:'',
      scenarioId:'',
      autoSync:false
    }));
  });

  const requests = [];
  const auth = {
    access_token:'test-session-value',
    token_type:'bearer',
    expires_at:'2026-09-11T09:00:00Z',
    user:{ id:'user-test', email:'user@example.test', display_name:'Usuario prueba' },
    memberships:[{ school_id:'school-test', user_id:'user-test', role:'ADMIN' }],
    school:null
  };

  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, headers:request.headers() });
    if (path === '/auth/login') return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(auth) });
    if (path === '/auth/me') return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ...auth, access_token:'' }) });
    if (path === '/schools/school-test/academic-years') return route.fulfill({ status:200, contentType:'application/json', body:'[]' });
    if (path === '/auth/logout') return route.fulfill({ status:204, body:'' });
    return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
  });

  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.getByRole('heading', { name:'Acceso al centro' })).toBeVisible();
  await expect(page.locator('#backendActorId')).not.toBeVisible();

  await page.locator('#loginEmail').fill('user@example.test');
  await page.locator('#loginPassword').fill('test-password-123');
  await page.getByRole('button', { name:'Iniciar sesión' }).click();

  await expect(page.getByRole('heading', { name:'Sesión' })).toBeVisible();
  await expect(page.getByText('Usuario prueba', { exact:true })).toBeVisible();
  await expect(page.getByText('ADMIN', { exact:true })).toBeVisible();

  const stored = await page.evaluate(() => ({
    sessionValue:sessionStorage.getItem('horario-gestor-escuela-access-token'),
    persistent:JSON.parse(localStorage.getItem('horario-gestor-escuela-backend') || '{}')
  }));
  expect(stored.sessionValue).toBe('test-session-value');
  expect(stored.persistent.accessToken).toBeUndefined();
  expect(stored.persistent.schoolId).toBe('school-test');
  expect(stored.persistent.actorId).toBe('');

  const yearsCall = requests.find(item => item.path === '/schools/school-test/academic-years');
  expect(yearsCall?.headers.authorization).toBe('Bearer test-session-value');
  expect(yearsCall?.headers['x-actor-id']).toBeUndefined();

  await page.getByRole('button', { name:'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name:'Acceso al centro' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('horario-gestor-escuela-access-token'))).toBeNull();
});
