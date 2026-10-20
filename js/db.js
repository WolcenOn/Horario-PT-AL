const DB_NAME = 'HorarioPTAL';
const DB_VERSION = 3;
export const STORES = ['students', 'professionals', 'groups', 'sessions', 'classSchedules', 'staffAbsences', 'settings'];

let dbPromise;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function transaction(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let value;
    try { value = callback(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function get(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value) {
  return transaction(storeName, 'readwrite', store => store.put(value));
}

// Compare and write in one IndexedDB transaction, preventing stale edits
// from silently overwriting an updated or deleted record in another tab.
export async function putIfUnchanged(storeName, value, original = null) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    let conflict = null;
    const request = store.get(value.id);
    request.onsuccess = () => {
      const persisted = request.result;
      const matches = original === null
        ? persisted === undefined
        : JSON.stringify(persisted) === JSON.stringify(original);
      if (!matches) {
        conflict = new Error('La ficha cambió en otra pestaña o fue eliminada. No se han guardado tus cambios. Vuelve a abrirla para editar su última versión.');
        tx.abort();
        return;
      }
      store.put(value);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(conflict || tx.error);
    tx.onabort = () => reject(conflict || tx.error || new Error('No se pudo guardar la ficha.'));
  });
}

export async function remove(storeName, id) {
  return transaction(storeName, 'readwrite', store => store.delete(id));
}

export async function clear(storeName) {
  return transaction(storeName, 'readwrite', store => store.clear());
}

export async function bulkPut(storeName, values) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    values.forEach(value => store.put(value));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceStoreData(storeName, values) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const value of values) store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(`No se pudo sustituir la colección ${storeName}.`));
  });
}

export async function replaceClassSubjectData(grupoClase, materia, values) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('classSchedules', 'readwrite');
    const store = tx.objectStore('classSchedules');
    const request = store.getAll();
    const normalizedGroup = normalizeText(grupoClase);
    const normalizedSubject = normalizeText(materia);

    request.onsuccess = () => {
      for (const entry of request.result || []) {
        if (normalizeText(entry.grupoClase) === normalizedGroup && normalizeText(entry.materia) === normalizedSubject) {
          store.delete(entry.id);
        }
      }
      for (const value of values) store.put(value);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo sustituir el horario semanal de la asignatura.'));
  });
}

export async function replaceCoreData({ students, professionals, groups, sessions, classSchedules = [], staffAbsences = [] }) {
  const db = await openDatabase();
  const storeNames = ['students', 'professionals', 'groups', 'sessions', 'classSchedules', 'staffAbsences'];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    const valuesByStore = { students, professionals, groups, sessions, classSchedules, staffAbsences };

    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      store.clear();
      for (const value of valuesByStore[storeName]) store.put(value);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo sustituir el horario importado.'));
  });
}

export async function resetDatabase() {
  for (const store of STORES) await clear(store);
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
