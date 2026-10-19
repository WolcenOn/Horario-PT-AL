import { test, expect } from '@playwright/test';

async function openApp(page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
}

const auth = {
  access_token:'test-session-value',
  token_type:'bearer',
  expires_at:'2026-09-12T09:00:00Z',
  user:{ id:'user-test', email:'user@example.test', display_name:'Usuario prueba' },
  memberships:[{ school_id:'school-test', school_name:'CEIP Horizonte', user_id:'user-test', role:'ADMIN' }],
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

test('Cuenta usa Bearer, muestra el centro por nombre y permite cambiar contraseña', async ({ page }) => {
  await page.addInitScript(settings => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify(settings));
  }, backendSettings());

  const requests = [];
  let remoteRevoked = false;
  let passwordChanged = false;
  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, method:request.method(), headers:request.headers(), body:request.postDataJSON?.() });
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
    if (path === '/auth/password/change' && request.method() === 'POST') {
      passwordChanged = true;
      expect(request.headers().authorization).toBe('Bearer test-session-value');
      expect(request.postDataJSON()).toEqual({
        current_password:'test-password-123',
        new_password:'new-password-456'
      });
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
  await expect(page.getByText('CEIP Horizonte', { exact:true })).toBeVisible();
  await expect(page.getByText('ADMIN', { exact:true })).toBeVisible();
  await expect(page.getByText('Sesiones de la cuenta', { exact:true })).toBeVisible();
  await expect(page.getByText('Esta sesión', { exact:true }).first()).toBeVisible();
  await expect(page.locator('.integration-auth-session .badge').filter({ hasText:/^Activa$/ })).toBeVisible();

  await page.getByText('Seguridad de la cuenta', { exact:true }).click();
  await page.locator('#currentAccountPassword').fill('test-password-123');
  await page.locator('#newAccountPassword').fill('new-password-456');
  await page.getByRole('button', { name:'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada. Las otras sesiones se han cerrado.', { exact:true })).toBeVisible();
  expect(passwordChanged).toBe(true);

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
  await expect(page.locator('.integration-auth-session .badge').filter({ hasText:/^Revocada$/ })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('horario-gestor-escuela-access-token'))).toBe('test-session-value');

  await page.getByRole('button', { name:'Cerrar esta sesión' }).click();
  await expect(page.getByRole('heading', { name:'Acceso al centro' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('horario-gestor-escuela-access-token'))).toBeNull();
});

test('recuperación de contraseña usa respuesta genérica y consume el token de la URL', async ({ page }) => {
  await page.addInitScript(settings => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify(settings));
  }, backendSettings());

  let resetRequested = false;
  let resetConfirmed = false;
  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/password/reset-request') {
      resetRequested = true;
      expect(request.postDataJSON()).toEqual({ email:'user@example.test' });
      return route.fulfill({ status:202, contentType:'application/json', body:JSON.stringify({ status:'accepted' }) });
    }
    if (path === '/auth/password/reset-confirm') {
      resetConfirmed = true;
      expect(request.postDataJSON()).toEqual({
        token:'reset-token-with-enough-length',
        new_password:'replacement-password'
      });
      return route.fulfill({ status:204, body:'' });
    }
    return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
  });

  await openApp(page, '/?reset_token=reset-token-with-enough-length');
  await page.locator('[data-view="integration"]').click();
  await page.locator('#resetRequestEmail').fill('user@example.test');
  await page.getByRole('button', { name:'Enviar enlace de recuperación' }).click();
  await expect(page.getByText('Si existe una cuenta con ese correo, recibirás un enlace para elegir una contraseña nueva.', { exact:true })).toBeVisible();
  expect(resetRequested).toBe(true);

  await expect(page.locator('#backendPasswordResetConfirmForm')).toBeVisible();
  await page.locator('#resetNewPassword').fill('replacement-password');
  await page.getByRole('button', { name:'Guardar contraseña nueva' }).click();
  await expect(page.getByText('Contraseña restablecida. Ya puedes iniciar sesión con la contraseña nueva.', { exact:true })).toBeVisible();
  expect(resetConfirmed).toBe(true);
  expect(new URL(page.url()).searchParams.has('reset_token')).toBe(false);
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
        headers:{ 'Retry-After':'90', 'Access-Control-Expose-Headers':'Retry-After', 'Access-Control-Allow-Origin':'*' },
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

  await expect(page.locator('#viewRoot').getByText('Demasiados intentos fallidos. Espera aproximadamente 2 min antes de volver a intentarlo.', { exact:true })).toBeVisible();
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

