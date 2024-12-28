import { JSFunction } from "./object-manipulation";

export type Ptr = number;
export type WasmModule = {
  HEAP8: Uint8Array
  _malloc: (len: number) => Ptr,
  _free: (ptr: Ptr) => void,
  addFunction: (fn: Function, sigStr: string) => Ptr,
};

let M!: WasmModule;

const allocatedStrings: Map<string, Ptr> = new Map();
const allocatedFunctions: Map<JSFunction, Ptr> = new Map();

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

export function getOrAllocateString(str: string): Ptr {
  const ptrMaybe = allocatedStrings.get(str);
  if (ptrMaybe)
    return ptrMaybe;

  const ptr = pushString(str);
  allocatedStrings.set(str, ptr);
  return ptr;
}

export function getOrAllocateFunction(fn: JSFunction, sigStr: string): Ptr {
  const ptrMaybe = allocatedFunctions.get(fn);
  if (ptrMaybe)
    return ptrMaybe;

  const ptr = M.addFunction(fn, sigStr);
  allocatedFunctions.set(fn, ptr);
  return ptr;
}

export function reverseFindFunction(cFnPtr: Ptr): JSFunction|undefined {
  for (const [jsFn, cPtr] of allocatedFunctions.entries()) {
    if (cPtr === cFnPtr) {
      return jsFn;
    }
  }

  return undefined;
}

export function pushString(str: string): Ptr {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str + '\0');
  const ptr = M._malloc(bytes.length);
  const strSpace = new Uint8Array(M.HEAP8.buffer, ptr, bytes.byteLength);
  strSpace.set(bytes);
  return ptr;
}

export function freeEverything() {
  for (const ptr of allocatedStrings.values()) {
    M._free(ptr);
  }

  for (const ptr of allocatedFunctions.values()) {
    M._free(ptr);
  }

  allocatedStrings.clear();
  allocatedFunctions.clear();
}
