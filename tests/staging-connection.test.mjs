import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BACKEND_SETTINGS} from '../js/backend-service.js';
import {isKnownProductionBackendUrl,prepareDemoStagingConnection}
  from '../js/staging-connection.js';

const legacy={
  enabled:true,baseUrl:DEFAULT_BACKEND_SETTINGS.baseUrl,
  schoolId:'demo-old',actorId:'actor-old',academicYearId:'year-old',
  scenarioId:'scenario-old',autoSync:true
};

test('staging mantiene el estado local fuera del alcance y descarta la identidad legacy',()=>{
  const source={...legacy};
  const result=prepareDemoStagingConnection(source,'https://gestor-staging.up.railway.app/');
  assert.equal(result.enabled,true);
  assert.equal(result.baseUrl,'https://gestor-staging.up.railway.app');
  assert.equal(result.schoolId,'');
  assert.equal(result.actorId,'');
  assert.equal(result.accessToken,'');
  assert.equal(result.academicYearId,'');
  assert.equal(result.scenarioId,'');
  assert.equal(result.autoSync,false);
  assert.deepEqual(source,legacy);
});

test('staging rechaza producción, HTTP y URLs con secretos o rutas',()=>{
  for(const url of [
    '',DEFAULT_BACKEND_SETTINGS.baseUrl,DEFAULT_BACKEND_SETTINGS.baseUrl+'/',
    'http://gestor-staging.up.railway.app',
    'https://user:password@gestor-staging.up.railway.app/',
    'https://gestor-staging.up.railway.app/auth/login',
    'https://gestor-staging.up.railway.app/?token=bad',
    'not-a-url'
  ])assert.throws(()=>prepareDemoStagingConnection(legacy,url));
  assert.equal(isKnownProductionBackendUrl(DEFAULT_BACKEND_SETTINGS.baseUrl+'/'),true);
  assert.equal(isKnownProductionBackendUrl('https://gestor-staging.up.railway.app'),false);
});
