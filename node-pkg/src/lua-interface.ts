// To understand why we have this weirdness, take a look at the build.sh file for lua-in-browser
import Module from "./lua-module.js"
import { LUA_MULTRET, StatusCode, lua_State } from "./lua-module.js";
import { CollectionOfLuaValue, formatLikeLuaCollection, isCollection, LuaObject, LuaValue } from "./object-manipulation.js";
import { _initPortalModule } from "./portal.js";

import * as WMem from "./wasm-mem-interface.js"
import { Ptr } from "./wasm-mem-interface.js";

export type LuaStateHandle = lua_State;
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
  let { L, codePtr: ptr } = getStateOrFail(stateHandle);

  // Remove previously loaded code if there is any
  if (ptr) {
    M._lua_settop(L, 0);
    M._free(ptr);
  }

  ptr = WMem.pushString(code);
  luaStates.set(stateHandle, {L, codePtr:ptr});

  M._luaL_loadstring(L, ptr);
}

/*
 * Execute code that has been previously loaded in the given state
 */
export function execute(stateHandle: LuaStateHandle) {
  let {L, codePtr:ptr} = getStateOrFail(stateHandle);

  if (ptr) {
    if (M._lua_pcall(L, 0, LUA_MULTRET, 0) != StatusCode.OK) {
      const errorPtr = M._lua_tostring(L, -1);
      const error = WMem.fetchString(errorPtr);
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
export function luaCreateState(): LuaStateHandle {
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
export function luaFreeState(stateHandle: LuaStateHandle) {
  if (!luaStates.has(stateHandle))
    return;

  const {L, codePtr} = luaStates.get(stateHandle)!;
  M._lua_close(L);
  if (codePtr)
    M._free(codePtr);
  luaStates.delete(stateHandle);
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
export function luaPushGlobalValue(stateHandle: LuaStateHandle, obj: LuaValue, name: string|Ptr): Ptr {
  const {L} = getStateOrFail(stateHandle);
  pushValue(L, obj);
  const namePtr = (typeof name === "string") ? WMem.pushString(name) : name;
  M._lua_setglobal(L, namePtr);
  return namePtr;
}

function pushValue(L: LuaStateHandle, obj: LuaValue) {
  switch (typeof obj) {
    case "string":
      const ptr = WMem.pushString(obj);
      M._lua_pushstring(L, ptr);
      M._free(ptr);
      break;
    case "number":
      if (Number.isInteger(obj))
        M._lua_pushinteger(L, obj);
      else
        M._lua_pushnumber(L, obj);
      break;
    case "bigint":
      throw new Error(`Not implemented type for object pushing: bigint`);
    case "boolean":
      M._lua_pushboolean(L, (obj) ? 1 : 0);
      break;
    case "symbol":
      throw new Error(`Not implemented type for object pushing: symbol`);
    case "undefined":
    case "object":
      if (!obj) {
        M._lua_pushnil(L);
        break;
      }
      // collections are handled differently
      if (isCollection(obj)) {
        const formatted = formatLikeLuaCollection(obj as CollectionOfLuaValue);
        pushObj(L, formatted, true);
      } else {
        let formatted = obj;
        if (obj instanceof Map) {
          formatted = formatLikeLuaCollection(obj);
        }
        pushObj(L, formatted as LuaObject);
      }
      break;
    case "function":
      throw new Error(`Not implemented type for object pushing: function`);
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
  _initPortalModule();
  while (moduleReadyCallbacks.length)
    moduleReadyCallbacks.pop()!();
})
.catch((e: Error) => console.error("Failed to load WASM module: ", e));
