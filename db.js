(function () {

let dbInstance = null; // 👈 This is now a private, memoized singleton

async function openDB(dbName = 'DataCaptureDB', storeName = 'Storage') {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
        }
    };

    request.onsuccess = event => {
        dbInstance = event.target.result;
        resolve(dbInstance);
    };

    request.onerror = event => {
        reject(event.target.error);
    };
    });
}
//  async function openDB(dbName = 'DataCaptureDB', storeName = 'Storage') {
//     return new Promise((resolve, reject) => {
//       const request = indexedDB.open(dbName, 1);
//       request.onerror = () => reject(request.error);
//       request.onsuccess = () => resolve(request.result);
//       request.onupgradeneeded = () => {
//         const db = request.result;
//         if (!db.objectStoreNames.contains(storeName)) {
//           db.createObjectStore(storeName);
//         }
//       };
//     });
//   }

  async function clearDB(storeName = 'Storage') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
  
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = (e) => reject(e.target.error);
    });
  }
  
 async function setDBValue(key, value, storeName = 'Storage') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
 async function getDBValue(key, storeName = 'Storage') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

// knowing the property whose sub property needs to be updated , we can use this method to sync that update by passing in the root property key and the updated value instance of it.
 async function appendToNestedObjectOfKey(key, newData, storeName = 'Storage') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const getReq = store.get(key);
  
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        const merged = deepMerge(existing, newData);
        store.put(merged, key);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  
  // A naive deep merge
  function deepMerge(obj1, obj2) {
    for (const key in obj2) {
      if (obj2[key] instanceof Object && key in obj1) {
        obj1[key] = deepMerge(obj1[key], obj2[key]);
      } else {
        obj1[key] = obj2[key];
      }
    }
    return obj1;
  }
  

 async function appendToArrayFieldOfKey(key, arrayFieldName, newEntry, storeName = 'Storage') {
    const db = await openDB(); // Assume you already have openDB defined
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
  
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        let existing = getReq.result || {};
  
        if (!Array.isArray(existing[arrayFieldName])) {
          existing[arrayFieldName] = [];
        }
  
        existing[arrayFieldName].push(newEntry);
  
        const putReq = store.put(existing, key);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
  
      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  }
  
 async function appendToArrayOfKey(key, valueToAppend, storeName = 'Storage') {
    const db = await openDB(); // Your IndexedDB open helper
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
  
      const getReq = store.get(key);
  
      getReq.onsuccess = () => {
        let existingValue = getReq.result;
  
        if (!Array.isArray(existingValue)) {
          existingValue = [];
        }
  
        existingValue.push(valueToAppend);
  
        const putReq = store.put(existingValue, key);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
  
      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  }

 async function updateNestedField(key, path, value, options = {}) {
  const { append = false, merge = false, storeName = 'Storage' } = options;
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const getReq = store.get(key);

    getReq.onsuccess = () => {
      let data = getReq.result ?? {};
      let ref = data;

      const keys = Array.isArray(path) ? path : path.split('.');
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in ref)) {
          // Create nested container based on lookahead key
          ref[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        } else if (typeof ref[k] !== 'object' || ref[k] === null) {
          return reject(new Error(`Conflict at "${keys.slice(0, i + 1).join('.')}". Expected an object or array, found ${typeof ref[k]}`));
        }
        ref = ref[k];
      }

      const lastKey = keys[keys.length - 1];
      const currentVal = ref[lastKey];

      // Append mode
      if (append) {
        if (currentVal === undefined) {
          ref[lastKey] = [value];
        } else if (Array.isArray(currentVal)) {
          ref[lastKey].push(value);
        } else {
          return reject(new Error(`Conflict at "${path}". Expected array to append, found ${typeof currentVal}`));
        }

      // Merge mode
      } else if (merge) {
        if (currentVal === undefined) {
          ref[lastKey] = value;
        } else if (typeof currentVal === 'object' && currentVal !== null && typeof value === 'object') {
          ref[lastKey] = deepMerge(currentVal, value);
        } else {
          return reject(new Error(`Conflict at "${path}". Cannot merge non-object types.`));
        }

      // Set mode
      } else {
        ref[lastKey] = value;
      }

      const putReq = store.put(data, key);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

  async function flushToIndexedDB(newEntries) {
    try {
      // Step 1: Get the buffer (array of entries to append)
      if (!Array.isArray(newEntries) || newEntries.length === 0) return;
  
      // Step 2: Get existing pages array from IndexedDB
      const existingPages = await getDBValue('pages') || [];
  
      // Step 3: Merge the arrays
      const updatedPages = [...existingPages, ...newEntries];
  
      // Step 4: Write back the updated array under 'pages' key
      await setDBValue('pages', updatedPages);
  
      console.log(`[FLUSH] Flushed ${newEntries.length} new entries to IndexedDB.`);
    } catch (err) {
      console.error('[FLUSH ERROR]', err);
    }
  }
      // Attach everything under the DB namespace
    window.DB = {
        openDB,
        clearDB,
        setDBValue,
        getDBValue,
        appendToNestedObjectOfKey,
        appendToArrayFieldOfKey,
        appendToArrayOfKey,
        updateNestedField,
        flushToIndexedDB
    };
})();