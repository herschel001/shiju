export const NATIVE_HOST = 'com.hershel.shiju';

export async function nativeRequest(action, details = {}) {
  let result;
  try { result = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { action, ...details }); }
  catch (error) {
    if (/not found|forbidden|not allowed/i.test(error.message)) throw new Error('本地辅助程序未连接。请运行项目根目录的 native-host/install.py，再刷新扩展。');
    throw new Error(`本地辅助程序通信失败：${error.message}`);
  }
  if (!result?.ok) throw new Error(result?.error || '本地辅助程序未完成操作。');
  return result;
}

export async function nativeStatus() {
  const result = await nativeRequest('status');
  if (!result.configured) throw new Error('本地辅助程序尚未选择保存文件夹。请打开拾句设置选择。');
  return result;
}

export async function saveNativeImage(blob, filename) {
  if (blob.size > 40 * 1024 * 1024) throw new Error('截图超过本地辅助程序的大小限制。');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = await nativeRequest('save', { filename, data: btoa(binary) });
  if (result.bytes !== bytes.length) throw new Error('本地辅助程序返回的写入字节数不一致。');
  return result;
}
