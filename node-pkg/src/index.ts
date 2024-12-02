import Module from "./lua-module.js"

export type LuaStateHandle = number;

let luaModule: any = null;
const moduleReadyCallbacks: (()=>void)[] = [];

let luaStateHandles: LuaStateHandle = 0;
const luaStates: Map<LuaStateHandle, number|null> = new Map();

/*
 * Callback to be invoked when the WASM module has been loaded.
 * You don't need to await for the module to be ready everytime,
 * do this when you think you are importing the module for the first time
 */
export function onModuleReady(cb: () => void) {
  if (luaModule) {
    cb();
  } else {
    moduleReadyCallbacks.push(cb);
  }
}

/*
 * Load some code in a given lua state, ready for execution
 */
export function load(stateHandle: LuaStateHandle, code: string) {
  if (!luaStates.has(stateHandle))
    throw new Error("Failed to find an active state for the given handle");

  let ptr = luaStates.get(stateHandle);

  if (ptr)
    luaModule._free(ptr);

  const encoder = new TextEncoder();
  const bytes = encoder.encode(code);
  ptr = luaModule._malloc(bytes.byteLength+1);
  luaStates.set(stateHandle, ptr as number);
  const wasmMemory = new Uint8Array(luaModule.HEAP8.buffer, ptr as number, bytes.byteLength+1);
  wasmMemory.set(bytes);
  wasmMemory[bytes.byteLength] = 0;
}

/*
 * Execute code that has been previously loaded in the given state
 */
export function execute(stateHandle: LuaStateHandle) {

  if (!luaStates.has(stateHandle))
    throw new Error("Failed to find an active state for the given handle");

  let ptr = luaStates.get(stateHandle);
  
  if (ptr) {
    luaModule._executeLua(ptr);
  } else {
    console.warn("No code loaded for the given state, nothing will be done");
  }
}

/*
 * Create a lua state in which code can be loaded and executed from a raw string or a blob representing a file
 */
export function createState(): LuaStateHandle {
  if (!luaModule)
    throw new Error("WASM Module is not initialized yet !");

  luaModule._createState();

  let handle = ++luaStateHandles;
  luaStates.set(handle, null);
  return handle;
}

/*
 * Release a state from memory
 */
export function freeState(stateHandle: LuaStateHandle) {
  const ptr = luaStates.get(stateHandle);
  if (ptr) {
    luaModule._free(ptr);
  }
  luaStates.delete(stateHandle);
}

Module()
.then((mod) => {
    luaModule = mod;
    while (moduleReadyCallbacks.length)
      moduleReadyCallbacks.pop()!();
})
.catch((e) => console.log("Failed to load WASM module: ", e));
