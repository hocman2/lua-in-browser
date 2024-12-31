// To understand why we have this weirdness, take a look at the build.sh file for lua-in-browser
import Module from "./lua-module.js"
import { LUA_MULTRET, StatusCode, lua_State, LuaType } from "./lua-module.js";
import { CollectionOfLuaValue, formatLikeLuaCollection, isCollection, LuaObject, LuaValue } from "./object-manipulation.js";

import * as WMem from "./wasm-mem-interface.js"
import { Ptr } from "./wasm-mem-interface.js";

export const KEEP_CODE_LOADED = true;
export type LuaStateHandle = lua_State;
export type LuaStateMetadata = {
  codePtr: Ptr|null,
  persistentCode: boolean,
  numArgsCurrentFn: number,
}

let M: any = null;
const moduleReadyCallbacks: (()=>void)[] = [];

const luaStates: Map<LuaStateHandle, LuaStateMetadata> = new Map();

function getStateDataOrFail(L: LuaStateHandle): LuaStateMetadata {
  if (!luaStates.has(L))
    throw new Error("No active state found for the given handle");

  return luaStates.get(L)!;
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
export function load(L: LuaStateHandle, code: string, persistent:boolean = false) {
  let { codePtr: ptr } = getStateDataOrFail(L);

  // Remove previously loaded code if there is any
  if (ptr) {
    M._lua_settop(L, 0);
    M._free(ptr);
  }

  if (persistent)
    ptr = WMem.getOrAllocateString(code);
  else  
    ptr = WMem.pushString(code);

  luaStates.set(L, {codePtr:ptr, persistentCode:persistent, numArgsCurrentFn:0});
  M._luaL_loadstring(L, ptr);
}

/*
 * Execute code that has been previously loaded in the given state
 * The code must be reloaded if another execution was to occur
 */
export function execute(L: LuaStateHandle): false | {code: StatusCode, error: string} {
  const stateData = getStateDataOrFail(L);
  const {codePtr: ptr} = stateData;

  if (ptr) {
    const code = M._lua_pcall(L, 0, LUA_MULTRET, 0);
    if (code != StatusCode.OK) {
      const errorPtr = M._lua_tostring(L, -1);
      const error = WMem.fetchString(errorPtr);
      M._lua_pop(L, 1);

      if (!stateData.persistentCode)
        M._free(ptr);

      stateData.codePtr = null;
      return { code, error };
    }
  } else {
    console.warn("No code loaded for the given state, nothing will be done");
  }

  if (!stateData.persistentCode)
    M._free(ptr);

  stateData.codePtr = null;
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

  luaStates.set(L, {codePtr: null, persistentCode: false, numArgsCurrentFn: 0});
  return L;
}

/*
 * Release a state from memory
 */
export function freeState(L: LuaStateHandle) {
  M._lua_close(L);
  const state = luaStates.get(L);
  if (!state)
    return;

  if (state.codePtr)
    M._free(state.codePtr);
  luaStates.delete(L);
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
export function setGlobal(L: LuaStateHandle, name: string, value: LuaValue) {
  pushValue(L, value);
  M._lua_setglobal(L, WMem.getOrAllocateString(name));
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

function pushObj(L: LuaStateHandle, obj: LuaObject, collection: boolean = false) {
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
export function getGlobal(L: LuaStateHandle, name: string): [LuaValue, LuaType] {
  const type = M._lua_getglobal(L, WMem.getOrAllocateString(name)) as LuaType;
  const value = makeLuaValue(L, type);
  M._lua_pop(L, 1);
  return [value, type];
}

/**
 * Gets a global Lua or C/JS function and calls it.
 * Fails if the value provided is not a function or does not exist or if the said function fails
 */
export function callGlobal(L: LuaStateHandle, name: string, ...args: LuaValue[]): LuaValue[]|null {
  const type = M._lua_getglobal(L, WMem.getOrAllocateString(name)) as LuaType;
  if (type !== LuaType.TFUNCTION)
    throw new Error(`${name} is not a function`);

  args.forEach((a) => pushValue(L, a));

  const initialStackSize = M._lua_gettop(L);

  if (M._lua_pcall(L, args.length, LUA_MULTRET, 0) != StatusCode.OK) {
    const errorPtr = M._lua_tostring(L, -1);
    const error = WMem.fetchString(errorPtr);
    M._lua_pop(L, 2);
    throw new Error(error);
  } else {
    const currentStackSize = M._lua_gettop(L);
    const numResults = currentStackSize - (initialStackSize - 1 - args.length);
    var results = new Array(numResults);
    if (numResults > 0) {
      for (let i = initialStackSize+1; i <= currentStackSize; ++i) {
        const type = M._lua_type(L, i);
        results.push(makeLuaValue(L, type, i));
      }  
      M._lua_pop(L, numResults);
    }

  }

  M._lua_pop(L, initialStackSize - 1 - args.length);
  return (results.length === 0) ? null : results;
}

function makeLuaValue(L: LuaStateHandle, type: LuaType, index?: number): LuaValue {
  let value: LuaValue;
  index = index ?? -1;
  switch (type) {
    case LuaType.TBOOLEAN:
      value = (M._lua_toboolean(L, index) ? true : false); 
      break;
    case LuaType.TNUMBER:
      if (M._lua_isinteger(L, index))
        value = M._lua_tointeger(L, index);
      else
        value = M._lua_tonumber(L, index);
      break;
    case LuaType.TSTRING:
      value = WMem.fetchString(M._lua_tostring(L, index));
      break;
    case LuaType.TTABLE:
      value = makeLuaValueFromTable(L, index);
      break;
    case LuaType.TFUNCTION:
      if (M._lua_iscfunction(L, index)) {
        const fnPtrMaybe = WMem.reverseFindFunction(M._lua_tocfunction(L, index)); 
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

  return value;
} 

function makeLuaValueFromTable(L: LuaStateHandle, index?: number): LuaValue {
  index = index ? index-1 : -2;
  let obj: LuaValue = {};

  // Push a space on the stack for the key
  M._lua_pushnil(L);

  while (M._lua_next(L, index) != 0) {
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
    M._lua_pop(L, 1);
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

export function getJsFunctionArgs(L: LuaStateHandle): [LuaValue, LuaType][] {
  const {numArgsCurrentFn: numArgs}= getStateDataOrFail(L);
  const stackSize = M._lua_gettop(L);

  const args = new Array(numArgs);
  for (let i = stackSize - numArgs; i <= stackSize; ++i) {
    const type = M._lua_type(L, i) as LuaType;
    args.push([makeLuaValue(L, type, i), type]);
  }
  return args;
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
