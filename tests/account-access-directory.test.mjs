import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSchoolAccessDirectory,roleDescription}
  from '../js/account-access-directory.js';
import {fetchSchoolAccessOverview}
  from '../js/backend-service.js';

test('describe permisos actuales y reserva docente sin confundirlo con VIEWER',()=>{
  assert.match(roleDescription('ADMIN').access,/cuentas/);
  assert.match(roleDescription('PLANNER').access,/planes/);
  assert.match(roleDescription('VIEWER').access,/NO es adecuado/);
  assert.match(roleDescription('TEACHER').access,/propio horario/);
  assert.match(roleDescription('TEACHER').access,/no habilitado/i);
});
test('dirección visualiza miembros e invitaciones sin enlaces ni tokens',()=>{
  const html=renderSchoolAccessDirectory({
    members:[{name:'Administración',email:'admin@centro.test',
      role:'ADMIN',access_status:'account_active',email_verified:false}],
    invitations:[{email:'docente@centro.test',role:'VIEWER',
      status:'pending',email_verified:false,token:'SECRET_TOKEN_NEVER_RENDER'}]
  },'ADMIN');
  assert.match(html,/data-access-users/);
  assert.match(html,/admin@centro.test/);
  assert.match(html,/data-access-invitations/);
  assert.match(html,/docente@centro.test/);
  assert.doesNotMatch(html,/SECRET_TOKEN_NEVER_RENDER/);
  assert.match(html,/No utilizar VIEWER/);
  assert.match(html,/no verificado/i);
});
test('PLANNER y VIEWER solo ven su nivel, nunca directorio de otros usuarios',()=>{
  const data={members:[{name:'Otra persona',email:'private@centro.test'}]};
  for(const role of ['PLANNER','VIEWER']){
    const html=renderSchoolAccessDirectory(data,role);
    assert.match(html,/data-current-account-permissions/);
    assert.doesNotMatch(html,/private@centro.test/);
    assert.doesNotMatch(html,/Otra persona/);
    assert.doesNotMatch(html,/data-access-users/);
  }
});
test('HTML del directorio escapa nombres y correos del servidor',()=>{
  const html=renderSchoolAccessDirectory({
    members:[{name:'<script>alert(1)</script>',email:'<img src=x>',
      role:'VIEWER',access_status:'no_active_password'}],
    invitations:[]
  },'ADMIN');
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/<img src=x>/);
  assert.match(html,/&lt;script&gt;/);
});
test('el directorio informa de servidor no actualizado sin inventar usuarios',()=>{
  const html=renderSchoolAccessDirectory(null,'ADMIN',{
    error:'El servidor no incluye el listado.'
  });
  assert.match(html,/data-access-overview-error/);
  assert.doesNotMatch(html,/data-access-users/);
});
test('la consulta usa Bearer, centro autorizado y nunca modifica datos',async()=>{
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    return {ok:true,status:200,text:async()=>JSON.stringify({
      school_id:'school-test',members:[],invitations:[]
    })};
  };
  try{
    const out=await fetchSchoolAccessOverview({
      baseUrl:'https://gestor.test',schoolId:'school-test',
      accessToken:'token-test'
    });
    assert.equal(out.school_id,'school-test');
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,
      'https://gestor.test/schools/school-test/access-overview');
    assert.equal(calls[0].options.method,undefined);
    assert.equal(calls[0].options.headers.Authorization,'Bearer token-test');
    assert.equal(calls[0].options.body,undefined);
  }finally{globalThis.fetch=original;}
});
test('sin sesión no consulta directorio administrativo',async()=>{
  await assert.rejects(fetchSchoolAccessOverview({
    baseUrl:'https://gestor.test',schoolId:'school-test'
  }),/Inicia sesión/);
});
