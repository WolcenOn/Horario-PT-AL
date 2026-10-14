import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTeacherAccountContacts,staffContactLabel}
  from '../js/teacher-account-contacts.js';

test('correos individuales válidos son contacto, nunca cuentas verificadas',()=>{
  const before=[{id:'a',nombre:'Profesora PT',email:' PT@Centro.es '},
    {id:'b',nombre:'Tutor',email:'tutor@centro.es'}];
  const original=JSON.stringify(before);
  const report=auditTeacherAccountContacts(before);
  assert.equal(report.summary.contactOnly,2);
  assert.equal(report.entries[0].email,'PT@Centro.es');
  for(const item of report.entries){
    assert.equal(item.status,'contact-only');
    assert.equal(item.verified,false);
    assert.equal(item.accountLinked,false);
    assert.equal(item.passwordRecoveryEnabled,false);
  }
  assert.equal(JSON.stringify(before),original);
});
test('no se habilita recuperación si falta correo o no es válido',()=>{
  const report=auditTeacherAccountContacts([
    {id:'a',nombre:'Persona A',email:''},
    {id:'b',nombre:'Persona B',email:'dirección-no-válida'}
  ]);
  assert.deepEqual(report.entries.map(x=>x.status),['missing','invalid']);
  assert.equal(report.summary.missing,1);
  assert.equal(report.summary.invalid,1);
  assert.equal(report.summary.contactOnly,0);
});
test('correos compartidos se detectan independientemente de las mayúsculas',()=>{
  const report=auditTeacherAccountContacts([
    {id:'a',nombre:'Persona A',email:' Equipo@centro.es '},
    {id:'b',nombre:'Persona B',email:'equipo@CENTRO.es'},
    {id:'c',nombre:'Persona C',email:'personal@centro.es'}
  ]);
  assert.deepEqual(report.entries.map(x=>x.status),
    ['shared','shared','contact-only']);
  assert.equal(report.summary.shared,2);
  assert.match(staffContactLabel('shared'),/Correo compartido/);
  assert.ok(report.entries.every(x=>!x.passwordRecoveryEnabled&&!x.verified));
});
test('los estados de contacto no contienen enlaces ni tokens de acceso',()=>{
  const report=auditTeacherAccountContacts([
    {id:'pt',nombre:'Profesional',email:'pt@centro.es'}
  ]);
  const content=JSON.stringify(report);
  assert.ok(!content.includes('reset_token'));
  assert.ok(!content.includes('reset-confirm'));
  assert.ok(!content.includes('access_token'));
  assert.equal(report.entries[0].passwordRecoveryEnabled,false);
  assert.equal(report.entries[0].accountLinked,false);
});
test('colecciones vacías no crean cuentas implícitas',()=>{
  assert.deepEqual(auditTeacherAccountContacts().summary,{
    total:0,contactOnly:0,missing:0,invalid:0,shared:0
  });
});
