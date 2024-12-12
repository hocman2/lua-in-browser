export type Ptr = number;
export type WasmModule = {
  HEAP8: Uint8Array
  _malloc: (len: number) => Ptr,
  _free: (ptr: Ptr) => void
};

let M!: WasmModule;

/**
* Call this before using any other function or it will bug out !!!
*/
export function setWasmModule(m: WasmModule) {
  M = m;
}

export function fetchString(strStart: Ptr): string {
  let len = 0;
  while (M.HEAP8[strStart+len] != 0) {
    ++len;
  }
  if (!len) return "";
  const byteArray = new Uint8Array(M.HEAP8.buffer, strStart, len);
  const decoder = new TextDecoder();
  return decoder.decode(byteArray);
}

export function pushString(str: string): Ptr {
  str += '\0';
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const ptr = M._malloc(bytes.length);
  const strSpace = new Uint8Array(M.HEAP8.buffer, ptr, bytes.byteLength);
  strSpace.set(bytes);
  return ptr;
}
