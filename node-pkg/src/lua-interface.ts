// To understand why we have this weirdness, take a look at the build.sh file for lua-in-browser
import Module from "./lua-module.js"
import { LUA_MULTRET, StatusCode, lua_State } from "./lua-module.js";
import { CollectionOfLuaValue, formatLikeLuaCollection, isCollection, LuaObject, LuaValue } from "./object-manipulation.js";

import * as WMem from "./wasm-mem-interface.js"
import { Ptr } from "./wasm-mem-interface.js";

export const KEEP_CODE_LOADED = true;
export type LuaStateHandle = lua_State;
export type LuaState = {
  L: lua_State,
  codePtr: Ptr|null,
  persistentCode: boolean,
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
export function load(stateHandle: LuaStateHandle, code: string, persistent:boolean = false) {
  let { L, codePtr: ptr } = getStateOrFail(stateHandle);

  // Remove previously loaded code if there is any
  if (ptr) {
    M._lua_settop(L, 0);
    M._free(ptr);
  }

  if (persistent)
    ptr = WMem.getOrAllocateString(code);
  else  
    ptr = WMem.pushString(code);

  luaStates.set(stateHandle, {L, codePtr:ptr, persistentCode:persistent});
  M._luaL_loadstring(L, ptr);
}

/*
 * Execute code that has been previously loaded in the given state
 * The code must be reloaded if another execution was to occur
 */
export function execute(stateHandle: LuaStateHandle): false | {code: StatusCode, error: string} {
  const state = getStateOrFail(stateHandle);
  const {L, codePtr: ptr} = state;

  if (ptr) {
    const code = M._lua_pcall(L, 0, LUA_MULTRET, 0);
    if (code != StatusCode.OK) {
      const errorPtr = M._lua_tostring(L, -1);
      const error = WMem.fetchString(errorPtr);
      M._lua_pop(L, 1);

      if (!state.persistentCode)
        M._free(ptr);

      state.codePtr = null;
      return { code, error };
    }
  } else {
    console.warn("No code loaded for the given state, nothing will be done");
  }

  if (!state.persistentCode)
    M._free(ptr);

  state.codePtr = null;
  return false;
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
  luaStates.set(handle, {L, codePtr: null, persistentCode: false});
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
  if (codePtr)
    M._free(codePtr);
  luaStates.delete(stateHandle);
  WMem.freeEverything();
}

/**
* Copies as best as possible a Javascript Object as a Lua table and makes it
available globally
*
* These value types will throw an error if they exist:
- functions
- bigint
- symbol
*
* null and undefined are pushed as nil
* @param name
* @returns The pointer to the name of the global, for reusing it
*/
export function setGlobal(stateHandle: LuaStateHandle, name: string, value: LuaValue) {
  const {L} = getStateOrFail(stateHandle);
  pushValue(L, value);
  const namePtr = WMem.getOrAllocateString(name);
  M._lua_setglobal(L, namePtr);
}

function pushValue(L: LuaStateHandle, v: LuaValue) {
  switch (typeof v) {
    case "string":
      const ptr = WMem.pushString(v);
      M._lua_pushstring(L, ptr);
      M._free(ptr);
      break;
    case "number":
      if (Number.isInteger(v))
        M._lua_pushinteger(L, v);
      else
        M._lua_pushnumber(L, v);
      break;
    case "bigint":
      throw new Error(`Not implemented type for object pushing: bigint`);
    case "boolean":
      M._lua_pushboolean(L, (v) ? 1 : 0);
      break;
    case "symbol":
      throw new Error(`Not implemented type for object pushing: symbol`);
    case "undefined":
    case "object":
      if (!v) {
        M._lua_pushnil(L);
        break;
      }
      // collections are handled differently
      if (isCollection(v)) {
        const formatted = formatLikeLuaCollection(v as CollectionOfLuaValue);
        pushObj(L, formatted, true);
      } else {
        let formatted = v;
        if (v instanceof Map) {
          formatted = formatLikeLuaCollection(v);
        }
        pushObj(L, formatted as LuaObject);
      }
      break;
    case "function":
      const fnPtr = WMem.getOrAllocateFunction(v, "ip");
      M._lua_pushcfunction(L, fnPtr);
      break;
  }
}

function pushObj(L: lua_State, obj: LuaObject, collection: boolean = false) {
  const keys = Object.keys(obj);
  M._lua_createtable(L, collection ? keys.length : 0, !collection ? keys.length : 0);

  const pushKeyToLua = (key: string) => {
    let keyConv = Number.parseFloat(key);

    if (Number.isNaN(keyConv)) {
      // The lua doc specifies that a pushed string is memcopied
      // so it's safe to free it after
      const ptr = WMem.pushString(key);
      M._lua_pushstring(L, ptr);
      M._free(ptr);

    } else {
      if (Number.isInteger(keyConv))
        M._lua_pushinteger(L, key);
      else
        M._lua_pushnumber(L, key);
    }
  }

  keys.forEach((key) => {
    pushKeyToLua(key);
    pushValue(L, (obj as any)[key])
    M._lua_settable(L, -3);
  });
}

Module()
.then((mod: any) => {
  M = mod;
  // Allows us to use memory management helper functions
  WMem.setWasmModule(M);
  while (moduleReadyCallbacks.length)
    moduleReadyCallbacks.pop()!();
})
.catch((e: Error) => console.error("Failed to load WASM module: ", e));
