// To understand why we have this weirdness, take a look at the build.sh file for lua-in-browser
import Module from "./lua-module.js"
import { LUA_MULTRET, StatusCode, lua_State, LuaType } from "./lua-consts.js";
import { CollectionOfLuaValue, formatLikeLuaCollection, isCollection, LuaObject, LuaValue } from "./object-manipulation.js";

import * as WMem from "./wasm-mem-interface.js"
import { Ptr } from "./wasm-mem-interface.js";

type WasmModule = any;

export type LuaStateHandle = lua_State;
export type LuaExecutionError = {code: StatusCode, error: string};
export type CodeHandle = number;
export type LuaStateMetadata = {
  // there was some stuff here initially but there is nothing anymore
  // i'm leaving it on in case we need to attach some data to a lua state some day
}

let M: WasmModule = null;
const luaStates: Map<LuaStateHandle, LuaStateMetadata> = new Map();
// we'll keep track of delivered code handles, this allows to give error messages if the user
// forgets to allocate the code string
const deliveredCodeHandles: Set<CodeHandle> = new Set();


export const lua = {
  /*
   * Returns the raw WASM module. It contains all lua documented functions prefixed by an underscore '_' symbol
   * Using this leaves you in charge of allocating and deallocating memory inside the module.
   * Since you also have access to the heap and stack, no guarantees can be made regarding the correct behavior
   * of the interface if you fiddle with memory.
   */
  _raw,

  /*
   * Callback to be invoked when the WASM module has been loaded.
   * You don't need to await for the module to be ready everytime,
   * do this when you think you are importing the module for the first time
   */
  onModuleReady,
  /*
   * Create a lua state in which code can be loaded and executed 
   */
  createState,
  /*
   * Release a state from memory
   */
  freeState,
  /*
   * Loads a given code string in the WASM instance's memory. Users are responsible for
   * allocating, storing and freeing CodeHandles because we don't know if you will reuse
   * the same code for multiple executions.
   * It should be noted that a code handle represents a string at a given time. If that 
   * string changes, you are expected to release the old CodeHandle and create a new one
   */
  prepareCode,
  releaseCode,
  /*
   * Execute some code previously loaded.
   * Once this function is ran, you need to reload the code before calling execute again
   */
  executeCode,

  /**
  * Copies as best as possible a Javascript Object as a Lua table and makes it
  available globally in the lua state
  *
  * These value types will throw an error if they exist:
  - bigint
  - symbol
  *
  * null and undefined are pushed as nil
  * @param name
  */
  setGlobal,
  /**
  * Retrieve a global from the lua state if it exists along with it's type.
  * Tables of adjacent indices starting with one are converted into an array
  * NIL is returned as null
  * It may omit some Lua specific types that can't be converted into JS. Such failures
  * are logged as warnings and can be ignored
  */
  getGlobal,
  
  /**
   * Gets a global Lua or C/JS function and calls it.
   * Fails if the value provided is not a function or does not exist or if the said function fails
   */
  callGlobal,
  getJsFunctionArgs,
};

function _raw(): WasmModule {
  return M;
}

const moduleReadyCallbacks: (() => void)[] = [];
function onModuleReady(cb: () => void) {
  if (M) {
    cb();
  } else {
    moduleReadyCallbacks.push(cb);
  }
}

function createState(): LuaStateHandle|null {
  if (!M) {
    console.error("WASM Module is not initialized yet ! You can pass a callback to onModuleReady to solve this issue.");
    return null;
  }

  const L = M._luaL_newstate();
  M._luaL_openlibs(L)

  luaStates.set(L, {});
  return L;
}


function freeState(L: LuaStateHandle) {
  M._lua_close(L);
  const state = luaStates.get(L);
  if (!state)
    return;

  luaStates.delete(L);
}

function prepareCode(L: LuaStateHandle, code: string): CodeHandle {
  const ptr = WMem.pushString(code);
  deliveredCodeHandles.add(ptr);
  return ptr;
}

function releaseCode(code: CodeHandle) {
  M._free(code);
  deliveredCodeHandles.delete(code);
}


function executeCode(L: LuaStateHandle, code: CodeHandle): null | LuaExecutionError {
  if (!deliveredCodeHandles.has(code)) {
    console.error("Gave executeCode() an undelivered CodeHandle. Make sure you call prepareCode() then loadCode() before calling executeCode(). It could also be that releaseCode() was called for this handle");
    console.trace();
  }

  M._luaL_loadstring(L, code);
  const statusCode = M._lua_pcall(L, 0, LUA_MULTRET, 0);
  if (statusCode != StatusCode.OK) {
    const errorPtr = M._lua_tostring(L, -1);
    const error = WMem.fetchString(errorPtr);
    M._lua_pop(L, 1);
    return { code: statusCode, error };
  }

  return null;
}

function setGlobal(L: LuaStateHandle, name: string, value: LuaValue) {
  _pushValue(L, value);
  M._lua_setglobal(L, WMem.getOrAllocateString(name));
}

function _pushValue(L: LuaStateHandle, v: LuaValue) {
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
      console.error(`Not implemented type for object pushing: bigint`);
      break;
    case "boolean":
      M._lua_pushboolean(L, (v) ? 1 : 0);
      break;
    case "symbol":
      console.error(`Not implemented type for object pushing: symbol`);
      break;
    case "undefined":
    case "object":
      if (!v) {
        M._lua_pushnil(L);
        break;
      }
      // collections are handled differently
      if (isCollection(v)) {
        const formatted = formatLikeLuaCollection(v as CollectionOfLuaValue);
        _pushObj(L, formatted, true);
      } else {
        let formatted = v;
        if (v instanceof Map) {
          formatted = formatLikeLuaCollection(v);
        }
        _pushObj(L, formatted as LuaObject);
      }
      break;
    case "function":
      const fnPtr = WMem.getOrAllocateFunction(v, "ip");
      M._lua_pushcfunction(L, fnPtr);
      break;
  }
}

