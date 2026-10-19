// A demo account needs its own server and database, never an Actor ID header.
// This helper changes only client-side connection settings; it does not
// create users, deploy Railway, change IndexedDB, or perform network requests.
import {DEFAULT_BACKEND_SETTINGS,normalizeBackendSettings} from './backend-service.js';

export function isKnownProductionBackendUrl(baseUrl) {
  try {
    return new URL(normalizeBackendSettings({baseUrl}).baseUrl).origin ===
      new URL(DEFAULT_BACKEND_SETTINGS.baseUrl).origin;
  } catch {
    return false;
  }
}

export function prepareDemoStagingConnection(settings, enteredUrl) {
  const raw=String(enteredUrl||'').trim();
  if (!raw) throw Error('Introduce la URL pública HTTPS de tu backend de pruebas en Railway.');
  let url;
  try { url=new URL(raw); }
  catch { throw Error('La URL de pruebas debe ser una dirección completa, por ejemplo https://mi-staging.up.railway.app.'); }
  if (url.protocol!=='https:' || url.username || url.password ||
      url.search || url.hash || url.pathname!=='/') {
    throw Error('Utiliza solo la dirección HTTPS de tu backend de pruebas, sin rutas, parámetros ni credenciales.');
  }
  if (isKnownProductionBackendUrl(url.origin)) {
    throw Error('Esta es la URL del servidor principal. Crea primero un entorno staging aislado en Railway.');
  }
  return normalizeBackendSettings({
    ...settings,enabled:true,baseUrl:url.origin,
    schoolId:'',actorId:'',accessToken:'',
    academicYearId:'',scenarioId:'',autoSync:false
  });
}