test('Dirección consulta usuarios y roles sin revelar tokens de invitación',async({page})=>{
  await page.addInitScript(({settings,token})=>{
    localStorage.setItem('horario-gestor-escuela-backend',JSON.stringify({
      ...settings,enabled:true,schoolId:'school-test'
    }));
    sessionStorage.setItem('horario-gestor-escuela-access-token',token);
  },{settings:backendSettings(),token:'test-session-value'});
  let calls=0;
  await page.route('https://gestor.test/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path==='/auth/me')return route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({...auth,access_token:''})
    });
    if(path==='/auth/sessions')return route.fulfill({
      status:200,contentType:'application/json',body:'[]'
    });
    if(path==='/schools/school-test/access-overview'){
      calls++;
      expect(req.headers().authorization).toBe('Bearer test-session-value');
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({
          school_id:'school-test',
          members:[
            {name:'Dirección',email:'direccion@example.test',
              role:'ADMIN',access_status:'account_active',email_verified:false},
            {name:'Coordinación',email:'coordinacion@example.test',
              role:'PLANNER',access_status:'account_active',email_verified:false}
          ],
          invitations:[{id:'inv1',email:'docente@example.test',
            role:'VIEWER',status:'pending',token:'SECRET_NEVER_RENDER'}]
        })
      });
    }
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.locator('[data-access-users] tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-access-users]')).toContainText('Dirección');
  await expect(page.locator('[data-access-invitations]')).toContainText('docente@example.test');
  await expect(page.locator('[data-access-permissions]')).toContainText('NO es adecuado');
  await expect(page.locator('[data-access-permissions]')).not.toContainText('SECRET_NEVER_RENDER');
  expect(calls).toBeGreaterThan(0);
});

test('un usuario de planificación ve sus permisos pero no consulta datos de los demás',async({page})=>{
  const planner={...auth,memberships:[{
    school_id:'school-test',school_name:'CEIP Horizonte',
    user_id:'user-test',role:'PLANNER'
  }]};
  await page.addInitScript(({settings,token})=>{
    localStorage.setItem('horario-gestor-escuela-backend',JSON.stringify({
      ...settings,enabled:true,schoolId:'school-test'
    }));
    sessionStorage.setItem('horario-gestor-escuela-access-token',token);
  },{settings:backendSettings(),token:'planner-session'});
  let requestedDirectory=false;
  await page.route('https://gestor.test/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    if(p==='/schools/school-test/access-overview')requestedDirectory=true;
    if(p==='/auth/me')return route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify(planner)});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.locator('[data-current-account-permissions]')).toContainText(
    'Coordinación / planificación');
  await expect(page.locator('[data-access-users]')).toHaveCount(0);
  expect(requestedDirectory).toBe(false);
});


test('demo requiere URL staging explícita y crea cuenta solo en el backend elegido',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('horario-gestor-escuela-backend',JSON.stringify({
      enabled:true,baseUrl:'https://gestorescuela-production.up.railway.app',
      schoolId:'legacy-demo-school',actorId:'old-id',autoSync:true
    }));
  });
  const calls=[];
  const stagingAuth={...auth,user:{...auth.user,email:'test@example.test'},
    school:{id:'school-test',name:'Centro ficticio staging'}};
  await page.route('https://gestor-staging.up.railway.app/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    calls.push({path,headers:req.headers()});
    if(path==='/auth/register-school')return route.fulfill({
      status:201,contentType:'application/json',body:JSON.stringify(stagingAuth)
    });
    if(path==='/auth/me')return route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({...stagingAuth,access_token:''})
    });
    if(path==='/auth/sessions')return route.fulfill({
      status:200,contentType:'application/json',body:'[]'
    });
    if(path==='/schools/school-test/academic-years')return route.fulfill({
      status:200,contentType:'application/json',body:'[]'
    });
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });
  await page.goto('/');
  await page.locator('[data-view="integration"]').click();
  await expect(page.locator('[data-demo-staging-setup]')).toContainText('Servidor principal detectado');
  await expect(page.locator('[data-register-backend-target]')).toContainText('SERVIDOR PRINCIPAL');
  await page.locator('#backendDemoStagingUrl').fill('https://gestorescuela-production.up.railway.app');
  await page.getByRole('button',{name:'Guardar URL de pruebas'}).click();
  await expect(page.locator('[data-demo-staging-status]')).toContainText('Esta es la URL del servidor principal');
  await page.locator('#backendDemoStagingUrl').fill('https://gestor-staging.up.railway.app/');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Guardar URL de pruebas'}).click();
  await expect(page.locator('[data-register-backend-target]')).toContainText('gestor-staging.up.railway.app');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('horario-gestor-escuela-backend')));
  expect(stored).toMatchObject({enabled:true,schoolId:'',actorId:'',
    autoSync:false,baseUrl:'https://gestor-staging.up.railway.app'});
  await page.locator('#registerSchoolName').fill('Centro ficticio staging');
  await page.locator('#registerDisplayName').fill('Dirección de prueba');
  await page.locator('#registerEmail').fill('test@example.test');
  await page.locator('#registerPassword').fill('test-password-123');
  await page.getByRole('button',{name:'Crear centro y entrar'}).click();
  await expect(page.getByRole('heading',{name:'Sesión'})).toBeVisible();
  expect(calls.some(x=>x.path==='/auth/register-school')).toBe(true);
  expect(calls.filter(x=>x.path==='/auth/register-school')[0].headers.authorization).toBeUndefined();
  const end=await page.evaluate(()=>{
    return {settings:JSON.parse(localStorage.getItem('horario-gestor-escuela-backend')),
      token:sessionStorage.getItem('horario-gestor-escuela-access-token')};
  });
  expect(end.settings.baseUrl).toBe('https://gestor-staging.up.railway.app');
  expect(end.settings.schoolId).toBe('school-test');
  expect(end.settings.actorId).toBe('');
  expect(end.token).toBe('test-session-value');
});