function _pushObj(L: LuaStateHandle, obj: LuaObject, collection: boolean = false) {
  const keys = Object.keys(obj);
  M._lua_createtable(L, collection ? keys.length : 0, !collection ? keys.length : 0);

  const pushKeyToLua = function(key: string) {
    let keyConv = Number.parseFloat(key);

    // push key as string
    if (Number.isNaN(keyConv)) {
      const ptr = WMem.pushString(key);
      M._lua_pushstring(L, ptr);
      M._free(ptr);
    // push key as number
    } else {
      if (Number.isInteger(keyConv))
        M._lua_pushinteger(L, key);
      else
        M._lua_pushnumber(L, key);
    }
  }

  keys.forEach((key) => {
    pushKeyToLua(key);
    _pushValue(L, (obj as any)[key])
    M._lua_settable(L, -3);
  });
}

export function getGlobal(L: LuaStateHandle, name: string): [LuaValue, LuaType] {
  const type = M._lua_getglobal(L, WMem.getOrAllocateString(name)) as LuaType;
  const value = _makeLuaValue(L, type);
  M._lua_pop(L, 1);
  return [value, type];
}

function callGlobal(L: LuaStateHandle, name: string, ...args: LuaValue[]): [LuaValue, LuaType][] | LuaExecutionError {
  const type = M._lua_getglobal(L, WMem.getOrAllocateString(name)) as LuaType;
  if (type !== LuaType.TFUNCTION) {
    console.error(`${name} is not a function`);
    return [];
  }

  const initialStackSize = M._lua_gettop(L);
  args.forEach((a) => _pushValue(L, a));

  const statusCode = M._lua_pcall(L, args.length, LUA_MULTRET, 0);
  if (statusCode != StatusCode.OK) {
    const errorPtr = M._lua_tostring(L, -1);
    const error = WMem.fetchString(errorPtr);
    M._lua_pop(L, 1);
    return {code: statusCode, error};
  } else {
    const currentStackSize = M._lua_gettop(L);
    const numResults = currentStackSize-initialStackSize;
    var results: [LuaValue, LuaType][] = [];
    if (numResults > 0) {
      for (let i = initialStackSize + 1; i <= currentStackSize; ++i) {
        const type = M._lua_type(L, i);
        results.push([_makeLuaValue(L, type, i), type]);
      }
      M._lua_pop(L, numResults);
    }

  }

  return results;
}

function _makeLuaValue(L: LuaStateHandle, type: LuaType, index?: number): LuaValue {
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
      value = _makeLuaValueFromTable(L, index);
      break;
    case LuaType.TFUNCTION:
      if (M._lua_iscfunction(L, index)) {
        const fnPtrMaybe = WMem.reverseFindFunction(M._lua_tocfunction(L, index));
        if (fnPtrMaybe)
          value = fnPtrMaybe;
        else
          console.error("TFUNCTION is a C function that cannot be found in the function allocation table");
      }
      else
        console.warn("TFUNCTION is a Lua function and cannot be converted to JS yet");
      break;
    case LuaType.TUSERDATA:
      console.warn("TUSERDATA cannot be converted to a LuaValue");
      break;
    case LuaType.TTHREAD:
      console.warn("TTHREAD cannot be converted to a LuaValue");
      break;
    case LuaType.TLIGHTUSERDATA:
      console.warn("TLIGHTUSERDATA cannot be converted to a LuaValue");
      break;
    case LuaType.TNIL:
    default:
      value = null;
      break;
  }

  return value;
}

function _makeLuaValueFromTable(L: LuaStateHandle, index?: number): LuaValue {
  index = index ? index - 1 : -2;
  let obj: LuaValue = {};

  // Push a space on the stack for the key
  M._lua_pushnil(L);

  while (M._lua_next(L, index) != 0) {
    const keyType = M._lua_type(L, -2) as LuaType;

    let key: string | number;
    switch (keyType) {
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
        console.error(`Table has an unsupported key type: ${keyType}. Only keys of type string and number are supported`);
        continue;
    }

    const valueType = M._lua_type(L, -1) as LuaType;
    obj[key] = _makeLuaValue(L, valueType);
    M._lua_pop(L, 1);
  }

  // return array if necessary
  const keys = Object.keys(obj);
  const arr = new Array(keys.length);

  for (let i = 0; i < keys.length; ++i) {
    let key: string | number = keys[i];

    const keyNumMaybe = Number.parseFloat(key);
    if (!Number.isNaN(keyNumMaybe))
      key = keyNumMaybe;

    if (typeof key !== "number" || key !== i + 1) return obj;
    arr[i] = obj[key];
  }

  return arr;
}

function getJsFunctionArgs(L: LuaStateHandle): [LuaValue, LuaType][] {
  const numArgs = M._lua_gettop(L);
  const args: [LuaValue, LuaType][] = [];
  for (let i = 1; i <= numArgs; ++i) {
    const type = M._lua_type(L, i) as LuaType;
    args.push([_makeLuaValue(L, type, i), type]);
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
