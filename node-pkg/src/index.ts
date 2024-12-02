import Module from "./lua-module.js"
import { LUA_MULTRET, StatusCode, lua_State } from "./lua-module.js";
import * as Memory from "./wasm-mem-interface.js"
import { Ptr } from "./wasm-mem-interface.js";

export type LuaStateHandle = number;
export type LuaState = {
  L: lua_State,
  codePtr: Ptr|null
}

let M: any = null;
const moduleReadyCallbacks: (()=>void)[] = [];

let luaStateHandles: LuaStateHandle = 0;
const luaStates: Map<LuaStateHandle, LuaState> = new Map();

function getStateOrFail(handle: LuaStateHandle): LuaState {
  if (!luaStates.has(handle))
    throw new Error("No active state found for the given handle");

  return luaStates.get(handle)!;
}

/*
 * Callback to be invoked when the WASM module has been loaded.
 * You don't need to await for the module to be ready everytime,
 * do this when you think you are importing the module for the first time
 */
export function onModuleReady(cb: () => void) {
  if (M) {
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

  let {L, codePtr: ptr} = luaStates.get(stateHandle)!;

  // Remove previously loaded code if there is any
  if (ptr) {
    M._lua_settop(L, 0);
    M._free(ptr);
  }

  ptr = Memory.pushString(M, code);
  luaStates.set(stateHandle, {L, codePtr:ptr});

  M._luaL_loadstring(L, ptr);
}

/*
 * Execute code that has been previously loaded in the given state
 */
export function execute(stateHandle: LuaStateHandle) {

  if (!luaStates.has(stateHandle))
    throw new Error("Failed to find an active state for the given handle");

  let {L, codePtr:ptr} = luaStates.get(stateHandle)!;
  
  if (ptr) {
    if (M._lua_pcall(L, 0, LUA_MULTRET, 0) != StatusCode.OK) {
      const errorPtr = M._lua_tostring(L, -1);
      const error = Memory.fetchString(M, errorPtr);
      console.error("Lua error: ", error)
      M._lua_pop(L, 1);
    }
  } else {
    console.warn("No code loaded for the given state, nothing will be done");
  }
}

/*
 * Create a lua state in which code can be loaded and executed from a raw string or a blob representing a file
 */
export function createState(): LuaStateHandle {
  if (!M)
    throw new Error("WASM Module is not initialized yet !");

  const L = M._luaL_newstate();
  M._luaL_openlibs(L)

  let handle = ++luaStateHandles;
  luaStates.set(handle, {L, codePtr: null});
  return handle;
}

/*
 * Release a state from memory
 */
export function freeState(stateHandle: LuaStateHandle) {
  if (!luaStates.has(stateHandle))
    return;

  const {L, codePtr} = luaStates.get(stateHandle)!;
  M._lua_close(L);
  if (codePtr) {
    M._free(codePtr);
  }
  luaStates.delete(stateHandle);
}

export function pushGlobalObject(stateHandle: LuaStateHandle, obj: any, name: string) {
  const {L} = getStateOrFail(stateHandle); 
  _pushObj(L, obj);
  const namePtr = Memory.pushString(M, name);
  M._lua_setglobal(L, namePtr);
  M._free(namePtr);
}

function _pushObj(L: lua_State, obj: any) {
  const keys = Object.keys(obj);
  M._lua_createtable(L, 0, keys.length);

  const pushKeyToLua = (key: string) => {
    let keyConv = Number.parseFloat(key);

    if (Number.isNaN(keyConv)) {
      // The lua doc specifies that a pushed string is memcopied
      // so it's safe to be freed after
      const ptr = Memory.pushString(M, key);
      M._lua_pushstring(L, ptr);
      M._free(ptr);

    } else {
      if (Number.isInteger(keyConv))
        M._lua_pushinteger(L, key);
      else
        M._lua_pushnumber(L, key);
    }
  }

  keys.map((k) => obj[k]).forEach((value, i) => {
    pushKeyToLua(keys[i]);

    switch (typeof value) {
      case "string":
        // not really pushing a key but it's the same logic
        pushKeyToLua(value);
        break;
      case "number":
        if (Number.isInteger(value))
          M._lua_pushinteger(L, value);
        else
          M._lua_pushnumber(L, value);
        break;
      case "bigint":
        throw new Error(`${keys[i]}:${value} Not implemented type for object pushing: bigint`);
      case "boolean":
        M._lua_pushboolean(L, (value) ? 1 : 0);
        break;
      case "symbol":
        throw new Error(`${keys[i]} Not implemented type for object pushing: symbol`);
        break;
      case "undefined":
      case "object":
        if (!value) {
          M._lua_pushnil(L);
        } else {
          // Recursivly push a new table
          _pushObj(L, value);
        }
        break;
      case "function":
        throw new Error(`${keys[i]}:${value} Not implemented type for object pushing: function`);
    }

    M._lua_settable(L, -3);
  }); 
}

(Module as any)()
.then((mod: any) => {
    M = mod;
    while (moduleReadyCallbacks.length)
      moduleReadyCallbacks.pop()!();
})
.catch((e: Error) => console.error("Failed to load WASM module: ", e));
