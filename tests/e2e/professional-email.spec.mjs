import {test,expect} from '@playwright/test';

test('el correo del docente se edita en su ficha y se conserva en IndexedDB',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{
      id:'person-contact',nombre:'Profesora de prueba',tipo:'DOCENTE',
      activo:true,disponibilidad:{},disponibilidadBase:{},bloqueosExternos:{}
    });
  });
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await page.locator('[data-edit="person-contact"]').click();
  const modal=page.locator('#modalForm');
  await expect(modal.locator('[name="teacherEmail"]')).toHaveCount(1);
  await modal.locator('[name="teacherEmail"]').fill('profesora@centro.es');
  await modal.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('#modalForm')).toHaveCount(0);
  const result=await page.evaluate(async()=>{
    const {getAll}=await import('/js/db.js');
    return (await getAll('professionals')).find(p=>p.id==='person-contact');
  });
  expect(result.email).toBe('profesora@centro.es');
  await expect(page.locator('[data-teacher-account-contact="contact-only"]'))
    .toContainText('Contacto disponible; cuenta no vinculada');
  await expect(page.locator('[data-teacher-account-summary]'))
    .toContainText('El correo de contacto no constituye una cuenta de acceso verificada.');
  await page.locator('[data-edit="person-contact"]').click();
  await expect(page.locator('#modalForm [name="teacherEmail"]'))
    .toHaveValue('profesora@centro.es');
});

test('avisa si dos docentes comparten buzón y no considera recuperable ninguna cuenta',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  const before=await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    const {loadState}=await import('/js/repository.js');
    await put('professionals',{
      id:'teacher1',nombre:'Docente uno',tipo:'DOCENTE',
      email:'equipo@centro.es',activo:true
    });
    await put('professionals',{
      id:'teacher2',nombre:'Docente dos',tipo:'PT',
      email:'EQUIPO@CENTRO.ES',activo:true
    });
    return JSON.stringify(await loadState());
  });
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await expect(page.locator('[data-teacher-account-contact="shared"]')).toHaveCount(2);
  await expect(page.locator('[data-teacher-account-summary]'))
    .toContainText('compartidos: 2');
  await expect(page.locator('[data-teacher-account-contact="shared"]').first())
    .toContainText('Correo compartido');
  const after=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    return JSON.stringify(await loadState());
  });
  expect(after).toBe(before);
});
