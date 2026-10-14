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
  await page.locator('[data-edit="person-contact"]').click();
  await expect(page.locator('#modalForm [name="teacherEmail"]'))
    .toHaveValue('profesora@centro.es');
});
