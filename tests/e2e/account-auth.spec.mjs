import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
}

const auth = {
  access_token:'test-session-value',
  token_type:'bearer',
  expires_at:'2026-09-12T09:00:00Z',
  user:{ id:'user-test', email:'user@example.test', display_name:'Usuario prueba' },
  memberships:[{ school_id:'school-test', user_id:'user-test', role:'ADMIN' }],
  school:null
};

function backendSettings() {
  return {
    enabled:false,
    baseUrl:'https://gestor.test',
    schoolId:'',
    actorId:'',
    academicYearId:'',
    scenarioId:'',
    autoSync:false
  };
}

test('Cuenta usa Bearer, gestiona otra sesión y no ofrece altas legacy', async ({ page }) => {
  await page.addInitScript(settings => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify(settings));
  }, backendSettings());

  const requests = [];
  let remoteRevoked = false;
  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, method:request.method(), headers:request.headers() });
    if (path === '/auth/login') return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(auth) });
    if (path === '/auth/me') return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ...auth, access_token:'' }) });
    if (path === '/auth/sessions' && request.method() === 'GET') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify([
        { id:'session-current', created_at:'2026-09-11T20:00:00Z', last_seen_at:'2026-09-11T21:00:00Z', expires_at:'2026-09-12T09:00:00Z', revoked_at:null, current:true },
        { id:'session-other', created_at:'2026-09-10T08:00:00Z', last_seen_at:'2026-09-11T18:00:00Z', expires_at:'2026-09-11T22:00:00Z', revoked_at:remoteRevoked ? '2026-09-11T21:05:00Z' : null, current:false }
      ]) });
    }
    if (path === '/auth/sessions/session-other' && request.method() === 'DELETE') {
      remoteRevoked = true;
      return route.fulfill({ status:204, body:'' });
    }
    if (path === '/schools/school-test/academic-years') return route.fulfill({ status:200, contentType:'application/json', body:'[]' });
    if (path === '/auth/logout') return route.fulfill({ status:204, body:'' });
    return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
  });

  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.getByRole('heading', { name:'Acceso al centro' })).toBeVisible();
  await expect(page.locator('#backendBootstrapForm')).toHaveCount(0);
  await expect(page.locator('#backendActorId')).toHaveCount(0);
  await expect(page.locator('#backendSchoolId')).toHaveCount(0);

  await page.locator('#loginEmail').fill('user@example.test');
  await page.locator('#loginPassword').fill('test-password-123');
  await page.getByRole('button', { name:'Iniciar sesión' }).click();

  await expect(page.getByRole('heading', { name:'Sesión' })).toBeVisible();
  await expect(page.getByText('Usuario prueba', { exact:true })).toBeVisible();
  await expect(page.getByText('ADMIN', { exact:true })).toBeVisible();
  await expect(page.getByText('Sesiones de la cuenta', { exact:true })).toBeVisible();
  await expect(page.getByText('Esta sesión', { exact:true }).first()).toBeVisible();
  await expect(page.getByText('Activa', { exact:true })).toBeVisible();

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

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-revoke-auth-session="session-other"]').click();
  await expect(page.getByText('Revocada', { exact:true }).first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('horario-gestor-escuela-access-token'))).toBe('test-session-value');

  const revokeCall = requests.find(item => item.path === '/auth/sessions/session-other');
  expect(revokeCall?.method).toBe('DELETE');
  expect(revokeCall?.headers.authorization).toBe('Bearer test-session-value');

  await page.getByRole('button', { name:'Cerrar esta sesión' }).click();
  await expect(page.getByRole('heading', { name:'Acceso al centro' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('horario-gestor-escuela-access-token'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('horario-gestor-escuela-backend') || '{}').schoolId)).toBe('');
});

test('Cerrar todas las sesiones invalida también este navegador', async ({ page }) => {
  await page.addInitScript(({ settings, token }) => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify({ ...settings, enabled:true, schoolId:'school-test' }));
    sessionStorage.setItem('horario-gestor-escuela-access-token', token);
  }, { settings:backendSettings(), token:'test-session-value' });

  let logoutAllCalled = false;
  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/me') return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ...auth, access_token:'' }) });
    if (path === '/auth/sessions') return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify([
      { id:'session-current', created_at:'2026-09-11T20:00:00Z', last_seen_at:'2026-09-11T21:00:00Z', expires_at:'2026-09-12T09:00:00Z', revoked_at:null, current:true }
    ]) });
    if (path === '/schools/school-test/academic-years') return route.fulfill({ status:200, contentType:'application/json', body:'[]' });
    if (path === '/auth/logout-all') {
      logoutAllCalled = true;
      expect(request.headers().authorization).toBe('Bearer test-session-value');
      return route.fulfill({ status:204, body:'' });
    }
    return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
  });

  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.getByRole('heading', { name:'Sesión' })).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name:'Cerrar todas las sesiones' }).click();

  await expect(page.getByRole('heading', { name:'Acceso al centro' })).toBeVisible();
  expect(logoutAllCalled).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('horario-gestor-escuela-access-token'))).toBeNull();
});

test('un login bloqueado muestra el tiempo de espera', async ({ page }) => {
  await page.addInitScript(settings => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify(settings));
  }, backendSettings());

  await page.route('https://gestor.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/login') {
      return route.fulfill({
        status:429,
        headers:{ 'Retry-After':'90' },
        contentType:'application/json',
        body:JSON.stringify({ detail:'Too many failed login attempts. Try again later.' })
      });
    }
    return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
  });

  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await page.locator('#loginEmail').fill('user@example.test');
  await page.locator('#loginPassword').fill('wrong-password');
  await page.getByRole('button', { name:'Iniciar sesión' }).click();

  await expect(page.getByText('Demasiados intentos fallidos. Espera aproximadamente 2 min antes de volver a intentarlo.', { exact:true })).toBeVisible();
});

test('una conexión Actor ID existente sigue visible solo como compatibilidad', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify({
      enabled:true,
      baseUrl:'https://gestor.test',
      schoolId:'legacy-school',
      actorId:'legacy-user',
      academicYearId:'',
      scenarioId:'',
      autoSync:false
    }));
  });

  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/schools/legacy-school/academic-years') {
      expect(request.headers()['x-actor-id']).toBe('legacy-user');
      return route.fulfill({ status:200, contentType:'application/json', body:'[]' });
    }
    return route.fulfill({ status:200, contentType:'application/json', body:'{"status":"ok"}' });
  });

  await openApp(page);
  await page.locator('[data-view="integration"]').click();

  await expect(page.getByText('Modo compatible', { exact:true })).toBeVisible();
  await expect(page.locator('#backendActorId')).toBeVisible();
  await expect(page.locator('#backendActorId')).toHaveValue('legacy-user');
  await expect(page.locator('#backendSchoolId')).toHaveValue('legacy-school');
  await expect(page.locator('#backendBootstrapForm')).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Crear vínculo legacy' })).toHaveCount(0);
});
