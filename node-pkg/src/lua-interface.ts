// To understand why we have this weirdness, take a look at the build.sh file for lua-in-browser
import Module from "./lua-module.js"
import { LUA_MULTRET, StatusCode, lua_State, LuaType } from "./lua-module.js";
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

/**
* Retrieve a global from the lua state if it exists along with it's type.
* Tables of adjacent indices starting with one are converted into an array
* NIL is returned as null
*/
export function getGlobal(stateHandle: LuaStateHandle, name: string): [LuaValue, LuaType] {
  const {L} = getStateOrFail(stateHandle);
  const namePtr = WMem.getOrAllocateString(name);
  const type = M._lua_getglobal(L, namePtr) as LuaType;
  return [makeLuaValue(L, type), type];
}

function makeLuaValue(L: LuaStateHandle, type: LuaType): LuaValue {
  let value: LuaValue;
  switch (type) {
    case LuaType.TBOOLEAN:
      value = (M._lua_toboolean(L, -1) ? true : false); 
      break;
    case LuaType.TNUMBER:
      if (M._lua_isinteger(L, -1))
        value = M._lua_tointeger(L, -1);
      else
        value = M._lua_tonumber(L, -1);
      break;
    case LuaType.TSTRING:
      value = WMem.fetchString(M._lua_tostring(L, -1));
      break;
    case LuaType.TTABLE:
      value = makeLuaValueFromTable(L);
      break;
    case LuaType.TFUNCTION:
      if (M._lua_iscfunction(L, -1)) {
        const fnPtrMaybe = WMem.reverseFindFunction(M._lua_tocfunction(L, -1)); 
        if (fnPtrMaybe)
          value = fnPtrMaybe;
        else
          throw new Error("TFUNCTION is a C function that cannot be found in the function allocation table");
      }
      else
        throw new Error("TFUNCTION is a Lua function and cannot be converted to JS");
      break;
    case LuaType.TUSERDATA:
      throw new Error("TUSERDATA cannot be converted to a LuaValue");
    case LuaType.TTHREAD:
      throw new Error("TTHREAD cannot be converted to a LuaValue");
    case LuaType.TLIGHTUSERDATA:
      throw new Error("TLIGHTUSERDATA cannot be converted to a LuaValue");
    case LuaType.TNIL:
    default:
      value = null;
      break;
  }

  M._lua_pop(L, 1);
  return value;
} 

function makeLuaValueFromTable(L: LuaStateHandle): LuaValue {
  let obj: LuaValue = {};

  // Push a space on the stack for the key
  M._lua_pushnil(L);

  while (M._lua_next(L, -2) != 0) {
    const keyType = M._lua_type(L, -2) as LuaType;

    let key: string|number;
    switch(keyType) {
      case LuaType.TNUMBER:
        if (M._lua_isinteger(L, -2))
          key = M._lua_tointeger(L, -2);
        else
          key = M._lua_tonumber(L, -2);
        break;
      case LuaType.TSTRING:
          key = WMem.fetchString(M._lua_tostring(L, -2));
        break;
      default:
        throw new Error(`Table has an unsupported key type: ${keyType}`);
    }

    const valueType = M._lua_type(L, -1) as LuaType;
    obj[key] = makeLuaValue(L, valueType);
  }

  // return array if necessary
  const keys = Object.keys(obj);
  const arr = new Array(keys.length);
  
  for (let i = 0; i < keys.length; ++i) {
    let key: string|number = keys[i];
    
    const keyNumMaybe = Number.parseFloat(key);
    if (!Number.isNaN(keyNumMaybe))
      key = keyNumMaybe;

    if (typeof key !== "number" || key !== i + 1) return obj;
    arr[i] = obj[key];
  }

  return arr;
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
