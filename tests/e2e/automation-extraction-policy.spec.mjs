import { test, expect } from '@playwright/test';

test('la optimización separa reglas duras de extracción y preferencias', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('horario-user-cleared', 'true'));

  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('HorarioPTAL', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      const storeNames = ['students', 'professionals', 'groups', 'sessions', 'classSchedules', 'settings'];
      const tx = db.transaction(storeNames, 'readwrite');
      for (const storeName of storeNames) tx.objectStore(storeName).clear();

      tx.objectStore('students').put({
        id:'student-policy-e2e',
        nombre:'Alumno prueba',
        curso:'4º',
        grupoClase:'4ºA',
        activo:true,
        horasPTObjetivoMin:60,
        horasALObjetivoMin:0
      });
      tx.objectStore('professionals').put({
        id:'professional-policy-e2e',
        nombre:'PT prueba',
        tipo:'PT',
        activo:true
      });
      tx.objectStore('groups').put({
        id:'group-policy-e2e',
        nombre:'PT 4ºA',
        tipo:'PT',
        professionalId:'professional-policy-e2e',
        studentIds:['student-policy-e2e'],
        activo:true
      });
      tx.objectStore('classSchedules').put({
        id:'class-policy-e2e',
        grupoClase:'4ºA',
        dia:'lunes',
        inicio:'09:00',
        fin:'10:00',
        materia:'Lengua'
      });

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('No se pudo preparar el escenario E2E.'));
    });

    db.close();
  });
  await page.reload();
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.locator('[data-view="automation"]').scrollIntoViewIfNeeded();
  await page.locator('[data-view="automation"]').click();

  await expect(page.getByRole('heading', { name:'Extracción, preferencias y horas permitidas' })).toBeVisible();
  await expect(page.locator('[data-course-rule="4º"]')).toBeVisible();

  const extraction = page.locator('[data-subject-extraction="Lengua"]');
  await expect(extraction).toBeVisible();
  const subjectRow = extraction.locator('xpath=ancestor::*[contains(@class,"subject-policy-row")][1]');
  const preference = subjectRow.locator('[data-subject-priority="Lengua"]');
  await expect(preference).toBeVisible();
  await expect(extraction.locator('option')).toHaveText(['PT y AL','Solo PT','Solo AL','No extraíble']);
  await expect(preference.locator('option')).toHaveText(['Baja','Media','Alta']);

  expect(errors).toEqual([]);
});
