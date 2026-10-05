const DB_NAME = 'english-clips-directory';
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readDirectory() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const request = tx.objectStore('handles').get('destination');
    tx.oncomplete = () => { db.close(); resolve(request.result || null); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('无法读取保存目录。')); };
  });
}

export async function storeDirectory(handle) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'destination');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('无法记住保存目录。')); };
  });
}

export async function writableDirectory() {
  const handle = await readDirectory();
  if (!handle || await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error('保存文件夹需要授权。请打开拾句设置，点击“重新授权”或重新选择文件夹，再截图。');
  }
  return handle;
}

export async function writeImage(handle, filename, blob) {
  const file = await handle.getFileHandle(filename, { create: true });
  const stream = await file.createWritable();
  try { await stream.write(blob); await stream.close(); }
  catch (error) { await stream.abort().catch(() => {}); throw error; }
}
